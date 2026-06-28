# PHASE 5: Polish, Security, On-Premises & Launch

**Status:** Draft
**Date:** 2026-06-28
**Depends on:** Phase 1 (Auth + DB), Phase 2 (Landing + CRUD + Embed), Phase 3 (Form Builder + Live Preview), Phase 4 (Submissions + Analytics + Stripe Billing)

## Summary

Phase 5 is the hardening gate before public launch. It covers account recovery flows (email verification, password reset), enterprise features (custom embed domains), full security audit (CSRF, rate limiting, headers, input validation, session hardening), Docker packaging for on-premises deployments, structured logging, backup strategy, performance audit, accessibility, SEO, and dark mode. When Phase 5 is complete, the platform is production-ready.

---

## Email Verification & Password Reset

### Email Verification Flow

```
SIGNUP
  │
  ▼
POST /api/auth/signup
  │  creates user with emailVerifiedAt = null
  │  generates crypto.randomUUID() as verificationToken
  │  stores token → users.verificationToken, users.verificationTokenExpiresAt (now + 24h)
  │  calls sendVerificationEmail(email, token)
  │  returns 201 { message: "Check your email" }
  │  does NOT create a session
  ▼
User clicks link in email →
GET /api/auth/verify?token=xxx
  │  looks up user by verificationToken WHERE expiresAt > now()
  │  if not found or expired → 400 with "Invalid or expired link. <a href='/resend'>Resend</a>"
  │  sets emailVerifiedAt = now(), clears verificationToken/ExpiresAt
  │  creates session, sets cookie
  │  redirects 302 → /app/dashboard
  ▼
User is logged in.

RESEND VERIFICATION
POST /api/auth/resend-verification
  │  requires email in body
  │  finds user, checks not already verified
  │  regenerates token + expiry
  │  rate-limited: 1 per 60s per email
  ▼
MIDDLEWARE GATE (unverified users)
  │  if session exists but user.emailVerifiedAt is null:
  │    allow GET /app/verify-prompt (page telling them to verify)
  │    allow POST /api/auth/resend-verification
  │    allow POST /api/auth/logout
  │    redirect all other /app/* → /app/verify-prompt
  ▼
```

### Password Reset Flow

```
FORGOT PASSWORD
POST /api/auth/forgot-password
  │  body: { email }
  │  ALWAYS returns 200 { message: "If an account exists, we sent a reset link." }
  │  (no user enumeration)
  │  if user exists:
  │    generates crypto.randomUUID() as resetToken
  │    stores resetToken + resetTokenExpiresAt (now + 1h) on user row
  │    sends reset email with link to /reset-password?token=xxx
  ▼
RESET PAGE
GET /reset-password?token=xxx
  │  SSR page — reads token from query
  │  validates token exists + not expired server-side
  │  if valid → show "New Password" form
  │  if invalid → show "Link expired / invalid" with link to /forgot-password
  ▼
EXECUTE RESET
POST /api/auth/reset-password
  │  body: { token, password }
  │  validates: token exists, not expired, password meets requirements (≥8 chars)
  │  finds user, sets passwordHash = bcryptjs.hash(password)
  │  clears resetToken/resetTokenExpiresAt
  │  invalidates ALL existing sessions for this user (security measure)
  │  creates new session, sets cookie
  │  redirects 302 → /app/dashboard
```

### Email Sending Implementation

Use **Resend** (resend.com) — simple REST API, generous free tier (100 emails/day), Node SDK.

**Environment variables:**

```env
RESEND_API_KEY=re_xxxx
EMAIL_FROM="Formbaker <noreply@formbaker.dev>"
```

**Send utility** (`src/lib/email.ts`):

```ts
import { Resend } from "resend";

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export async function sendEmail(to: string, subject: string, html: string) {
  const { data, error } = await resend.emails.send({
    from: import.meta.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
  if (error) {
    console.error("[email] send failed:", error);
    // Don't throw — we don't want signup to 500 if email fails.
    // Log and move on. User can resend verification.
  }
  return data;
}
```

