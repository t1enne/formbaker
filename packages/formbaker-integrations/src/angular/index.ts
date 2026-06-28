/**
 * Angular FormBuilder integration for Formbaker.
 *
 * Translates a Formbaker form definition into an Angular `FormGroup` with
 * `Validators` from `@angular/forms`. Handles required, min, and max
 * constraints across all Formbaker field types.
 *
 * When values are provided via opts, `rebuildFormGroup` evaluates dependency
 * visibility so hidden fields are excluded from the group.
 *
 * @example
 * ```ts
 * import { formbakerToFormGroup } from "@formbaker/integrations/angular";
 * import { Validators } from "@angular/forms";
 *
 * const form = create({ pluginName: "zod", nodes: { name: { id: "name", type: "field", fieldType: "text", validation: { required: true } } } });
 * const fb = inject(FormBuilder);
 * const group = formbakerToFormGroup(form, fb, Validators);
 * ```
 */
import type {
  Formbaker,
  FormbakerField,
  FormbakerNode,
  FormbakerValidation,
} from "formbaker";
import { createVisibilityChecker } from "formbaker";
import type { ValidatorFn } from "@angular/forms";

const isField = (n: FormbakerNode): n is FormbakerField => n.type === "field";

// --- Interfaces for the Angular types we actually call ---
// These are compatible subsets of the real @angular/forms classes,
// so a real FormBuilder / FormGroup satisfies them naturally.

export interface FormBuilderLike {
  control(
    value: unknown,
    validators?: ValidatorFn | ValidatorFn[],
  ): { value: unknown };
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

// --- Helper to get field nodes from the unified nodes map ---

const getFields = (form: Formbaker): FormbakerField[] => {
  return Object.values(form.nodes).filter(isField);
};

// --- Validator builders ---

const buildValidators = (
  validation: FormbakerValidation | undefined,
  fieldType: FormbakerField["fieldType"],
  V: FormbakerValidators,
): ValidatorFn[] => {
  const validators: ValidatorFn[] = [];
  if (!validation) return validators;

  const { required, min, max } = validation;

  if (required) {
    validators.push(
      V.required(required === true ? undefined : required.message),
    );
  }

  if (min !== undefined) {
    if (fieldType === "text" || fieldType === "textarea") {
      validators.push(V.minLength(min as number, validation.min?.message));
    } else if (fieldType === "number") {
      validators.push(V.min(min as number, validation.min?.message));
    }
  }

  if (max !== undefined) {
    if (fieldType === "text" || fieldType === "textarea") {
      validators.push(V.maxLength(max as number, validation.max?.message));
    } else if (fieldType === "number") {
      validators.push(V.max(max as number, validation.max?.message));
    }
  }

  return validators;
};

// --- Default value extraction ---

const getDefaultValue = (field: FormbakerField): unknown => {
  if (field.fieldType === "text" || field.fieldType === "textarea") return "";
  if (field.fieldType === "number") return null;
  if (field.fieldType === "checkbox" || field.fieldType === "radio")
    return false;
  if (field.fieldType === "select") return null;
  if (field.fieldType === "file") return null;
  return "";
};

/**
 * Return the set of field IDs that are visible given the current values.
 * When values is empty or undefined, all fields are considered visible.
 */
const getVisibleFieldIds = (
  form: Formbaker,
  values: Record<string, unknown> | undefined,
): Set<string> => {
  const fields = getFields(form);
  if (!values || Object.keys(values).length === 0) {
    return new Set(fields.map((f) => f.id));
  }
  const isIncluded = createVisibilityChecker(form);
  const visibleFieldIds = fields
    .filter((f) => isIncluded(f.id, values))
    .map((f) => f.id);

  return new Set(visibleFieldIds);
};

/**
 * Convert a Formbaker form into an Angular `FormGroup`.
 *
 * Dependency visibility is NOT evaluated here (it requires the plugin
 * registry at runtime). Use `rebuildFormGroup` for live visibility updates
 * with values.
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
  const visibleIds = getVisibleFieldIds(form, opts.values);

  const controls: Record<string, { value: unknown }> = {};

  for (const field of getFields(form)) {
    if (!visibleIds.has(field.id)) continue;
    const defaultValue = getDefaultValue(field);
    const v = buildValidators(field.validation, field.fieldType, validators);
    controls[field.id] = fb.control(defaultValue, v);
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
  opts: FormbakerFormGroupOptions = {},
): void => {
  const visibleIds = getVisibleFieldIds(form, opts.values);
  const current = new Set(Object.keys(group.controls));

  // Remove controls that are no longer in the visible schema
  for (const name of current) {
    if (!visibleIds.has(name)) {
      group.removeControl(name);
    }
  }

  // Add controls for newly-visible fields
  for (const field of getFields(form)) {
    if (!visibleIds.has(field.id)) continue;
    if (group.get(field.id)) continue; // already present — skip to preserve value

    const defaultValue = getDefaultValue(field);
    const v = buildValidators(field.validation, field.fieldType, validators);
    group.addControl(field.id, fb.control(defaultValue, v));
  }
};
