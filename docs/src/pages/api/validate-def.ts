// ponytail: hybrid mode — all docs pages are SSG by default (output: 'static'),
// but API routes like this one run server-side. Set prerender = false on any
// endpoint that needs the request object.
export const prerender = false;

import type { APIRoute } from "astro";

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const formDef = url.searchParams.get("def");

  if (!formDef) {
    return new Response(
      JSON.stringify({ error: "Missing 'def' query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const parsed = JSON.parse(formDef);
    // ponytail: this validates the structure is parseable JSON.
    // Full validation (plugin registration, cycle checks, field types)
    // would require importing the actual formbaker packages here.
    // That's the upgrade path.
    return new Response(
      JSON.stringify({
        valid: true,
        nodes: parsed.nodes?.length ?? 0,
        dependencies: parsed.dependencies?.length ?? 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
};
