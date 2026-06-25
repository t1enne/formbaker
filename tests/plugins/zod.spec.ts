/**
 * Tests for the Zod validation plugin.
 *
 * Mirrors the arktype plugin's coverage: each field type, optional vs required,
 * min/max constraints, and edge cases.
 */
import { describe, expect, it } from "vitest";
import { create, addNode, validate } from "@/engine";
import { zodPlugin } from "@/plugins/zod";

describe("zodPlugin", () => {
  it("should set the plugin on the form", () => {
    const form = create({ plugin: zodPlugin });
    expect(form.plugin).toBe(zodPlugin);
  });

  // --- text ---
  it("should validate required text", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "name", type: "text", validation: { required: true },
    });

    expect(validate(form, { name: "" }).success).toBe(false);
    expect(validate(form, { name: "Alice" }).success).toBe(true);
  });

  it("should validate optional text (null/undefined OK)", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "bio", type: "text",
    });

    expect(validate(form, { bio: null }).success).toBe(true);
    expect(validate(form, { bio: undefined }).success).toBe(true);
    expect(validate(form, { bio: "hello" }).success).toBe(true);
  });

  it("should enforce text min/max", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "msg",
      type: "text",
      validation: { min: 2, max: 5 },
    });

    expect(validate(form, { msg: "a" }).success).toBe(false);
    expect(validate(form, { msg: "ab" }).success).toBe(true);
    expect(validate(form, { msg: "abcde" }).success).toBe(true);
    expect(validate(form, { msg: "abcdef" }).success).toBe(false);
    // min 0 on the schema means no constraint; we don't force min=0
  });

  // --- number ---
  it("should validate required number", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
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
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "score",
      type: "number",
      validation: { min: 0, max: 100 },
    });

    expect(validate(form, { score: 0 }).success).toBe(true);
    expect(validate(form, { score: 100 }).success).toBe(true);
    expect(validate(form, { score: -1 }).success).toBe(false);
    expect(validate(form, { score: 101 }).success).toBe(false);
  });

  it("should validate optional number", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "opt", type: "number",
    });

    expect(validate(form, { opt: null }).success).toBe(true);
    expect(validate(form, { opt: undefined }).success).toBe(true);
    expect(validate(form, { opt: 42 }).success).toBe(true);
  });

  // --- select ---
  it("should validate required select", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
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
    const form = addNode(create({ plugin: zodPlugin }), {
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
    const form = addNode(create({ plugin: zodPlugin }), {
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
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "newsletter", type: "checkbox",
    });

    expect(validate(form, { newsletter: null }).success).toBe(true);
    expect(validate(form, { newsletter: undefined }).success).toBe(true);
  });

  // --- radio ---
  it("should validate required radio", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
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
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "bio",
      type: "textarea",
      validation: { required: true },
    });

    expect(validate(form, { bio: "" }).success).toBe(false);
    expect(validate(form, { bio: "I am..." }).success).toBe(true);
  });

  it("should enforce textarea min/max", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "desc",
      type: "textarea",
      validation: { min: 10, max: 100 },
    });

    expect(validate(form, { desc: "short" }).success).toBe(false);
    expect(validate(form, { desc: "long enough string" }).success).toBe(true);
  });

  // --- file ---
  it("should validate required file as object", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "resume",
      type: "file",
      validation: { required: true },
    });

    expect(validate(form, { resume: { name: "cv.pdf" } }).success).toBe(true);
    expect(validate(form, { resume: null }).success).toBe(false);
  });

  it("should validate optional file", () => {
    const form = addNode(create({ plugin: zodPlugin }), {
      id: "avatar", type: "file",
    });

    expect(validate(form, { avatar: null }).success).toBe(true);
    expect(validate(form, { avatar: undefined }).success).toBe(true);
  });

  // --- multiple fields ---
  it("should validate multiple fields together", () => {
    let form = create({ plugin: zodPlugin });
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
    let form = create({ plugin: zodPlugin });
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
});
