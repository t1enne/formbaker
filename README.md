# Formbaker

**Dynamic form engine** — build forms where fields appear, disappear, and revalidate based on user input.

Formbaker is **not** a form library like React Hook Form or Angular Forms — it **complements** them. It's a lightweight engine that manages form _structure_ (fields, sections, dependencies) while the form library handles form state (values, dirty tracking, submission). The integrations bridge the two layers automatically.

The engine dynamically derives a **Standard Schema V1** from the current form state and visible fields. Validation is delegated to a **plugin** — currently ArkType and Zod are built-in. Plugins are registered by name, keeping form definitions fully **serializable as JSON**.

Form definitions are pure data — no functions, no imports. This makes them storable in a database, editable in a configurator UI, and portable across stacks. The form you `create({ pluginName: "zod" })` by hand is indistinguishable from one loaded by `JSON.parse()`.

## Features

- **Immutable API** — `addNode`, `addDependency`, `removeNode`, `moveNode`, etc. all return a new form without modifying the original.
- **Dependency-driven visibility** — fields and sections show/hide based on runtime conditions evaluated against other field values. Dependencies are declared as plain schemas.
- **AND / OR / XOR dependencies** — combine multiple dependencies on the same target using logical combinators. Defaults to OR.
- **Cyclic dependency detection** — adding an edge that would create a cycle throws immediately.
- **Sections** — group fields into labelled, ordered sections with optional description. Sections support nested child fields via `parentId`.
- **Field types** — text, number, checkbox, radio, textarea, select, file. Each has type-specific validation (min/max length, min/max value, allowed options).
- **Per-field validation** — required, min, max.
- **Reordering** — move fields and sections relative to each other; ordering is recalculated automatically.
- **Auto-numbering** — produce section-question numbering (1, 1.1, 1.2, 2, 2.1, …).
- **Plug into React Hook Form** — `useFormbakerForm` hook provides a resolver that rebuilds the schema on value changes.
- **Serializable** — form definitions contain only data (strings, numbers, objects). No functions. `JSON.stringify`/`JSON.parse` round-trips cleanly. Designed for form configurators that store and reload schemas from a database or CMS.
- **Plugin system** — swap validation backends via a named plugin registry. No plugin dependency is bundled unless you register it.

## How it complements your form library

Formbaker isn't a form state library — it's a form _structure_ engine. You use it alongside your existing form library, not instead of it.

### React Hook Form

The `useFormbakerForm` hook returns a standard `UseFormReturn` with a resolver that dynamically rebuilds the validation schema every render. It also returns `isInSchema(id)` and `visibleFields` so you can hide field markup when a dependency excludes it:

```tsx
const { register, isInSchema } = useFormbakerForm(form, watch());

{
  isInSchema("license_plate") && <input {...register("license_plate")} />;
}
```

The resolver handles which fields validate; `isInSchema` lets you decide what renders.

→ See the [React Hook Form integration](./packages/formbaker-integrations/src/react-hook-form/) for a full example.

### Angular Reactive Forms

`rebuildFormGroup` syncs an Angular `FormGroup` to match the form's current visible structure. When a dependency hides a field, its control is removed from the group so it doesn't participate in validation. When it reappears, the control is re-added with its previous value preserved. Pass `{ values: formGroup.value }` to enable visibility evaluation.

→ See the [Angular integration](./packages/formbaker-integrations/src/angular/) for a full example.

### When it pulls its weight

Formbaker shines when your form structure isn't fixed at build time:

- **Form configurators** — users build forms in a drag-and-drop UI. Fields, sections, and dependencies are stored as JSON in a CMS and restored at runtime.
- **Complex conditional logic** — 20+ fields where visibility chains span multiple levels. A dependency graph is easier to reason about than nested `if(showX) { if(showY) { ... } }` conditions.
- **Admin panels with user-defined schemas** — letting non-developers compose survey forms, application forms, or dynamic checkout flows.
- **Dynamic numbering** — auto-numbering (1, 1.1, 1.2, 2, …) that stays correct as sections are added, removed, or reordered.

