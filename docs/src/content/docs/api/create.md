---
title: create()
description: Create a new Formbaker instance.
---

```ts
function create(
  context: FormContext,
  nodes?: Node[],
  dependencies?: Dependency[],
): FormbakerInstance;
```

The `create()` function is the entry point. It produces an immutable form
instance.

## Parameters

### `context`

| Property     | Type     | Description                            |
| ------------ | -------- | -------------------------------------- |
| `pluginName` | `string` | Name of a registered validation plugin |

```ts
const form = create({ pluginName: "zod" });
// At minimum, you need a plugin.
```

### `nodes` (optional)

Array of node definitions. Each node is a field or section.

```ts
const form = create({ pluginName: "zod" }, [
  { id: "name", type: "text", question: "Name", required: true },
  { id: "personal", type: "section", label: "Personal Info" },
]);
```

Omit to start with an empty form and add nodes later.

### `dependencies` (optional)

Array of dependency definitions. Each controls visibility of a target
node.

```ts
const form = create({ pluginName: "zod" }, nodes, [
  { target: "pet_name", source: "has_pet", condition: { equals: true } },
]);
```

## Returns

A `FormbakerInstance` — see [Form Instance](/api/form-instance/) for the
full API.

## Errors

- Throws if `pluginName` doesn't reference a registered plugin.
- Throws if dependencies form a cycle (see [Dependencies](/guides/dependencies/)).
