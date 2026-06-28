# PHASE 2 — Product Skeleton: Landing, Pricing, Form CRUD, Embed

## Summary

Add marketing pages (landing, pricing), the forms database table, full form CRUD API (authenticated), a public embed-serving API with CORS and rate limiting, basic app pages for form management, and a bare embed preview page. Landing and pricing are fully static. Form management and embed serving run SSR because they hit the database. No rich form builder — forms are edited as JSON text in a textarea. Embed rendering is a JSON dump in this phase.

---

## Files to Create

### 1. `src/db/schema.ts` — add `forms` table

```ts
// Append to the existing schema from Phase 1. The Phase 1 schema already has
// users and sessions tables from drizzle-orm/sqlite-core. Add this table.

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./schema"; // Phase 1 already exports users

export const forms = sqliteTable("forms", {
  id: text("id").primaryKey(), // UUID v4
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  definition: text("definition").notNull(), // JSON string of Formbaker schema
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
```

### 2. `src/db/forms.ts` — form CRUD helpers

Pure functions wrapping Drizzle queries. No auth logic — auth is at the API route layer.

```ts
import { db } from "./db";
import { forms, users } from "./schema";
import { randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import type { Formbaker } from "formbaker";

// --- Types ---

export type FormRow = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;

export interface FormListItem {
  id: string;
  name: string;
  nodeCount: number;
  dependencyCount: number;
  updatedAt: Date;
}

// --- Queries ---

export async function listForms(userId: string): Promise<FormListItem[]> {
  const rows = await db
    .select({
      id: forms.id,
      name: forms.name,
      definition: forms.definition,
      updatedAt: forms.updatedAt,
    })
    .from(forms)
    .where(eq(forms.userId, userId))
    .orderBy(desc(forms.updatedAt));

  return rows.map((r) => {
    let nodeCount = 0;
    let dependencyCount = 0;
    try {
      const def = JSON.parse(r.definition) as Formbaker;
      nodeCount = Object.keys(def.nodes ?? {}).length;
      dependencyCount =
        (def.dependencies?.forward
          ? Object.values(def.dependencies.forward).reduce(
              (sum, deps) => sum + deps.length,
              0,
            )
          : 0);
    } catch {
      // corrupted definition — show zeros
    }
    return { id: r.id, name: r.name, nodeCount, dependencyCount, updatedAt: r.updatedAt };
  });
}

export async function getForm(
  id: string,
  userId: string,
): Promise<FormRow | undefined> {
  const rows = await db
    .select()
    .from(forms)
    .where(and(eq(forms.id, id), eq(forms.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getFormPublic(id: string): Promise<FormRow | undefined> {
  const rows = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
  return rows[0];
}

export async function createForm(
  userId: string,
  name: string,
  definition: string,
): Promise<FormRow> {
  const id = randomUUID();
  const now = new Date();
  const row: NewForm = { id, userId, name, definition, createdAt: now, updatedAt: now };
  await db.insert(forms).values(row);
  return (await getForm(id, userId))!;
}

export async function updateForm(
  id: string,
  userId: string,
  patch: { name?: string; definition?: string },
): Promise<FormRow | undefined> {
  const existing = await getForm(id, userId);
  if (!existing) return undefined;

  await db
    .update(forms)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(forms.id, id), eq(forms.userId, userId)));

  return getForm(id, userId);
}

export async function deleteForm(id: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(forms)
    .where(and(eq(forms.id, id), eq(forms.userId, userId)));
  // Drizzle delete result: rowsAffected is available on some drivers
  // For better-sqlite3 via drizzle, we check by re-querying
  const remaining = await getForm(id, userId);
  return remaining === undefined;
}
```

### 3. `src/pages/api/forms/index.ts` — list + create

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { listForms, createForm } from "../../../db/forms";
import { getUserFromRequest } from "../../../lib/auth"; // Phase 1 middleware sets this

