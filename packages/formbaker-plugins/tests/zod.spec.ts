/**
 * Tests for the Zod validation plugin.
 *
 * Covers each field type, optional vs required, min/max constraints,
 * edges, and plugin-specific evaluateCondition translation layer.
 */
import { describe, expect, it, beforeAll } from "vitest";
import type { FormbakerField, Formbaker, FormbakerDependency } from "formbaker";
import { create, addNode, validate, registerPlugin, addDependency } from "formbaker";
import { zodPlugin } from "@formbaker/plugins/zod";

const withDep = (
  condition: string | number,
  parentFieldType: FormbakerField["fieldType"] = "text",
  childFieldType: FormbakerField["fieldType"] = "text",
): Formbaker =>
  addDependency(
    create({
      pluginName: "zod",
      nodes: {
        parent: { id: "parent", type: "field", fieldType: parentFieldType },
        child: {
          id: "child",
          type: "field",
          fieldType: childFieldType,
          validation: { required: true },
        },
      },
    } as any),
    { source: "parent", target: "child", condition } as FormbakerDependency,
  );

describe("zodPlugin", () => {
  beforeAll(() => {
    registerPlugin("zod", zodPlugin);
  });

  describe("per-field validation", () => {
    it.each([
      // [fieldType, validation, passing, failing]
      ["text", { required: true }, ["Alice"], ["", null, undefined]],
      ["text", { min: 2, max: 5 }, ["ab", "abcde"], ["a", "abcdef"]],
      ["text", {}, ["hello", null, undefined], []],
      ["number", { required: true }, [25], [undefined, null, "nope"]],
      ["number", { min: 0, max: 100 }, [0, 100], [-1, 101]],
      ["number", {}, [42, null, undefined], []],
      ["select", { required: true }, [0, 1], [2, null]],
      ["select", {}, [null, undefined, 0], []],
      ["checkbox", { required: true }, [true, false], ["yes", undefined]],
      ["checkbox", {}, [null, undefined], []],
      ["radio", { required: true }, [true, false], ["male"]],
      ["textarea", { required: true }, ["I am..."], [""]],
      ["textarea", { min: 10, max: 100 }, ["long enough string"], ["short"]],
      ["file", { required: true }, [{ name: "cv.pdf" }], [null]],
      ["file", {}, [null, undefined], []],
    ] as const)("%s %j → pass: %j, fail: %j", (fieldType, validation, passing, failing) => {
      const form = addNode(create({ pluginName: "zod" }), {
        id: "x",
        type: "field",
        fieldType: fieldType as FormbakerField["fieldType"],
        ...(fieldType === "select" ? { options: ["A", "B"] } : {}),
        validation,
      });
      for (const v of passing) expect(validate(form, { x: v }).success).toBe(true);
      for (const v of failing) expect(validate(form, { x: v }).success).toBe(false);
    });
  });

  it("validates multiple fields together", () => {
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
    expect(validate(form, { name: "Bob", age: 25 }).success).toBe(true);
    expect(validate(form, { name: "Bob", age: 10 }).success).toBe(false);
  });

  it("composes multiple field schemas into one object schema", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "a",
      type: "field",
      fieldType: "text",
      validation: { required: true },
    });
    form = addNode(form, { id: "b", type: "field", fieldType: "number", validation: { min: 0 } });
    const result = validate(form, { a: "hi", b: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: "hi", b: 5 });
  });

  it("produces empty object schema when no fields", () => {
    expect(validate(create({ pluginName: "zod" }), {}).success).toBe(true);
  });

  describe("evaluateCondition (zod translation layer)", () => {
    it("'true' means truthy (not null, undefined, or false)", () => {
      const form = withDep("true", "checkbox", "text");
      expect(validate(form, { parent: null }).success).toBe(true);
      expect(validate(form, { parent: false }).success).toBe(true);
      expect(validate(form, { parent: true }).success).toBe(false);
      expect(validate(form, { parent: true, child: "x" }).success).toBe(true);
    });

    it("'string' matches string values", () => {
      const form = withDep("string");
      expect(validate(form, { parent: null }).success).toBe(true);
      expect(validate(form, { parent: "x" }).success).toBe(false);
      expect(validate(form, { parent: "x", child: "y" }).success).toBe(true);
    });

    it("'number' matches number values", () => {
      const form = withDep("number", "number", "text");
      expect(validate(form, { parent: null }).success).toBe(true);
      expect(validate(form, { parent: 25 }).success).toBe(false);
      expect(validate(form, { parent: 25, child: "ok" }).success).toBe(true);
    });

    it("'boolean' matches boolean values", () => {
      const form = withDep("boolean", "checkbox", "text");
      expect(validate(form, { parent: null }).success).toBe(true);
      expect(validate(form, { parent: true }).success).toBe(false);
      expect(validate(form, { parent: false }).success).toBe(false);
      expect(validate(form, { parent: true, child: "yes" }).success).toBe(true);
    });

    it("'object' matches non-null objects", () => {
      const form = withDep("object", "file", "text");
      expect(validate(form, { parent: null }).success).toBe(true);
      expect(validate(form, { parent: { name: "x.pdf" } }).success).toBe(false);
      expect(validate(form, { parent: { name: "x.pdf" }, child: "A file" }).success).toBe(true);
    });

    it("'any' always shows dependent field", () => {
      const form = withDep("any");
      expect(validate(form, { parent: null }).success).toBe(false);
      expect(validate(form, { parent: null, child: "x" }).success).toBe(true);
    });

    it("unknown arktype DSL falls back to visible", () => {
      const form = withDep("$eq(42)");
      expect(validate(form, { parent: null }).success).toBe(false);
      expect(validate(form, { parent: null, child: "x" }).success).toBe(true);
    });

    it("non-string condition falls back to visible", () => {
      const form = addDependency(
        create({
          pluginName: "zod",
          nodes: {
            parent: { id: "parent", type: "field", fieldType: "text" },
            child: {
              id: "child",
              type: "field",
              fieldType: "text",
              validation: { required: true },
            },
          },
        }),
        { source: "parent", target: "child", condition: 42 },
      );
      expect(validate(form, { parent: null }).success).toBe(false);
      expect(validate(form, { parent: null, child: "x" }).success).toBe(true);
    });
  });
});
