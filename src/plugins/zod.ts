/**
 * Zod validation plugin for Formbaker.
 *
 * Translates Formbaker field definitions into Zod schemas.
 * Zod 4.x schemas natively implement StandardSchemaV1, so no adapter
 * wrapping is needed.
 */
import { z } from "zod/v4";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FormbakerField, FormbakerPlugin } from "../types";

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && !Number.isNaN(v);

const buildSchema = (field: FormbakerField): z.ZodTypeAny => {
  const { validation } = field;
  const isOptional = !validation?.required;
  const min = validation?.min;
  const max = validation?.max;

  if (field.type === "text" || field.type === "textarea") {
    let schema: z.ZodString = z.string();
    if (!isOptional) {
      schema = schema.min(1);
    }
    if (isNumber(min) && min > 0) {
      schema = schema.min(min);
    }
    if (isNumber(max)) {
      schema = schema.max(max);
    }
    return isOptional ? z.union([z.undefined(), z.null(), schema]) : schema;
  }

  if (field.type === "number") {
    let schema: z.ZodNumber = z.number();
    if (isNumber(min)) {
      schema = schema.gte(min);
    }
    if (isNumber(max)) {
      schema = schema.lte(max);
    }
    return isOptional ? z.union([z.undefined(), z.null(), schema]) : schema;
  }

  if (field.type === "select") {
    const opts = (field as FormbakerField<"select">).options;
    const literals = opts.map((_, i) => z.literal(i));
    const schema = z.union(
      literals as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]],
    );
    return isOptional ? z.union([z.undefined(), z.null(), schema]) : schema;
  }

  if (field.type === "checkbox" || field.type === "radio") {
    const schema = z.boolean();
    return isOptional ? z.union([z.undefined(), z.null(), schema]) : schema;
  }

  if (field.type === "file") {
    const schema = z.object({}).passthrough();
    return isOptional ? z.union([z.undefined(), z.null(), schema]) : schema;
  }

  return z.any();
};

/**
 * Zod plugin: converts a Formbaker field into a Zod schema,
 * which natively implements `StandardSchemaV1`.
 */
export const zodPlugin: FormbakerPlugin = (field, _values) =>
  buildSchema(field) as unknown as StandardSchemaV1;