export const GET: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const forms = await listForms(user.id);
  return new Response(JSON.stringify(forms), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { name?: string; definition?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return new Response(JSON.stringify({ error: "name is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.definition || typeof body.definition !== "string") {
    return new Response(JSON.stringify({ error: "definition is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate definition is parseable JSON + has at least nodes and pluginName
  try {
    const def = JSON.parse(body.definition);
    if (!def.pluginName || typeof def.pluginName !== "string") {
      throw new Error("Missing pluginName");
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "definition is not a valid Formbaker schema" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const form = await createForm(user.id, body.name.trim(), body.definition);
  return new Response(JSON.stringify(form), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
```

### 4. `src/pages/api/forms/[id].ts` — get, update, delete

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { getForm, updateForm, deleteForm } from "../../../db/forms";
import { getUserFromRequest } from "../../../lib/auth";

export const GET: APIRoute = async ({ params, request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing form id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const form = await getForm(id, user.id);
  if (!form) {
    return new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(form), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const PUT: APIRoute = async ({ params, request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing form id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { name?: string; definition?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (body.definition) {
    try {
      const def = JSON.parse(body.definition);
      if (!def.pluginName || typeof def.pluginName !== "string") {
        throw new Error("Missing pluginName");
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "definition is not a valid Formbaker schema" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const form = await updateForm(id, user.id, body);
  if (!form) {
    return new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify(form), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing form id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const deleted = await deleteForm(id, user.id);
  if (!deleted) {
    return new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(null, { status: 204 });
};
```

### 5. `src/pages/api/embed/[id].ts` — public embed API

```ts
export const prerender = false;

import type { APIRoute } from "astro";
import { getFormPublic } from "../../../db/forms";

// Simple in-memory rate limiter (ponytail: per-IP, resets on server restart)
// Upgrade path: Redis or a proper token bucket.
const rateLimitWindowMs = 60_000; // 1 minute
const rateLimitMax = 60; // 60 requests per minute
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + rateLimitWindowMs });
    return true;
  }
  if (entry.count >= rateLimitMax) {
    return false;
  }
  entry.count++;
  return true;
}

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60_000).unref();

export const GET: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing form id" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Rate limiting
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Retry-After": "60",
      },
    });
  }

  const form = await getFormPublic(id);
  if (!form) {
    return new Response(JSON.stringify({ error: "Form not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(form.definition, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300", // 5 min CDN cache
    },
  });
};

// Handle CORS preflight
export const OPTIONS: APIRoute = () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};
```

### 6. `src/pages/index.astro` — Landing page

```astro
---
// Landing page — static, no auth required
// ponytail: this is the root marketing page at formbaker.dev
// The docs live at /docs/* via Starlight
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Formbaker — Dynamic Forms, No Effort</title>
  <meta name="description" content="Build dynamic forms where fields appear, disappear, and revalidate based on user input. Works with React, Angular, and plain HTML5." />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    /* Inline critical CSS only — full styles in a shared layout later */
    /* ponytail: use CSS custom properties for the design system */
    :root {
      --color-bg: #0d0d0d;
      --color-surface: #1a1a1a;
      --color-border: #2a2a2a;
      --color-text: #e4e4e4;
      --color-text-muted: #888;
      --color-accent: #7c3aed;
      --color-accent-hover: #6d28d9;
      --color-green: #22c55e;
      --radius: 8px;
      --max-width: 1100px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
    }
    /* ... (full styles in Landing Page Content Outline below) ... */
  </style>
</head>
<body>
  <!-- NAVBAR -->
  <nav>...</nav>

  <!-- HERO -->
  <section id="hero">
    <h1>Dynamic Forms, No Effort</h1>
    <p>Define forms as data. Let fields appear, disappear, and revalidate based on user input — across React, Angular, and plain HTML5.</p>
    <div class="cta-group">
      <a href="/signup" class="btn-primary">Start Building</a>
      <a href="/docs/" class="btn-secondary">See the Docs</a>
    </div>
  </section>

  <!-- CODE DEMO -->
  <section id="demo">
    <!-- Syntax-highlighted JSON definition of a formbaker form -->
  </section>

  <!-- FEATURES GRID -->
  <section id="features">
    <h2>Why Formbaker?</h2>
    <div class="features-grid">
      <div class="feature-card">
        <h3>Define as Data</h3>
        <p>Forms are plain JSON. Version them in git. Generate them programmatically.</p>
      </div>
      <div class="feature-card">
        <h3>Conditional Logic</h3>
        <p>Fields appear, disappear, and revalidate based on previous answers. No imperative spaghetti.</p>
      </div>
      <div class="feature-card">
        <h3>Multi-Framework</h3>
        <p>One form definition. Render with React Hook Form, Angular, or vanilla HTML5.</p>
      </div>
      <div class="feature-card">
        <h3>Validation Plugins</h3>
        <p>Plug in Zod, ArkType, or class-validator. Mix and match per project.</p>
      </div>
      <div class="feature-card">
        <h3>Embed Anywhere</h3>
        <p>Serve forms via iframe. Embed in any website. No JavaScript framework required on the host page.</p>
      </div>
      <div class="feature-card">
        <h3>Open Source</h3>
        <p>MIT licensed. The core engine is free forever. Pay for hosting and advanced features.</p>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section id="cta">
    <h2>Start building dynamic forms today</h2>
    <a href="/signup" class="btn-primary">Get Started Free</a>
  </section>

  <!-- FOOTER -->
  <footer>
    <p>&copy; 2026 Formbaker. <a href="/docs/">Docs</a> · <a href="/pricing">Pricing</a> · <a href="https://github.com/t1enne/formbaker">GitHub</a></p>
  </footer>
</body>
</html>
```

### 7. `src/pages/pricing.astro` — Pricing page

```astro
---
// Pricing page — static, no auth required
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pricing — Formbaker</title>
  <meta name="description" content="Simple, transparent pricing for Formbaker. Start free, upgrade as you grow." />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    /* Shared design tokens from landing */
    /* ... pricing-specific additions ... */
  </style>
</head>
<body>
  <nav><!-- same as landing --></nav>

  <section id="pricing-header">
    <h1>Simple, Transparent Pricing</h1>
    <p>Start free. Upgrade when you need more forms, custom domains, and priority support.</p>
  </section>

  <section id="pricing-tiers">
    <div class="tier tier-free">...</div>
    <div class="tier tier-pro">...</div>
    <div class="tier tier-enterprise">...</div>
  </section>

  <footer><!-- same as landing --></footer>
</body>
</html>
```

### 8. `src/pages/app/forms/index.astro` — Form list (authenticated)

```astro
---
// ponytail: This page requires auth. The Phase 1 middleware attaches user to Astro.locals.
// If no user, redirect to /login.

const user = Astro.locals.user;
if (!user) {
  return Astro.redirect("/login?redirect=/app/forms");
}

// ponytail: fetch forms from the API on the client side, or do SSR fetch.
// For Phase 2, we do a server-side fetch to the internal API.
const apiUrl = new URL("/api/forms", Astro.url);
const response = await fetch(apiUrl, {
  headers: { cookie: Astro.request.headers.get("cookie") ?? "" },
});
const forms = response.ok ? await response.json() : [];
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Forms — Formbaker</title>
</head>
<body>
  <nav>
    <a href="/app/dashboard">Dashboard</a>
    <a href="/app/forms">My Forms</a>
    <span>{user.email}</span>
    <form action="/api/auth/logout" method="POST"><button>Logout</button></form>
  </nav>

  <main>
    <h1>My Forms</h1>
    <a href="/app/forms/new">+ Create Form</a>

    {forms.length === 0 ? <p>No forms yet. Create your first form!</p> : null}

    <table>
      <thead>
        <tr><th>Name</th><th>Nodes</th><th>Updated</th><th></th></tr>
      </thead>
      <tbody>
        {forms.map((f: any) => (
          <tr>
            <td>{f.name}</td>
            <td>{f.nodeCount}</td>
            <td>{new Date(f.updatedAt).toLocaleDateString()}</td>
            <td><a href={`/app/forms/${f.id}`}>Edit</a></td>
          </tr>
        ))}
      </tbody>
    </table>
  </main>
</body>
</html>
```

### 9. `src/pages/app/forms/[id].astro` — Form editor (authenticated)

```astro
---
const user = Astro.locals.user;
if (!user) {
  return Astro.redirect("/login?redirect=" + Astro.url.pathname);
}

const { id } = Astro.params;

const apiUrl = new URL(`/api/forms/${id}`, Astro.url);
const response = await fetch(apiUrl, {
  headers: { cookie: Astro.request.headers.get("cookie") ?? "" },
});

if (!response.ok) {
  return Astro.redirect("/app/forms");
}

const form = await response.json();
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{form.name} — Formbaker</title>
</head>
<body>
  <nav>
    <a href="/app/dashboard">Dashboard</a>
    <a href="/app/forms">My Forms</a>
    <span>{user.email}</span>
    <form action="/api/auth/logout" method="POST"><button>Logout</button></form>
  </nav>

  <main>
    <h1>{form.name}</h1>

    <form id="edit-form" method="post">
      <input type="hidden" name="formId" value={form.id} />

      <label>
        Name
        <input type="text" name="name" value={form.name} required />
      </label>

      <label>
        Definition (JSON)
        <textarea name="definition" rows="20" spellcheck="false" required>{form.definition}</textarea>
      </label>

      <button type="submit">Save</button>
      <button type="button" id="delete-btn">Delete</button>
    </form>

    <div>
      <h2>Embed</h2>
      <code>&lt;iframe src="{new URL(`/embed/${form.id}`, Astro.url).toString()}"&gt;&lt;/iframe&gt;</code>
    </div>
  </main>

  <script>
    // ponytail: vanilla JS for save and delete. Upgrade path: htmx or Preact.
    const edform = document.getElementById("edit-form")!;
    edform.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(edform as HTMLFormElement);
      const res = await fetch(`/api/forms/${fd.get("formId")}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          definition: fd.get("definition"),
        }),
      });
      if (res.ok) alert("Saved!");
      else alert("Error: " + (await res.json()).error);
    });

    document.getElementById("delete-btn")!.addEventListener("click", async () => {
      if (!confirm("Delete this form permanently?")) return;
      const res = await fetch(`/api/forms/${form.id}`, { method: "DELETE" });
      if (res.ok) window.location.href = "/app/forms";
      else alert("Error deleting form");
    });
  </script>
</body>
</html>
```

### 10. `src/pages/app/forms/new.astro` — Create form (authenticated)

```astro
---
const user = Astro.locals.user;
if (!user) {
  return Astro.redirect("/login?redirect=/app/forms/new");
}
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>New Form — Formbaker</title>
</head>
<body>
  <nav>
    <a href="/app/dashboard">Dashboard</a>
    <a href="/app/forms">My Forms</a>
    <span>{user.email}</span>
    <form action="/api/auth/logout" method="POST"><button>Logout</button></form>
  </nav>

  <main>
    <h1>Create Form</h1>

    <form id="create-form">
      <label>
        Name
        <input type="text" name="name" required placeholder="My Survey Form" />
      </label>

      <label>
        Definition (JSON)
        <textarea name="definition" rows="20" spellcheck="false" required placeholder='{"pluginName":"zod","nodes":{},"dependencies":{"forward":{},"backward":{}}}'></textarea>
      </label>

      <button type="submit">Create</button>
    </form>
  </main>

  <script>
    document.getElementById("create-form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          definition: fd.get("definition"),
        }),
      });
      if (res.ok) {
        const form = await res.json();
        window.location.href = `/app/forms/${form.id}`;
      } else {
        const err = await res.json();
        alert("Error: " + err.error);
      }
    });
  </script>
