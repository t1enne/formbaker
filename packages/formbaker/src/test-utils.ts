/**
 * Shared test utilities for Formbaker.
 *
 * Exports a zero-dependency test plugin (only @standard-schema/spec, already a
 * core dependency) that exercises every code path the engine can hit through a
 * plugin. Used across core and integration tests so all packages share one
 * canonical test plugin instead of duplicating it.
 *
 * Also exports helpers for building forms in tests.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FormbakerField, FormbakerPlugin } from "./types";
import { create, addNode, addDependency } from "./engine";

// --- Standard Schema helpers ---

type StdResult = StandardSchemaV1.Result<unknown>;

const makeSchema = (validate: (v: unknown) => StdResult): StandardSchemaV1 => ({
  "~standard": { version: 1, vendor: "test", validate },
});

const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

// --- Field validator ---

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

// --- mergeFields ---

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

// --- evaluateCondition ---

/**
 * Evaluate a dependency condition against a value.
 *
 * Supports a subset of conditions used across tests:
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

// --- Exports ---

/**
 * A zero-dependency test plugin shared across core and integration tests.
 *
 * Validates fields according to their fieldType:
 * - `text`/`textarea` → strings, checked against required/min/max
 * - `number` → numbers, checked against min/max
 * - `checkbox`/`radio` → booleans
 * - `select` → valid index into options array
 */
export const testPlugin: FormbakerPlugin = {
  field,
  mergeFields,
  evaluateCondition,
};

// --- Form building helpers ---

/**
 * Build a form with the given field definitions, registered under "test".
 * Shortcut for test setup boilerplate.
 *
 * @example
 * ```ts
 * import { buildForm } from "formbaker/test-utils";
 * const form = buildForm(
 *   { id: "name", type: "field", fieldType: "text", validation: { required: true } },
 *   { id: "age", type: "field", fieldType: "number", validation: { min: 18 } },
 * );
 * ```
 */
export function buildForm(...fields: Parameters<typeof addNode>[1][]): ReturnType<typeof addNode> {
  return fields.reduce((f, node) => addNode(f, node), create({ pluginName: "test" }));
}

/**
 * Build a form with a toggle/name/extra pattern for testing dependency visibility.
 *
 * - `toggle` (checkbox) controls visibility of `extra`
 * - `name` is always visible
 * - `extra` is visible when `toggle` is truthy
 */
export const buildVisibilityForm = (): ReturnType<typeof addNode> => {
  let f = create({ pluginName: "test" });
  f = addNode(f, { id: "toggle", type: "field", fieldType: "checkbox" });
  f = addNode(f, { id: "name", type: "field", fieldType: "text" });
  f = addNode(f, { id: "extra", type: "field", fieldType: "text" });
  f = addDependency(f, { source: "toggle", target: "extra", condition: "true" });
  return f;
};