For a simple static form with a handful of fields, use your form library directly. For anything that feels like a form configurator, Formbaker removes the complexity from the library layer.

## How it works

### 1. Register a validation plugin

```ts
import { registerPlugin } from "formbaker";
import { arktypePlugin } from "@formbaker/plugins/arktype";

registerPlugin("arktype", arktypePlugin);
```

Or for Zod:

```ts
import { registerPlugin } from "formbaker";
import { zodPlugin } from "@formbaker/plugins/zod";

registerPlugin("zod", zodPlugin);
```

### 2. Create a form

The simplest form starts with `create`. All data — fields, sections, dependencies — can be declared inline in a single call. No mutations, no rebinding:

```ts
import { create } from "formbaker";

const form = create({
  pluginName: "arktype",
  nodes: {
    has_vehicle: {
      id: "has_vehicle",
      type: "field",
      fieldType: "checkbox",
      label: { eng: "Do you have a vehicle?" },
    },
    license_plate: {
      id: "license_plate",
      type: "field",
      fieldType: "text",
      validation: { required: true },
    },
  },
  dependencies: {
    forward: {
      has_vehicle: [
        { source: "has_vehicle", target: "license_plate", condition: "true" },
      ],
    },
    backward: {
      license_plate: [
        { source: "has_vehicle", target: "license_plate", condition: "true" },
      ],
    },
  },
});
```

For incremental building — e.g. responding to user interaction in a configurator UI — use `addNode`. Every function is **immutable**: it returns a new form and leaves the original untouched.

```ts
import { create, addNode, addDependency } from "formbaker";

const base = create({ pluginName: "arktype" });

// Add a checkbox — base is unchanged
const withVehicle = addNode(base, {
  id: "has_vehicle",
  type: "field",
  fieldType: "checkbox",
});

// Add a text field — withVehicle is unchanged
const withPlate = addNode(withVehicle, {
  id: "license_plate",
  type: "field",
  fieldType: "text",
  validation: { required: true },
});

// Wire them together — withPlate is unchanged
const final = addDependency(withPlate, {
  source: "has_vehicle",
  target: "license_plate",
  condition: "true",
});

// base still has zero nodes, withVehicle has one, final has everything
console.log(Object.keys(base.nodes).length); // 0
console.log(Object.keys(withVehicle.nodes).length); // 1
console.log(Object.keys(final.nodes).length); // 2
```

Because every operation returns a new snapshot, you get several properties for free:

- **Time-travel debugging** — keep refs to intermediate states and diff them to understand what changed.
- **Undo/redo** — build a stack of form snapshots as the user edits. No diffing or patching required.
- **Concurrent edit safety** — multiple parts of a UI (or multiple users) can read from a shared ref without fear of another part mutating it mid-flight.
- **Predictable `shouldComponentUpdate`** — reference equality checks (`===`) reliably detect changes in React or any virtual-DOM framework.
- **Serializable history** — every snapshot is plain JSON; persist every edit for audit trails or collaborative replay.

### 3. Validate

```ts
validate(form, { has_vehicle: true, license_plate: "" });
// → { success: false, data: "...", schema: ... }

validate(form, { has_vehicle: false });
// → { success: true, data: { has_vehicle: false }, schema: ... }
```

When `has_vehicle` is `false`, `license_plate` is excluded from validation entirely — no error, no required check.

### 4. Sections with children

Sections group fields together. A section's `id` must start with `#`. Child fields link to their parent via `parentId`:

```ts
let form = create({ pluginName: "arktype" });

form = addNode(form, {
  id: "#personal",
  type: "section",
  label: "Personal Information",
  description: "Basic contact details",
});

form = addNode(form, {
  id: "name",
  type: "field",
  fieldType: "text",
  label: "Full name",
  parentId: "#personal",
  validation: { required: true },
});

form = addNode(form, {
  id: "email",
  type: "field",
  fieldType: "text",
  label: "Email",
  parentId: "#personal",
  validation: { required: true },
});
```

Children are ordered independently within their parent section. Removing a section cascades — all children are removed and their dependency edges are cleaned up.

