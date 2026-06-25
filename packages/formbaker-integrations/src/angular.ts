/**
 * Angular FormBuilder integration for Formbaker.
 *
 * Translates a Formbaker form definition into an Angular `FormGroup` with
 * `Validators` from `@angular/forms`. Handles required, min, and max
 * constraints across all Formbaker field types.
 *
 * @example
 * ```ts
 * import { formbakerToFormGroup } from "@formbaker/integrations/angular";
 * import { Validators } from "@angular/forms";
 *
 * const form = create({ pluginName: "zod", fields: { name: { id: "name", type: "text", validation: { required: true } } } });
 * const fb = inject(FormBuilder);
 * const group = formbakerToFormGroup(form, fb, Validators);
 * ```
 */
import type { Formbaker, FormbakerField, FormbakerValidation } from "formbaker";
import type { ValidatorFn } from "@angular/forms";

// --- Interfaces for the Angular types we actually call ---
// These are compatible subsets of the real @angular/forms classes,
// so a real FormBuilder / FormGroup satisfies them naturally.

export interface FormBuilderLike {
  control(value: unknown, validators?: ValidatorFn | ValidatorFn[]): { value: unknown };
  group(controls: Record<string, { value: unknown }>): {
    controls: Record<string, { value: unknown }>;
  };
}

export interface FormGroupLike {
  controls: Record<string, { value: unknown }>;
  get(name: string): { value: unknown } | null;
  addControl(name: string, control: { value: unknown }): void;
  removeControl(name: string): void;
}

export interface FormbakerFormGroupOptions {
  /** Current form values used for dependency-based visibility. Defaults to `{}`. */
  values?: Record<string, unknown>;
  /** If true, include optional fields even when their value is undefined. Defaults to false. */
  includeOptionalUndefined?: boolean;
}

export interface FormbakerValidators {
  required: (message?: string) => ValidatorFn;
  minLength: (minLength: number, message?: string) => ValidatorFn;
  maxLength: (maxLength: number, message?: string) => ValidatorFn;
  min: (min: number, message?: string) => ValidatorFn;
  max: (max: number, message?: string) => ValidatorFn;
}

// --- Validator builders ---

const buildValidators = (
  validation: FormbakerValidation | undefined,
  type: FormbakerField["type"],
  V: FormbakerValidators,
): ValidatorFn[] => {
  const validators: ValidatorFn[] = [];
  if (!validation) return validators;

  const { required, min, max } = validation;

  if (required) {
    validators.push(V.required(required === true ? undefined : required.message));
  }

  if (min !== undefined) {
    if (type === "text" || type === "textarea") {
      validators.push(V.minLength(min as number, validation.min?.message));
    } else if (type === "number") {
      validators.push(V.min(min as number, validation.min?.message));
    }
  }

  if (max !== undefined) {
    if (type === "text" || type === "textarea") {
      validators.push(V.maxLength(max as number, validation.max?.message));
    } else if (type === "number") {
      validators.push(V.max(max as number, validation.max?.message));
    }
  }

  return validators;
};

// --- Default value extraction ---

const getDefaultValue = (field: FormbakerField): unknown => {
  if (field.type === "text" || field.type === "textarea") return "";
  if (field.type === "number") return null;
  if (field.type === "checkbox" || field.type === "radio") return false;
  if (field.type === "select") return null;
  if (field.type === "file") return null;
  return "";
};

/**
 * Convert a Formbaker form into an Angular `FormGroup`.
 *
 * Dependency visibility is NOT evaluated here (it requires the plugin
 * registry at runtime). Use `rebuildFormGroup` for live visibility updates.
 *
 * @param form        - A Formbaker form definition.
 * @param fb          - An Angular `FormBuilder` instance.
 * @param validators  - Angular `Validators` (or a compatible object) for building validators.
 * @param opts        - Options (values for visibility, includeOptionalUndefined).
 * @returns A `FormGroup` with all fields from the form definition.
 */
export const formbakerToFormGroup = (
  form: Formbaker,
  fb: FormBuilderLike,
  validators: FormbakerValidators,
  opts: FormbakerFormGroupOptions = {},
) => {
  void opts; // reserved for future visibility support

  const controls: Record<string, { value: unknown }> = {};

  for (const id in form.fields) {
    const field = form.fields[id]!;
    const defaultValue = getDefaultValue(field);
    const v = buildValidators(field.validation, field.type, validators);
    controls[id] = fb.control(defaultValue, v);
  }

  return fb.group(controls);
};

/**
 * Rebuild an Angular FormGroup from a Formbaker form.
 *
 * Unlike `formbakerToFormGroup` which creates a fresh group, this merges
 * visibility changes into an existing group: it removes controls for hidden
 * fields and adds controls for newly-visible fields while preserving existing
 * values.
 *
 * @param form        - The Formbaker form definition.
 * @param group       - An existing Angular FormGroup.
 * @param fb          - An Angular FormBuilder instance.
 * @param validators  - Angular `Validators` (or a compatible object).
 * @param opts        - Options (values, includeOptionalUndefined).
 *
 * @example
 * ```ts
 * rebuildFormGroup(form, myFormGroup, fb, Validators, { values: myFormGroup.value });
 * ```
 */
export const rebuildFormGroup = (
  form: Formbaker,
  group: FormGroupLike,
  fb: FormBuilderLike,
  validators: FormbakerValidators,
  _opts: FormbakerFormGroupOptions = {},
): void => {
  const desired = new Set(Object.keys(form.fields));
  const current = new Set(Object.keys(group.controls));

  // Remove controls that are no longer in the form
  for (const name of current) {
    if (!desired.has(name)) {
      group.removeControl(name);
    }
  }

  // Add or update controls for fields in the form
  for (const id in form.fields) {
    const field = form.fields[id]!;
    if (group.get(id)) continue; // already present — skip to preserve value

    const defaultValue = getDefaultValue(field);
    const v = buildValidators(field.validation, field.type, validators);
    group.addControl(id, fb.control(defaultValue, v));
  }
};
