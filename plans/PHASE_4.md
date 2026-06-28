# PHASE 4: Submissions, Analytics + Stripe Billing

## Summary

Add the monetization and data-collection layer to the Formbaker platform. Three pillars: (1) a public submission endpoint that third-party iframes POST to, with CORS, rate limiting, and spam protection; (2) an analytics dashboard showing submission volume, conversion rates, and top forms using Chart.js; (3) Stripe integration for paid plans (Pro/Enterprise) with checkout, webhooks, customer portal, and plan-gating middleware. Free tier gets 3 forms, 100 submissions/month, and mandatory "Powered by Formbaker" branding.

---

## DB Schema Additions

All additions to `docs/src/db/schema.ts`. Use `drizzle-orm/sqlite-core`.

### 1. `formSubmissions` table

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { forms } from "./schema";        // from Phase 2
import { users } from "./schema";        // from Phase 1

export const formSubmissions = sqliteTable("form_submissions", {
  id:          text("id").primaryKey(),           // crypto.randomUUID()
  formId:      text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  data:        text("data").notNull(),             // JSON blob — the submitted field values
  submittedAt: integer("submitted_at").notNull(),  // Unix ms
  ip:          text("ip"),                         // Hashed or anonymized IP
  userAgent:   text("user_agent"),                 // Raw UA string
  referrer:    text("referrer"),                   // URL of embedding page
  isSpam:      integer("is_spam").default(0),       // 0 = clean, 1 = flagged
});
```

### 2. `subscriptions` table

```ts
export const subscriptions = sqliteTable("subscriptions", {
  id:                   text("id").primaryKey(),
  userId:               text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripePriceId:        text("stripe_price_id").notNull(),
  stripeCustomerId:     text("stripe_customer_id").notNull(),
  status:               text("status").notNull(),   // active, past_due, canceled, incomplete
  plan:                 text("plan").notNull(),     // "pro" | "enterprise"
  currentPeriodStart:   integer("current_period_start").notNull(),
  currentPeriodEnd:     integer("current_period_end").notNull(),
  cancelAtPeriodEnd:    integer("cancel_at_period_end").default(0),
  createdAt:            integer("created_at").notNull(),
  updatedAt:            integer("updated_at").notNull(),
});
```

### 3. `users` table additions (from Phase 1 schema)

New columns to add during migration:

```ts
// Add to existing users table:
stripeCustomerId: text("stripe_customer_id").unique(),    // Stripe customer ID, null for free
plan:             text("plan").notNull().default("free"), // "free" | "pro" | "enterprise"
```

### 4. `submissionCounts` table (monthly quota tracking)

```ts
export const submissionCounts = sqliteTable("submission_counts", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  yearMonth: text("year_month").notNull(),   // "2026-07" format
  count:     integer("count").notNull().default(0),
}, (t) => ({
  uniq: uniqueIndex("uq_user_month").on(t.userId, t.yearMonth),
}));
```

### 5. Migration file

`docs/drizzle/0002_submissions_billing.sql`:

```sql
CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  referrer TEXT,
  is_spam INTEGER DEFAULT 0
);

CREATE INDEX idx_submissions_form_id ON form_submissions(form_id);
CREATE INDEX idx_submissions_submitted_at ON form_submissions(submitted_at);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  plan TEXT NOT NULL,
  current_period_start INTEGER NOT NULL,
  current_period_end INTEGER NOT NULL,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

CREATE TABLE submission_counts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX idx_submission_counts_user_month ON submission_counts(user_id, year_month);

