/**
 * Tests for the Zod validation plugin.
 *
 * Mirrors the arktype plugin's coverage: each field type, optional vs required,
 * min/max constraints, edge cases, and plugin-specific mergeFields/evaluateCondition.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, validate, registerPlugin, addDependency } from "formbaker";
import { zodPlugin } from "@formbaker/plugins/zod";

describe("zodPlugin", () => {
  beforeAll(() => {
    registerPlugin("zod", zodPlugin);
  });

  it("should set the plugin name on the form", () => {
    const form = create({ pluginName: "zod" });
    expect(form.pluginName).toBe("zod");
  });

  // --- text ---
  it("should validate required text", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "name",
      type: "field",
      fieldType: "text",
      validation: { required: true },
    });

    expect(validate(form, { name: "" }).success).toBe(false);
    expect(validate(form, { name: "Alice" }).success).toBe(true);
  });

  it("should validate optional text (null/undefined OK)", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "bio",
      type: "field",
      fieldType: "text",
    });

    expect(validate(form, { bio: null }).success).toBe(true);
    expect(validate(form, { bio: undefined }).success).toBe(true);
    expect(validate(form, { bio: "hello" }).success).toBe(true);
  });

  it("should enforce text min/max", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "msg",
      type: "field",
      fieldType: "text",
      validation: { min: 2, max: 5 },
    });

    expect(validate(form, { msg: "a" }).success).toBe(false);
    expect(validate(form, { msg: "ab" }).success).toBe(true);
    expect(validate(form, { msg: "abcde" }).success).toBe(true);
    expect(validate(form, { msg: "abcdef" }).success).toBe(false);
  });

  // --- number ---
  it("should validate required number", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "age",
      type: "field",
      fieldType: "number",
      validation: { required: true },
    });

    expect(validate(form, { age: 25 }).success).toBe(true);
    expect(validate(form, { age: undefined }).success).toBe(false);
    expect(validate(form, { age: null }).success).toBe(false);
    expect(validate(form, { age: "not-a-number" }).success).toBe(false);
  });

  it("should enforce number min/max", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "score",
      type: "field",
      fieldType: "number",
      validation: { min: 0, max: 100 },
    });

    expect(validate(form, { score: 0 }).success).toBe(true);
    expect(validate(form, { score: 100 }).success).toBe(true);
    expect(validate(form, { score: -1 }).success).toBe(false);
    expect(validate(form, { score: 101 }).success).toBe(false);
  });

  it("should validate optional number", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "opt",
      type: "field",
      fieldType: "number",
    });

    expect(validate(form, { opt: null }).success).toBe(true);
    expect(validate(form, { opt: undefined }).success).toBe(true);
    expect(validate(form, { opt: 42 }).success).toBe(true);
  });

  // --- select ---
  it("should validate required select", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "color",
      type: "field",
      fieldType: "select",
      options: ["Rosso", "Verde"],
      validation: { required: true },
    });

    expect(validate(form, { color: 0 }).success).toBe(true);
    expect(validate(form, { color: 1 }).success).toBe(true);
    expect(validate(form, { color: 2 }).success).toBe(false);
  });

  it("should validate optional select", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "size",
      type: "field",
      fieldType: "select",
      options: ["Piccolo"],
    });

    expect(validate(form, { size: null }).success).toBe(true);
    expect(validate(form, { size: undefined }).success).toBe(true);
    expect(validate(form, { size: 0 }).success).toBe(true);
  });

  // --- checkbox ---
  it("should validate required checkbox", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "agree",
      type: "field",
      fieldType: "checkbox",
      validation: { required: true },
    });

    expect(validate(form, { agree: true }).success).toBe(true);
    expect(validate(form, { agree: false }).success).toBe(true);
    expect(validate(form, { agree: "yes" }).success).toBe(false);
    expect(validate(form, { agree: undefined }).success).toBe(false);
  });

  it("should validate optional checkbox", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "newsletter",
      type: "field",
      fieldType: "checkbox",
    });

    expect(validate(form, { newsletter: null }).success).toBe(true);
    expect(validate(form, { newsletter: undefined }).success).toBe(true);
  });

  // --- radio ---
  it("should validate required radio", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "gender",
      type: "field",
      fieldType: "radio",
      validation: { required: true },
    });

    expect(validate(form, { gender: true }).success).toBe(true);
    expect(validate(form, { gender: false }).success).toBe(true);
    expect(validate(form, { gender: "male" }).success).toBe(false);
  });

  // --- textarea ---
  it("should validate required textarea", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "bio",
      type: "field",
      fieldType: "textarea",
      validation: { required: true },
    });

    expect(validate(form, { bio: "" }).success).toBe(false);
    expect(validate(form, { bio: "I am..." }).success).toBe(true);
  });

  it("should enforce textarea min/max", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "desc",
      type: "field",
      fieldType: "textarea",
      validation: { min: 10, max: 100 },
    });

    expect(validate(form, { desc: "short" }).success).toBe(false);
    expect(validate(form, { desc: "long enough string" }).success).toBe(true);
  });

  // --- file ---
  it("should validate required file as object", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "resume",
      type: "field",
      fieldType: "file",
      validation: { required: true },
    });

    expect(validate(form, { resume: { name: "cv.pdf" } }).success).toBe(true);
    expect(validate(form, { resume: null }).success).toBe(false);
  });

  it("should validate optional file", () => {
    const form = addNode(create({ pluginName: "zod" }), {
      id: "avatar",
      type: "field",
      fieldType: "file",
    });

    expect(validate(form, { avatar: null }).success).toBe(true);
    expect(validate(form, { avatar: undefined }).success).toBe(true);
  });

  // --- multiple fields ---
  it("should validate multiple fields together", () => {
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

    const result = validate(form, { name: "Bob", age: 25 });
    expect(result.success).toBe(true);
  });

  it("should fail when one of multiple fields is invalid", () => {
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

    expect(validate(form, { name: "Bob", age: 10 }).success).toBe(false);
  });

  // --- mergeFields (plugin-specific) ---
  it("should produce an empty object schema when no fields are visible", () => {
    const form = create({ pluginName: "zod" });
    // No fields means mergeFields gets an empty record
    const result = validate(form, {});
    expect(result.success).toBe(true);
  });

  it("should compose multiple field schemas into one object schema", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "a", type: "field", fieldType: "text", validation: { required: true } });
    form = addNode(form, { id: "b", type: "field", fieldType: "number", validation: { min: 0 } });

    const result = validate(form, { a: "hi", b: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: "hi", b: 5 });
  });

  // --- evaluateCondition (plugin-specific translation layer) ---
  it("evaluateCondition: 'true' means truthy (non-null, non-undefined, non-false)", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          parent: { id: "parent", type: "field", fieldType: "checkbox" },
          child: { id: "child", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "parent", target: "child", condition: "true" },
    );

    expect(validate(form, { parent: null }).success).toBe(true);
    expect(validate(form, { parent: false }).success).toBe(true);
    expect(validate(form, { parent: true }).success).toBe(false); // child required
    expect(validate(form, { parent: true, child: "x" }).success).toBe(true);
  });

  it("evaluateCondition: 'string' matches string values", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          parent: { id: "parent", type: "field", fieldType: "text" },
          child: { id: "child", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "parent", target: "child", condition: "string" },
    );

    expect(validate(form, { parent: null }).success).toBe(true); // no parent → child hidden
    expect(validate(form, { parent: "x" }).success).toBe(false); // child visible, required, missing
    expect(validate(form, { parent: "x", child: "y" }).success).toBe(true);
  });

  it("evaluateCondition: 'number' matches number values", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          age: { id: "age", type: "field", fieldType: "number" },
          note: { id: "note", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "age", target: "note", condition: "number" },
    );

    expect(validate(form, { age: null }).success).toBe(true); // not a number → note hidden
    expect(validate(form, { age: 25 }).success).toBe(false); // note visible, required, missing
    expect(validate(form, { age: 25, note: "ok" }).success).toBe(true);
  });

  it("evaluateCondition: 'boolean' matches boolean values", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          toggle: { id: "toggle", type: "field", fieldType: "checkbox" },
          extra: { id: "extra", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "toggle", target: "extra", condition: "boolean" },
    );

    expect(validate(form, { toggle: null }).success).toBe(true); // not boolean → extra hidden
    expect(validate(form, { toggle: true }).success).toBe(false); // extra visible, required, missing
    expect(validate(form, { toggle: false }).success).toBe(false);
    expect(validate(form, { toggle: true, extra: "yes" }).success).toBe(true);
  });

  it("evaluateCondition: 'object' matches non-null objects", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          file: { id: "file", type: "field", fieldType: "file" },
          desc: { id: "desc", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "file", target: "desc", condition: "object" },
    );

    expect(validate(form, { file: null }).success).toBe(true);
    expect(validate(form, { file: { name: "x.pdf" } }).success).toBe(false);
    expect(validate(form, { file: { name: "x.pdf" }, desc: "A file" }).success).toBe(true);
  });

  it("evaluateCondition: 'any' always shows dependent field", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          a: { id: "a", type: "field", fieldType: "text" },
          b: { id: "b", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "a", target: "b", condition: "any" },
    );

    // b is always visible regardless of a's value
    expect(validate(form, { a: null }).success).toBe(false);
    expect(validate(form, { a: null, b: "x" }).success).toBe(true);
  });

  it("evaluateCondition: unknown condition string falls back to visible", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          a: { id: "a", type: "field", fieldType: "text" },
          b: { id: "b", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      // "$eq(42)" is arktype DSL — zod plugin can't translate it, falls back to visible
      { source: "a", target: "b", condition: "$eq(42)" },
    );

    expect(validate(form, { a: null }).success).toBe(false);
    expect(validate(form, { a: null, b: "x" }).success).toBe(true);
  });

  it("evaluateCondition: non-string condition falls back to visible", () => {
    const form = addDependency(
      create({
        pluginName: "zod",
        nodes: {
          a: { id: "a", type: "field", fieldType: "text" },
          b: { id: "b", type: "field", fieldType: "text", validation: { required: true } },
        },
      }),
      { source: "a", target: "b", condition: 42 },
    );

    expect(validate(form, { a: null }).success).toBe(false);
    expect(validate(form, { a: null, b: "x" }).success).toBe(true);
  });
});