**Email templates** — use template literal functions, not a template engine:

- `src/lib/email-templates/verify-email.ts`
- `src/lib/email-templates/reset-password.ts`

Content: simple HTML with Formbaker branding, the link, and a fallback plain-text note.

---

## Custom Domains (Pro / Enterprise)

Allows customers to serve their formbaker embeds from their own domain (e.g., `forms.customer.com`) instead of `formbaker.dev/embed/xyz`. This is a Pro/Enterprise feature modeled after how Typeform does it.

### Architecture

```
          DNS
   ┌─────────────────────────────────┐
   │  forms.customer.com  CNAME  →   │
   │  customer.formbaker.dev         │
   └─────────────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────┐
   │  Nginx / Node server            │
   │  Reads Host header              │
   │  Looks up domain → userId       │
   │  Serves only that user's forms  │
   └─────────────────────────────────┘
```

### Database Schema Addition

```sql
-- custom_domains table
CREATE TABLE custom_domains (
  id          TEXT PRIMARY KEY,
  userId      TEXT NOT NULL REFERENCES users(id),
  domain      TEXT NOT NULL UNIQUE,  -- e.g. "forms.customer.com"
  verifiedAt  INTEGER,               -- null until DNS verified
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);
```

### Setup Flow (Admin UI)

1. User goes to `/app/settings/domains` → "Add Custom Domain"
2. Enters their domain: `forms.customer.com`
3. System creates `custom_domains` row, returns:
   - CNAME target: `proxy.formbaker.dev` (or `customer.formbaker.dev`)
   - Verification TXT record: `formbaker-verify=<random-token>`
4. User configures DNS (CNAME + TXT)
5. User clicks "Verify" → `POST /api/domains/:id/verify`
   - Resolves TXT record at `_formbaker-verify.forms.customer.com`
   - If matches stored token → sets `verifiedAt = now()`
6. System now serves embeds from `forms.customer.com` for that user's forms

### DNS Verification Implementation

```ts
// src/lib/dns.ts
import { resolveTxt } from "node:dns/promises";

export async function verifyDomain(domain: string, expectedToken: string): Promise<boolean> {
  try {
    const records = await resolveTxt(`_formbaker-verify.${domain}`);
    return records.some((record) => record.join("").includes(expectedToken));
  } catch {
    return false;
  }
}
```

### Multi-Tenant Embed Serving

```ts
// src/pages/api/embed/[formId].ts
// Reads Host header, determines userId from custom_domains, loads the correct form

export const GET: APIRoute = async ({ request, params }) => {
  const host = request.headers.get("host") || "";
  const formId = params.formId;

  // If host matches a verified custom domain, only serve forms owned by that user
  if (!host.endsWith("formbaker.dev")) {
    const domain = await db.query.customDomains.findFirst({
      where: eq(customDomains.domain, host),
    });
    if (!domain || !domain.verifiedAt) {
      return new Response("Domain not configured", { status: 404 });
    }
    // domain.userId gates which forms can be served
  }

  // ... serve form JSON
};
```

### Proxy Architecture (Recommended for Production)

Custom domains in production need a reverse proxy (Nginx/Caddy) that terminates TLS for arbitrary domains. Options:

**Option A: Wildcard TLS + Nginx** (simplest for self-hosted/on-prem)

- Nginx listens on 443 with a wildcard cert (`*.formbaker.dev`)
- Routes all requests to the Node server
- Node reads the Host header

**Option B: Caddy with on-demand TLS** (simplest for single-server)

- Caddy automatically provisions Let's Encrypt certs for each custom domain
- Zero manual cert management

**Option C: Cloudflare for SaaS** (robust for production)

- Use Cloudflare SSL for SaaS
- Custom hostname API handles cert provisioning
- Customer points CNAME to `proxy.formbaker.dev` (Cloudflare)

**Recommendation for Phase 5:** Option A (wildcard TLS + Nginx) for self-hosted/on-prem, Option C if going fully managed cloud. Document both.

