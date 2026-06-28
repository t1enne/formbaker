---
title: Installation
description: How to install Formbaker and its packages.
---

## Package structure

Formbaker is split into three packages:

| Package | npm | Purpose |
|---------|-----|---------|
| `formbaker` | `formbaker` | Core engine — form creation, dependency graph, schema derivation |
| `formbaker-plugins` | `formbaker-plugins` | Validation backends (Zod, ArkType) |
| `formbaker-integrations` | `formbaker-integrations` | Framework bridges (React Hook Form, Angular) |

```bash
# Everything
npm install formbaker formbaker-plugins formbaker-integrations

# Core only (use your own validation)
npm install formbaker

# Core + React integration
npm install formbaker formbaker-integrations
```

## Peer dependencies

The integrations package has peer dependencies. Install only what you use:

```bash
# React Hook Form integration
npm install formbaker formbaker-integrations react-hook-form @hookform/resolvers

# Angular integration
npm install formbaker formbaker-integrations @angular/forms
```

## Plugin registration

Plugins must be registered before creating forms:

```ts
import { registerPlugin } from "formbaker";
import { zodPlugin } from "formbaker-plugins/zod";

registerPlugin("zod", zodPlugin);
```

If you use `formbaker-plugins`, the plugins are importable. If you write your own, register it the same way:

```ts
registerPlugin("my-validator", {
  buildSchema(nodes) {
    // return a StandardSchemaV1
  },
});
```

## TypeScript

TypeScript types are included. No additional `@types/` packages needed.
