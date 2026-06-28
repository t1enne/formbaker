# @formbaker/plugins

Validation plugins for Formbaker. Each plugin translates Formbaker field definitions into a validation library's schema DSL and provides a `StandardSchemaV1`-compliant validator.

## Available plugins

| Plugin    | Doc                           | Import                                                       |
| --------- | ----------------------------- | ------------------------------------------------------------ |
| `arktype` | [Readme](./arktype/README.md) | `import { arktypePlugin } from "@formbaker/plugins/arktype"` |
| `zod`     | [Readme](./zod/README.md)     | `import { zodPlugin } from "@formbaker/plugins/zod"`         |

## Usage

Register a plugin by name, then pass that name to `create`:

```ts
import { registerPlugin, create, validate } from "formbaker";
import { arktypePlugin } from "@formbaker/plugins/arktype";

registerPlugin("arktype", arktypePlugin);

const form = create({
  pluginName: "arktype",
  nodes: {
    /* ... */
  },
});
validate(form, values);
```

## Writing a custom plugin

A `FormbakerPlugin` must implement three methods:

```ts
import type { FormbakerPlugin } from "formbaker";

const myPlugin: FormbakerPlugin = {
  field: (field, values) => {
    /* field → StandardSchemaV1 */
  },
  mergeFields: (fields) => {
    /* { [name]: StandardSchemaV1 } → StandardSchemaV1 */
  },
  evaluateCondition: (condition, value) => {
    /* condition string → boolean */
  },
};

registerPlugin("my-plugin", myPlugin);
```

See the [ArkType](./arktype/) or [Zod](./zod/) plugin source for real implementations.
