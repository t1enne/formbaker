---
title: Validation Plugins
description: Plug in Zod, ArkType, or build your own validation backend.
---

Formbaker validates forms through named plugins. The core library imports
no validation library — you register what you need.

## Built-in plugins

Two plugins ship with `formbaker-plugins`:

```ts
import { registerPlugin } from "formbaker";
import { zodPlugin } from "formbaker-plugins/zod";
import { arktypePlugin } from "formbaker-plugins/arktype";

registerPlugin("zod", zodPlugin);
registerPlugin("arktype", arktypePlugin);
```

Register once at app startup. Then reference by name in form definitions:

```ts
const form = create({ pluginName: "zod" }, nodes, dependencies);
```

## Writing a custom plugin

A plugin is a function that takes the current form state and returns a
[Standard Schema V1](https://github.com/standard-schema/standard-schema):

```ts
import type { Plugin } from "formbaker";

const myPlugin: Plugin = (state) => {
  // state contains:
  //   nodes — all node definitions
  //   visibleNodes — only currently-visible nodes
  //   context — { pluginName, ...otherOptions }

  // Return a StandardSchemaV1
  return {
    "~standard": { version: 1, vendor: "my-plugin", ... },
    async "~validate"(data) {
      const issues = [];
      for (const node of state.visibleNodes) {
        if (node.required && !data[node.id]) {
          issues.push({ message: `${node.question} is required`, path: [node.id] });
        }
        // ... more validation
      }
      return { issues };
    },
  };
};
```

## Choosing a plugin

Why use one over the other?

| | Zod | ArkType |
|---|-----|---------|
| Bundle size | ~12 KB gzipped | < 2 KB gzipped |
| Type inference | Yes | Yes (1:1 TS mapping) |
| Syntax | Method chains | String-based expressions |
| Ecosystem | Mature, many integrations | Newer, very fast |

For most projects, either works. If bundle size matters (e.g., an embed
widget), ArkType's <2 KB is compelling. If you already use Zod in your
stack, pick Zod to avoid shipping two validators.
