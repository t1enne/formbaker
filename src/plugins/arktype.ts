/**
 * ArkType validation plugin for Formbaker.
 *
 * Translates Formbaker field definitions into arktype schemas via `type()`.
 * arktype 2.x Type objects natively implement StandardSchemaV1, so no adapter
 * wrapping is needed — `type(...)` returns a `StandardSchemaV1` directly.
 */
import { type } from "arktype";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FormbakerField, FormbakerPlugin } from "../types";

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && !Number.isNaN(v);

const buildSchema = (field: FormbakerField): string => {
  const { validation } = field;
  const isOptional = !validation?.required;
  let schema = isOptional ? "undefined | null | " : "";
  const min = validation?.min;
  const max = validation?.max;

  if (field.type === "text") {
    let constraints = isOptional ? "string" : "string > 0";
    if (isNumber(min) && min > 0) {
      constraints += ` & string >= ${min}`;
    }
    if (isNumber(max)) {
      constraints += ` & string <= ${max}`;
    }
    return schema + constraints;
  }
  if (field.type === "number") {
    let constraints = "";
    if (min !== undefined) {
      constraints += `number >= ${min}`;
    }
    if (max !== undefined) {
      constraints += constraints ? ` & number <= ${max}` : `number <= ${max}`;
    }
    const baseSchema = constraints || "number";
    return schema + baseSchema;
  }
  if (field.type === "select") {
    const opts = (field as FormbakerField<"select">).options;
    return schema + opts.map((_, i) => `${i}`).join(" | ");
  }
  if (field.type === "checkbox" || field.type === "radio") {
    return schema + "boolean";
  }
  if (field.type === "textarea") {
    let constraints = isOptional ? "string" : "string > 0";
    if (isNumber(min) && min > 0) {
      constraints += ` & string >= ${min}`;
    }
    if (isNumber(max)) {
      constraints += ` & string <= ${max}`;
    }
    return schema + constraints;
  }
  if (field.type === "file") {
    return schema + "object";
  }
  return schema;
};

/**
 * ArkType plugin: converts a Formbaker field into an arktype `Type`,
 * which natively implements `StandardSchemaV1`.
 */
const field = (_field: FormbakerField, _values: Record<string, unknown>): StandardSchemaV1 => {
  const schema = buildSchema(_field);
  // Dynamic schema string — arktype can't narrow at compile time, so `as any` is unavoidable.
  return type(schema as any);
};

/**
 * Merge named field schemas into a single object schema via arktype `type()`.
 */
const mergeFields = (fields: Record<string, StandardSchemaV1>): StandardSchemaV1 => {
  if (Object.keys(fields).length === 0) {
    return type({});
  }
  return type(fields);
};

/**
 * Evaluate a dependency condition by parsing it as an arktype schema
 * and checking whether the value matches.
 */
const evaluateCondition = (condition: unknown, value: unknown): boolean => {
  const r = type(condition as any)(value);
  return !(r instanceof type.errors);
};

export const arktypePlugin: FormbakerPlugin = { field, mergeFields, evaluateCondition };