---

## Security Checklist

### 1. CSRF Protection

**Problem:** POST endpoints (login, signup, form CRUD) accept requests from any origin without CSRF token validation. A malicious site can make the user's browser submit forms.

**Implementation:**

Astro 7 does not include CSRF middleware by default. Use the **double-submit cookie** pattern:

```ts
// src/lib/csrf.ts
import crypto from "node:crypto";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "X-CSRF-Token";

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// In middleware: set csrf cookie on all GET /app/* responses
// In POST handlers: compare header value to cookie value

export function validateCsrf(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  const csrfCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));

  if (!csrfCookie) return false;
  const cookieValue = csrfCookie.split("=")[1];
  const headerValue = request.headers.get(CSRF_HEADER);

  return cookieValue === headerValue;
}
```

**Protected routes:** All POST/PUT/DELETE /api/_ and /app/_ endpoints.

**Relaxation:** GET endpoints and /api/embed/\* (public, stateless) are exempt.

**Rate limiting on CSRF token:** Set `SameSite=Lax; HttpOnly; Secure; Path=/`.

### 2. Rate Limiting

Implement a simple in-process rate limiter backed by SQLite. No Redis needed at this scale.

**Schema:**

```sql
CREATE TABLE rate_limits (
  key        TEXT NOT NULL,     -- e.g. "auth:login:192.168.1.1"
  windowStart INTEGER NOT NULL, -- unix ms of window start
  count      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, windowStart)
);
```

**Rate limiter module** (`src/lib/rate-limit.ts`):

```ts
import { db } from "./db";

const LIMITS = {
  "auth:login": { max: 5, windowMs: 60_000 }, // 5 per minute
  "auth:signup": { max: 3, windowMs: 60_000 }, // 3 per minute
  "auth:forgot": { max: 1, windowMs: 60_000 }, // 1 per minute
  "auth:verify": { max: 10, windowMs: 60_000 }, // 10 per minute
  "api:embed": { max: 100, windowMs: 60_000 }, // 100 per minute per IP
  "api:forms:write": { max: 30, windowMs: 60_000 }, // 30 per minute per user
};

type LimitKey = keyof typeof LIMITS;

export async function checkRateLimit(
  key: LimitKey,
  identifier: string,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const now = Date.now();
  const limit = LIMITS[key];
  const windowStart = now - (now % limit.windowMs); // align to window
  const dbKey = `${key}:${identifier}`;

  // Increment or insert
  const query = await db
    .insert(rateLimits)
    .values({ key: dbKey, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    });

  // Get current count
  const row = await db.query.rateLimits.findFirst({
    where: and(eq(rateLimits.key, dbKey), eq(rateLimits.windowStart, windowStart)),
  });

  const count = row?.count ?? 1;
  const remaining = limit.max - count;

  return {
    allowed: remaining >= 0,
    retryAfterMs: remaining < 0 ? limit.windowMs : 0,
  };
}
```

**Cleanup:** A scheduled job every 5 minutes deletes expired rate-limit rows (`windowStart < now - maxWindow`). Run via `setInterval` in the Node process.

**Rate limit headers on every response:**

```ts
headers.set("X-RateLimit-Limit", String(limit.max));
headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
headers.set("X-RateLimit-Reset", String(windowStart + limit.windowMs));
```

### 3. Input Validation with Zod

Every API endpoint must validate request body/params with Zod before processing.

**Pattern:**

```ts
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
});

// In handler:
const parsed = SignupSchema.safeParse(await request.json());
if (!parsed.success) {
  return new Response(
    JSON.stringify({ error: "Validation failed", details: parsed.error.flatten() }),
    { status: 400 },
  );
}
```

**Audit checklist — every API route needs a Zod schema:**

- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- POST /api/auth/resend-verification
- POST/PUT/DELETE /api/forms/\*
- POST /api/domains/\*
- GET /api/embed/[formId] (validate formId is UUID)
- POST /api/submissions/\*

