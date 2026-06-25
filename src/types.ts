import type { StandardSchemaV1 } from "@standard-schema/spec";

export type PlainObject = Record<string, unknown>;

export declare type Optional<O, K extends keyof any = keyof O> = {
  [P in K & keyof O]?: O[P];
} & {
  [P in Exclude<keyof O, K>]: O[P];
};

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
 * A validation plugin produces a Standard Schema v1 validator for a given field.
 * It receives the field definition and the current form values (for dependency-based
 * visibility checks). The returned schema must implement {@link StandardSchemaV1}.
 *
 * Plugins decide how to translate {@link FormbakerValidation} rules (required, min,
 * max, absolute) into their library's schema DSL.
 *
 * @example // ArkType plugin (built-in)
 * (field, values) => type("string > 0") // arktype Type implements StandardSchemaV1
 *
 * @example // Zod plugin (user-provided)
 * (field, values) => z.string().min(1) // with ~standard adapter
 */
export type FormbakerPlugin = (
  field: FormbakerField,
  values: Record<string, unknown>,
) => StandardSchemaV1;

export interface Formbaker<T extends PlainObject = {}> {
  id: string;
  label: string;
  fields: Record<string, FormbakerField & T>;
  sections: Record<string, FormbakerSection>;
  dependencies: {
    forward: { [x: string]: FormbakerDependency[] };
    backward: { [x: string]: FormbakerDependency[] };
  };
  /** The validation plugin used by this form. Defaults to the built-in arktype plugin. */
  plugin: FormbakerPlugin;
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
  // variable id
  $$?: string;
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
