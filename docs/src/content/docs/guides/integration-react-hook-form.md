---
title: React Hook Form Integration
description: Using Formbaker with React Hook Form — dynamic schemas, visibility, and automatic revalidation.
---

The `useFormbakerForm` hook bridges Formbaker and React Hook Form. It
returns a standard `UseFormReturn`, so your existing form code works
unchanged.

## Setup

```bash
npm install formbaker formbaker-integrations react-hook-form @hookform/resolvers
```

## Basic usage

```tsx
import { useFormbakerForm } from "formbaker-integrations/react-hook-form";
import { create } from "formbaker";

const form = create({ pluginName: "zod" }, nodes, dependencies);

function SurveyForm() {
  const {
    register,
    handleSubmit,
    isInSchema,
  } = useFormbakerForm(form);

  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <input {...register("name")} />

      {/* Only render if visible */}
      {isInSchema("pet_name") && (
        <input {...register("pet_name")} />
      )}

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Dynamic schema

The hook rebuilds the validation schema on every value change. When a user
checks a box that triggers a dependency, the schema updates:

1. Form values change → dependency conditions are evaluated
2. Visible fields are recalculated
3. The plugin builds a new Standard Schema from visible fields only
4. React Hook Form re-validates against the new schema

This means a field that hides because its dependency condition is no
longer met is _excluded from validation_ until it becomes visible again.

## `isInSchema(id)`

Returns `true` when the field is visible given current values. Use it to
conditionally render field markup:

```tsx
{isInSchema("advanced_option") && (
  <fieldset>
    <legend>Advanced</legend>
    <input {...register("advanced_option")} />
  </fieldset>
)}
```

## `visibleFields`

Array of currently visible field IDs. Useful for rendering fields
dynamically:

```tsx
const { register, visibleFields } = useFormbakerForm(form);

return (
  <form>
    {visibleFields.map((id) => (
      <input key={id} {...register(id)} />
    ))}
  </form>
);
```

## TypeScript

```tsx
import { useFormbakerForm } from "formbaker-integrations/react-hook-form";
import type { FormDefinition } from "formbaker";

const form: FormDefinition = create(...);

function MyForm() {
  const { register, isInSchema } = useFormbakerForm(form);
  // register() is fully typed from the form definition
}
```
