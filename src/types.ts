export type PlainObject = Record<string, unknown>;

export declare type Optional<O, K extends keyof any = keyof O> = {
  [P in K & keyof O]?: O[P];
} & {
  [P in Exclude<keyof O, K>]: O[P];
};

export type TranslationDict = {
  it: string | null;
  eng: string | null;
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

export type FormeyTypeMap = {
  text: { defaultValue?: unknown };
  number: { defaultValue?: unknown };
  checkbox: { defaultValue?: unknown };
  radio: { defaultValue?: unknown };
  textarea: { defaultValue?: unknown };
  select: {
    defaultValue?: unknown;
    options: TranslationDict[];
  };
  file: {};
};

export type FormeyValidation = {
  [K in keyof ValidationRuleMap]?: BaseValidation & ValidationRuleMap[K];
};

export type FormeyDependency = {
  condition: any;
  source: string;
  target: string;
};

export interface Formey<T extends PlainObject = {}> {
  id: string;
  label: Partial<TranslationDict>;
  fields: Record<string, FormeyField & T>;
  sections: Record<string, FormeySection>;
  dependencies: {
    forward: { [x: string]: FormeyDependency[] };
    backward: { [x: string]: FormeyDependency[] };
  };
}

export interface FormeySection {
  id: string;
  label?: Partial<TranslationDict>;
  description?: Partial<TranslationDict>;
  order?: number;
}

export interface BaseField {
  id: string;
  label?: Partial<TranslationDict>;
  description?: Partial<TranslationDict>;
  type: keyof FormeyTypeMap;
  validation?: FormeyValidation;
  order?: number;
  // variable id
  $$?: string;
}

export type FormeyField<T extends keyof FormeyTypeMap = "text"> = {
  [K in keyof FormeyTypeMap]: FormeyTypeMap[T] & BaseField;
}[keyof FormeyTypeMap];

export type FormResult<T> = {
  success: boolean;
  data: T | string;
  schema: any;
};

export interface PositionedSection {
  type: "_section";
  id: string;
  section?: FormeySection;
  position: { x: number; y: number };
}

export interface PositionedField<T extends PlainObject> {
  type: "_node";
  id: string;
  position: { x: number; y: number };
  node?: FormeyField & T;
}

export type PositionedNode<T extends PlainObject = {}> =
  | PositionedField<T>
  | PositionedSection;
