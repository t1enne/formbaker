/**
 * React Hook Form integration for Formbaker.
 *
 * Bridges a Formbaker form definition into react-hook-form via the
 * standard-schema resolver. Since Formbaker's `getSchema()` returns a
 * StandardSchemaV1 compliant object, we can use @hookform/resolvers'
 * standard-schema resolver directly — no intermediate translation needed.
 *
 * @example
 * ```tsx
 * import { useFormbakerForm } from "@formbaker/integrations/react-hook-form";
 *
 * const form = create({ pluginName: "zod", fields: { name: { id: "name", type: "text" } } });
 * const { control, register, handleSubmit } = useFormbakerForm(form);
 * ```
 */
import { useMemo } from "react";
import {
  useForm,
  type UseFormReturn,
  type FieldValues,
  type UseFormProps,
  type Resolver,
} from "react-hook-form";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { getSchema } from "formbaker";
import type { Formbaker } from "formbaker";

/**
 * React hook that returns a react-hook-form `UseFormReturn` configured with
 * a resolver derived from the given Formbaker form definition.
 *
 * The schema is rebuilt on every render so that dependency-based visibility
 * changes (which fields are included) are reflected. If performance becomes
 * an issue, memoise `values` externally or memoise `getSchema` outside the
 * component.
 *
 * @param form   - A Formbaker form definition (must have a registered plugin).
 * @param values - Current form values; used by getSchema to determine which
 *                 optional fields without values to exclude. Defaults to `{}`.
 * @param opts   - Additional react-hook-form useForm options (defaults, mode, etc.).
 */
export function useFormbakerForm<Input extends FieldValues = FieldValues, Context = unknown>(
  form: Formbaker,
  values: Record<string, unknown> = {},
  opts?: Omit<UseFormProps<Input, Context>, "resolver">,
): UseFormReturn<Input, Context, Input> {
  // ponytail: getSchema returns StandardSchemaV1<unknown, unknown> because
  // Formbaker doesn't track field types at the type level. The resolver cast
  // is safe — `validate` runs the plugin's actual schema at runtime, and
  // react-hook-form's Resolver<Input, Context, Output> is structurally
  // compatible with what standardSchemaResolver produces from any
  // StandardSchemaV1 whose runtime validate accepts the Input shape.
  // Upgrade path: if formbaker adds type-level schema inference, use
  // StandardSchemaV1.InferInput / InferOutput to thread types through.
  const resolver = useMemo<Resolver<Input, Context, Input>>(() => {
    return standardSchemaResolver(getSchema(form, values) as StandardSchemaV1<Input, Input>);
  }, [form, values]);

  return useForm<Input, Context, Input>({
    ...opts,
    resolver,
  });
}
