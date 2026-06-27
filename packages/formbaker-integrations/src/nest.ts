/**
 * NestJS class-validator integration for Formbaker.
 *
 * Generates ES module classes decorated with class-validator decorators
 * from a Formbaker form definition. The output is a string (source code)
 * so you can write it to a file, pipe it into a build step, or evaluate
 * it at runtime via `new Function(...)`.
 *
 * @example
 * ```ts
 * const form = create({ pluginName: "zod", nodes: {
 *   name: { id: "name", type: "field", fieldType: "text", validation: { required: true, min: 2, max: 50 } },
 *   age:  { id: "age",  type: "field", fieldType: "number", validation: { required: true, min: 18, max: 120 } },
 *   bio:  { id: "bio",  type: "field", fieldType: "textarea", validation: { min: 10 } },
 * } });
 *
 * const code = formbakerToClassValidator(form, { className: "CreateUserDto" });
 * // writeFileSync("create-user.dto.ts", code);
 * ```
 */
import type { Formbaker, FormbakerField } from "formbaker";

// --- Helper to get field nodes from the unified nodes map ---

const getFields = (form: Formbaker): FormbakerField[] => {
  return Object.values(form.nodes).filter((n): n is FormbakerField => n.type === "field");
};

// --- Options ---

export interface ClassValidatorOptions {
  /** Name of the generated DTO class. Default: "FormbakerDto". */
  className?: string;
  /** If true, import class-validator decorators. Default: true. */
  includeImports?: boolean;
  /** Additional decorators to apply to the class (e.g., @ApiProperty). */
  classDecorators?: string[];
}

// --- Field-type → class-validator decorator mapping ---

interface DecoratorMapping {
  decorators: string[];
  tsType: string;
}

const mapField = (field: FormbakerField): DecoratorMapping => {
  const { validation } = field;
  const decorators: string[] = [];
  const isOptional = !validation?.required;

  // Type-specific decorators
  switch (field.fieldType) {
    case "text":
    case "textarea":
      decorators.push("@IsString()");
      if (validation?.min) {
        decorators.push(`@MinLength(${validation.min})`);
      }
      if (validation?.max) {
        decorators.push(`@MaxLength(${validation.max})`);
      }
      break;
    case "number":
      decorators.push("@IsNumber()");
      if (validation?.min !== undefined) {
        decorators.push(`@Min(${validation.min})`);
      }
      if (validation?.max !== undefined) {
        decorators.push(`@Max(${validation.max})`);
      }
      break;
    case "checkbox":
    case "radio":
      decorators.push("@IsBoolean()");
      break;
    case "select": {
      const options = field.options ?? [];
      decorators.push("@IsNumber()");
      decorators.push(`@IsIn([${options.map((_, i) => i).join(", ")}])`);
      break;
    }
    case "file":
      decorators.push("@IsObject()");
      break;
  }

  // Required / Optional
  if (isOptional) {
    decorators.push("@IsOptional()");
  } else if (field.fieldType === "text" || field.fieldType === "textarea") {
    decorators.push("@IsNotEmpty()");
  } else {
    decorators.push("@IsDefined()");
  }

  // TS type
  const tsType = fieldTypeToTs(field);

  return { decorators, tsType };
};

const fieldTypeToTs = (field: FormbakerField): string => {
  if (field.fieldType === "select") return "number";
  if (field.fieldType === "checkbox" || field.fieldType === "radio") return "boolean";
  if (field.fieldType === "number") return "number";
  if (field.fieldType === "file") return "Record<string, unknown>";
  return "string";
};

// --- Code generation ---

/**
 * Generate a class-validator decorated DTO class source code from a Formbaker
 * form definition.
 *
 * @param form - A Formbaker form definition (sections and dependencies are ignored).
 * @param opts - Options for code generation.
 * @returns TypeScript source code string.
 *
 * @example
 * ```ts
 * const code = formbakerToClassValidator(form, { className: "CreateUserDto" });
 * await fs.writeFile("create-user.dto.ts", code);
 * ```
 */
export const formbakerToClassValidator = (
  form: Formbaker,
  opts: ClassValidatorOptions = {},
): string => {
  const { className = "FormbakerDto", includeImports = true, classDecorators = [] } = opts;

  const lines: string[] = [];

  // Only import the decorators actually used, so the generated file
  // doesn't have dead imports.
  const usedDecorators = new Set<string>();
  const fieldMappings: Record<string, DecoratorMapping> = {};
  for (const field of getFields(form)) {
    const mapping = mapField(field);
    fieldMappings[field.id] = mapping;
    for (const dec of mapping.decorators) {
      usedDecorators.add(dec.replace(/^@(\w+).*$/, "$1"));
    }
  }

  if (includeImports) {
    const sortedDecs = [...usedDecorators].toSorted();
    lines.push(`import { ${sortedDecs.join(", ")} } from "class-validator";`);
    lines.push("");
  }

  for (const dec of classDecorators) {
    lines.push(dec);
  }
  lines.push(`export class ${className} {`);

  for (const field of getFields(form)) {
    const { decorators, tsType } = fieldMappings[field.id]!;

    for (const dec of decorators) {
      lines.push(`  ${dec}`);
    }
    lines.push(`  ${field.id}!: ${tsType};`);
    lines.push("");
  }

  lines.push("}");

  return lines.join("\n");
};
