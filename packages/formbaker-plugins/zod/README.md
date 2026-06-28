# @formbaker/plugins/zod

Zod validation plugin for Formbaker. Translates Formbaker field definitions into [Zod](https://zod.dev/) schemas. Zod 4.x schemas natively implement `StandardSchemaV1`, so no adapter wrapping is needed.

## Install

```bash
npm install formbaker @formbaker/plugins zod
```

Zod is a peer dependency; install it alongside this plugin.

## Usage

```ts
import { registerPlugin, create, addNode, validate } from "formbaker";
import { zodPlugin } from "@formbaker/plugins/zod";

registerPlugin("zod", zodPlugin);

const form = create(
  { pluginName: "zod" },
  {
    /* ... */
  },
);
```

## How it works

The plugin uses Zod's builder API to construct schemas for each field type:

- **text / textarea** — `z.string().min(N).max(M)`.
- **number** — `z.number().gte(N).lte(M)`.
- **select** — `z.union([z.literal(0), z.literal(1), ...])`.
- **checkbox / radio** — `z.boolean()`.
- **file** — `z.object({}).passthrough()`.

Optional fields wrap the base schema in `z.union([z.undefined(), z.null(), schema])`.

### Condition evaluation

Since Zod doesn't have ArkType's string-based DSL, the plugin translates common condition patterns:

| Condition   | Behavior                                                  |
| ----------- | --------------------------------------------------------- |
| `"true"`    | Value is not null, not undefined, and not false.          |
| `"string"`  | `typeof value === "string"`                               |
| `"number"`  | `typeof value === "number"`                               |
| `"boolean"` | `typeof value === "boolean"`                              |
| `"object"`  | Value is not null and `typeof value === "object"`         |
| `"any"`     | Always passes.                                            |
| _other_     | Unknown ArkType DSL patterns fall back to always visible. |

## API

`zodPlugin: FormbakerPlugin` — a `{ field, mergeFields, evaluateCondition }` object.

| Export      | Type              | Description                            |
| ----------- | ----------------- | -------------------------------------- |
| `zodPlugin` | `FormbakerPlugin` | Use with `registerPlugin("zod", ...)`. |
