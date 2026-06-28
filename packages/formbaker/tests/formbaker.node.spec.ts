import { create, addNode, validate, registerPlugin } from "formbaker";
import { testPlugin } from "./testPlugin";
import { describe, expect, it, beforeAll } from "vitest";

describe("formbaker", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("throws on duplicate node ids", () => {
    const form = addNode(create({ pluginName: "test" }), {
      id: "personal",
      type: "field",
      fieldType: "text",
    });
    expect(() => addNode(form, { id: "personal", type: "field", fieldType: "text" })).toThrow();
  });

  it("handles validation: required text, max length, number range", () => {
    // required text + max → 3 cases (null, within limit, over limit)
    const form = create({
      pluginName: "test",
      nodes: {
        b: {
          id: "b",
          type: "field",
          fieldType: "text",
          defaultValue: null,
          validation: { required: { message: "Please pick one" }, max: 5 },
        },
        age: {
          id: "age",
          type: "field",
          fieldType: "number",
          validation: { required: { message: "Age is required" }, min: 1, max: 150 },
        },
      },
    });

    // b is null → required field fails
    expect(validate(form, { b: null }).success).toBe(false);
    // b valid, age valid
    expect(validate(form, { b: "B", age: 25 }).success).toBe(true);
    // b too long
    expect(validate(form, { b: "hello my friend", age: 25 }).success).toBe(false);
    // number range
    expect(validate(form, { b: "x", age: 150 }).success).toBe(true);
    expect(validate(form, { b: "x", age: 151 }).success).toBe(false);
    expect(validate(form, { b: "x", age: 0 }).success).toBe(false);
  });

  it("accepts nullable fields", () => {
    const form = addNode(create({ pluginName: "test" }), {
      id: "b",
      type: "field",
      fieldType: "text",
      defaultValue: null,
    });
    expect(validate(form, { b: null }).success).toBe(true);
    expect(validate(form, { b: "b" }).success).toBe(true);
  });
});
