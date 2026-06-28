# @formbaker/integrations/nest

Generates TypeScript source code for a [class-validator](https://github.com/typestack/class-validator) decorated DTO class from a Formbaker form definition.

This is a **code generation** utility — it produces a string of TypeScript source code that you can write to a file, pipe into a build step, or evaluate at runtime.

## Install

```bash
npm install formbaker @formbaker/integrations
```

class-validator is a peer dependency (required at the consumer side if you use the generated code).

## Usage

```ts
import { create, addNode } from "formbaker";
import { formbakerToClassValidator } from "@formbaker/integrations/nest";

let form = create({ pluginName: "zod" });

form = addNode(form, {
  id: "name",
  type: "field",
  fieldType: "text",
  validation: { required: true, min: 2, max: 50 },
});
form = addNode(form, {
  id: "age",
  type: "field",
  fieldType: "number",
  validation: { required: true, min: 18, max: 120 },
});
form = addNode(form, { id: "bio", type: "field", fieldType: "textarea", validation: { min: 10 } });

const code = formbakerToClassValidator(form, { className: "CreateUserDto" });
// import { IsString, IsNumber, MinLength, MaxLength, Min, Max, IsNotEmpty, IsOptional, IsDefined } from "class-validator";
//
// export class CreateUserDto {
//   @IsString()
//   @MinLength(2)
//   @MaxLength(50)
//   @IsNotEmpty()
//   name!: string;
//
//   @IsNumber()
//   @Min(18)
//   @Max(120)
//   @IsDefined()
//   age!: number;
//   ...
// }
```

## API

### `formbakerToClassValidator(form, opts?)`

Returns a TypeScript source code string for a class-validator decorated DTO.

- **`form`** — A `Formbaker` form definition. Sections and dependencies are ignored (only fields matter for DTO generation).
- **`opts.className`** — Name of the generated class (default: `"FormbakerDto"`).
- **`opts.includeImports`** — If true, emit `import` statement for used decorators (default: `true`).
- **`opts.classDecorators`** — Additional decorators to place before the class (e.g. `["@ApiProperty()"]` for swagger).

| Export                      | Type                      | Description                               |
| --------------------------- | ------------------------- | ----------------------------------------- |
| `formbakerToClassValidator` | `(form, opts?) => string` | Generate class-validator DTO source code. |

## Field mapping

| Field type | Decorators                                    | TS type                   |
| ---------- | --------------------------------------------- | ------------------------- |
| `text`     | `@IsString()`, `@MinLength()`, `@MaxLength()` | `string`                  |
| `textarea` | `@IsString()`, `@MinLength()`, `@MaxLength()` | `string`                  |
| `number`   | `@IsNumber()`, `@Min()`, `@Max()`             | `number`                  |
| `select`   | `@IsNumber()`, `@IsIn([...])`                 | `number`                  |
| `checkbox` | `@IsBoolean()`                                | `boolean`                 |
| `radio`    | `@IsBoolean()`                                | `boolean`                 |
| `file`     | `@IsObject()`                                 | `Record<string, unknown>` |

Required fields get `@IsNotEmpty()` (text) or `@IsDefined()` (other types). Optional fields get `@IsOptional()`.
