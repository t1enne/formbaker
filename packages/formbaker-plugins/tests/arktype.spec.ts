/**
 * Tests for the ArkType validation plugin.
 *
 * Covers each field type, optional vs required, min/max constraints,
 * edge cases, and plugin-specific features (DSL-based dependency conditions,
 * mergeFields with empty record, etc.).
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, addDependency, validate, registerPlugin } from "formbaker";
import { arktypePlugin } from "@formbaker/plugins/arktype";

describe("arktypePlugin", () => {
  beforeAll(() => {
    registerPlugin("arktype", arktypePlugin);
  });

  it("should set the plugin name on the form", () => {
    const form = create({ pluginName: "arktype" });
    expect(form.pluginName).toBe("arktype");
  });

  // --- text ---
  it("should validate required text", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "name",
      type: "text",
      validation: { required: true },
    });

    expect(validate(form, { name: "" }).success).toBe(false);
    expect(validate(form, { name: "Alice" }).success).toBe(true);
  });

  it("should validate optional text (null/undefined OK)", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "bio",
      type: "text",
    });

    expect(validate(form, { bio: null }).success).toBe(true);
    expect(validate(form, { bio: undefined }).success).toBe(true);
    expect(validate(form, { bio: "hello" }).success).toBe(true);
  });

  it("should enforce text min/max", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "msg",
      type: "text",
      validation: { min: 2, max: 5 },
    });

    expect(validate(form, { msg: "a" }).success).toBe(false);
    expect(validate(form, { msg: "ab" }).success).toBe(true);
    expect(validate(form, { msg: "abcde" }).success).toBe(true);
    expect(validate(form, { msg: "abcdef" }).success).toBe(false);
  });

  // --- number ---
  it("should validate required number", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "age",
      type: "number",
      validation: { required: true },
    });

    expect(validate(form, { age: 25 }).success).toBe(true);
    expect(validate(form, { age: undefined }).success).toBe(false);
    expect(validate(form, { age: null }).success).toBe(false);
    expect(validate(form, { age: "not-a-number" }).success).toBe(false);
  });

  it("should enforce number min/max", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "score",
      type: "number",
      validation: { min: 0, max: 100 },
    });

    expect(validate(form, { score: 0 }).success).toBe(true);
    expect(validate(form, { score: 100 }).success).toBe(true);
    expect(validate(form, { score: -1 }).success).toBe(false);
    expect(validate(form, { score: 101 }).success).toBe(false);
  });

  it("should allow number min=0 with no max", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "n",
      type: "number",
      validation: { min: 0 },
    });

    expect(validate(form, { n: 0 }).success).toBe(true);
    expect(validate(form, { n: -1 }).success).toBe(false);
    expect(validate(form, { n: 1e6 }).success).toBe(true);
  });

  it("should validate optional number", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "opt",
      type: "number",
    });

    expect(validate(form, { opt: null }).success).toBe(true);
    expect(validate(form, { opt: undefined }).success).toBe(true);
    expect(validate(form, { opt: 42 }).success).toBe(true);
  });

  // --- select ---
  it("should validate required select", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "color",
      type: "select",
      options: ["Rosso", "Verde"],
      validation: { required: true },
    });

    expect(validate(form, { color: 0 }).success).toBe(true);
    expect(validate(form, { color: 1 }).success).toBe(true);
    expect(validate(form, { color: 2 }).success).toBe(false);
  });

  it("should validate optional select", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "size",
      type: "select",
      options: ["Piccolo"],
    });

    expect(validate(form, { size: null }).success).toBe(true);
    expect(validate(form, { size: undefined }).success).toBe(true);
    expect(validate(form, { size: 0 }).success).toBe(true);
  });

  // --- checkbox ---
  it("should validate required checkbox", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "agree",
      type: "checkbox",
      validation: { required: true },
    });

    expect(validate(form, { agree: true }).success).toBe(true);
    expect(validate(form, { agree: false }).success).toBe(true);
    expect(validate(form, { agree: "yes" }).success).toBe(false);
    expect(validate(form, { agree: undefined }).success).toBe(false);
  });

  it("should validate optional checkbox", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "newsletter",
      type: "checkbox",
    });

    expect(validate(form, { newsletter: null }).success).toBe(true);
    expect(validate(form, { newsletter: undefined }).success).toBe(true);
    expect(validate(form, { newsletter: false }).success).toBe(true);
    expect(validate(form, { newsletter: true }).success).toBe(true);
  });

  // --- radio ---
  it("should validate required radio", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "gender",
      type: "radio",
      validation: { required: true },
    });

    expect(validate(form, { gender: true }).success).toBe(true);
    expect(validate(form, { gender: false }).success).toBe(true);
    expect(validate(form, { gender: "male" }).success).toBe(false);
  });

  // --- textarea ---
  it("should validate required textarea", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "bio",
      type: "textarea",
      validation: { required: true },
    });

    expect(validate(form, { bio: "" }).success).toBe(false);
    expect(validate(form, { bio: "I am..." }).success).toBe(true);
  });

  it("should enforce textarea min/max", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "desc",
      type: "textarea",
      validation: { min: 10, max: 100 },
    });

    expect(validate(form, { desc: "short" }).success).toBe(false);
    expect(validate(form, { desc: "long enough string" }).success).toBe(true);
  });

  // --- file ---
  it("should validate required file as object", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "resume",
      type: "file",
      validation: { required: true },
    });

    expect(validate(form, { resume: { name: "cv.pdf" } }).success).toBe(true);
    expect(validate(form, { resume: null }).success).toBe(false);
  });

  it("should validate optional file", () => {
    const form = addNode(create({ pluginName: "arktype" }), {
      id: "avatar",
      type: "file",
    });

    expect(validate(form, { avatar: null }).success).toBe(true);
    expect(validate(form, { avatar: undefined }).success).toBe(true);
  });

  // --- multiple fields ---
  it("should validate multiple fields together", () => {
    let form = create({ pluginName: "arktype" });
    form = addNode(form, {
      id: "name",
      type: "text",
      validation: { required: true },
    });
    form = addNode(form, {
      id: "age",
      type: "number",
      validation: { min: 18 },
    });

    const result = validate(form, { name: "Bob", age: 25 });
    expect(result.success).toBe(true);
  });

  it("should fail when one of multiple fields is invalid", () => {
    let form = create({ pluginName: "arktype" });
    form = addNode(form, {
      id: "name",
      type: "text",
      validation: { required: true },
    });
    form = addNode(form, {
      id: "age",
      type: "number",
      validation: { min: 18 },
    });

    expect(validate(form, { name: "Bob", age: 10 }).success).toBe(false);
  });

  // --- mergeFields (plugin-specific) ---
  it("should produce an empty object schema when no fields are visible", () => {
    const form = create({ pluginName: "arktype" });
    const result = validate(form, {});
    expect(result.success).toBe(true);
  });

  it("should compose multiple field schemas into one object schema", () => {
    let form = create({ pluginName: "arktype" });
    form = addNode(form, { id: "a", type: "text", validation: { required: true } });
    form = addNode(form, { id: "b", type: "number", validation: { min: 0 } });

    const result = validate(form, { a: "hi", b: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: "hi", b: 5 });
  });

  // --- evaluateCondition (plugin-specific: arktype DSL) ---
  it("evaluateCondition: plain type name string matches values of that type", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        fields: {
          parent: { id: "parent", type: "text" },
          child: { id: "child", type: "text", validation: { required: true } },
        },
      }),
      { source: "parent", target: "child", condition: "string" },
    );

    expect(validate(form, { parent: null }).success).toBe(true);
    expect(validate(form, { parent: "x" }).success).toBe(false);
    expect(validate(form, { parent: "x", child: "y" }).success).toBe(true);
  });

  it("evaluateCondition: 'true' matches truthy booleans", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        fields: {
          parent: { id: "parent", type: "checkbox" },
          child: { id: "child", type: "text", validation: { required: true } },
        },
      }),
      { source: "parent", target: "child", condition: "true" },
    );

    // arktype's "true" only passes when value === true
    expect(validate(form, { parent: null }).success).toBe(true);
    expect(validate(form, { parent: false }).success).toBe(true);
    expect(validate(form, { parent: true }).success).toBe(false);
    expect(validate(form, { parent: true, child: "x" }).success).toBe(true);
  });

  it("evaluateCondition: 'unknown' always matches", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        fields: {
          a: { id: "a", type: "text" },
          b: { id: "b", type: "text", validation: { required: true } },
        },
      }),
      { source: "a", target: "b", condition: "unknown" },
    );

    expect(validate(form, { a: null }).success).toBe(false);
    expect(validate(form, { a: null, b: "x" }).success).toBe(true);
  });

  it("evaluateCondition: arktype union DSL (string | number)", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        // Use a number field for parent so 42 passes field validation
        fields: {
          parent: { id: "parent", type: "number" },
          child: { id: "child", type: "text", validation: { required: true } },
        },
      }),
      { source: "parent", target: "child", condition: "string | number" },
    );

    expect(validate(form, { parent: null }).success).toBe(true); // null not in union → child hidden
    expect(validate(form, { parent: 42 }).success).toBe(false); // number matches → child visible but missing
    expect(validate(form, { parent: 42, child: "z" }).success).toBe(true);
  });

  it("evaluateCondition: number constraint DSL (number >= 18)", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        fields: {
          age: { id: "age", type: "number" },
          note: { id: "note", type: "text", validation: { required: true } },
        },
      }),
      { source: "age", target: "note", condition: "number >= 18" },
    );

    expect(validate(form, { age: null }).success).toBe(true);
    expect(validate(form, { age: 15 }).success).toBe(true); // 15 doesn't match, so child hidden
    expect(validate(form, { age: 18 }).success).toBe(false); // 18 matches, child required but missing
    expect(validate(form, { age: 18, note: "adult" }).success).toBe(true);
    expect(validate(form, { age: 25, note: "ok" }).success).toBe(true);
  });

  it("evaluateCondition: exact value via '$eq'", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        fields: {
          answer: { id: "answer", type: "text" },
          prize: { id: "prize", type: "text", validation: { required: true } },
        },
      }),
      { source: "answer", target: "prize", condition: "'yes'" },
    );

    expect(validate(form, { answer: null }).success).toBe(true);
    expect(validate(form, { answer: "no" }).success).toBe(true);
    expect(validate(form, { answer: "yes" }).success).toBe(false);
    expect(validate(form, { answer: "yes", prize: "gold" }).success).toBe(true);
  });

  it("evaluateCondition: union with exact values", () => {
    const form = addDependency(
      create({
        pluginName: "arktype",
        fields: {
          color: { id: "color", type: "select", options: ["R", "G", "B"] },
          detail: { id: "detail", type: "text", validation: { required: true } },
        },
      }),
      { source: "color", target: "detail", condition: "0 | 1" },
    );

    // select index 0 or 1 → detail visible; index 2 → hidden
    expect(validate(form, { color: null }).success).toBe(true);
    expect(validate(form, { color: 0 }).success).toBe(false);
    expect(validate(form, { color: 0, detail: "red" }).success).toBe(true);
    expect(validate(form, { color: 1 }).success).toBe(false);
    expect(validate(form, { color: 1, detail: "green" }).success).toBe(true);
    expect(validate(form, { color: 2 }).success).toBe(true); // condition doesn't match, child hidden
  });
});