**Form definition validation:** Use the formbaker library's `create()` to validate form definitions on save. Reject invalid definitions with a 422.

### 4. Security Headers

Add via Astro middleware or a Vite plugin. Every response gets:

```ts
// src/middleware.ts
export function onRequest(context, next) {
  const response = await next();

  // CSP: Allow our own scripts, Google Fonts (if used), no inline scripts
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'; object-src 'none'",
  );

  // Don't allow framing (except for embed pages — override there)
  response.headers.set("X-Frame-Options", "DENY");

  // MIME type sniffing prevention
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // HSTS (for production — 1 year, include subdomains)
  if (import.meta.env.PROD) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  return response;
}
```

**Embed override:** The `/api/embed/[formId]` route sets `X-Frame-Options: ALLOW-FROM https://customer.com` or returns no restriction (since embeds must be iframe-able). Also adds `frame-ancestors *` to CSP for embed routes only.

### 5. Session Security

| Measure                      | Implementation                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Cookie flags**             | `HttpOnly, Secure, SameSite=Lax, Path=/`                                           |
| **Session expiry**           | 7 days. Extend on activity (rolling expiry). Hard cap at 30 days                   |
| **Concurrent session limit** | Max 5 active sessions per user. Oldest expires when limit exceeded                 |
| **Session invalidation**     | On password change: delete ALL sessions for that user                              |
| **Session ID rotation**      | After login (prevents session fixation)                                            |
| **Secure session ID**        | `crypto.randomUUID()` or `crypto.randomBytes(32).toString('hex')` — NOT sequential |
| **DB cleanup**               | Delete expired sessions hourly via interval                                        |
| **Activity tracking**        | `sessions.lastActivityAt` column, updated per request if > 1 min since last update |

### 6. Additional Hardening

| Area                            | Mitigation                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| **Password storage**            | bcryptjs with cost factor 12                                                            |
| **SQL injection**               | Drizzle parameterized queries (already safe), no raw SQL strings                        |
| **Environment variables**       | `.env` in `.gitignore`. Validate all required vars on startup                           |
| **Error responses**             | Never expose stack traces. `NODE_ENV=production` catches uncaught exceptions            |
| **Dependency audit**            | `npm audit` in CI. Dependabot or Renovate configured                                    |
| **Brute force**                 | Rate limiting on login (5/min). Lockout after 10 failed attempts from same IP in 15 min |
| **SRI (Subresource Integrity)** | Not needed — all assets are self-hosted, no CDN scripts                                 |
| **Trusted types**               | Optional. Can enforce via CSP if using no inline scripts                                |

---

## Docker & Deployment

### Dockerfile

```dockerfile
# docs/Dockerfile
# Multi-stage build for Formbaker platform

# --- Stage 1: Build ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 and sharp
RUN apk add --no-cache python3 make g++

# Copy workspace config
COPY package.json package-lock.json ./
COPY packages/formbaker/package.json ./packages/formbaker/
COPY packages/formbaker-plugins/package.json ./packages/formbaker-plugins/
COPY packages/formbaker-integrations/package.json ./packages/formbaker-integrations/
COPY docs/package.json ./docs/

# Install dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy source
COPY packages/formbaker/ ./packages/formbaker/
COPY packages/formbaker-plugins/ ./packages/formbaker-plugins/
COPY packages/formbaker-integrations/ ./packages/formbaker-integrations/
COPY docs/ ./docs/

# Build workspace packages
RUN npm run build --workspace=packages/formbaker
RUN npm run build --workspace=packages/formbaker-plugins
RUN npm run build --workspace=packages/formbaker-integrations

# Build Astro app
WORKDIR /app/docs
RUN npm run build

# --- Stage 2: Production ---
FROM node:22-alpine AS runner

WORKDIR /app

# Runtime deps for better-sqlite3 and sharp
RUN apk add --no-cache python3

# Copy workspace packages (built dists)
COPY --from=builder /app/packages/formbaker/package.json /app/packages/formbaker/dist \
  ./packages/formbaker/
COPY --from=builder /app/packages/formbaker-plugins/package.json /app/packages/formbaker-plugins/dist \
  ./packages/formbaker-plugins/
COPY --from=builder /app/packages/formbaker-integrations/package.json /app/packages/formbaker-integrations/dist \
  ./packages/formbaker-integrations/

# Copy Astro build output
COPY --from=builder /app/docs/dist ./docs/dist
COPY --from=builder /app/docs/package.json ./docs/
COPY --from=builder /app/docs/node_modules ./docs/node_modules

# DB directory (volume mount target)
RUN mkdir -p /data

WORKDIR /app/docs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV DATABASE_PATH=/data/formbaker.db

EXPOSE 4321

# Run Astro SSR server via the standalone adapter
CMD ["node", "dist/server/entry.mjs"]
```

