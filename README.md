# Formbaker

**Dynamic form engine** — build forms where fields appear, disappear, and revalidate based on user input.

Formbaker is not a form library like React Hook Form or TanStack Form. It's a lightweight engine that manages form _structure_ (fields, sections, dependencies) and dynamically derives a **Standard Schema V1** from the current form state and visible fields. Validation is delegated to a **plugin** — currently ArkType and Zod are built-in. Plugins are registered by name, keeping form definitions fully **serializable as JSON**.

If your forms are mostly static — fields are always the same — use Formbaker's dependencies directly (React Hook Form + raw schemas) or TanStack Form. If your forms have complex conditional visibility rules where field B only matters when field A is a certain value, Formbaker gives you a declarative dependency graph for that.

## Features

- **Dependency-driven visibility** — fields and sections show/hide based on runtime conditions evaluated against other field values. Dependencies are declared as plain schemas.
- **Cyclic dependency detection** — adding an edge that would create a cycle throws immediately.
- **Sections** — group fields into labelled, ordered sections with optional description.
- **Field types** — text, number, checkbox, radio, textarea, select, file. Each has type-specific validation (min/max length, min/max value, allowed options).
- **Per-field validation** — required, min, max.
- **Reordering** — move fields and sections relative to each other; ordering is recalculated automatically.
- **Auto-numbering** — produce section-question numbering (1, 1.1, 1.2, 2, 2.1, …).
- **Plug into React Hook Form** — `formbakerResolver` wraps `@hookform/resolvers/standard-schema` so you can use Formbaker with `useForm`.
- **Serializable** — form definitions contain only data (strings, numbers, objects). No functions. `JSON.stringify`/`JSON.parse` round-trips cleanly.
- **Plugin system** — swap validation backends via a named plugin registry. No plugin dependency is bundled unless you register it.

## How it works

### 1. Register a validation plugin

```ts
import { registerPlugin } from "formbaker";
import { arktypePlugin } from "formbaker/plugins/arktype";

registerPlugin("arktype", arktypePlugin);
```

Or for Zod:

```ts
import { registerPlugin } from "formbaker";
import { zodPlugin } from "formbaker/plugins/zod";

registerPlugin("zod", zodPlugin);
```

### 2. Create a form

```ts
import { create, addNode, addDependency, validate } from "formbaker";

const form = create({ id: "my-form", pluginName: "arktype" });

addNode(form, {
  id: "has_vehicle",
  type: "checkbox",
  label: { eng: "Do you have a vehicle?" },
});
addNode(form, {
  id: "license_plate",
  type: "text",
  validation: { required: true },
});

addDependency(form, {
  source: "has_vehicle",
  target: "license_plate",
  condition: "true",
});
```

### 3. Validate

```ts
validate(form, { has_vehicle: true, license_plate: "" });
// → { success: false, data: "...", schema: ... }

validate(form, { has_vehicle: false });
// → { success: true, data: { has_vehicle: false }, schema: ... }
```

When `has_vehicle` is `false`, `license_plate` is excluded from validation entirely — no error, no required check.

### 4. Serialize and restore

```ts
const json = JSON.stringify(form);
// → all data, no functions dropped

const loaded = JSON.parse(json);
const restored = create({ ...loaded, pluginName: loaded.pluginName });
// Validation works as before — the plugin is resolved by name.
```

## Plugin system

The `Formbaker` object stores its plugin as a **string name** (`pluginName: "arktype"` or `"zod"`). The actual plugin function is mapped from the name at validation time via the global registry.

```ts
registerPlugin("zod", zodPlugin);
const form = create({ pluginName: "zod" });
// → form can be JSON.stringify'd
```

This means:

- **No default plugin** — you must call `create({ pluginName: "..." })`.
- **Custom plugins** — a `FormbakerPlugin` is just `(field, values) => StandardSchemaV1`.
- **Serialization works** because the form object has no function references.

## Comparison

Formbaker operates at a different layer than these alternatives. It is _not_ a form state library — it's a form _structure_ engine that generates validation schemas dynamically. You'd typically pair it with React Hook Form or any form state library.

### If you were evaluating from scratch or considering a replacement:

