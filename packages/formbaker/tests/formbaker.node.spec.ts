import {
  create,
  addNode,
  validate,
  registerPlugin,
  isVisible,
  addDependency,
} from "formbaker";
import { testPlugin } from "formbaker/test-utils";
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
    expect(() =>
      addNode(form, { id: "personal", type: "field", fieldType: "text" }),
    ).toThrow();
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
          validation: {
            required: { message: "Age is required" },
            min: 1,
            max: 150,
          },
        },
      },
    });

    // b is null → required field fails
    expect(validate(form, { b: null }).success).toBe(false);
    // b valid, age valid
    expect(validate(form, { b: "B", age: 25 }).success).toBe(true);
    // b too long
    expect(validate(form, { b: "hello my friend", age: 25 }).success).toBe(
      false,
    );
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

  describe("isVisible", () => {
    it("returns true for a node with no dependencies", () => {
      const form = addNode(create({ pluginName: "test" }), {
        id: "a",
        type: "field",
        fieldType: "text",
      });
      expect(isVisible(form, "a", {})).toBe(true);
    });

    it("returns false when an OR dep condition fails", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, {
        id: "trigger",
        type: "field",
        fieldType: "checkbox",
      });
      form = addNode(form, { id: "target", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "trigger",
        target: "target",
        condition: "true",
      });
      expect(isVisible(form, "target", { trigger: false })).toBe(false);
      expect(isVisible(form, "target", { trigger: true })).toBe(true);
    });

    it("returns false when an AND group has one failure", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "a", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "b", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "target", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "a",
        target: "target",
        condition: "true",
        dependencyType: "AND",
      });
      form = addDependency(form, {
        source: "b",
        target: "target",
        condition: "true",
        dependencyType: "AND",
      });
      expect(isVisible(form, "target", { a: true, b: false })).toBe(false);
      expect(isVisible(form, "target", { a: true, b: true })).toBe(true);
    });

    it("returns true when any OR dep passes", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "a", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "b", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "target", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "a",
        target: "target",
        condition: "true",
      });
      form = addDependency(form, {
        source: "b",
        target: "target",
        condition: "true",
      });
      expect(isVisible(form, "target", { a: false, b: false })).toBe(false);
      expect(isVisible(form, "target", { a: true, b: false })).toBe(true);
      expect(isVisible(form, "target", { a: false, b: true })).toBe(true);
    });

    it("returns false for a field inside a hidden section", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "#s1", type: "section" });
      form = addNode(form, {
        id: "trigger",
        type: "field",
        fieldType: "checkbox",
      });
      form = addNode(form, {
        id: "child",
        type: "field",
        fieldType: "text",
        parentId: "#s1",
      });
      form = addDependency(form, {
        source: "trigger",
        target: "#s1",
        condition: "true",
      });
      expect(isVisible(form, "child", { trigger: false })).toBe(false);
      expect(isVisible(form, "child", { trigger: true })).toBe(true);
    });

    it("returns true for a node with no backward deps even with unrelated deps", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "a", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "b", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "a",
        target: "b",
        condition: "true",
      });
      // "a" has forward deps but no backward deps — always visible
      expect(isVisible(form, "a", {})).toBe(true);
    });

    it("throws for a nonexistent node", () => {
      const form = create({ pluginName: "test" });
      expect(() => isVisible(form, "no-such-node", {})).toThrow();
    });
  });
});
