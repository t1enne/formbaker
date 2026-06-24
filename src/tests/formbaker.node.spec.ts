import { create, addNode, validate } from "@/libs/formbaker/engine";
import { describe, expect, it } from "vitest";

describe("formbaker", () => {
  it("should throw when adding nodes with duplicate ids", () => {
    const form = create();
    addNode(form, { id: "personal", type: "text" });

    expect(() => {
      addNode(form, { id: "personal", type: "text" });
    }).toThrow();
  });

  it("should work with nullable fields", () => {
    const form = create();
    addNode(form, { id: "b", type: "text", defaultValue: null });
    let formbakerValidateResult = validate(form, { b: "b" });
    expect(formbakerValidateResult.success).toBe(true);
  });

  it("should handle validations", () => {
    const form = create({
      fields: {
        b: {
          id: "b",
          type: "text",
          defaultValue: null,
          validation: {
            required: { message: "Please pick one" },
            max: 5,
          },
        },
      },
    });

    const first = validate(form, { b: null });
    expect(first.success).toBe(false);

    const second = validate(form, { b: "B" });
    expect(second.success).toBe(true);

    expect(validate(form, { b: "hello my friend" }).success).toBe(false);
  });

  it("should handle max validation for numbers", () => {
    const form = create({
      fields: {
        age: {
          id: "age",
          type: "number",
          validation: {
            required: { message: "Age is required" },
            min: 1,
            max: 150,
          },
        },
      },
    });

    expect(validate(form, { age: 150 }).success).toBe(true);
    expect(validate(form, { age: 151 }).success).toBe(false);
    expect(validate(form, { age: 0 }).success).toBe(false);
    expect(validate(form, { age: -1 }).success).toBe(false);
  });
});
