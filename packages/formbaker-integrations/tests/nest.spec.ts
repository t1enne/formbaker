/**
 * Tests for the NestJS class-validator code generation integration.
 */
import { describe, expect, it } from "vitest";
import { create, addNode } from "formbaker";
import { formbakerToClassValidator } from "../src/nest";

describe("nest class-validator code generation", () => {
  it("generates imports and class declaration", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text", validation: { required: true } });
    const code = formbakerToClassValidator(form, { className: "CreateUserDto" });

    expect(code).toContain('from "class-validator"');
    expect(code).toContain("export class CreateUserDto {");
    expect(code).not.toContain('from "class-transformer"');
  });

  it.each([
    // [fieldType, validation, expectedDecorators, expectedType]
    ["text",     { required: true, min: 2, max: 50 },   ["@IsString()", "@IsNotEmpty()", "@MinLength(2)", "@MaxLength(50)"], "string"],
    ["number",   { required: true, min: 18, max: 120 }, ["@IsNumber()", "@Min(18)", "@Max(120)", "@IsDefined()"],             "number"],
    ["textarea", { min: 10 },                           ["@IsOptional()", "@IsString()", "@MinLength(10)"],                    "string"],
    ["checkbox", { required: true },                    ["@IsBoolean()", "@IsDefined()"],                                      "boolean"],
    ["select",   { required: true },                    ["@IsNumber()", "@IsIn([0, 1, 2])", "@IsDefined()"],                  "number"],
    ["file",     { required: true },                    ["@IsObject()", "@IsDefined()"],                                      "Record<string, unknown>"],
  ] as const)("%s %j → %j", (fieldType, validation, expectedDecorators, expectedType) => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "field",
      type: "field",
      fieldType,
      ...(fieldType === "select" ? { options: ["Red", "Green", "Blue"] } : {}),
      validation,
    });
    const code = formbakerToClassValidator(form, { className: "Dto" });
    for (const dec of expectedDecorators) expect(code).toContain(dec);
    expect(code).toContain(`field!: ${expectedType};`);
  });

  it("omits imports when includeImports is false", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text", validation: { required: true } });
    expect(formbakerToClassValidator(form, { className: "Dto", includeImports: false }))
      .not.toContain('from "class-validator"');
  });

  it("applies class-level decorators", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text", validation: { required: true } });
    expect(formbakerToClassValidator(form, { className: "Dto", classDecorators: ["@ApiProperty()"] }))
      .toContain("@ApiProperty()");
  });

  it("generates empty class when no fields", () => {
    const code = formbakerToClassValidator(create({ pluginName: "zod" }), { className: "EmptyDto" });
    expect(code).toContain("export class EmptyDto {");
    expect(code).toContain("}");
  });
});
