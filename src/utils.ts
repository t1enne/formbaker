import {
  Formbaker,
  FormbakerDependency,
  FormbakerField,
  FormbakerSection,
  TranslationDict,
  PlainObject,
} from "./types";
import { type } from "arktype";
import { isNumber } from "../utils";

/**
 * This works assuming that relationships between fields are within a section
 * or field -> section.
 * Won't work if we attempt to connect a field from one section to a field
 * in another section.
 */

// checks if node's condition is true
export const shouldInclude = (
  form: Formbaker,
  node: FormbakerField | FormbakerSection,
  value: any,
) => {
  if (!node) {
    return false;
  }
  const deps = form.dependencies.backward[node.id];
  if (!deps || deps.length === 0) {
    return true;
  }
  if (value === undefined) {
    return true;
  }
  // WARN: evaluate whether OR or AND should be used here
  return deps.some((d) => {
    const r = type(d.condition)(value[d.source]);
    const hasError = r instanceof type.errors;
    return !hasError;
  });
};

const getPrimitiveSchema = (field: FormbakerField, _value: any) => {
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
  if (field.type === "checkbox") {
    return schema + "boolean";
  }

  if (field.type === "radio") {
    return schema + "boolean";
  }

  if (field.type === "textarea") {
    let constraints = isOptional ? "string" : "string > 0";
    if (min !== undefined) {
      constraints += ` & string >= ${min}`;
    }
    if (max !== undefined) {
      constraints += ` & string <= ${max}`;
    }
    return schema + constraints;
  }

  if (field.type === "file") {
    return schema + "object";
  }
  return schema;
};

// const toSectionSchema = (values: any) => (field: FormbakerField, _: number) =>
//   getFieldSchema(field, values);

const toFormSchema =
  (form: Formbaker, value: any, formbakerErrs: Record<string, any> = {}) =>
  (field: FormbakerField, _: number) => {
    const willInclude = shouldInclude(form, field, value);
    if (!willInclude) {
      return {};
    }
    const isOptional = !field.validation?.required;
    if (isOptional && isUndefined(value[field.id])) {
      return {};
    }
    const ps = getPrimitiveSchema(field, value) as any;
    return {
      [field.id]: type(ps).configure({
        message: (ctx) => {
          const md = formbakerErrs[ctx.code] ?? formbakerErrs.predicate;
          return String(md?.id);
        },
      }),
    };
  };

const getTranslatedText = (
  text: Partial<TranslationDict> | undefined,
  locale: "it" | "eng" | "en" = "it",
): string => {
  if (!text) {
    return "";
  }
  if (typeof text === "string") {
    return text;
  }
  if (locale == "en") {
    return text.eng || text.it || "";
  }
  return text[locale] || text.it || "";
};

const isEqualDepencency = (a: FormbakerDependency, b: FormbakerDependency) => {
  if (a.source !== b.source) {
    return false;
  }
  if (a.target !== b.target) {
    return false;
  }
  if (a.condition !== b.condition) {
    return false;
  }
  return true;
};

const getNodeAtOrder = <T extends Formbaker>(form: T, order = 0) => {
  const field = Object.values(form.fields).find((f) => f.order === order);
  return field ?? Object.values(form.sections).find((s) => s.order === order);
};

/**
 * returns a, b, c etc
 */
const getLetterFromIndex = (index: number) => String.fromCharCode(97 + index);
const getIndexFromLetter = (letter: string) =>
  letter.toLowerCase().charCodeAt(0) - 97;

// --- Replacing es-toolkit functions ---

/** Assertion: throws if condition is falsy. */
export function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? "Invariant failed");
  }
}

/** Checks if value is strictly undefined. */
export function isUndefined(x: unknown): x is undefined {
  return x === void 0;
}

/** Creates a new object with specified keys omitted. */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const result: Record<string, unknown> = { ...obj };
  for (const key of keys) {
    delete result[key as string];
  }
  return result as unknown as Omit<T, K>;
}

/** Deep merge source into target (mutates target). Skips unsafe prototype keys. */
export function merge<T extends Record<PropertyKey, any>, S extends Record<PropertyKey, any>>(
  target: T,
  source: S,
): T & S {
  const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
  const t = target as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (unsafeKeys.has(key)) continue;
    const sv = source[key];
    const tv = t[key];
    if (isMergeable(sv) && isMergeable(tv)) {
      t[key] = merge(tv as Record<PropertyKey, unknown>, sv as Record<PropertyKey, unknown>);
    } else if (Array.isArray(sv)) {
      t[key] = merge([] as unknown as Record<PropertyKey, unknown>, sv);
    } else if (isPlainObject(sv)) {
      t[key] = merge({}, sv as Record<PropertyKey, unknown>);
    } else if (tv === void 0 || sv !== void 0) {
      t[key] = sv;
    }
  }
  return target as T & S;
}

function isMergeable(value: unknown): boolean {
  return isPlainObject(value) || Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Sorts an array by iteratee functions or property keys (ascending).
 * Returns a new array; does not mutate the original.
 */
export function sortBy<T>(
  arr: T[],
  criteria: Array<((item: T) => unknown) | keyof T>,
): T[] {
  return arr.slice().sort((a, b) => {
    for (let i = 0; i < criteria.length; i++) {
      const criterion = criteria[i]!;
      const fn: (item: T) => unknown =
        typeof criterion === "function"
          ? (criterion as (item: T) => unknown)
          : (item: T) => item[criterion as keyof T];
      const va = fn(a);
      const vb = fn(b);
      if (va != null && vb != null) {
        if (va < vb) return -1;
        if (va > vb) return 1;
      }
    }
    return 0;
  });
}

/** Composes functions left-to-right. */
export function flow<A extends unknown[], B, C>(
  f1: (...args: A) => B,
  f2: (arg: B) => C,
): (...args: A) => C;
export function flow<A extends unknown[], B, C, D>(
  f1: (...args: A) => B,
  f2: (arg: B) => C,
  f3: (arg: C) => D,
): (...args: A) => D;
export function flow<A extends unknown[], B, C, D, E>(
  f1: (...args: A) => B,
  f2: (arg: B) => C,
  f3: (arg: C) => D,
  f4: (arg: D) => E,
): (...args: A) => E;
export function flow(...funcs: Array<(...args: any[]) => unknown>) {
  return function (this: unknown, ...args: unknown[]) {
    let result = funcs.length ? funcs[0]!.apply(this, args) : args[0];
    for (let i = 1; i < funcs.length; i++) {
      result = funcs[i]!.call(this, result);
    }
    return result;
  };
}

export {
  toFormSchema,
  getTranslatedText,
  isEqualDepencency,
  getNodeAtOrder,
  getIndexFromLetter,
  getLetterFromIndex,
};
