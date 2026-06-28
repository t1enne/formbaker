# @formbaker/integrations/react-hook-form

Bridges a Formbaker form definition into [React Hook Form](https://react-hook-form.com/) via the `@hookform/resolvers/standard-schema` resolver.

Since Formbaker's `getSchema()` returns a `StandardSchemaV1`-compliant object, the standard-schema resolver works directly — no intermediate translation needed.

## Install

```bash
npm install formbaker @formbaker/integrations react-hook-form @hookform/resolvers
```

## Usage

```tsx
import { create, addNode, addDependency, registerPlugin } from "formbaker";
import { zodPlugin } from "@formbaker/plugins/zod";
import { useFormbakerForm } from "@formbaker/integrations/react-hook-form";

registerPlugin("zod", zodPlugin);

let form = create({ pluginName: "zod" });

form = addNode(form, {
  id: "has_vehicle",
  type: "field",
  fieldType: "checkbox",
  label: "Do you own a vehicle?",
});

form = addNode(form, {
  id: "license_plate",
  type: "field",
  fieldType: "text",
  label: "License plate number",
  validation: { required: { message: "License plate is required" }, min: 3 },
});

form = addDependency(form, {
  source: "has_vehicle",
  target: "license_plate",
  condition: "true",
});

function VehicleForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useFormbakerForm(form);

  return (
    <form onSubmit={handleSubmit((data) => console.log(data))}>
      <label>
        <input type="checkbox" {...register("has_vehicle")} />I own a vehicle
      </label>

      {form.nodes.license_plate && (
        <label>
          License plate:
          <input {...register("license_plate")} />
          {errors.license_plate && <span>{errors.license_plate.message}</span>}
        </label>
      )}

      <button type="submit">Submit</button>
    </form>
  );
}
```

## API

### `useFormbakerForm(form, values?, opts?)`

Returns a `UseFormReturn` instance pre-configured with a resolver derived from the given Formbaker form definition.

- **`form`** — A `Formbaker` form definition (must have a registered plugin).
- **`values`** — Current form values (default `{}`). The schema is rebuilt on every render so dependency-based visibility changes are reflected. If performance is a concern, memoise `values` externally.
- **`opts`** — Additional `useForm` options (`defaultValues`, `mode`, etc.). The `resolver` is always set by this hook.

| Export             | Type                                                 | Description                                   |
| ------------------ | ---------------------------------------------------- | --------------------------------------------- |
| `useFormbakerForm` | `(form: Formbaker, values?, opts?) => UseFormReturn` | React hook returning react-hook-form methods. |