| Alternative                   | Comparison                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Hook Form + raw schemas | Formbaker is a layer you could skip by writing schemas manually. But Formbaker generates them dynamically from a declarative config (fields + deps + values) — that dynamic generation is the value prop. If your forms are static or per-page handcrafted, raw RHF + your schema lib is simpler. |
| TanStack Form                 | More mature, framework-agnostic, schema-first philosophy. No built-in support for conditional field visibility based on values — you'd need to compose. No graph layout. Would require a custom dependency-graph layer similar to Formbaker's.                                                    |
| React JSON Schema Form (RJSF) | Full renderer + schema in one. Good for JSON-driven forms, but JSON Schema is verbose and not great for conditional logic. Would need a custom widget set for Italian government (Bootstrap Italia) styling. Significantly heavier.                                                               |
| @conform-to/react             | Progressive, small. Works with any schema library (Zod, ArkType). No dependency graph, no dynamic schema generation — you write the schema once. Lighter but would not replace Formbaker's dynamic schema generation.                                                                             |
| Final Form / React Final Form | Mature subscription-based form state. No schema generation — validation is function-based. Would still need a schema generation layer.                                                                                                                                                            |

### Quick decision guide

- **"I have a static form with fixed fields."** → Use React Hook Form directly with your schema library.
- **"I want framework-agnostic form state."** → Use TanStack Form.
- **"I have a JSON Schema I want to render as a form."** → Use RJSF.
- **"I have 20+ fields with complex visibility rules that change based on answers."** → Formbaker gives you the dependency graph for free.

## Why not just RHF + conditional logic?

You can absolutely do `watch()` + `shouldRender` in React Hook Form. That works fine for simple cases. Where it breaks down:

- Validation rules for hidden fields still fire unless you manually skip them.
- Cross-field dependencies (B depends on A, C depends on B, D depends on A and C) become nested conditionals that are hard to trace.
- There's no way to get a DAG layout of your fields for a visual builder.
- Dynamic question numbering (1, 1.1, 1.2, 2, …) requires manual bookkeeping.

Formbaker's dependency graph solves these at the model level rather than at the render level.

## API

| Function                           | Purpose                                                 |
| ---------------------------------- | ------------------------------------------------------- |
| `registerPlugin(name, plugin)`     | Register a validation plugin by name                    |
| `create(params)`                   | Create a new form (requires `pluginName`)               |
| `addNode(form, field)`             | Add a field                                             |
| `removeNode(form, id)`             | Remove a field (fails if it has outgoing deps)          |
| `addSection(form, section)`        | Add a section (id must start with `#`)                  |
| `removeSection(form, id)`          | Remove a section                                        |
| `addDependency(form, dep)`         | Add a visibility dependency                             |
| `removeDependency(form, dep)`      | Remove a dependency                                     |
| `validate(form, values)`           | Validate data against the form's current visible schema |
| `getSchema(form, values)`          | Get the Standard Schema V1 for the current form state   |
| `formbakerResolver(form)`          | React Hook Form resolver                                |
| `getSortedNodes(form)`             | All nodes sorted by order                               |
| `getOrderingMap(form)`             | Section-question numbering map                          |
| `moveNode(form, id, targetId)`     | Reorder a node relative to another                      |
| `clearForm(form)`                  | Remove all fields and dependencies                      |
| `shouldInclude(form, node, value)` | Check if a node is visible given current values         |

## Built-in plugins

| Name        | Source                      | Export                     |
| ----------- | --------------------------- | -------------------------- |
| `"arktype"` | `formbaker/plugins/arktype` | `import { arktypePlugin }` |
| `"zod"`     | `formbaker/plugins/zod`     | `import { zodPlugin }`     |

## Types

All types are in `src/types.ts`. Key types:

- `Formbaker` — the form object (fields, sections, dependencies, `pluginName`)
- `FormbakerField` — a field with type, validation, label, etc.
- `FormbakerSection` — a group of fields
- `FormbakerDependency` — `{ source, target, condition }` where condition is a schema string
- `FormbakerPlugin` — `(field, values) => StandardSchemaV1`
- `FormbakerPluginName` — `string` (JSON-safe identifier)
- `FormResult` — `{ success, data, schema }`