</body>
</html>
```

### 11. `src/pages/embed/[id].astro` — Public embed preview page

```astro
---
// Public page — any website can iframe this.
// ponytail: renders a simple form preview. In this phase, just shows
// the form definition as pretty-printed JSON inside a minimal HTML frame.
// Upgrade path: load formbaker engine from CDN, render actual form inputs.

const { id } = Astro.params;

const apiUrl = new URL(`/api/embed/${id}`, Astro.url);
const response = await fetch(apiUrl);

let definition: string | null = null;
let error: string | null = null;

if (response.ok) {
  definition = await response.text();
} else {
  error = `Form not found (404)`;
}
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Form Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, sans-serif;
      padding: 16px;
      background: #fff;
      color: #111;
      min-height: 100%;
    }
    pre {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .error {
      color: #dc2626;
      padding: 24px;
      text-align: center;
    }
  </style>
</head>
<body>
  {error
    ? <div class="error"><p>{error}</p></div>
    : <pre>{definition ? JSON.stringify(JSON.parse(definition), null, 2) : null}</pre>
  }
</body>
</html>
```

---

## Files to Modify

### `src/db/schema.ts` (created in Phase 1)

Append the `forms` table definition as shown in **File 1** above. Also ensure `forms` is added to the barrel export:

```ts
export { users, sessions, forms } from "./schema";
```

### `astro.config.mjs`

No changes needed from Phase 1. Phase 1 already switched to `output: 'hybrid'`. The Starlight integration handles `/docs/*` with `prerender = true` (static). New pages at `/`, `/pricing`, `/app/*`, `/embed/*` and `/api/*` are either marked static or server-side as needed.

**One addition:** add the new `/api/forms/*` and `/api/embed/*` routes. They're file-based and automatically picked up — no config change needed.

### `package.json`

No new dependencies needed for Phase 2. All API logic uses existing `drizzle-orm` (installed in Phase 1). The pages are pure Astro components — no additional frameworks.

If `formbaker` type-checking is desired for `src/db/forms.ts`, add a workspace reference or devDependency:

```json
{
  "devDependencies": {
    "formbaker": "workspace:*"
  }
}
```

But this is optional — the `definition` field is stored and served as a string, not parsed as a typed object at the DB layer.

---

## Landing Page Content Outline

### Hero Section
- **Headline:** "Dynamic Forms, No Effort"
- **Subheadline:** "Define forms as data. Let fields appear, disappear, and revalidate based on user input — across React, Angular, and plain HTML5."
- **CTA buttons:** "Start Building" (→ /signup, filled purple), "See the Docs" (→ /docs/, outlined)
- **Visual:** Code snippet showing a Formbaker JSON definition with syntax highlighting (purple accented). The snippet shows a form with 3 fields: `name` (text, required), `has_extra` (checkbox), `extra_detail` (text, visible only when `has_extra` is true).

### Features Grid (6 cards, 3×2 on desktop)
1. **Define as Data** — "Forms are plain JSON. Version them in git. Generate them programmatically. No drag-and-drop lock-in."
2. **Conditional Logic** — "Fields appear, disappear, and revalidate based on previous answers. Dependencies are declarative — no imperative spaghetti."
3. **Multi-Framework** — "One form definition. Render with React Hook Form, Angular Reactive Forms, or vanilla HTML5 `<form>`. Pick the integration that fits your stack."
4. **Validation Plugins** — "Plug in Zod, ArkType, or class-validator. Each field gets type-safe validation. Mix and match per project."
5. **Embed Anywhere** — "Serve forms via iframe. Embed in any website. No JavaScript framework required on the host page. Works with WordPress, Webflow, or plain HTML."
6. **Open Source Core** — "MIT licensed. The engine is free forever — inspect it, fork it, contribute. Pay for hosting, collaboration, and enterprise features."

### Code Demo Section
- Show a validated JSON definition inline (10–15 nodes, 3–4 dependencies)
- Side-by-side: JSON on the left, rendered form preview on the right (static screenshot or ASCII-style mockup)
- **ponytail:** Phase 2 uses a static mockup. Phase 3 adds a live iframe preview.

### CTA Section
- "Start building dynamic forms today"
- "Get Started Free" button (→ /signup)
- "No credit card required. Free tier includes up to 3 forms."

### Footer
- Left: Formbaker logo + tagline
- Links: Docs, Pricing, GitHub, Contact
- Bottom: © 2026 Formbaker. MIT License.

---

## Pricing Tiers Specification

### Free Tier
- **Price:** $0/month, forever
- **Includes:**
  - Up to 3 forms
  - Up to 20 fields per form
  - Public embed (with Formbaker branding)
  - Community support (GitHub Discussions)
  - 100 embed loads/month
- **Does not include:** custom domains, remove branding, priority support
- **CTA:** "Start Free" → /signup

### Pro Tier
- **Price:** $19/month (or $190/year — 2 months free)
- **Includes (everything in Free, plus):**
  - Up to 50 forms
  - Up to 200 fields per form
  - Remove Formbaker branding
  - Custom embed domain (CNAME)
  - 50,000 embed loads/month
  - Email support (24h response)
  - Form response collection (webhook)
  - Rate limit: 600 req/min per form
- **CTA:** "Go Pro" → /signup?plan=pro

### Enterprise Tier
- **Price:** Custom (starts at $499/month)
- **Includes (everything in Pro, plus):**
  - Unlimited forms and fields
  - Unlimited embed loads
  - On-premises deployment option
  - SSO / SAML / LDAP
  - Custom SLAs
  - Priority support (4h response)
  - Dedicated account manager
  - Custom integrations
- **CTA:** "Contact Sales" → /contact (or mailto:sales@formbaker.dev)

### Design Notes
- Free tier is prominent and not de-emphasized — it should feel generous, not crippled
- Pro is highlighted (recommended badge, slightly elevated card)
- Enterprise is plain (contact sales)
- Show monthly/yearly toggle (yearly = 17% discount)
- Feature comparison table below the cards

---

## Checklist

- [ ] Add `forms` table to `src/db/schema.ts` and run `drizzle-kit generate` + `drizzle-kit migrate`
- [ ] Create `src/db/forms.ts` with `listForms`, `getForm`, `getFormPublic`, `createForm`, `updateForm`, `deleteForm`
- [ ] Create `src/pages/api/forms/index.ts` (GET list + POST create)
- [ ] Create `src/pages/api/forms/[id].ts` (GET one, PUT update, DELETE)
- [ ] Create `src/pages/api/embed/[id].ts` (GET public, CORS, rate-limited)
- [ ] Create `src/pages/index.astro` (landing page, static)
- [ ] Create `src/pages/pricing.astro` (pricing page, static)
- [ ] Create `src/pages/app/forms/index.astro` (form list, auth required)
- [ ] Create `src/pages/app/forms/[id].astro` (form edit, auth required)
- [ ] Create `src/pages/app/forms/new.astro` (create form, auth required)
- [ ] Create `src/pages/embed/[id].astro` (embed preview, public)
- [ ] Verify all API routes return correct status codes (201 on create, 204 on delete, 401 on unauthenticated, 404 on missing form, 429 on rate limit)
- [ ] Verify ownership checks — `getForm`, `updateForm`, `deleteForm` all check `userId`
- [ ] Verify CORS headers on `/api/embed/*` endpoints (including OPTIONS preflight)
- [ ] Verify landing + pricing are fully static (no SSR, no DB calls)
- [ ] Test: create a form, embed it in an iframe on a separate page, verify CORS + JSON delivery
- [ ] Test: attempt to access `/app/forms` without auth cookie → redirect to `/login`
- [ ] Test: attempt to GET/PUT/DELETE a form belonging to another user → 404 (not 403, to avoid leaking existence)

---

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "PHASE_2.md covers exactly the specified scope: landing page, pricing page, forms table schema, form CRUD API, embed API, app form pages, and embed preview page. No scope creep."
    }
  ],
  "changedFiles": [
    "/home/nasrt/Documents/code/dev/formbaker/plans/PHASE_2.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Plan written to /home/nasrt/Documents/code/dev/formbaker/plans/PHASE_2.md",
    "11 new files specified with path, purpose, and code snippets",
    "2 existing files to modify (db/schema.ts, package.json)",
    "Full content outlines for landing and pricing",
    "3-tier pricing specification",
    "17-item actionable checklist"
  ],
  "residualRisks": [
    "Phase 1 must deliver auth middleware and Astro.locals.user before Phase 2 app pages work",
    "drizzle-kit migration must match the schema additions",
    "Rate limiter is in-memory — resets on server restart; upgrade to Redis before production",
    "Embed page is JSON dump only — no real form rendering until Phase 3",
    "formbaker package import for type-checking requires workspace reference resolution",
    "Astro.file-based routing: /app/forms/[id].astro and /api/forms/[id].ts must not collide (they won't — different path segments)"
  ],
  "noStagedFiles": true,
  "diffSummary": "Created PHASE_2.md — a detailed implementation plan covering 11 new files and 2 file modifications for the Formbaker platform product skeleton (landing, pricing, forms CRUD, embed serving).",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The plan assumes Phase 1 creates src/db/schema.ts with users/sessions tables, src/db/db.ts with the DB singleton, src/lib/auth.ts with getUserFromRequest, and Astro middleware that attaches user to locals. The forms table references users.id via FK — this will fail if Phase 1 schema doesn't export `users`."
}
```
