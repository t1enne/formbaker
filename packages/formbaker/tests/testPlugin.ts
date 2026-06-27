/**
 * Zero-dependency test plugin for Formbaker integration tests.
 *
 * Implements `FormbakerPlugin` using only `@standard-schema/spec` (already a
 * core dependency). Ships in the test tree — never exported to consumers.
 * Exercises every code path the engine can hit through a plugin, so
 * integration tests stay in core without depending on arktype or zod.
 */
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FormbakerField, FormbakerPlugin } from "formbaker";

type StdResult = StandardSchemaV1.Result<unknown>;

const makeSchema = (validate: (v: unknown) => StdResult): StandardSchemaV1 => ({
  "~standard": { version: 1, vendor: "test", validate },
});

const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

const field = (f: FormbakerField, _values: Record<string, unknown>): StandardSchemaV1 => {
  const req = !!f.validation?.required;
  const min = f.validation?.min;
  const max = f.validation?.max;

  // select: value must be a valid index into options
  if (f.fieldType === "select") {
    const opts = f.options ?? [];
    return makeSchema((v) => {
      if (!req && (v === null || v === undefined)) return { value: v };
      if (typeof v !== "number" || v < 0 || v >= opts.length)
        return { issues: [{ message: `Invalid select value for ${f.id}` }] };
      return { value: v };
    });
  }

  // checkbox / radio: boolean
  if (f.fieldType === "checkbox" || f.fieldType === "radio") {
    return makeSchema((v) => {
      if (!req && (v === null || v === undefined)) return { value: v };
      if (typeof v !== "boolean") return { issues: [{ message: `Expected boolean for ${f.id}` }] };
      return { value: v };
    });
  }

  // number
  if (f.fieldType === "number") {
    return makeSchema((v) => {
      if (!req && (v === null || v === undefined)) return { value: v };
      if (!isNum(v)) return { issues: [{ message: `Expected number for ${f.id}` }] };
      if (isNum(min) && v < min) return { issues: [{ message: `${f.id} below minimum` }] };
      if (isNum(max) && v > max) return { issues: [{ message: `${f.id} above maximum` }] };
      return { value: v };
    });
  }

  // text / textarea / file / anything else → string
  return makeSchema((v) => {
    if (!req && (v === null || v === undefined)) return { value: v };
    if (typeof v !== "string") return { issues: [{ message: `Expected string for ${f.id}` }] };
    if (req && v === "") return { issues: [{ message: `${f.id} is required` }] };
    if (isNum(min) && v.length < min) return { issues: [{ message: `${f.id} too short` }] };
    if (isNum(max) && v.length > max) return { issues: [{ message: `${f.id} too long` }] };
    return { value: v };
  });
};

const mergeFields = (fields: Record<string, StandardSchemaV1>): StandardSchemaV1 =>
  makeSchema((v) => {
    if (v === null || typeof v !== "object") return { issues: [{ message: "Expected object" }] };
    const obj = v as Record<string, unknown>;
    const issues: StandardSchemaV1.Issue[] = [];
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) {
      const result = fields[key]!["~standard"].validate(obj[key]);
      if (result instanceof Promise) throw new Error("async not supported");
      if (result.issues) issues.push(...result.issues);
      else out[key] = result.value;
    }
    return issues.length ? { issues } : { value: out };
  });

/**
 * Evaluate a dependency condition against a value.
 *
 * Matches the subset of arktype DSL used in integration tests:
 *   "true"   → truthy (non-null, non-undefined, non-false)
 *   "string" → typeof value === "string"
 *   "number" → typeof value === "number"
 *   "any"    → always true
 */
const evaluateCondition = (condition: unknown, value: unknown): boolean => {
  if (typeof condition !== "string") return true;
  switch (condition) {
    case "true":
      return value != null && value !== false;
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "any":
      return true;
    default:
      return true;
  }
};

export const testPlugin: FormbakerPlugin = {
  field,
  mergeFields,
  evaluateCondition,
};
