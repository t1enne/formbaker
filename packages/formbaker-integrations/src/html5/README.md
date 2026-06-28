# @formbaker/integrations/html5

Bridges a Formbaker form definition into the browser's native [Constraint Validation API](https://developer.mozilla.org/en-US/docs/Web/HTML/Constraint_validation) (the `setCustomValidity` / `reportValidity` system).

No framework needed — works with plain HTML forms. Just provide a function that maps field IDs to their DOM elements.

## Install

```bash
npm install formbaker @formbaker/integrations
```

## Usage

```ts
import { create, addNode, registerPlugin } from "formbaker";
import { zodPlugin } from "@formbaker/plugins/zod";
import { attachCustomValidation, validateForm } from "@formbaker/integrations/html5";

registerPlugin("zod", zodPlugin);

let form = create({ pluginName: "zod" });

form = addNode(form, {
  id: "name",
  type: "field",
  fieldType: "text",
  label: "Full name",
  validation: { required: { message: "Name is required" }, min: 2 },
});

form = addNode(form, {
  id: "age",
  type: "field",
  fieldType: "number",
  label: "Age",
  validation: { required: true, min: 18, max: 120 },
});

// Getter function: maps field IDs to their DOM elements
const getEl = (id: string) => document.getElementById(id) as HTMLInputElement;

// Option A: auto-wire on blur/input events
const cleanup = attachCustomValidation(form, getEl);

// Option B: validate explicitly (e.g. on form submit)
document.querySelector("form")!.addEventListener("submit", (e) => {
  e.preventDefault();
  const valid = validateForm(form, getEl);
  if (valid) {
    // submit
  }
});
```

## How it works

The HTML5 Constraint Validation API lets you set a custom error message on a form element via `element.setCustomValidity(message)`. When the message is non-empty, the element is invalid. When empty, the element's native validity (required, min, max, type) takes over.

This integration:

1. Runs Formbaker's `getSchema().validate()` against the current form values.
2. Maps each validation error back to the corresponding DOM element.
3. Calls `setCustomValidity(errorMessage)` on each element — or `setCustomValidity("")` to clear errors.

For live validation, `attachCustomValidation` listens on `blur` and `input` events, performing validation on the changed field only.

## API

### `attachCustomValidation(form, getElement, options?)`

Wires up live validation on form elements. Returns a cleanup function.

- **`form`** — A `Formbaker` form definition.
- **`getElement`** — `(fieldId: string) => HTMLElement | null` — returns the DOM element for a field.
- **`options.validateOn`** — Event types to trigger validation (default: `["blur", "input"]`).
- **`options.onValid`** — `(fieldId: string) => void` — called when a field passes validation.
- **`options.onInvalid`** — `(fieldId: string, message: string) => void` — called when a field fails.

Returns `() => void` — call to remove all event listeners.

### `validateForm(form, getElement)`

Validates all visible fields against the Formbaker schema. Calls `setCustomValidity` and `reportValidity` on each element. Returns `true` if all fields are valid.

- **`form`** — A `Formbaker` form definition.
- **`getElement`** — `(fieldId: string) => HTMLElement | null` — returns the DOM element for a field.

### `clearValidation(form, getElement)`

Clears all custom validity messages on visible fields. Useful before re-validating.

- **`form`** — A `Formbaker` form definition.
- **`getElement`** — `(fieldId: string) => HTMLElement | null` — returns the DOM element for a field.

| Export                    | Type                                                    | Description                                             |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `attachCustomValidation`  | `(form, getElement, options?) => () => void`            | Wire live blur/input validation on form elements.       |
| `validateForm`            | `(form, getElement) => boolean`                         | Validate all visible fields, show native bubbles.       |
| `clearValidation`         | `(form, getElement) => void`                            | Clear all custom validity messages.                     |