### docker-compose.yml

```yaml
# docker-compose.yml (at repo root)
services:
  app:
    build:
      context: .
      dockerfile: docs/Dockerfile
    ports:
      - "4321:4321"
    volumes:
      - db_data:/data # SQLite DB persists here
      - ./backups:/backups # DB backup directory (for cron script)
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test:
        ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4321/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  # Optional: Nginx reverse proxy for TLS termination + custom domains
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  db_data:
```

### nginx.conf Template

```nginx
# nginx.conf (at repo root)
events { worker_connections 1024; }

http {
  include       /etc/nginx/mime.types;
  default_type  application/octet-stream;

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
  limit_req_zone $binary_remote_addr zone=embed:10m rate=100r/m;

  server {
    listen 80;
    server_name formbaker.dev *.formbaker.dev;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name formbaker.dev *.formbaker.dev;

    ssl_certificate     /etc/nginx/certs/formbaker.crt;
    ssl_certificate_key /etc/nginx/certs/formbaker.key;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Rate limit API
    location /api/ {
      limit_req zone=api burst=20 nodelay;
      proxy_pass http://app:4321;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Rate limit embed
    location /api/embed/ {
      limit_req zone=embed burst=50 nodelay;
      proxy_pass http://app:4321;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static assets (long cache)
    location /_astro/ {
      proxy_pass http://app:4321;
      expires 1y;
      add_header Cache-Control "public, immutable";
    }

    # Everything else
    location / {
      proxy_pass http://app:4321;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
```

### Environment Variables

```env
# docs/.env.production
NODE_ENV=production
HOST=0.0.0.0
PORT=4321

# Database
DATABASE_PATH=/data/formbaker.db

# Session
SESSION_SECRET=<crypto.randomBytes(64).toString('hex')>

# Email (Resend)
RESEND_API_KEY=re_xxxx
EMAIL_FROM="Formbaker <noreply@formbaker.dev>"

# Stripe (Phase 4)
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# On-premises (Phase 5)
LICENSE_KEY=
ENABLE_EMBED_RESPONSE_STORAGE=false

# Base URL
PUBLIC_SITE_URL=https://formbaker.dev
```

### On-Premises License System

For on-premises enterprise deployments:

```ts
// src/lib/license.ts
import crypto from "node:crypto";
import { db } from "./db";

interface License {
  customerId: string;
  maxUsers: number;
  maxForms: number;
  expiresAt: number | null; // null = perpetual
  features: string[]; // e.g. ['custom-domains', 'sso', 'audit-log']
}

export function validateLicense(key: string): License | null {
  try {
    // License key format: base64(JSON) || base64(signature)
    const [payloadB64, signatureB64] = key.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString());

    // Verify signature with public key
    const publicKey = import.meta.env.LICENSE_PUBLIC_KEY;
    if (!publicKey) {
      // Dev mode: accept any key
      console.warn("[license] No LICENSE_PUBLIC_KEY set — accepting any key in dev");
      return payload;
    }

    const verifier = crypto.createVerify("SHA256");
    verifier.update(payloadB64);
    const valid = verifier.verify(publicKey, signatureB64, "base64");

    if (!valid) return null;

    // Check expiry
    if (payload.expiresAt && Date.now() > payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}
```

