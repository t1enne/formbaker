import type { StandardSchemaV1 } from "@standard-schema/spec";

export type PlainObject = Record<string, unknown>;

export type ValidationRuleMap = {
  required: { message: string } | boolean;
  min: number;
  max: number;
};

export type BaseValidation = {
  message?: string;
};

export type FormbakerTypeMap = {
  text: { defaultValue?: unknown };
  number: { defaultValue?: unknown };
  checkbox: { defaultValue?: unknown };
  radio: { defaultValue?: unknown };
  textarea: { defaultValue?: unknown };
  select: {
    defaultValue?: unknown;
    options: string[];
  };
  file: {};
};

export type FormbakerValidation = {
  [K in keyof ValidationRuleMap]?: BaseValidation & ValidationRuleMap[K];
};

export type FormbakerDependency = {
  condition: any;
  source: string;
  target: string;
  /** How multiple dependencies on the same target combine. Defaults to "OR". */
  dependencyType?: "AND" | "OR" | "XOR";
};

/**
 * A validation plugin for Formbaker.
 *
 * Each plugin must provide three operations:
 * - `field`: translate a single FormbakerField into a Standard Schema v1 validator.
 * - `mergeFields`: compose a record of named field schemas into a single object schema.
 * - `evaluateCondition`: evaluate a dependency condition against a raw value.
 *
 * Plugins decide how to translate {@link FormbakerValidation} rules (required, min,
 * max) into their library's schema DSL.
 */
export type FormbakerPlugin = {
  field: (field: FormbakerField, values: Record<string, unknown>) => StandardSchemaV1;
  mergeFields: (fields: Record<string, StandardSchemaV1>) => StandardSchemaV1;
  evaluateCondition: (condition: unknown, value: unknown) => boolean;
};

/** A JSON-safe identifier for the validation plugin. */
export type FormbakerPluginName = string;

// --- Unified node types ---

export interface FormbakerField {
  id: string;
  type: "field";
  parentId?: string;
  order?: number;
  label?: string;
  description?: string;
  validation?: FormbakerValidation;
  meta?: Record<string, unknown>;
  fieldType: keyof FormbakerTypeMap;
  /** Options for select fields. Present when fieldType === "select". */
  options?: string[];
  defaultValue?: unknown;
}

export interface FormbakerSection {
  id: string;
  type: "section";
  order?: number;
  label?: string;
  description?: string;
  meta?: Record<string, unknown>;
}

export type FormbakerNode = FormbakerField | FormbakerSection;

export interface Formbaker<T extends PlainObject = {}> {
  id: string;
  label: string;
  /** All nodes (fields and sections) in one flat map. */
  nodes: Record<string, FormbakerNode & Omit<T, keyof FormbakerNode>>;
  dependencies: {
    forward: { [x: string]: FormbakerDependency[] };
    backward: { [x: string]: FormbakerDependency[] };
  };
  /** Name of the validation plugin. "arktype" (built-in) or "zod". */
  pluginName: FormbakerPluginName;
}

export type FormResult<T> = {
  success: boolean;
  data: T | string;
  schema: any;
};

export interface PositionedNode<T extends PlainObject = {}> {
  type: "_node" | "_section";
  id: string;
  position: { x: number; y: number };
  node?: FormbakerNode & T;
}
