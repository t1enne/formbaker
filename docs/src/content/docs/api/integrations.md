---
title: Integrations API
description: Framework bridges — React Hook Form and Angular.
---

## React Hook Form

### `useFormbakerForm(form, options?)`

```ts
import { useFormbakerForm } from "formbaker-integrations/react-hook-form";

const {
  register,
  handleSubmit,
  watch,
  formState,
  isInSchema,
  visibleFields,
} = useFormbakerForm(form, {
  defaultValues: { name: "" },
});
```

Returns a standard `UseFormReturn` plus:

| Property | Type | Description |
|----------|------|-------------|
| `isInSchema` | `(id: string) => boolean` | Whether a field is visible given current values |
| `visibleFields` | `string[]` | Array of currently visible field IDs |

All other properties are standard React Hook Form (`register`,
`handleSubmit`, `watch`, `reset`, `formState`, etc.).

## Angular

### `rebuildFormGroup(form, group, options?)`

```ts
import { rebuildFormGroup } from "formbaker-integrations/angular";

const updatedGroup = rebuildFormGroup(form, existingGroup, {
  values: formGroup.value,
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `form` | `FormbakerInstance` | The form engine instance |
| `group` | `FormGroup` | Existing Angular FormGroup to rebuild |
| `options.values` | `Record<string, unknown>` | Current values for visibility evaluation |
| `options.validator` | `ValidatorFn` | Optional custom validator |

Returns a new `FormGroup` with controls matching visible fields. Controls
for hidden fields are removed. Controls for newly-visible fields are
created. Existing control values are preserved through the rebuild.

## When to use which

- **React Hook Form** — use `useFormbakerForm` inside a React component.
  It's a hook that manages the form instance lifecycle.
- **Angular** — use `rebuildFormGroup` imperatively, typically inside
  `ngOnInit` and `valueChanges` subscriptions.
