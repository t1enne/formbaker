# Formey

**Dynamic form engine** — build forms where fields appear, disappear, and revalidate based on user input.

Formey is not a form library like React Hook Form or TanStack Form. It's a lightweight engine that manages form *structure* (fields, sections, dependencies) and dynamically derives an **ArkType schema** from the current form state and visible fields. If your forms are mostly static — fields are always the same — use Formey's dependencies directly (React Hook Form + raw ArkType schemas) or TanStack Form. If your forms have complex conditional visibility rules where field B only matters when field A is a certain value, Formey gives you a declarative dependency graph for that.

## Features

- **Dependency-driven visibility** — fields and sections show/hide based on runtime conditions evaluated against other field values. Dependencies are declared as plain ArkType schemas.
- **Cyclic dependency detection** — adding an edge that would create a cycle throws immediately.
- **Sections** — group fields into labelled, ordered sections with optional description.
- **Field types** — text, number, checkbox, radio, textarea, select, file. Each has type-specific validation (min/max length, min/max value, allowed options).
- **Per-field validation** — required, min, max, with ArkType-level constraints.
- **Reordering** — move fields and sections relative to each other; ordering is recalculated automatically.
- **Auto-numbering** — produce section-question numbering (1, 1.1, 1.2, 2, 2.1, …).
- **Graph layout** — layout the dependency graph using Dagre for visualisation in a UI.
- **Plug into React Hook Form** — `formeyResolver` wraps `@hookform/resolvers/arktype` so you can use Formey with `useForm`.
- **i18n labels** — fields and sections carry `{ it, eng }` translation dicts.

## How it works

Define a form structure imperatively:

```ts
import { create, addNode, addDependency, validate } from "formey";

const form = create({ id: "my-form" });

addNode(form, { id: "has_vehicle", type: "checkbox", label: { eng: "Do you have a vehicle?" } });
addNode(form, { id: "license_plate", type: "text", validation: { required: true } });

addDependency(form, {
  source: "has_vehicle",
  target: "license_plate",
  condition: "true",
});

validate(form, { has_vehicle: true, license_plate: "" });
// → { success: false, data: "...", schema: { license_plate: ... } }

validate(form, { has_vehicle: false });
// → { success: true, data: { has_vehicle: false }, schema: {} }
```

When `has_vehicle` is `false`, `license_plate` is excluded from validation entirely — no error, no required check.

## Comparison

Formey operates at a different layer than these alternatives. It is *not* a form state library — it's a form *structure* engine that generates validation schemas dynamically. You'd typically pair it with React Hook Form or any form state library.

### If you were evaluating from scratch or considering a replacement:

| Alternative | Comparison |
|---|---|
| React Hook Form + raw ArkType schemas | Formey is a layer you could skip by writing ArkType schemas manually. But Formey generates them dynamically from a declarative config (fields + deps + values) — that dynamic generation is the value prop. If your forms are static or per-page handcrafted, raw RHF + ArkType is simpler. |
| TanStack Form | More mature, framework-agnostic, schema-first philosophy. No built-in support for conditional field visibility based on values — you'd need to compose. No graph layout. Would require a custom dependency-graph layer similar to Formey's. |
| React JSON Schema Form (RJSF) | Full renderer + schema in one. Good for JSON-driven forms, but JSON Schema is verbose and not great for conditional logic. Would need a custom widget set for Italian government (Bootstrap Italia) styling. Significantly heavier. |
| @conform-to/react | Progressive, small. Works with any schema library (Zod, ArkType). No dependency graph, no dynamic schema generation — you write the schema once. Lighter but would not replace Formey's dynamic schema generation. |
| Final Form / React Final Form | Mature subscription-based form state. No schema generation — validation is function-based. Would still need a schema generation layer. |

### Quick decision guide

- **"I have a static form with fixed fields."** → Use React Hook Form directly with ArkType schemas.
- **"I want framework-agnostic form state."** → Use TanStack Form.
- **"I have a JSON Schema I want to render as a form."** → Use RJSF.
- **"I have 20+ fields with complex visibility rules that change based on answers."** → Formey gives you the dependency graph for free.

## Why not just RHF + conditional logic?

You can absolutely do `watch()` + `shouldRender` in React Hook Form. That works fine for simple cases. Where it breaks down:

- Validation rules for hidden fields still fire unless you manually skip them.
- Cross-field dependencies (B depends on A, C depends on B, D depends on A and C) become nested conditionals that are hard to trace.
- There's no way to get a DAG layout of your fields for a visual builder.
- Dynamic question numbering (1, 1.1, 1.2, 2, …) requires manual bookkeeping.

Formey's dependency graph solves these at the model level rather than at the render level.

## API

| Function | Purpose |
|---|---|
| `create(params?)` | Create a new empty form |
| `addNode(form, field)` | Add a field |
| `removeNode(form, id)` | Remove a field (fails if it has outgoing deps) |
| `addSection(form, section)` | Add a section (id must start with `#`) |
| `removeSection(form, id)` | Remove a section |
| `addDependency(form, dep)` | Add a visibility dependency |
| `removeDependency(form, dep)` | Remove a dependency |
| `validate(form, values)` | Validate data against the form's current visible schema |
| `getSchema(form, values)` | Get the ArkType schema for the current form state |
| `formeyResolver(form)` | React Hook Form resolver |
| `getSortedNodes(form)` | All nodes sorted by order |
| `getOrderingMap(form)` | Section-question numbering map |
| `moveNode(form, id, targetId)` | Reorder a node relative to another |
| `layoutedGraph(form)` | Dagre-computed node positions |
| `clearForm(form)` | Remove all fields and dependencies |
| `shouldInclude(form, node, value)` | Check if a node is visible given current values |

## Types

All types are in `src/types.ts`. Key types:

- `Formey` — the form object (fields, sections, dependencies)
- `FormeyField` — a field with type, validation, label, etc.
- `FormeySection` — a group of fields
- `FormeyDependency` — `{ source, target, condition }` where condition is an ArkType schema string
- `FormResult` — `{ success, data, schema }`
