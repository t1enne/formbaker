/**
 * Tests serialization round-trip: form definitions must survive
 * JSON.stringify/JSON.parse and revalidate correctly after rehydration.
 *
 * This is a regression test — plugins were previously stored as function
 * references on the form object, which JSON.stringify silently dropped.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, validate, registerPlugin } from "formbaker";
import { testPlugin } from "./testPlugin";

describe("serialization", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });
  it("form should survive JSON stringify/parse round-trip", () => {
    const form = create({
      fields: {
        name: { id: "name", type: "text", validation: { required: true } },
        age: { id: "age", type: "number", validation: { min: 0 } },
      },
      pluginName: "test",
    });

    const json = JSON.stringify(form, null, 2);
    const restored = JSON.parse(json);

    expect(restored.pluginName).toBe("test");
    expect(restored.fields.name.type).toBe("text");
    expect(restored.fields.age.validation.min).toBe(0);
    expect(typeof restored.pluginName).toBe("string");

    // Rehydrate
    const rehydrated = create({ ...restored, pluginName: restored.pluginName });

    expect(validate(rehydrated, { name: "" }).success).toBe(false);
    expect(validate(rehydrated, { name: "Alice" }).success).toBe(true);
  });

  it("rehydrated form with dependencies should validate correctly", () => {
    const original = create({
      fields: {
        parent: { id: "parent", type: "checkbox" },
        child: {
          id: "child",
          type: "text",
          validation: { required: true },
        },
      },
      dependencies: {
        forward: {
          parent: [{ source: "parent", target: "child", condition: "true" }],
        },
        backward: {
          child: [{ source: "parent", target: "child", condition: "true" }],
        },
      },
      pluginName: "test",
    });

    const json = JSON.stringify(original);
    const loaded = JSON.parse(json);
    const rehydrated = create({ ...loaded });

    // child only required when parent is true
    expect(validate(rehydrated, { parent: false }).success).toBe(true);
    expect(validate(rehydrated, { parent: true, child: "x" }).success).toBe(
      true,
    );
    expect(validate(rehydrated, { parent: true, child: "" }).success).toBe(
      false,
    );
  });
});
