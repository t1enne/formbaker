---
title: Plugins API
description: Register, configure, and write custom validation plugins.
---

## `registerPlugin(name, plugin)`

```ts
import { registerPlugin } from "formbaker";
import { zodPlugin } from "formbaker-plugins/zod";

registerPlugin("zod", zodPlugin);
```

Registers a plugin under a name. Must be called before `create()` with
that `pluginName`. Throws if the name is already registered.

## Plugin interface

```ts
interface Plugin {
  (state: PluginState): StandardSchemaV1;
}

interface PluginState {
  nodes: Node[];
  visibleNodes: Node[];
  context: FormContext;
}
```

- `nodes` — all nodes in the form
- `visibleNodes` — subset of nodes currently visible (dependencies
  evaluated)
- `context` — the form context from `create()`

## Built-in plugins

### Zod (`formbaker-plugins/zod`)

```ts
import { zodPlugin } from "formbaker-plugins/zod";
registerPlugin("zod", zodPlugin);
```

Converts visible node constraints into Zod schemas. Each node becomes a
`z.string().min().max()` or equivalent.

### ArkType (`formbaker-plugins/arktype`)

```ts
import { arktypePlugin } from "formbaker-plugins/arktype";
registerPlugin("arktype", arktypePlugin);
```

Converts visible node constraints into ArkType type expressions. Smaller
bundle footprint than Zod.

## Custom plugin example

```ts
import type { Plugin, PluginState } from "formbaker";

const yupPlugin: Plugin = (state: PluginState) => {
  // Not shown: build a Standard Schema V1 from Yup
  // The key: return any StandardSchemaV1-compatible object
};

registerPlugin("yup", yupPlugin);
```

Your plugin only needs to:
1. Accept `PluginState`
2. Return a `StandardSchemaV1` object

How you build the schema (zod, arktype, yup, valibot, hand-rolled) is up to you.

## `getPlugin(name)`

```ts
import { getPlugin } from "formbaker";

const plugin = getPlugin("zod");
// Returns the plugin function, or undefined if not registered
```
