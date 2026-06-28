/**
 * Tests for the class-validator runtime DTO builder.
 *
 * Uses `validate` and `validateSync` to test actual validation behaviour.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import type { FormbakerField } from "formbaker";
import { create, addNode } from "formbaker";
import { validate, validateSync } from "class-validator";
import { formbakerToClassValidator } from "../src/class-validator";

describe("class-validator runtime DTO builder", () => {
  it("builds a class that can be instantiated", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "name",
      type: "field",
      fieldType: "text",
      validation: { required: true },
    });
    const Dto = formbakerToClassValidator(form);
    const instance = new Dto();
    expect(typeof instance).toBe("object");
  });

  describe("sync validation via validateSync", () => {
    it.each([
      // [fieldType, validation, passingValue, failingValues]
      ["text", { required: true }, "Alice", ["", null, undefined]],
      ["text", { min: 2, max: 5 }, "ab", ["", "a", "abcdef"]],
      ["number", { required: true }, 25, [undefined, null, "not a number"]],
      ["number", { min: 0, max: 100 }, 0, [-1, 101]],
      ["select", { required: true }, 0, [2, null]],
      ["checkbox", { required: true }, true, ["yes", undefined]],
      ["textarea", { required: true }, "hello", [""]],
      ["textarea", { min: 10, max: 100 }, "long enough string", ["short"]],
      ["file", { required: true }, { name: "cv.pdf" }, [null]],
    ] as const)("%s %j → pass: %j, fail: %j", (fieldType, validation, passValue, failValues) => {
      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "x",
        type: "field",
        fieldType: fieldType as FormbakerField["fieldType"],
        ...(fieldType === "select" ? { options: ["A", "B"] } : {}),
        validation,
      });

      const Dto = formbakerToClassValidator(form);

      // Passing
      {
        const dto = new Dto() as Record<string, unknown>;
        (dto as Record<string, unknown>).x = passValue as unknown;
        const errors = validateSync(dto);
        expect(errors, `${fieldType} ${JSON.stringify(passValue)} should pass`).toHaveLength(0);
      }

      // Failing
      for (const v of failValues) {
        const dto = new Dto() as Record<string, unknown>;
        (dto as Record<string, unknown>).x = v as unknown;
        const errors = validateSync(dto);
        expect(errors, `${fieldType} ${JSON.stringify(v)} should fail`).not.toHaveLength(0);
      }
    });
  });

  describe("async validation via validate", () => {
    it("validates multiple fields together", async () => {
      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "name",
        type: "field",
        fieldType: "text",
        validation: { required: true },
      });
      form = addNode(form, {
        id: "age",
        type: "field",
        fieldType: "number",
        validation: { min: 18 },
      });

      const Dto = formbakerToClassValidator(form);

      // Valid
      {
        const dto = new Dto() as Record<string, unknown>;
        (dto as Record<string, unknown>).name = "Bob";
        (dto as Record<string, unknown>).age = 25;
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      }

      // Invalid
      {
        const dto = new Dto() as Record<string, unknown>;
        (dto as Record<string, unknown>).name = "Bob";
        (dto as Record<string, unknown>).age = 10;
        const errors = await validate(dto);
        expect(errors).not.toHaveLength(0);
      }
    });

    it("optional fields accept undefined/null", async () => {
      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "email",
        type: "field",
        fieldType: "text",
        validation: {}, // not required
      });

      const Dto = formbakerToClassValidator(form);

      const results = await Promise.all(
        [undefined, null, "hello@example.com"].map(async (v) => {
          const dto = new Dto() as Record<string, unknown>;
          (dto as Record<string, unknown>).email = v as unknown;
          return { v, errors: await validate(dto) };
        }),
      );
      for (const { v, errors } of results) {
        expect(errors, `optional field with ${v}`).toHaveLength(0);
      }
    });

    // class-validator rejects classes with zero decorated properties as "unknownValue".
    // This is expected: an empty form produces a class with nothing to validate.
    it("empty class is rejected by validate as unknown", async () => {
      const Dto = formbakerToClassValidator(create({ pluginName: "zod" }));
      const errors = await validate(new Dto());
      expect(errors).not.toHaveLength(0);
      expect(errors[0]!.constraints).toHaveProperty("unknownValue");
    });

    it("custom className appears in error messages", async () => {
      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "name",
        type: "field",
        fieldType: "text",
        validation: { required: true },
      });

      const Dto = formbakerToClassValidator(form, { className: "CreateUserDto" });
      const dto = new Dto() as Record<string, unknown>;
      (dto as Record<string, unknown>).name = null as unknown;
      const errors = await validate(dto);

      expect(errors).not.toHaveLength(0);
      expect(errors[0]!.target!.constructor.name).toBe("CreateUserDto");
    });

    it("radio fields use IsBoolean", async () => {
      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "agree",
        type: "field",
        fieldType: "radio",
        validation: { required: true },
      });

      const Dto = formbakerToClassValidator(form);

      const valid = new Dto() as Record<string, unknown>;
      (valid as Record<string, unknown>).agree = true;
      expect(await validate(valid)).toHaveLength(0);

      const invalid = new Dto() as Record<string, unknown>;
      (invalid as Record<string, unknown>).agree = "yes";
      expect(await validate(invalid)).not.toHaveLength(0);
    });

    it("select uses IsIn with option indices", async () => {
      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "color",
        type: "field",
        fieldType: "select",
        options: ["Red", "Green", "Blue"],
        validation: { required: true },
      });

      const Dto = formbakerToClassValidator(form);

      const valid = new Dto() as Record<string, unknown>;
      (valid as Record<string, unknown>).color = 0;
      expect(await validate(valid)).toHaveLength(0);

      const invalid = new Dto() as Record<string, unknown>;
      (invalid as Record<string, unknown>).color = 42;
      expect(await validate(invalid)).not.toHaveLength(0);
    });
  });
});