ALTER TABLE users ADD COLUMN stripe_customer_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
```

---

## Stripe Integration Architecture

### Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
│ /app/settings│────▶│ POST         │────▶│  Stripe      │────▶│ Stripe    │
│ /billing     │     │ /api/stripe/ │     │  Checkout    │     │ Hosted UI │
│ (Astro page) │     │ create-check │     │  Session     │     │           │
│              │     │ out-session  │     │  created     │     │           │
│   [Click     │     │              │     │              │     │  User     │
│   Upgrade]   │     │ req: {       │     │ res: { url } │     │  enters   │
│              │     │   priceId    │     │              │     │  card     │
│              │     │ }            │     │              │     │  details  │
└─────────────┘     └──────────────┘     └──────────────┘     └─────┬─────┘
                                                                     │
                              ┌──────────────────────────────────────┘
                              ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│ User Browser │     │ /app/settings│     │ POST                     │
│ redirects to │────▶│ /billing?    │     │ /api/stripe/webhook      │
│ success_url  │     │ success=true │     │                          │
│              │     │              │     │ Stripe POSTs event:      │
│              │     │              │     │ checkout.session.        │
│              │     │              │     │   completed              │
└──────────────┘     └──────────────┘     │ → upsert subscription    │
                                          │ → update user.plan       │
                                          │ → update user.           │
                                          │   stripeCustomerId       │
                                          └──────────────────────────┘
```

### Webhook Events Handled

| Event | Action |
|---|---|
| `checkout.session.completed` | Create subscription row, set `user.plan = "pro"`, set `user.stripeCustomerId` |
| `customer.subscription.updated` | Update subscription status/period in DB |
| `customer.subscription.deleted` | Set subscription status to `canceled`, downgrade user to `free`, keep data |
| `invoice.payment_failed` | Set subscription status to `past_due`, optionally notify user |

### Webhook Security

1. Verify Stripe-Signature header using `stripe.webhooks.constructEvent()`
2. Read raw body — Astro `APIRoute` needs `request.text()` (not `.json()`) for signature verification
3. Use environment variable `STRIPE_WEBHOOK_SECRET` (`whsec_...`)
4. Return 200 quickly (Stripe retries on non-200)

### Customer Portal

`POST /api/stripe/create-portal` — creates a Stripe Customer Portal session. User can update payment method, cancel subscription, view invoices. Redirect user to the returned URL.

### Environment Variables (add to `.env.example` and document)

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
```

### Dependencies to Install

```bash
cd docs
npm install stripe @stripe/stripe-js chart.js
npm install -D @types/chart.js  # if needed
```

---

## API Routes Spec

### 7. `POST /api/embed/[formId]/submit`

**Purpose:** Public endpoint for iframe-embedded forms to submit data. No auth. CORS enabled. Rate limited. Spam checked.

**Request:**
```
POST /api/embed/form_abc123/submit
Content-Type: application/json

