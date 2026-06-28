---
title: Form Instance
description: The immutable API for adding, removing, and reordering nodes and dependencies.
---

The object returned by `create()`. All methods return a new instance —
the original is never modified.

## Properties

### `definition`

The serializable form definition (context + nodes + dependencies).

```ts
const json = JSON.stringify(form.definition);
```

### `context`

The form context passed to `create()`.

## Node methods

### `addNode(node)`

```ts
const withField = form.addNode({
  id: "email",
  type: "text",
  question: "Email",
  required: true,
});
// Returns new FormbakerInstance with the node appended
```

### `removeNode(id)`

```ts
const removed = form.removeNode("email");
// Node and all its dependencies are removed
```

### `moveNode(id, position)`

```ts
const reordered = form.moveNode("email", 0);
// position is zero-indexed among nodes of the same parent
```

### `updateNode(id, updates)`

```ts
const updated = form.updateNode("email", { required: false });
// Merges partial updates into the node
```

## Dependency methods

### `addDependency(dep)`

```ts
const withDep = form.addDependency({
  target: "pet_name",
  source: "has_pet",
  condition: { equals: true },
});
// Throws CycleError if this creates a cycle
```

### `removeDependency(target, source?)`

```ts
const cleaned = form.removeDependency("pet_name");
// Remove all deps targeting pet_name
// Or specific: form.removeDependency("pet_name", "has_pet")
```

## Schema methods

### `schema`

The current [Standard Schema V1](https://github.com/standard-schema/standard-schema) object.

```ts
const validator = form.schema;
const result = await validator["~validate"]({ name: "Alice" });
```

### `validate(values)`

Convenience method. Returns a validation result.

```ts
const result = form.validate({ name: "Alice" });
// { success: true, data: { name: "Alice" } }
// { success: false, issues: [{ message: "Name is required", path: ["name"] }] }
```

## Dependency evaluation

### `evaluate(values)`

Returns the set of visible node IDs given current form values:

```ts
const visible = form.evaluate({ has_pet: true });
// Set { "name", "has_pet", "pet_name" }
```

### `isVisible(id, values)`

```ts
form.isVisible("pet_name", { has_pet: false }); // false
form.isVisible("pet_name", { has_pet: true }); // true
```

## Utility

### `produce()`

Returns computed properties:

```ts
const derived = form.produce();
// { numbering: { "name": "1.1", "email": "1.2" }, ... }
```
