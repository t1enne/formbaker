/**
 * React Hook Form integration for Formbaker.
 *
 * Bridges a Formbaker form definition into react-hook-form via the
 * standard-schema resolver. Since Formbaker's `getSchema()` returns a
 * StandardSchemaV1 compliant object, we can use @hookform/resolvers'
 * standard-schema resolver directly — no intermediate translation needed.
 *
 * Also exposes `isInSchema(id)` and `visibleFields` so components can
 * hide their own markup for fields excluded by dependencies:
 *
 * @example
 * ```tsx
 * const { register, isInSchema } = useFormbakerForm(form, watch());
 *
 * {isInSchema("license_plate") && (
 *   <input {...register("license_plate")} />
 * )}
 * ```
 */
import { useMemo, useRef } from "react";
import {
  useForm,
  type UseFormReturn,
  type FieldValues,
  type UseFormProps,
  type Resolver,
} from "react-hook-form";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { getSchema, createVisibilityChecker } from "formbaker";
import type { Formbaker } from "formbaker";

export interface FormbakerFormReturn<Input extends FieldValues, Context, Output>
  extends UseFormReturn<Input, Context, Output> {
  /** Check if a field is in the current visible schema. Returns false when
   *  the field is hidden by a dependency or sits inside a hidden section. */
  isInSchema: (fieldId: string) => boolean;
  /** Set of field IDs currently in the visible schema. */
  visibleFields: Set<string>;
}

/**
 * React hook that returns a react-hook-form `UseFormReturn` configured with
 * a resolver derived from the given Formbaker form definition, plus helpers
 * for checking field visibility.
 *
 * The schema is rebuilt on every render so that dependency-based visibility
 * changes (which fields are included) are reflected. If performance becomes
 * an issue, memoise `values` externally or memoise `getSchema` outside the
 * component.
 *
 * @param form   - A Formbaker form definition (must have a registered plugin).
 * @param values - Current form values; used by getSchema to determine which
 *                 optional fields without values to exclude, and by isInSchema
 *                 to evaluate dependency conditions.
 * @param opts   - Additional react-hook-form useForm options (defaults, mode, etc.).
 */
export function useFormbakerForm<Input extends FieldValues = FieldValues, Context = unknown>(
  form: Formbaker,
  values: Record<string, unknown> = {},
  opts?: Omit<UseFormProps<Input, Context>, "resolver">,
): FormbakerFormReturn<Input, Context, Input> {
  // ponytail: getSchema returns StandardSchemaV1<unknown, unknown> because
  // Formbaker doesn't track field types at the type level. The resolver cast
  // is safe — `validate` runs the plugin's actual schema at runtime, and
  // react-hook-form's Resolver<Input, Context, Output> is structurally
  // compatible with what standardSchemaResolver produces from any
  // StandardSchemaV1 whose runtime validate accepts the Input shape.
  // Upgrade path: if formbaker adds type-level schema inference, use
  // StandardSchemaV1.InferInput / InferOutput to thread types through.

  // Keep a stable resolver reference so RHF's useForm doesn't re-initialise
  // on every render. The resolver is a stable async function that builds the
  // current schema on each validation call using the latest values via the
  // ref, then delegates to standardSchemaResolver's inner validation logic.
  // This avoids both RHF re-init and stale schema snapshots.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const resolver = useMemo<Resolver<Input, Context, Input>>(() => {
    return async (data, context, options) => {
      const schema = getSchema(form, valuesRef.current) as StandardSchemaV1<Input, Input>;
      const inner = standardSchemaResolver(schema);
      return inner(data, context, options);
    };
  }, [form]);

  const formReturn = useForm<Input, Context, Input>({
    ...opts,
    resolver,
  });

  // Compute visible fields fresh every render so dependency changes are
  // reflected immediately. This is a cheap iteration over form.nodes — the
  // expensive work (schema rebuild + RHF re-init) is avoided above.
  const visibleFields = useMemo(() => {
    const isIncluded = createVisibilityChecker(form);
    const visible = new Set<string>();
    for (const id of Object.keys(form.nodes)) {
      if (isIncluded(id, values)) visible.add(id);
    }
    return visible;
  }, [form, values]);

  const isInSchema = (fieldId: string): boolean => visibleFields.has(fieldId);

  return Object.assign(formReturn, { isInSchema, visibleFields });
}
