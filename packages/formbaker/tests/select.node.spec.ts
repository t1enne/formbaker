import { create, validate, registerPlugin } from "formbaker";
import { testPlugin } from "./testPlugin";
import { describe, it, expect, beforeAll } from "vitest";

const field = {
  id: "b",
  type: "select" as const,
  validation: {},
  options: ["a", "b"],
};

describe("formbaker selects", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  let fb = create({ pluginName: "test", fields: { b: field } });

  it("should allow nullable state", () => {
    let formbakerValidateResult = validate(fb, { b: null });
    expect(formbakerValidateResult.success).toBe(true);
  });

  it("should disallow unspecified values", () => {
    field.validation = { required: true };
    const r1 = validate(fb, { b: 2 });
    expect(r1.success).toBe(false);

    const r2 = validate(fb, { b: null });
    expect(r2.success).toBe(false);

    const r3 = validate(fb, { b: 1 });
    expect(r3.success).toBe(true);
  });
});
