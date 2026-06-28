/**
 * Class-validator runtime DTO builder for Formbaker.
 *
 * Builds a runtime class — decorated with class-validator decorators — from
 * a Formbaker form definition. Create an instance, assign values, then pass it
 * to `validate` / `validateSync` from `class-validator`.
 *
 * @example
 * ```ts
 * import { validate } from "class-validator";
 * import { formbakerToClassValidator } from "@formbaker/plugins/class-validator";
 *
 * const form = create({ pluginName: "zod", nodes: {
 *   name: { id: "name", type: "field", fieldType: "text", validation: { required: true, min: 2, max: 50 } },
 *   age:  { id: "age",  type: "field", fieldType: "number", validation: { required: true, min: 18, max: 120 } },
 * } });
 *
 * const Dto = formbakerToClassValidator(form);
 * const dto = new Dto();
 * dto.name = "John";
 * dto.age = 30;
 *
 * const errors = await validate(dto);
 * ```
 *
 * @module
 */
import type { Formbaker, FormbakerField } from "formbaker";
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsObject,
  IsOptional,
  IsDefined,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsIn,
} from "class-validator";

// --- Extract field nodes from the form ---

const getFields = (form: Formbaker): FormbakerField[] =>
  Object.values(form.nodes).filter(
    (n): n is FormbakerField => n.type === "field",
  );

// --- Options ---

export interface ClassValidatorOptions {
  /** Name of the generated class. Default: "FormbakerDto". */
  className?: string;
}

// --- Build decorator list for a single field ---

type DecoratorFn = (target: object, propertyKey: string) => void;

const buildDecorators = (field: FormbakerField): DecoratorFn[] => {
  const { validation } = field;
  const decs: DecoratorFn[] = [];
  const isOptional = !validation?.required;

  switch (field.fieldType) {
    case "text":
    case "textarea":
      decs.push(IsString());
      if (validation?.min) decs.push(MinLength(validation.min));
      if (validation?.max) decs.push(MaxLength(validation.max));
      break;
    case "number":
      decs.push(IsNumber());
      if (validation?.min !== undefined) decs.push(Min(validation.min));
      if (validation?.max !== undefined) decs.push(Max(validation.max));
      break;
    case "checkbox":
    case "radio":
      decs.push(IsBoolean());
      break;
    case "select": {
      const options = field.options ?? [];
      decs.push(IsNumber());
      decs.push(IsIn(options.map((_, i) => i)));
      break;
    }
    case "file":
      decs.push(IsObject());
      break;
  }

  if (isOptional) {
    decs.push(IsOptional());
  } else if (
    field.fieldType === "text" ||
    field.fieldType === "textarea"
  ) {
    decs.push(IsNotEmpty());
  } else {
    decs.push(IsDefined());
  }

  return decs;
};

// --- Class builder ---

/**
 * Build a runtime class decorated with class-validator decorators from a
 * Formbaker form definition.
 *
 * Create an instance, assign property values, then pass it to `validate` or
 * `validateSync` from `class-validator`.
 *
 * ```ts
 * const Dto = formbakerToClassValidator(form);
 * const dto = new Dto();
 * dto.name = "John";
 * const errors = await validate(dto);
 * ```
 */
export const formbakerToClassValidator = (
  form: Formbaker,
  opts: ClassValidatorOptions = {},
): new () => Record<string, unknown> => {
  const { className = "FormbakerDto" } = opts;

  // Dynamically create a named class so error messages have clear type names.
  const DtoClass: new () => Record<string, unknown> =
    { [className]: class {} }[className];

  for (const field of getFields(form)) {
    for (const dec of buildDecorators(field)) {
      dec(DtoClass.prototype, field.id);
    }
  }

  return DtoClass;
};
