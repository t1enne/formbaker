/**
 * Tests for the NestJS class-validator code generation integration.
 */
import { describe, expect, it } from "vitest";
import { create, addNode } from "formbaker";
import { formbakerToClassValidator } from "../src/nest";

describe("nest class-validator code generation", () => {
  it("should generate imports", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "text", validation: { required: true } });
    const code = formbakerToClassValidator(form, { className: "TestDto" });

    expect(code).toContain("import {");
    expect(code).toContain('from "class-validator"');
    // No unused class-transformer import
    expect(code).not.toContain('from "class-transformer"');
  });

  it("should generate the class declaration", () => {
    const form = create({ pluginName: "zod" });
    const code = formbakerToClassValidator(form, { className: "CreateUserDto" });

    expect(code).toContain("export class CreateUserDto {");
  });

  it("should generate text field with @IsString, @IsNotEmpty, @MinLength, @MaxLength", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "name",
      type: "text",
      validation: { required: true, min: 2, max: 50 },
    });

    const code = formbakerToClassValidator(form, { className: "Dto" });

    expect(code).toContain("@IsString()");
    expect(code).toContain("@IsNotEmpty()");
    expect(code).toContain("@MinLength(2)");
    expect(code).toContain("@MaxLength(50)");
    expect(code).toContain("name!: string;");
  });

  it("should generate number field with @IsNumber, @Min, @Max", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "age",
      type: "number",
      validation: { required: true, min: 18, max: 120 },
    });

    const code = formbakerToClassValidator(form, { className: "Dto" });

    expect(code).toContain("@IsNumber()");
    expect(code).toContain("@Min(18)");
    expect(code).toContain("@Max(120)");
    expect(code).toContain("@IsDefined()");
    expect(code).toContain("age!: number;");
  });

  it("should generate optional fields with @IsOptional", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "bio",
      type: "textarea",
      validation: { min: 10 },
    });

    const code = formbakerToClassValidator(form, { className: "Dto" });

    expect(code).toContain("@IsOptional()");
    expect(code).toContain("@IsString()");
    expect(code).toContain("@MinLength(10)");
    // No @IsNotEmpty for optional
    expect(code).not.toContain("@IsNotEmpty()");
  });

  it("should generate checkbox as boolean with @IsBoolean", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "agree",
      type: "checkbox",
      validation: { required: true },
    });

    const code = formbakerToClassValidator(form, { className: "Dto" });

    expect(code).toContain("@IsBoolean()");
    expect(code).toContain("agree!: boolean;");
  });

  it("should generate select with @IsNumber, @IsIn", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "color",
      type: "select",
      options: ["Red", "Green", "Blue"],
      validation: { required: true },
    });

    const code = formbakerToClassValidator(form, { className: "Dto" });

    expect(code).toContain("@IsNumber()");
    expect(code).toContain("@IsIn([0, 1, 2])");
    expect(code).toContain("color!: number;");
  });

  it("should generate file as Record with @IsObject", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "resume",
      type: "file",
      validation: { required: true },
    });

    const code = formbakerToClassValidator(form, { className: "Dto" });

    expect(code).toContain("@IsObject()");
    expect(code).toContain("resume!: Record<string, unknown>;");
  });

  it("should omit imports when includeImports is false", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "text", validation: { required: true } });
    const code = formbakerToClassValidator(form, {
      className: "Dto",
      includeImports: false,
    });

    expect(code).not.toContain('from "class-validator"');
  });

  it("should apply class-level decorators", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "text", validation: { required: true } });
    const code = formbakerToClassValidator(form, {
      className: "Dto",
      classDecorators: ["@ApiProperty()"],
    });

    expect(code).toContain("@ApiProperty()");
  });

  it("should generate an empty class when there are no fields", () => {
    const form = create({ pluginName: "zod" });
    const code = formbakerToClassValidator(form, { className: "EmptyDto" });

    expect(code).toContain("export class EmptyDto {");
    expect(code).toContain("}");
    expect(code).not.toContain("!:");
  });
});
