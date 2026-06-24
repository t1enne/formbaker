import { isUndefined } from "es-toolkit";
import {
  Formbaker,
  FormbakerDependency,
  FormbakerField,
  FormbakerSection,
  TranslationDict,
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

export {
  toFormSchema,
  getTranslatedText,
  isEqualDepencency,
  getNodeAtOrder,
  getIndexFromLetter,
  getLetterFromIndex,
};
