---
title: Schema
description: The Standard Schema V1 produced by Formbaker's plugin system.
---

Formbaker produces a [Standard Schema
V1](https://github.com/standard-schema/standard-schema)-compatible
validator. This means it works with any library that understands the
standard — React Hook Form resolvers, TanStack Form, etc.

## Accessing the schema

```ts
const form = create({ pluginName: "zod" }, nodes, dependencies);
const schema = form.schema;

// Standard Schema V1 shape:
schema["~standard"]; // { version: 1, vendor: "formbaker-zod", ... }

// Validate:
const result = await schema["~validate"](data);
```

## How the schema is built

1. **Evaluate dependencies** — using current values, determine which nodes
   are visible
2. **Collect visible node constraints** — for each visible node, gather
   `required`, `minLength`, `maxLength`, `min`, `max`, etc.
3. **Delegate to plugin** — call the named plugin with the node set and
   constraints
4. **Return Standard Schema** — the plugin returns a validator that
   conforms to the standard

## Schema derivation is dynamic

The schema changes every time visibility changes. When a field hides, its
constraints are removed from the schema. When it reappears, they're back.

This is handled automatically by integrations like `useFormbakerForm`:

```tsx
// React Hook Form:
// The resolver calls form.schema on every value change,
// so the validation schema always matches visible fields.
const { register } = useFormbakerForm(form);
```

## Using the schema directly

If you're not using an integration, you can validate manually:

```ts
import { create } from "formbaker";

const form = create({ pluginName: "zod" }, nodes, dependencies);

async function validate(values: Record<string, unknown>) {
  const result = await form.schema["~validate"](values);

  if (result.issues) {
    for (const issue of result.issues) {
      console.error(`${issue.path?.join(".")}: ${issue.message}`);
    }
  }

  return result;
}
```

## Standard Schema compatibility

The produced schema implements the full Standard Schema V1 interface.
This includes:

- `"~standard"` metadata property
- `"~validate"` async validation method

It can be used with any resolver or form library that consumes Standard
Schema V1 validators.
