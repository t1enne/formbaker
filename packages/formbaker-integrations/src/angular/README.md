# @formbaker/integrations/angular

Bridges a Formbaker form definition into Angular's reactive forms (`@angular/forms` `FormGroup` / `FormBuilder`).

## Install

```bash
npm install formbaker @formbaker/integrations @angular/forms
```

## Usage

```ts
import { create, addNode, registerPlugin } from "formbaker";
import { arktypePlugin } from "@formbaker/plugins/arktype";
import { formbakerToFormGroup, rebuildFormGroup } from "@formbaker/integrations/angular";
import { Component, inject } from "@angular/core";
import { FormBuilder, Validators, ReactiveFormsModule } from "@angular/forms";

registerPlugin("arktype", arktypePlugin);

let form = create({ pluginName: "arktype" });

form = addNode(form, {
  id: "name",
  type: "field",
  fieldType: "text",
  label: "Full name",
  validation: { required: true },
});
form = addNode(form, {
  id: "age",
  type: "field",
  fieldType: "number",
  label: "Age",
  validation: { min: 0, max: 120 },
});
form = addNode(form, {
  id: "plan",
  type: "field",
  fieldType: "select",
  label: "Plan",
  options: ["Basic", "Standard", "Premium"],
});

@Component({
  selector: "app-insurance-form",
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `...`,
})
export class InsuranceFormComponent {
  private fb = inject(FormBuilder);
  formGroup = this.fb.group({});

  constructor() {
    rebuildFormGroup(form, this.formGroup, this.fb, Validators);
  }

  onSubmit() {
    if (this.formGroup.valid) {
      console.log(this.formGroup.value);
    }
  }
}
```

## API

### `formbakerToFormGroup(form, fb, validators, opts?)`

Converts a Formbaker form into an Angular `FormGroup`. Creates controls for every field in the form definition.

- **`form`** — A `Formbaker` form definition.
- **`fb`** — An Angular `FormBuilder` instance.
- **`validators`** — Angular `Validators` (for building min/max/required validators).
- **`opts.values`** — Current form values (for visibility).
- **`opts.includeOptionalUndefined`** — If true, include optional fields even when value is undefined.

### `rebuildFormGroup(form, group, fb, validators, opts?)`

Merges visibility changes into an existing `FormGroup`. Removes controls for hidden fields, adds controls for newly-visible fields, preserves existing values.

| Export                 | Type                                             | Description                                          |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `formbakerToFormGroup` | `(form, fb, validators, opts?) => FormGroupLike` | Create a fresh FormGroup from a Formbaker form.      |
| `rebuildFormGroup`     | `(form, group, fb, validators, opts?) => void`   | Add/remove controls to match current form structure. |
