---
title: Serialization
description: Form definitions are pure JSON — store them, load them, share them across stacks.
---

Formbaker form definitions contain no functions, classes, or imports. They
are plain data — strings, numbers, arrays, objects. This means they
survive `JSON.stringify`/`JSON.parse` with no loss.

## Why serialization matters

If your form structure is fixed at compile time, you don't need this. But
when forms are built by non-developers in a configurator UI, stored in a
database, and loaded dynamically at runtime — serialization is essential.

Formbaker is designed for that use case. The form you `create()` by hand
is indistinguishable from one loaded by `JSON.parse()`.

## Round-trip

```ts
import { create } from "formbaker";

const form = create(
  { pluginName: "zod" },
  [{ id: "name", type: "text", question: "Name", required: true }],
  [{ target: "email", source: "subscribe", condition: { equals: true } }],
);

// Serialize
const json = JSON.stringify(form.definition);
// '{"context":{"pluginName":"zod"},"nodes":[...],"dependencies":[...]}'

// Store in DB, send over the wire, etc.
// Later:
const restored = create(JSON.parse(json));
// restored behaves identically to form
```

## What's serializable

All of it:

- **Nodes** — field definitions with `id`, `type`, `question`, constraints
- **Sections** — labels, descriptions, parent relationships
- **Dependencies** — source/target/condition triples with combinators
- **Context** — `pluginName` (a string reference, not a function)

## Plugin references

The `pluginName` is stored as a string. You must register the named plugin
before creating the form from deserialized data:

```ts
registerPlugin("zod", zodPlugin);
// Now you can create forms with pluginName: "zod"
```

This is the key insight: functions can't be serialized, so Formbaker
references them by name instead. The resolution happens at creation time.

## Storage patterns

**Configurator UI → Database → Runtime:**

```ts
// Configurator (browser)
const def = formBuilder.export(); // serializable object
await saveToDB(def);

// Runtime (server or client)
const def = await loadFromDB(formId);
const form = create(def);
```

**Versioning:**

Include a version number in your storage format:

```ts
const stored = {
  version: 1,
  definition: form.definition,
};
```

This lets you migrate form definitions when the schema evolves.
