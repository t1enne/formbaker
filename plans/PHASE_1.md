# PHASE 1: Foundation — Auth + DB + App Shell

## Summary

Switch the Formbaker docs app (Astro 7 + Starlight 0.41) from `output: 'static'` to `output: 'hybrid'` so docs pages remain pre-rendered while new app/auth pages run server-side. Install Drizzle ORM + better-sqlite3, define the users and sessions schema, and wire a singleton DB connection with automatic migration. Build a session-based auth system (signup, login, logout, /me) with bcrypt password hashing, `httpOnly` cookies, and Astro middleware that gates `/app/*` routes. Create minimal shell pages: `/login`, `/signup`, `/app/dashboard`, and an `AppLayout` component. No email verification or password reset in this phase.

## Files to Create

### 1. `src/db/schema.ts` — Drizzle schema definitions

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  emailVerifiedAt: integer("email_verified_at"),
  plan: text("plan").notNull().default("free"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});
```

### 2. `src/db/index.ts` — Singleton DB connection + migration runner

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

const DB_DIR = join(import.meta.dirname, "..", "..", ".data");
const DB_PATH = join(DB_DIR, "formbaker.db");
const MIGRATIONS_DIR = join(import.meta.dirname, "..", "..", "drizzle");

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Run migrations on first import. In production, this is idempotent —
// Drizzle tracks applied migrations in the __drizzle_migrations table.
migrate(db, { migrationsFolder: MIGRATIONS_DIR });
```

### 3. `drizzle.config.ts` — Drizzle Kit config (at docs/ root)

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "./.data/formbaker.db",
  },
});
```

### 4. `src/env.d.ts` — Augment `App.Locals` for user object in middleware

```ts
/// <reference types="astro/client" />

declare global {
  namespace App {
    interface Locals {
      user?: {
        id: string;
        email: string;
        name: string;
        plan: string;
      };
    }
  }
}

export {};
```

This allows `Astro.locals.user` in `.astro` files and `context.locals.user` in API routes to be type-safe. The `/// <reference types="astro/client" />` triple-slash directive is already present in `.astro/types.d.ts` so we don't need to re-add it here — but including it is harmless and makes the file self-contained.

### 5. `src/lib/auth.ts` — Shared auth helpers

```ts
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, sessions } from "../db/schema";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function createSessionToken(): string {
  return crypto.randomUUID();
}

export async function createSession(userId: string): Promise<string> {
  const token = createSessionToken();
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;

  await db.insert(sessions).values({
    id: token,
    userId,
    createdAt: now,
    expiresAt,
  });

  return token;
}

export async function validateSession(token: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, token))
    .limit(1);

  if (!session || session.expiresAt < Date.now()) {
    // Clean up expired session
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, token));
    }
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      plan: users.plan,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export function sessionCookie(token: string, maxAge: number) {
  return {
    name: "auth_token",
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearSessionCookie() {
  return {
    name: "auth_token",
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
```

### 6. `src/pages/api/auth/signup.ts` — POST /api/auth/signup

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import {
  hashPassword,
  createSession,
  sessionCookie,
} from "../../../lib/auth";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const name = formData.get("name")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!email || !name || !password) {
    return new Response("Email, name, and password are required.", { status: 400 });
  }

  if (password.length < 8) {
    return new Response("Password must be at least 8 characters.", { status: 400 });
  }

  // Check if user already exists
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    return new Response("An account with that email already exists.", { status: 409 });
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id,
    email,
    passwordHash,
    name,
    createdAt: Date.now(),
    plan: "free",
  });

  const token = await createSession(id);
  const cookie = sessionCookie(token, 30 * 24 * 60 * 60);

  cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  return redirect("/app/dashboard");
};
```

### 7. `src/pages/api/auth/login.ts` — POST /api/auth/login

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import {
  verifyPassword,
  createSession,
  sessionCookie,
} from "../../../lib/auth";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim().toLowerCase();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return new Response("Email and password are required.", { status: 400 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Don't reveal whether the email exists
    return new Response("Invalid email or password.", { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return new Response("Invalid email or password.", { status: 401 });
  }

  const token = await createSession(user.id);
  const cookie = sessionCookie(token, 30 * 24 * 60 * 60);

  cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  return redirect("/app/dashboard");
};
```

