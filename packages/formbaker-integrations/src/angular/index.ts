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
 * import { FormBuilder } from "@angular/forms";
 *
 * const form = create({ pluginName: "zod", nodes: { name: { id: "name", type: "field", fieldType: "text", validation: { required: true } } } });
 * const fb = inject(FormBuilder);
 * const group = formbakerToFormGroup(form, fb);
 * ```
 */
import type {
  Formbaker,
  FormbakerField,
  FormbakerNode,
  FormbakerValidation,
} from "formbaker";
import { createVisibilityChecker } from "formbaker";
import { FormBuilder, Validators, type ValidatorFn } from "@angular/forms";

const isField = (n: FormbakerNode): n is FormbakerField => n.type === "field";

// --- Helper to get field nodes from the unified nodes map ---

const getFields = (form: Formbaker): FormbakerField[] => {
  return Object.values(form.nodes).filter(isField);
};

// --- Validator builders ---

const validatorsOf = (
  validation: FormbakerValidation | undefined,
  fieldType: FormbakerField["fieldType"],
): ValidatorFn[] => {
  const validators: ValidatorFn[] = [];
  if (!validation) return validators;

  const { required, min, max } = validation;

  if (required) {
    validators.push(Validators.required);
  }

  if (min !== undefined) {
    if (fieldType === "text" || fieldType === "textarea") {
      validators.push(Validators.minLength(min as number));
    } else if (fieldType === "number") {
      validators.push(Validators.min(min as number));
    }
  }

  if (max !== undefined) {
    if (fieldType === "text" || fieldType === "textarea") {
      validators.push(Validators.maxLength(max as number));
    } else if (fieldType === "number") {
      validators.push(Validators.max(max as number));
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

/** Options for {@link formbakerToFormGroup} and {@link rebuildFormGroup}. */
export interface FormbakerFormGroupOptions {
  /** Current form values used for dependency-based visibility. Defaults to `{}`. */
  values?: Record<string, unknown>;
}

/**
 * Convert a Formbaker form into an Angular `FormGroup`.
 *
 * Dependency visibility is NOT evaluated here (it requires the plugin
 * registry at runtime). Use `rebuildFormGroup` for live visibility updates
 * with values.
 *
 * @param form - A Formbaker form definition.
 * @param fb   - An Angular `FormBuilder` instance.
 * @param opts - Options (values for visibility).
 * @returns A `FormGroup` with all fields from the form definition.
 */
export const formbakerToFormGroup = (
  form: Formbaker,
  fb: FormBuilder,
  opts: FormbakerFormGroupOptions = {},
) => {
  const visibleIds = getVisibleFieldIds(form, opts.values);
  const controls: Record<string, unknown> = {};

  for (const field of getFields(form)) {
    if (!visibleIds.has(field.id)) continue;
    const defaultValue = getDefaultValue(field);
    const validatorFns = validatorsOf(field.validation, field.fieldType);
    controls[field.id] = fb.control(defaultValue, validatorFns);
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
 * @param form  - The Formbaker form definition.
 * @param group - An existing Angular `FormGroup`.
 * @param fb    - An Angular `FormBuilder` instance.
 * @param opts  - Options (values for visibility).
 *
 * @example
 * ```ts
 * rebuildFormGroup(form, myFormGroup, fb, { values: myFormGroup.value });
 * ```
 */
export const rebuildFormGroup = (
  form: Formbaker,
  group: import("@angular/forms").FormGroup,
  fb: FormBuilder,
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
    const validatorFns = validatorsOf(field.validation, field.fieldType);
    group.addControl(field.id, fb.control(defaultValue, validatorFns));
  }
};