### 5. AND / OR / XOR dependencies

Multiple dependencies on the same target combine logically via `dependencyType`:

```ts
let form = create({ pluginName: "arktype" });
form = addNode(form, { id: "a", type: "field", fieldType: "checkbox" });
form = addNode(form, { id: "b", type: "field", fieldType: "checkbox" });
form = addNode(form, {
  id: "c",
  type: "field",
  fieldType: "text",
  validation: { required: true },
});

// AND — both a AND b must be true for c to show
form = addDependency(form, {
  source: "a",
  target: "c",
  condition: "true",
  dependencyType: "AND",
});
form = addDependency(form, {
  source: "b",
  target: "c",
  condition: "true",
  dependencyType: "AND",
});

// XOR — exactly one of the dependencies must pass
form = addDependency(form, {
  source: "a",
  target: "c",
  condition: "true",
  dependencyType: "XOR",
});
form = addDependency(form, {
  source: "b",
  target: "c",
  condition: "true",
  dependencyType: "XOR",
});

// OR is the default — any dependency passing shows the target
form = addDependency(form, { source: "a", target: "c", condition: "true" }); // dependencyType defaults to "OR"
```



#### How dependency types aggregate

Dependencies with the **same `dependencyType`** are grouped and evaluated by that group's logic gate internally. Then the results of each gate are **OR'd together** — if any group says the target should be visible, it's visible.

This means one target field can have dependencies with different types. The evaluation order is:

1. Collect all deps targeting `c`.
2. Partition them by `dependencyType` into three buckets: `AND`, `OR`, `XOR`.
3. Evaluate each bucket as a single boolean: all must pass for `AND`, any passes for `OR`, exactly one passes for `XOR`.
4. If **any** bucket returns `true`, `c` is visible.

| Expression | Type A→c | Type B→c | Outcome |
|------------|----------|----------|---------|
| A **OR** B | `OR` | `OR` | default — either makes c visible |
| A **AND** B | `AND` | `AND` | both must be `true` for c to show |
| A **XOR** B | `XOR` | `XOR` | exactly one must be `true` |
| **(A AND B) OR C** | `AND` (A→c) | `AND` (B→c) | the AND group fails, the OR group passes → c shows |

In the last row, C's `OR` dependency is on a third field. The AND bucket returns `false` (A is false or B is false), but the OR bucket returns `true` (C is true), so `c` is visible. This is how you compose different logical operators on the same target.

##### What this approach handles well

Simple dependency trees that mirror how a form configurator UI works. An admin toggles a checkbox or picks a condition from a dropdown — each action adds one dep to the database. Common patterns like "show when A AND B" or "show when any of these reasons is checked" are one bucket assignment away, and mixing types for `(A AND B) OR C` is natural.

No expression parsing, no AST, no nesting — every dep is just `{ source, target, condition, dependencyType }`. JSON-serializable in one pass.

##### What it can't do

- **Two independent AND groups targeting the same field** — `(A AND B) OR (C AND D)` is impossible because all AND-typed deps land in the same bucket. You'd need two AND buckets, which means first-class groups.
- **NOT gate** — there's no way to say "show when A is NOT checked." The condition DSL handles some negation (`"false"` shows when the source is falsy), but that's per-dep, not a gate.
- **Nested expressions** — anything like `A AND (B OR C)` requires a dependency group concept the current model doesn't have.

For most form configurators these gaps are fine — real-world forms rarely need more than one level of nesting, and the `condition` DSL handles the "show when unchecked" case. But if you're building a survey tool with complex branching logic, a recursive group model or expression-string approach would be more expressive.

### 6. Serialize and restore

```ts
const json = JSON.stringify(form);
// → all data, no functions dropped

const loaded = JSON.parse(json);
const restored = create({ ...loaded, pluginName: loaded.pluginName });
// Validation works as before — the plugin is resolved by name.
```

## The form configurator use case

Formbaker's strongest use case isn't hand-coding forms — it's building a **form configurator**.

Picture a drag-and-drop UI where admins compose forms from a palette of field types, wire up conditional visibility, and save. The output is a plain JSON object — zero functions, zero imports — that you store in a database or CMS:

```json
{
  "pluginName": "zod",
  "nodes": {
    "has_vehicle": {
      "id": "has_vehicle",
      "type": "field",
      "fieldType": "checkbox",
      "label": { "eng": "Do you have a vehicle?" },
      "order": 1
    },
    "license_plate": {
      "id": "license_plate",
      "type": "field",
      "fieldType": "text",
      "label": { "eng": "License plate" },
      "validation": { "required": true },
      "order": 2
    }
  },
  "dependencies": {
    "forward": {
      "has_vehicle": [
        {
          "source": "has_vehicle",
          "target": "license_plate",
          "condition": "true"
        }
      ]
    },
    "backward": {
      "license_plate": [
        {
          "source": "has_vehicle",
          "target": "license_plate",
          "condition": "true"
        }
      ]
    }
  }
}
```

Later, when a user fills out that form, you `create()` from the stored JSON and call `validate()`. The plugin is resolved by name — the form definition never touches validation code. Same JSON, same behavior, whether it was built by hand or by a configurator.

## Framework integrations

Formbaker provides ready-made integrations for common form state libraries.

| Integration     | Package                   | Source                                                                       |
| --------------- | ------------------------- | ---------------------------------------------------------------------------- |
| React Hook Form | `@formbaker/integrations` | [`/react-hook-form`](./packages/formbaker-integrations/src/react-hook-form/) |
| Angular         | `@formbaker/integrations` | [`/angular`](./packages/formbaker-integrations/src/angular/)                 |

Each integration folder has its own README with install instructions, API docs, and examples.

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

## API

All functions are **immutable** — they return a new form object without modifying the original.

| Function                       | Purpose                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `registerPlugin(name, plugin)` | Register a validation plugin by name                                                       |
| `create(params)`               | Create a new form (requires `pluginName`)                                                  |
| `addNode(form, node)`          | Add a field or section node. Returns a new form.                                           |
| `removeNode(form, id)`         | Remove a node (fails if it has outgoing deps; cascades to children for sections).          |
| `addDependency(form, dep)`     | Add a visibility dependency. `dependencyType` supports `"AND"`, `"OR"` (default), `"XOR"`. |
| `removeDependency(form, dep)`  | Remove a dependency                                                                        |
| `validate(form, values)`       | Validate data against the form's current visible schema                                    |
| `getSchema(form, values)`      | Get the Standard Schema V1 for the current form state                                      |

| `getSortedNodes(form)` | All nodes sorted by order (DFS: sections then their children) |
| `getOrderingMap(form)` | Section-question numbering map |
| `moveNode(form, id, targetId)` | Reorder a node relative to another (renumbers siblings) |
| `clearForm(form)` | Remove all fields and dependencies |
| `isVisible(form, nodeId, values)` | Check if a node is visible given current values (resolves plugin internally) |

## Built-in plugins

| Name                | Package              | Source                                                              |
| ------------------- | -------------------- | ------------------------------------------------------------------- |
| `"arktype"`         | `@formbaker/plugins` | [`/arktype`](./packages/formbaker-plugins/arktype/)                 |
| `"zod"`             | `@formbaker/plugins` | [`/zod`](./packages/formbaker-plugins/zod/)                         |
| `"class-validator"` | `@formbaker/plugins` | [`/class-validator`](./packages/formbaker-plugins/class-validator/) |

Each plugin folder has its own README with detailed documentation.

## Types

All types are in `src/types.ts`. Key types:

- `Formbaker` — the form object (fields, sections, dependencies, `pluginName`)
- `FormbakerField` — a field with type, validation, label, etc.
- `FormbakerSection` — a group of fields
- `FormbakerDependency` — `{ source, target, condition, dependencyType? }` where condition is a schema string and `dependencyType` is `"AND"` | `"OR"` (default) | `"XOR"`
- `FormbakerPlugin` — `(field, values) => StandardSchemaV1`
- `FormbakerPluginName` — `string` (JSON-safe identifier)
- `FormResult` — `{ success, data, schema }`