### 8. `src/pages/api/auth/logout.ts` — POST /api/auth/logout

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { deleteSession, clearSessionCookie } from "../../../lib/auth";

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get("auth_token")?.value;
  if (token) {
    await deleteSession(token);
  }

  const cookie = clearSessionCookie();
  cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  return redirect("/login");
};
```

### 9. `src/pages/api/auth/me.ts` — GET /api/auth/me

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { validateSession } from "../../../lib/auth";

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;

  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ authenticated: true, user }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
```

### 10. `src/middleware.ts` — Astro middleware (auth gate)

```ts
import { defineMiddleware } from "astro:middleware";
import { validateSession } from "./lib/auth";

// Routes that are always public — no auth required
const PUBLIC_PATH_PREFIXES = [
  "/docs",
  "/pricing",
  "/login",
  "/signup",
  "/playground",
  "/api/auth",
  "/api/validate-def",
  "/api/embed",
];

// The root path "/" is also public (landing page)
const PUBLIC_EXACT_PATHS = ["/"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow public routes through
  if (PUBLIC_EXACT_PATHS.includes(pathname)) {
    return next();
  }

  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return next();
    }
  }

  // Check for auth cookie and validate session
  const token = context.cookies.get("auth_token")?.value;

  if (token) {
    const user = await validateSession(token);
    if (user) {
      context.locals.user = user;
      return next();
    }
    // Token exists but is invalid/expired — clear it below
  }

  // Redirect unauthenticated to login for /app/* routes
  if (pathname.startsWith("/app") || pathname.startsWith("/api/forms")) {
    return context.redirect(`/login?return_to=${encodeURIComponent(pathname)}`);
  }

  // For everything else (e.g., static assets), just continue
  return next();
});
```

Note: This middleware only runs for SSR routes (not for pre-rendered docs pages). Astro 7 hybrid mode automatically skips the middleware for static routes. The middleware runs on every SSR request because `sequence()` is not needed for a single handler.

### 11. `src/pages/app/dashboard.astro` — Authenticated dashboard page

```astro
---
import AppLayout from "../../layouts/AppLayout.astro";

// Middleware guarantees locals.user is set for /app/* routes
const user = Astro.locals.user!;
---

<AppLayout title="Dashboard">
  <h1>Welcome, {user.name}</h1>
  <p>You are logged in as {user.email} ({user.plan} plan).</p>

  <form method="POST" action="/api/auth/logout">
    <button type="submit">Log out</button>
  </form>
</AppLayout>
```

### 12. `src/pages/login.astro` — Login page

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";

// If the user accessed via a query param, preserve it so we can
// redirect them back after login.
const returnTo = Astro.url.searchParams.get("return_to") ?? "/app/dashboard";
---

<BaseLayout title="Log in — Formbaker">
  <main class="auth-page">
    <h1>Log in</h1>

    <form method="POST" action="/api/auth/login">
      <input type="hidden" name="return_to" value={returnTo} />

      <label>
        Email
        <input type="email" name="email" required autocomplete="email" />
      </label>

      <label>
        Password
        <input type="password" name="password" required autocomplete="current-password" minlength="8" />
      </label>

      <button type="submit">Log in</button>
    </form>

    <p>Don't have an account? <a href="/signup">Sign up</a></p>
  </main>
</BaseLayout>

