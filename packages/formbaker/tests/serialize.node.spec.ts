/**
 * Tests serialization round-trip: form definitions must survive
 * JSON.stringify/JSON.parse and revalidate correctly after rehydration.
 *
 * This is a regression test — plugins were previously stored as function
 * references on the form object, which JSON.stringify silently dropped.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, validate, registerPlugin } from "formbaker";
import { testPlugin } from "formbaker/test-utils";

describe("serialization", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("round-trips fields, validates after rehydration", () => {
    const form = create({
      nodes: {
        name: { id: "name", type: "field", fieldType: "text", validation: { required: true } },
        age: { id: "age", type: "field", fieldType: "number", validation: { min: 0 } },
      },
      pluginName: "test",
    });

    const restored = JSON.parse(JSON.stringify(form));
    const rehydrated = create({ ...restored, pluginName: restored.pluginName });

    expect(validate(rehydrated, { name: "" }).success).toBe(false);
    expect(validate(rehydrated, { name: "Alice" }).success).toBe(true);
  });

  it("round-trips dependencies correctly", () => {
    const original = create({
      nodes: {
        parent: { id: "parent", type: "field", fieldType: "checkbox" },
        child: { id: "child", type: "field", fieldType: "text", validation: { required: true } },
      },
      dependencies: {
        forward: { parent: [{ source: "parent", target: "child", condition: "true" }] },
        backward: { child: [{ source: "parent", target: "child", condition: "true" }] },
      },
      pluginName: "test",
    });

    const rehydrated = create({ ...JSON.parse(JSON.stringify(original)) });

    expect(validate(rehydrated, { parent: false }).success).toBe(true);
    expect(validate(rehydrated, { parent: true, child: "x" }).success).toBe(true);
    expect(validate(rehydrated, { parent: true, child: "" }).success).toBe(false);
  });
});