{
  "data": {
    "email": "user@example.com",
    "name": "Jane Doe",
    "message": "I'd like to learn more..."
  },
  "honeypot": ""   // must be empty; filled = bot
}
```

**Rate Limiting (in-memory, keyed by IP):**
- 60 submissions per minute per IP
- 10 submissions per minute per form ID + IP

**Spam Protection:**
- Honeypot field: if `honeypot` is non-empty, flag as spam (still store, mark `isSpam = 1`)
- Optional: reCAPTCHA token validation (Phase 4.5)
- Check `referrer` header — if empty or mismatch, flag

**Quota Check:**
- Look up form owner's plan
- Query `submissionCounts` for the current year-month
- If over plan limit (free: 100, pro: 10,000, enterprise: unlimited), return 429

**Response (201):**
```json
{
  "id": "sub_xyz789",
  "accepted": true
}
```

**Response (429 — rate limited):**
```json
{
  "error": "Too many requests. Try again later."
}
```

**Response (429 — quota exceeded):**
```json
{
  "error": "Monthly submission limit reached for this form."
}
```

**Response (400):**
```json
{
  "error": "Invalid submission data"
}
```

**CORS Headers:**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

### 8. `GET /api/forms/[formId]/submissions`

**Purpose:** Owner retrieves submissions for their form. Auth required.

**Auth:** Session middleware required. Must be form owner.

**Query params:**
```
?page=1&limit=50&sort=submitted_at&order=desc&search=janedoe&isSpam=0
```

**Response (200):**
```json
{
  "submissions": [
    {
      "id": "sub_xyz789",
      "formId": "form_abc123",
      "data": { "email": "user@example.com", "name": "Jane Doe" },
      "submittedAt": 1719619200000,
      "ip": "a1b2c3...",       // hashed
      "userAgent": "Mozilla/5.0 ...",
      "referrer": "https://customer-site.com/contact",
      "isSpam": 0
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 50,
  "totalPages": 3
}
```

**Response (403):**
```json
{
  "error": "You do not own this form"
}
```

---

### 9. `GET /api/forms/[formId]/submissions/[subId]`

**Purpose:** Single submission detail. Auth required. Owner only.

**Response (200):** Same shape as above, single object.

---

### 10. `DELETE /api/forms/[formId]/submissions/[subId]`

**Purpose:** Delete a submission. Auth required. Owner only.

**Response (200):**
```json
{
  "deleted": true
}
```

---

### 11. `DELETE /api/forms/[formId]/submissions`

**Purpose:** Bulk delete submissions. Auth required. Owner only. Supports filters.

**Request body:**
```json
{
  "isSpam": true,    // delete all spam
  "before": 1717200000000  // optional: delete submissions before this timestamp
}
```

**Response (200):**
```json
{
  "deleted": 23
}
```

---

### 12. `GET /api/forms/[formId]/submissions.csv`

**Purpose:** Export submissions as CSV. Auth required. Owner only.

**Response:** `Content-Type: text/csv` with `Content-Disposition: attachment; filename="form_abc123_submissions.csv"`

Includes all non-spam submissions. Headers derived from form fields.

---

### 13. `GET /api/forms/[formId]/analytics`

**Purpose:** Analytics data for the form owner's dashboard. Auth required.

**Query params:**
```
?range=30d   // 7d, 30d, 90d, 1y, all
```

**Response (200):**
```json
{
  "formId": "form_abc123",
  "totalSubmissions": 1423,
  "submissionsThisMonth": 87,
  "submissionsOverTime": [
    { "date": "2026-06-01", "count": 12 },
    { "date": "2026-06-02", "count": 8 }
  ],
  "submissionRate": 4.2,
  "spamRate": 0.03,
  "topReferrers": [
    { "referrer": "https://customer-site.com/contact", "count": 89 },
    { "referrer": "https://customer-site.com/landing", "count": 34 }
  ]
}
```

---

### 14. `GET /api/analytics/overview`

**Purpose:** Dashboard overview for authenticated user. Summary across all forms.

**Response (200):**
```json
{
  "totalForms": 5,
  "totalSubmissions": 2341,
  "submissionsThisMonth": 312,
  "formBreakdown": [
    {
      "formId": "form_abc123",
      "formName": "Contact Us",
      "submissionCount": 892,
      "thisMonth": 45
    }
  ],
  "submissionsOverTime": [
    { "date": "2026-06-01", "count": 28 },
    { "date": "2026-06-02", "count": 35 }
  ],
  "planLimit": {
    "plan": "pro",
    "formsUsed": 5,
    "formsLimit": 50,
    "submissionsUsed": 312,
    "submissionsLimit": 10000
  }
}
```

---

### 15. `POST /api/stripe/create-checkout-session`

**Purpose:** Start Stripe checkout for upgrading to Pro/Enterprise.

**Auth:** Session required.

**Request:**
```json
{
  "priceId": "price_abc123",
  "successUrl": "https://formbaker.dev/app/settings/billing?success=true",
  "cancelUrl": "https://formbaker.dev/app/settings/billing?canceled=true"
}
```

**Response (200):**
```json
{
  "url": "https://checkout.stripe.com/c/pay/cs_test_abc..."
}
```

**Implementation:**
1. Get or create Stripe customer (via `stripe.customers.create()` with email)
2. Save `stripeCustomerId` on user row if new
3. Call `stripe.checkout.sessions.create()` with mode: `subscription`
4. Store `client_reference_id` as `userId` in session metadata
5. Return session URL

---

### 16. `POST /api/stripe/webhook`

**Purpose:** Receive Stripe events. No auth (Stripe signature verification instead).

**Request:** Raw body + `Stripe-Signature` header.

**Response:** Always 200 (or Stripe retries). Parse, verify, handle event synchronously.

---

### 17. `POST /api/stripe/create-portal`

**Purpose:** Create Stripe Customer Portal session. Auth required.

**Request:**
```json
{
  "returnUrl": "https://formbaker.dev/app/settings/billing"
}
```

**Response (200):**
```json
{
  "url": "https://billing.stripe.com/p/session/..."
}
```

---

### 18. `GET /api/account/plan`

**Purpose:** Return current user's plan info (for middleware and UI gating).

**Auth:** Session required.

**Response (200):**
```json
{
  "plan": "pro",
  "subscription": {
    "status": "active",
    "currentPeriodEnd": 1722441600000,
    "cancelAtPeriodEnd": false
  },
  "limits": {
    "forms": { "used": 5, "limit": 50 },
    "submissionsPerMonth": { "used": 312, "limit": 10000 },
    "customDomain": true,
    "removeBranding": true
  }
}
```

---

## Files to Create

### New files

| File | Description |
|---|---|
| `docs/src/db/schema.ts` | Union file that re-exports all tables from individual schema files (Phase 1-4) |
| `docs/src/db/submissions-schema.ts` | `formSubmissions` and `submissionCounts` table definitions |
| `docs/src/db/subscriptions-schema.ts` | `subscriptions` table definition |
| `docs/drizzle/0002_submissions_billing.sql` | SQL migration file |
| `docs/src/lib/rate-limit.ts` | In-memory rate limiter (sliding window per IP and per form+IP). Key cleanup on interval. |
| `docs/src/lib/spam.ts` | Spam detection: honeypot check, referrer analysis, optional reCAPTCHA verifier |
| `docs/src/lib/quota.ts` | Plan/quota checker: `checkSubmissionQuota(userId)` — queries `submissionCounts`, compares against plan limits. `incrementSubmissionCount(userId)` |
| `docs/src/lib/stripe.ts` | Singleton Stripe client (`new Stripe(process.env.STRIPE_SECRET_KEY)`), helper functions |
| `docs/src/lib/analytics.ts` | Query helpers: `getSubmissionsOverTime(formId, range)`, `getOverviewAnalytics(userId)` |
| `docs/src/lib/csv.ts` | Converts submission array to CSV string |
| `docs/src/pages/api/embed/[formId]/submit.ts` | Public submission endpoint |
| `docs/src/pages/api/forms/[formId]/submissions/index.ts` | List submissions (GET), bulk delete (DELETE) |
| `docs/src/pages/api/forms/[formId]/submissions/[subId].ts` | Get single (GET), delete single (DELETE) |
| `docs/src/pages/api/forms/[formId]/submissions.csv.ts` | CSV export |
| `docs/src/pages/api/forms/[formId]/analytics.ts` | Per-form analytics endpoint |
| `docs/src/pages/api/analytics/overview.ts` | Dashboard overview analytics |
| `docs/src/pages/api/stripe/create-checkout-session.ts` | Checkout session creation |
| `docs/src/pages/api/stripe/webhook.ts` | Stripe webhook receiver |
| `docs/src/pages/api/stripe/create-portal.ts` | Customer portal session |
| `docs/src/pages/api/account/plan.ts` | Current plan info |
| `docs/src/pages/app/dashboard/index.astro` | Analytics dashboard page |
| `docs/src/pages/app/dashboard/analytics.astro` | Full analytics page with Chart.js |
| `docs/src/pages/app/forms/[id]/submissions.astro` | Submission list with table + search |
| `docs/src/pages/app/settings/billing.astro` | Billing page — plan display, upgrade button, portal link, usage meters |
| `docs/src/components/analytics/SubmissionsChart.astro` | Chart.js `<canvas>` + JS for submissions-over-time line chart |
| `docs/src/components/analytics/FormBreakdown.astro` | Horizontal bar chart of top forms |
| `docs/src/components/analytics/ConversionCard.astro` | Metric card showing conversion rate |
| `docs/src/components/submissions/SubmissionTable.astro` | Paginated table component |
| `docs/src/components/submissions/SubmissionDetail.astro` | Expandable submission detail view |
| `docs/src/components/billing/PlanCard.astro` | Plan comparison card for billing page |
| `docs/src/components/billing/UpgradeButton.astro` | Button that calls `/api/stripe/create-checkout-session` and redirects |
| `docs/src/components/billing/UsageMeter.astro` | Progress bar showing forms used / limit, submissions used / limit |

### Modified files

| File | Change |
|---|---|
| `docs/package.json` | Add `stripe`, `@stripe/stripe-js`, `chart.js` to dependencies |
| `docs/astro.config.mjs` | Switch `output: 'static'` → `output: 'hybrid'` (done in Phase 1); ensure `adapter: node({ mode: 'standalone' })` for stripe SDK |
| `docs/src/middleware.ts` | Add plan-gating check: block form creation beyond limit, block submissions beyond quota. Attach `locals.plan` and `locals.limits` to request context |
| `docs/.env.example` | Document `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` |
| `docs/src/db/index.ts` | Re-export new tables |

---

## Plan Limits & Feature Gating Specification

### Plan Tiers

| Feature | Free | Pro ($29/mo) | Enterprise (custom) |
|---|---|---|---|
| Forms | 3 | 50 | Unlimited |
| Submissions/month | 100 | 10,000 | Unlimited |
| Formbaker branding | Required on embed | Removable | Removable |
| Custom domain | No | Yes | Yes |
| Data export (CSV) | Last 30 days | All | All |
| Analytics retention | 30 days | 1 year | Unlimited |
| Email notifications | No | Yes | Yes |
| Priority support | No | No | Yes |
| On-premises | No | No | Yes |

### Feature Gating Implementation

**In middleware (`docs/src/middleware.ts`):**

```ts
// Plan limits lookup
const PLAN_LIMITS = {
  free:   { forms: 3,   submissionsPerMonth: 100,   customDomain: false, removeBranding: false, csvHistory: 30 },
  pro:    { forms: 50,  submissionsPerMonth: 10000,  customDomain: true,  removeBranding: true,  csvHistory: 365 },
  enterprise: { forms: Infinity, submissionsPerMonth: Infinity, customDomain: true, removeBranding: true, csvHistory: Infinity },
} as const;

// Attach to Astro.locals
locals.plan = user.plan;
locals.limits = PLAN_LIMITS[user.plan];
```

**Form creation gate:** In `POST /api/forms/create`, count user's forms. If `>= PLAN_LIMITS[plan].forms`, return `403 { error: "Plan limit reached. Upgrade to create more forms." }`.

**Submission gate:** In `POST /api/embed/[formId]/submit`, call `checkSubmissionQuota(userId)`. If exceeded, return `429 { error: "Monthly submission limit reached." }`.

**Branding:** On embed page, check `user.plan` — if `free`, inject `<div class="formbaker-branding">Powered by Formbaker</div>` + link into the iframe response.

**Custom domain:** Phase 5 (post-launch). Requires DNS validation.

### Quota Increment Logic

`docs/src/lib/quota.ts`:

```ts
export async function incrementSubmissionCount(db: DrizzleClient, userId: string): Promise<void> {
  const yearMonth = new Date().toISOString().slice(0, 7); // "2026-07"
  await db
    .insert(submissionCounts)
    .values({ id: crypto.randomUUID(), userId, yearMonth, count: 1 })
    .onConflictDoUpdate({
      target: [submissionCounts.userId, submissionCounts.yearMonth],
      set: { count: sql`${submissionCounts.count} + 1` },
    });
}

export async function checkSubmissionQuota(db: DrizzleClient, userId: string, plan: string): Promise<boolean> {
  const limit = PLAN_LIMITS[plan]?.submissionsPerMonth ?? 0;
  if (limit === Infinity) return true;
  const yearMonth = new Date().toISOString().slice(0, 7);
  const row = await db
    .select({ count: submissionCounts.count })
    .from(submissionCounts)
    .where(and(eq(submissionCounts.userId, userId), eq(submissionCounts.yearMonth, yearMonth)))
    .get();
  return (row?.count ?? 0) < limit;
}
```

---

## Checklist

### Submissions
- [ ] `formSubmissions` and `submissionCounts` tables + migration
- [ ] `POST /api/embed/[formId]/submit` — CORS, rate limit, honeypot, quota check, store
- [ ] `GET /api/forms/[formId]/submissions` — paginated, filterable
- [ ] `GET /api/forms/[formId]/submissions/[subId]`
- [ ] `DELETE /api/forms/[formId]/submissions/[subId]`
- [ ] `DELETE /api/forms/[formId]/submissions` (bulk)
- [ ] `GET /api/forms/[formId]/submissions.csv`
- [ ] Submission table UI (`/app/forms/[id]/submissions`)
- [ ] Submission detail expandable view
- [ ] Search/filter on submissions page

### Analytics
- [ ] `GET /api/forms/[formId]/analytics`
- [ ] `GET /api/analytics/overview`
- [ ] Chart.js integration — line chart for submissions over time
- [ ] Chart.js integration — bar chart for form breakdown
- [ ] `ConversionCard` component
- [ ] Analytics dashboard page (`/app/dashboard`)

### Stripe Billing
- [ ] `subscriptions` table + migration
- [ ] `users.stripeCustomerId` and `users.plan` columns
- [ ] Stripe SDK installed and configured
- [ ] `POST /api/stripe/create-checkout-session`
- [ ] `POST /api/stripe/webhook` — signature verification, event handling
- [ ] `POST /api/stripe/create-portal`
- [ ] `GET /api/account/plan`
- [ ] Billing page (`/app/settings/billing`) — current plan, upgrade button, usage meters
- [ ] `PlanCard`, `UpgradeButton`, `UsageMeter` components

### Plan Limits
- [ ] `docs/src/lib/quota.ts` — check + increment functions
- [ ] Middleware attaches `locals.plan` and `locals.limits`
- [ ] Form creation gate (limit check on `POST /api/forms/create`)
- [ ] Submission gate (quota check on `POST /api/embed/[formId]/submit`)
- [ ] Branding injection for free-tier embeds

### Dev & Testing
- [ ] Stripe test mode webhook forwarding (Stripe CLI: `stripe listen --forward-to localhost:4321/api/stripe/webhook`)
- [ ] `.env.example` updated with all Stripe vars
- [ ] Rate limiter tested with load (e.g., `ab` or `oha`)
- [ ] CSV export tested with large submission sets (>1000 rows)

---

## Risks & Notes

1. **Stripe webhook in dev:** Requires `stripe listen` CLI running locally. Document this in README. Use test keys.

2. **Raw body parsing:** Astro's `APIRoute` gives `request` — use `request.text()` not `request.json()` for Stripe signature verification. The webhook handler must read the raw string.

3. **Rate limiter persistence:** In-memory rate limiter resets on server restart. For production, consider Redis. For MVP, in-memory is fine.

4. **Chart.js SSR:** Chart.js is a browser library. Charts render client-side in `<script>` tags. No SSR complications.

5. **CSV export memory:** For forms with >100k submissions, streaming CSV generation prevents OOM. Use `ReadableStream` with `response.body`. For MVP, paginate in-memory.

6. **Spam false positives:** The honeypot + referrer approach catches basic bots. More sophisticated spam needs reCAPTCHA v3 (deferred to Phase 4.5).

7. **Stripe price IDs:** Hardcode Pro/Enterprise price IDs in env vars. Never commit production price IDs. Document how to find them in Stripe Dashboard → Products.

8. **Hybrid output mode:** Astro must be switched to `output: 'hybrid'` (from current `output: 'static'`) for any SSR routes to work. This was planned for Phase 1 — ensure it's done before Phase 4 begins. API routes need `export const prerender = false`.
