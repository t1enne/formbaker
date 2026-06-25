/**
 * Zod validation plugin for Formbaker.
 *
 * Translates Formbaker field definitions into Zod schemas.
 * Zod 4.x schemas natively implement StandardSchemaV1, so no adapter
 * wrapping is needed.
 */
import { z } from "zod/v4";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FormbakerField, FormbakerPlugin } from "formbaker";

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
 * Zod plugin: converts a Formbaker field into a Zod schema.
 * Zod 4.x schemas natively implement StandardSchemaV1.
 */
const field = (_field: FormbakerField, _values: Record<string, unknown>): StandardSchemaV1 =>
  buildSchema(_field);

/**
 * Merge named field schemas into a single object schema via Zod.
 */
const mergeFields = (fields: Record<string, StandardSchemaV1>): StandardSchemaV1 => {
  if (Object.keys(fields).length === 0) {
    return z.object({});
  }
  // Check each schema — Zod's own objects implement StandardSchemaV1 via buildSchema.
  // For user-supplied schemas that might be other StandardSchemaV1 implementations,
  // we wrap them into a Zod object. If they're already Zod schemas, z.object picks
  // them up as-is since ZodObject's shape accepts ZodTypeAny.
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of Object.keys(fields)) {
    shape[key] = fields[key] as z.ZodTypeAny;
  }
  return z.object(shape);
};

/**
 * Evaluate a dependency condition by parsing the string as a Zod schema
 * and checking whether the value matches.
 *
 * Condition strings in Formbaker are arktype DSL, not Zod DSL.
 * For Zod we reinterpret common patterns:
 *   "true"        → value must be truthy (non-null, non-undefined, non-false)
 *   "string"      → value must be a string
 *   "number"      → value must be a number
 *   "boolean"     → value must be a boolean
 *   "object"      → value must be a non-null object
 *   "any"         → always true
 *   default:       → always true (arktype-specific conditions can't be translated)
 */
const evaluateCondition = (condition: unknown, value: unknown): boolean => {
  if (typeof condition !== "string") return true;
  switch (condition) {
    case "true": return value != null && value !== false;
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "object": return value !== null && typeof value === "object";
    case "any": return true;
    default: return true; // arktype-specific DSL; fall back to always visible
  }
};

export const zodPlugin: FormbakerPlugin = { field, mergeFields, evaluateCondition };
