# @formbaker/plugins/arktype

ArkType validation plugin for Formbaker. Translates Formbaker field definitions into [ArkType](https://arktype.io/) `Type` objects — which natively implement `StandardSchemaV1`, so no adapter wrapping is needed.

## Install

```bash
npm install formbaker @formbaker/plugins arktype
```

ArkType is a peer dependency; install it alongside this plugin.

## Usage

```ts
import { registerPlugin, create, addNode, validate } from "formbaker";
import { arktypePlugin } from "@formbaker/plugins/arktype";

registerPlugin("arktype", arktypePlugin);

const form = create(
  { pluginName: "arktype" },
  {
    /* ... */
  },
);
```

## How it works

The plugin uses ArkType's string-based DSL (`type("string > 0")`) to build validation schemas from `FormbakerField` definitions:

- **text / textarea** — `"string"` (optional), `"string > 0"` (required), with `& string >= N` / `& string <= N` for min/max length.
- **number** — `"number"` (optional), with `"number >= N"` / `"number <= N"` for min/max.
- **select** — union of literal indexes: `"0 | 1 | 2"`.
- **checkbox / radio** — `"boolean"`.
- **file** — `"object"`.

### Condition evaluation

Dependency conditions use ArkType DSL directly. Any valid ArkType expression works:

```ts
addDependency(form, { source: "age", target: "license", condition: "number >= 18" });
// "string" matches string values
// "true" matches exactly `true`
// "unknown" matches anything
// "'yes'" matches the exact string "yes"
// "0 | 1" matches select indexes 0 or 1
```

## API

`arktypePlugin: FormbakerPlugin` — a `{ field, mergeFields, evaluateCondition }` object.

| Export          | Type              | Description                                |
| --------------- | ----------------- | ------------------------------------------ |
| `arktypePlugin` | `FormbakerPlugin` | Use with `registerPlugin("arktype", ...)`. |
