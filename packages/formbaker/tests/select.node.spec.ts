import { create, validate, registerPlugin } from "formbaker";
import { testPlugin } from "./testPlugin";
import { describe, it, expect, beforeAll } from "vitest";

describe("select field", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("nullable when optional, validates index bounds when required", () => {
    const optional = create({
      pluginName: "test",
      nodes: {
        b: { id: "b", type: "field", fieldType: "select", validation: {}, options: ["a", "b"] },
      },
    });
    expect(validate(optional, { b: null }).success).toBe(true);

    const required = create({
      pluginName: "test",
      nodes: {
        b: {
          id: "b",
          type: "field",
          fieldType: "select",
          validation: { required: true },
          options: ["a", "b"],
        },
      },
    });
    expect(validate(required, { b: 2 }).success).toBe(false);
    expect(validate(required, { b: null }).success).toBe(false);
    expect(validate(required, { b: 1 }).success).toBe(true);
  });
});
