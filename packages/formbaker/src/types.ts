import type { StandardSchemaV1 } from "@standard-schema/spec";

export type PlainObject = Record<string, unknown>;

export type ValidationRuleMap = {
  required: { message: string } | boolean;
  min: number;
  max: number;
  absolute: string | number | boolean;
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
 * max, absolute) into their library's schema DSL.
 */
export type FormbakerPlugin = {
  field: (
    field: FormbakerField,
    values: Record<string, unknown>,
  ) => StandardSchemaV1;
  mergeFields: (
    fields: Record<string, StandardSchemaV1>,
  ) => StandardSchemaV1;
  evaluateCondition: (condition: unknown, value: unknown) => boolean;
};

/** A JSON-safe identifier for the validation plugin. */
export type FormbakerPluginName = string;

export interface Formbaker<T extends PlainObject = {}> {
  id: string;
  label: string;
  fields: Record<string, FormbakerField & T>;
  sections: Record<string, FormbakerSection>;
  dependencies: {
    forward: { [x: string]: FormbakerDependency[] };
    backward: { [x: string]: FormbakerDependency[] };
  };
  /** Name of the validation plugin. "arktype" (built-in) or "zod". */
  pluginName: FormbakerPluginName;
}

export interface FormbakerSection {
  id: string;
  label?: string;
  description?: string;
  order?: number;
}

export interface BaseField {
  id: string;
  label?: string;
  description?: string;
  type: keyof FormbakerTypeMap;
  validation?: FormbakerValidation;
  order?: number;
  /** Arbitrary consumer-defined metadata. */
  meta?: Record<string, unknown>;
}

export type FormbakerField<T extends keyof FormbakerTypeMap = "text"> = {
  [K in keyof FormbakerTypeMap]: FormbakerTypeMap[T] & BaseField;
}[keyof FormbakerTypeMap];

export type FormResult<T> = {
  success: boolean;
  data: T | string;
  schema: any;
};

export interface PositionedSection {
  type: "_section";
  id: string;
  section?: FormbakerSection;
  position: { x: number; y: number };
}

export interface PositionedField<T extends PlainObject> {
  type: "_node";
  id: string;
  position: { x: number; y: number };
  node?: FormbakerField & T;
}

export type PositionedNode<T extends PlainObject = {}> =
  | PositionedField<T>
  | PositionedSection;