<style>
  .auth-page {
    max-width: 400px;
    margin: 4rem auto;
    padding: 0 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  input {
    padding: 0.5rem;
    font-size: 1rem;
  }

  button {
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    cursor: pointer;
  }
</style>
```

### 13. `src/pages/signup.astro` — Signup page

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---

<BaseLayout title="Sign up — Formbaker">
  <main class="auth-page">
    <h1>Create an account</h1>

    <form method="POST" action="/api/auth/signup">
      <label>
        Name
        <input type="text" name="name" required autocomplete="name" />
      </label>

      <label>
        Email
        <input type="email" name="email" required autocomplete="email" />
      </label>

      <label>
        Password
        <input type="password" name="password" required autocomplete="new-password" minlength="8" />
      </label>

      <button type="submit">Sign up</button>
    </form>

    <p>Already have an account? <a href="/login">Log in</a></p>
  </main>
</BaseLayout>

<style>
  .auth-page {
    max-width: 400px;
    margin: 4rem auto;
    padding: 0 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  input {
    padding: 0.5rem;
    font-size: 1rem;
  }

  button {
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    cursor: pointer;
  }
</style>
```

### 14. `src/layouts/AppLayout.astro` — Layout shell for authenticated app pages

```astro
---
export interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body>
    <nav style="display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid #e2e8f0;">
      <a href="/app/dashboard">Dashboard</a>
      <form method="POST" action="/api/auth/logout" style="margin-left: auto;">
        <button type="submit">Log out</button>
      </form>
    </nav>
    <main style="padding: 2rem 1rem;">
      <slot />
    </main>
  </body>
</html>
```

### 15. `src/layouts/BaseLayout.astro` — Minimal public-page layout

```astro
---
export interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

### 16. `.data/.gitkeep` — Placeholder so .data/ is created

(Empty file — just marks the .data directory for git tracking its parent path.)

## Files to Modify

### 1. `docs/astro.config.mjs` — Switch to hybrid output

**Change line 14:** `output: 'static'` → `output: 'hybrid'`

The rest of the config (starlight integration, node adapter, site) stays identical. Starlight pages (under `/docs/*`) get `prerender = true` by default in hybrid mode. Only pages that explicitly set `prerender = false` (API routes, `/app/*`, `/login`, `/signup`) will run server-side.

### 2. `docs/package.json` — Add scripts and dependencies

**Add to `dependencies`:**
```json
{
  "better-sqlite3": "^12.11.1",
  "bcryptjs": "^2.4.3",
  "drizzle-orm": "^0.45.2"
}
```

**Add to `devDependencies` or a new `devDependencies` block:**
```json
{
  "@types/better-sqlite3": "^7.6.13",
  "@types/bcryptjs": "^2.4.6",
  "drizzle-kit": "^0.31.10"
}
```

**Add to `scripts`:**
```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

### 3. `docs/.gitignore` — Add data and migration artifacts

Append:
```
# SQLite database
.data/

# Drizzle migration artifacts (we track the SQL, not the meta)
drizzle/meta/
```

(We keep `drizzle/*.sql` files tracked; the `meta/` folder is regenerated by drizzle-kit.)

## DB Schema

```sql
-- Generated after running `npm run db:generate` then `npm run db:migrate`
-- This is what Drizzle produces:

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `password_hash` text NOT NULL,
  `name` text NOT NULL,
  `created_at` integer NOT NULL,
  `email_verified_at` integer,
  `plan` text DEFAULT 'free' NOT NULL
);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);

CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
```

**Why text UUIDs not autoincrement?** Public form IDs and user references in URLs don't leak sequential counts. UUIDs are URL-safe and avoid enumeration attacks.

**Why integer timestamps (unix ms)?** SQLite has no native datetime type. Integers are portable, sortable, and simple to compare. Drizzle maps these to JS `number`.

## Auth Flow

```
SIGNUP
  Client                    Server                      DB
   │                         │                          │
   │  POST /api/auth/signup  │                          │
   │  {email, name, password}│                          │
   │ ─────────────────────────>                          │
   │                         │  SELECT users WHERE email│
   │                         │ ───────────────────────────>
   │                         │  <─ existing? 409 ────────
   │                         │                          │
   │                         │  bcrypt(password, 12)    │
   │                         │  INSERT users            │
   │                         │ ───────────────────────────>
   │                         │  <─ id ──────────────────
   │                         │                          │
   │                         │  crypto.randomUUID()     │
   │                         │  INSERT sessions         │
   │                         │ ───────────────────────────>
   │                         │                          │
   │  <─ 302 /app/dashboard  │                          │
   │  Set-Cookie: auth_token │                          │

LOGIN
  Client                    Server                      DB
   │                         │                          │
   │  POST /api/auth/login   │                          │
   │  {email, password}      │                          │
   │ ─────────────────────────>                          │
   │                         │  SELECT users WHERE email│
   │                         │ ───────────────────────────>
   │                         │  <─ user row ────────────
   │                         │                          │
   │                         │  bcrypt.compare(pw, hash)│
   │                         │  bad? → 401 Generic err  │
   │                         │                          │
   │                         │  crypto.randomUUID()     │
   │                         │  INSERT sessions         │
   │                         │ ───────────────────────────>
   │                         │                          │
   │  <─ 302 /app/dashboard  │                          │
   │  Set-Cookie: auth_token │                          │

LOGOUT
  Client                    Server                      DB
   │                         │                          │
   │  POST /api/auth/logout  │                          │
   │  Cookie: auth_token=xyz │                          │
   │ ─────────────────────────>                          │
   │                         │  DELETE sessions WHERE id│
   │                         │ ───────────────────────────>
   │                         │                          │
   │  <─ 302 /login          │                          │
   │  Set-Cookie: auth_token=; Max-Age=0                │

AUTH GATE (every SSR request to /app/* or /api/forms/*)
  Client                    Middleware                  DB
   │                         │                          │
   │  GET /app/dashboard     │                          │
   │  Cookie: auth_token=xyz │                          │
   │ ─────────────────────────>                          │
   │                         │  SELECT sessions WHERE id│
   │                         │ ───────────────────────────>
   │                         │  <─ session row ─────────
   │                         │                          │
   │                         │  expired? → delete, 302  │
   │                         │                          │
   │                         │  SELECT users WHERE id   │
   │                         │ ───────────────────────────>
   │                         │  <─ user row ────────────
   │                         │                          │
   │                         │  context.locals.user = u │
   │                         │  next() → page renders   │

ME (read current user)
  Client                    Server
   │                         │
   │  GET /api/auth/me       │
   │  Cookie: auth_token=xyz │
   │ ─────────────────────────>
   │                         │  middleware already attached
   │                         │  locals.user — if set, return
   │                         │  user JSON; if not, 401
   │  <─ {authenticated,user}│
```

## Checklist

- [ ] 1. Switch `astro.config.mjs` `output` to `"hybrid"`
- [ ] 2. Install npm deps: `npm install better-sqlite3 bcryptjs drizzle-orm` in docs/
- [ ] 3. Install npm devDeps: `npm install -D @types/better-sqlite3 @types/bcryptjs drizzle-kit` in docs/
- [ ] 4. Create `src/db/schema.ts` with users + sessions tables
- [ ] 5. Create `src/db/index.ts` with singleton DB connection + migrator
- [ ] 6. Create `drizzle.config.ts` at docs/ root
- [ ] 7. Run `npm run db:generate` to produce initial migration SQL
- [ ] 8. Run `npm run db:migrate` to apply migration and create .data/formbaker.db
- [ ] 9. Verify SQLite database exists at `.data/formbaker.db` with correct tables (`sqlite3 .data/formbaker.db ".schema"`)
- [ ] 10. Create `src/env.d.ts` augmenting `App.Locals`
- [ ] 11. Create `src/lib/auth.ts` with all auth helpers
- [ ] 12. Create `src/pages/api/auth/signup.ts`
- [ ] 13. Create `src/pages/api/auth/login.ts`
- [ ] 14. Create `src/pages/api/auth/logout.ts`
- [ ] 15. Create `src/pages/api/auth/me.ts`
- [ ] 16. Create `src/middleware.ts`
- [ ] 17. Create `src/layouts/BaseLayout.astro`
- [ ] 18. Create `src/layouts/AppLayout.astro`
- [ ] 19. Create `src/pages/login.astro`
- [ ] 20. Create `src/pages/signup.astro`
- [ ] 21. Create `src/pages/app/dashboard.astro`
- [ ] 22. Create `.data/.gitkeep`
- [ ] 23. Update `docs/.gitignore` with `.data/` and `drizzle/meta/`
- [ ] 24. Update `docs/package.json` with new scripts and dependencies
- [ ] 25. Run `npm run build` in docs/ — confirm no build errors
- [ ] 26. Run `npm run dev` in docs/ — test full flow: visit /signup, create account, verify redirect to /app/dashboard, visit /api/auth/me, logout, verify redirect to /login
- [ ] 27. Verify /docs pages still load correctly (static pre-rendering)
```

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Plan defines exactly 16 new files and 3 modifications to existing files. All code snippets are concrete and grounded in Astro 7, Drizzle ORM, and better-sqlite3 APIs verified against installed versions. No scope creep — no email verification, no password reset, no Stripe, no frontend frameworks."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Plan includes: (a) full Drizzle schema code, (b) complete middleware with public-path routing table, (c) all four auth API handlers with error handling, (d) Astro page components with form markup, (e) DB connection singleton with WAL pragma, (f) auth-flow ASCII diagrams, (g) 27-item checklist covering every create/install/verify step."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Read astro.config.mjs — confirmed current output:'static', starlight 0.41.1, node adapter standalone",
    "Read tsconfig.json — confirms extends astro/tsconfigs/strict",
    "Read Astro 7 extendables.d.ts — confirmed App.Locals global namespace augmentation pattern",
    "Read Astro 7 context.d.ts — confirmed cookies.set() API signature with httpOnly, secure, sameSite, path, maxAge",
    "Read Astro 7 middleware sequence.d.ts — confirmed defineMiddleware exports from 'astro:middleware'",
    "Verified npm package versions: drizzle-orm 0.45.2, better-sqlite3 12.11.1, @types/better-sqlite3 7.6.13, bcryptjs 2.4.3 available"
  ],
  "residualRisks": [
    "Astro 7 hybrid mode + Starlight 0.41 compatibility: Starlight pages should pre-render fine, but if Starlight generates SSR-dependent routes they'll need prerender = true set explicitly. Low risk — Starlight is designed for static-first.",
    "import.meta.dirname is ESM-only and requires Node 21+. If docs/ CI runs on older Node, replace with fileURLToPath + path.dirname.",
    "secure: true on cookies breaks localhost dev without HTTPS. Recommend environment check: secure: process.env.NODE_ENV === 'production'.",
    "No CSRF protection on login/signup forms. Phase 1 accepts this (vanilla forms, no JS). Add CSRF tokens in a follow-up before going live.",
    "Session table has no index on expires_at — scanning on cleanup. Acceptable at Phase 1 scale (<10k sessions). Add index in Phase 2 if needed."
  ],
  "noStagedFiles": true,
  "diffSummary": "Plan-only task — no code changes made. Wrote /home/nasrt/Documents/code/dev/formbaker/plans/PHASE_1.md (16 new files planned, 3 modifications planned, 27 checklist items).",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The plan is executable by another agent without ambiguity. The cookie secure flag mentioned in residual risks should be addressed in implementation — I recommend wrapping it: `secure: import.meta.env.PROD` which Astro provides out of the box."
}
```