### Health Check Endpoint

```ts
// src/pages/api/health.ts
export const prerender = false;
import type { APIRoute } from "astro";
import { db } from "../../lib/db";

export const GET: APIRoute = async () => {
  const checks: Record<string, boolean> = {};

  try {
    // DB connectivity
    await db.execute(sql`SELECT 1`);
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const healthy = Object.values(checks).every(Boolean);
  const status = healthy ? 200 : 503;

  return new Response(
    JSON.stringify({
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.0.1",
      checks,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
};
```

### DB Backup Strategy

```ts
// scripts/backup.ts — run via cron or docker-compose scheduled task
import { execSync } from "node:child_process";
import { mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = process.env.DATABASE_PATH || "/data/formbaker.db";
const BACKUP_DIR = process.env.BACKUP_DIR || "/backups";
const MAX_BACKUPS = 30; // keep 30 days of backups

const now = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = join(BACKUP_DIR, `formbaker-${now}.db`);

mkdirSync(BACKUP_DIR, { recursive: true });

// SQLite backup via .backup command
execSync(`sqlite3 "${DB_PATH}" ".backup '${backupFile}'"`, {
  stdio: "inherit",
});

console.log(`[backup] Created: ${backupFile}`);

// Rotate old backups
const { readdirSync, statSync, unlinkSync } = require("node:fs");
const files = readdirSync(BACKUP_DIR)
  .filter((f: string) => f.startsWith("formbaker-") && f.endsWith(".db"))
  .map((f: string) => ({ name: f, time: statSync(join(BACKUP_DIR, f)).mtimeMs }))
  .sort((a: any, b: any) => b.time - a.time);

for (const file of files.slice(MAX_BACKUPS)) {
  unlinkSync(join(BACKUP_DIR, file.name));
  console.log(`[backup] Removed old: ${file.name}`);
}
```

**Schedule:** Run hourly via crontab or a container sidecar. Document in deployment guide.

### Structured Logging

```ts
// src/lib/logger.ts
// Simple structured logger — upgrade path to pino/winston later

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  // JSON to stdout — Docker/Nginx/systemd can capture
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => log("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
};
```

### Deployment Guide

Create `docs/DEPLOYMENT.md`:

1. System requirements (Node 22+, 1GB RAM, 10GB disk)
2. Clone repo, copy `.env.example` → `.env.production`, fill values
3. `docker compose up -d`
4. DNS setup (A record for formbaker.dev → server IP)
5. TLS certificate setup (Let's Encrypt via certbot or Caddy)
6. Backup cron setup
7. Upgrade procedure (pull, rebuild, migrate)
8. Monitoring recommendations (Uptime Robot, Sentry for errors)

---

## Polish

### Loading States & Error Boundaries

**Loading states:** Every /app page that fetches data shows a skeleton loader:

- Dashboard: 3 skeleton cards
- Form list: skeleton table rows
- Form editor: skeleton layout matching the real UI

**Error boundaries:** Each /app page wraps its main content in a try/catch. On error, show an error card with:

- "Something went wrong" message
- Retry button
- Error ID for debugging (no stack trace)

**API error handling:** Every API call from the frontend handles 401 (redirect to login), 403 (permission denied message), 429 (show "too many requests, try again in X seconds"), 500 (show generic error).

### 404 & Error Pages

- `src/pages/404.astro` — custom 404 with links to docs, login, signup
- `src/pages/500.astro` — custom 500 with "we've been notified" message
- Starlight docs already have built-in 404

### Responsive Design

**Breakpoints:** Mobile (< 768px), Tablet (768-1024px), Desktop (> 1024px)

**Audit every page:**

- /app/dashboard: stack cards vertically on mobile
- /app/forms/[id]/edit: form builder adapts — sidebar collapses to bottom on mobile
- /app/settings: tabs become vertical on mobile
- /pricing: cards stack instead of side-by-side
- / (landing): all hero sections stack vertically

Use CSS custom properties for breakpoints, no Tailwind unless needed later.

### Dark Mode

Respect `prefers-color-scheme` media query. Provide a manual toggle in `/app/settings`.

**Strategy:** CSS custom properties on `:root` and `[data-theme="dark"]`:

```css
:root {
  --color-bg: #ffffff;
  --color-text: #1a1a2e;
  --color-surface: #f5f5f7;
  --color-border: #e0e0e0;
  --color-primary: #0066ff;
  --color-primary-text: #ffffff;
  --color-muted: #6b7280;
}

[data-theme="dark"] {
  --color-bg: #0f0f1a;
  --color-text: #e4e4e7;
  --color-surface: #1a1a2e;
  --color-border: #2d2d44;
  --color-primary: #4d94ff;
  --color-primary-text: #0f0f1a;
  --color-muted: #9ca3af;
}
```

**Starlight docs:** Starlight has built-in dark mode — no extra work.

### Accessibility

| Check                   | Target                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Color contrast**      | All text ≥ 4.5:1 against background (WCAG AA)                                 |
| **Keyboard navigation** | Tab through all interactive elements. Focus rings visible                     |
| **Form labels**         | Every input has a `<label>` with `for` attribute                              |
| **alt text**            | Every `<img>` has `alt` attribute (descriptive or empty for decorative)       |
| **ARIA landmarks**      | `<nav>`, `<main>`, `<header>`, `<footer>` on every layout                     |
| **Screen reader**       | Test with VoiceOver (macOS) or NVDA (Windows). Error messages use `aria-live` |
| **Skip link**           | "Skip to content" link as first focusable element                             |
| **Touch targets**       | All buttons/links ≥ 44×44px on mobile                                         |
| **Focus order**         | Logical tab order. No `tabindex` > 0                                          |

### SEO

| Item                | Implementation                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| **Sitemap**         | `@astrojs/sitemap` integration. Auto-generates sitemap.xml                     |
| **Meta tags**       | Every page has `<title>`, `<meta name="description">`, Open Graph tags         |
| **Canonical URLs**  | `<link rel="canonical">` on every page                                         |
| **robots.txt**      | Starlight auto-generates. Ensure it exists in `public/robots.txt`              |
| **Structured data** | JSON-LD for docs (TechArticle), landing (Organization), pricing (Product)      |
| **Performance**     | Lighthouse score ≥ 90 for all pages. `< 100KB CSS`, minimal JS on landing/docs |

### Performance Audit

| Target               | How                                                                   |
| -------------------- | --------------------------------------------------------------------- |
| **Docs pages (SSG)** | Already fast. Lighthouse 95+                                          |
| **Landing page**     | No heavy JS. Load fonts inline or with `font-display: swap`           |
| **App pages (SSR)**  | Cache DB queries where possible. Use streaming responses              |
| **API responses**    | < 100ms p50 for read endpoints. < 200ms p95                           |
| **Embed endpoint**   | Must be < 50ms p50. Cache form definitions in memory                  |
| **Assets**           | `sharp` for image optimization (already installed). Compress SVGs     |
| **Bundle size**      | Analyze with `astro build --experimental-bundle-analysis`. Split code |

---

## Files to Create

### Email

- `docs/src/lib/email.ts` — Resend client wrapper
- `docs/src/lib/email-templates/verify-email.ts` — Verification email HTML
- `docs/src/lib/email-templates/reset-password.ts` — Password reset email HTML

### Auth Routes (added to existing auth module)

- `docs/src/pages/api/auth/verify.ts` — GET verify?token=xxx
- `docs/src/pages/api/auth/resend-verification.ts` — POST resend verification email
- `docs/src/pages/api/auth/forgot-password.ts` — POST initiate password reset
- `docs/src/pages/api/auth/reset-password.ts` — POST execute password reset

### Auth Pages

- `docs/src/pages/verify-prompt.astro` — Page shown to unverified users
- `docs/src/pages/reset-password.astro` — Reset password form page
- `docs/src/pages/forgot-password.astro` — Forgot password request page

### Custom Domains

- `docs/src/pages/api/domains/index.ts` — POST create, GET list
- `docs/src/pages/api/domains/[id].ts` — DELETE, GET
- `docs/src/pages/api/domains/[id]/verify.ts` — POST trigger DNS verification
- `docs/src/lib/dns.ts` — DNS verification utility
- `docs/src/pages/app/settings/domains.astro` — Domain management UI

### Security

- `docs/src/lib/csrf.ts` — CSRF token generation and validation
- `docs/src/lib/rate-limit.ts` — Rate limiter
- `docs/src/lib/logger.ts` — Structured logger
- `docs/src/lib/license.ts` — On-prem license validation
- `docs/src/middleware.ts` — Global middleware (security headers, auth gating, CSRF)
- `docs/src/lib/validation-schemas.ts` — Shared Zod schemas for all API routes

### Infrastructure

- `docs/Dockerfile` — Multi-stage Docker build
- `../../docker-compose.yml` — (repo root)
- `../../nginx.conf` — (repo root) Nginx reverse proxy config
- `docs/.env.example` — Template environment file
- `docs/DEPLOYMENT.md` — Deployment guide
- `scripts/backup.ts` — Database backup script
- `docs/src/pages/api/health.ts` — Health check endpoint

### Polish

- `docs/src/pages/404.astro` — Custom 404
- `docs/src/pages/500.astro` — Custom 500
- `docs/src/styles/theme.css` — CSS custom properties for light/dark theme
- `docs/src/components/ThemeToggle.astro` — Theme toggle component
- `docs/src/components/SkeletonLoader.astro` — Reusable skeleton loader
- `docs/src/components/ErrorCard.astro` — Reusable error boundary display
- `docs/src/assets/og-default.png` — Default Open Graph image
- `docs/public/robots.txt` — (if not auto-generated)

### Database Migration Additions

- Column: `users.verificationToken` TEXT
- Column: `users.verificationTokenExpiresAt` INTEGER
- Column: `users.resetToken` TEXT
- Column: `users.resetTokenExpiresAt` INTEGER
- Column: `sessions.lastActivityAt` INTEGER
- Table: `custom_domains`
- Table: `rate_limits`

---

## Launch Checklist

### Pre-Launch Verification

- [ ] All API endpoints have Zod validation
- [ ] All POST/PUT/DELETE endpoints enforce CSRF
- [ ] Rate limiting active on auth and embed endpoints
- [ ] Security headers confirmed via `curl -I` on all response types
- [ ] Session cookies are HttpOnly, Secure, SameSite=Lax
- [ ] Email verification flow tested end-to-end (dev with Resend test key)
- [ ] Password reset flow tested end-to-end
- [ ] Custom domain verification tested with a real domain
- [ ] Docker build succeeds, `docker compose up` works
- [ ] Health check endpoint returns 200
- [ ] DB backup script runs and produces valid .db file
- [ ] Lighthouse audit: landing ≥ 90, docs ≥ 95, /app/dashboard ≥ 80
- [ ] Responsive: all pages tested at 375px, 768px, 1440px
- [ ] Dark mode: toggle works, persists preference in localStorage
- [ ] Accessibility: keyboard navigable, screen-reader tested for critical flows
- [ ] Sitemap accessible at `/sitemap-index.xml`
- [ ] robots.txt allows docs, blocks /app/\*
- [ ] Error pages: visit `/nonexistent` returns custom 404, simulated API failure shows error card
- [ ] npm audit reports 0 critical/high vulnerabilities
- [ ] All env vars documented in `.env.example`
- [ ] DEPLOYMENT.md is complete and step-by-step testable

### Go/No-Go Decision

- [ ] Smoke test: signup → verify email → login → create form → embed form → submit via embed
- [ ] Performance: p95 API latency < 200ms under load
- [ ] Backup restore tested: can restore from backup and start server successfully
- [ ] License key system works (for on-prem)
- [ ] SSL/TLS configured and A+ on SSL Labs

---

_End of Phase 5 plan._
