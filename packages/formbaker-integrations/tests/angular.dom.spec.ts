/**
 * Angular FormBuilder integration tests with happy-dom.
 *
 * Uses the real @angular/forms FormBuilder and Validators.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, addDependency, registerPlugin } from "formbaker";
import type { FormbakerPlugin } from "formbaker";
// Angular JIT requires the platform to be loaded before @angular/forms.
import "@angular/platform-browser-dynamic";
import { FormBuilder } from "@angular/forms";
import { formbakerToFormGroup, rebuildFormGroup } from "../src/angular";

describe("angular FormBuilder integration (real)", () => {
  const testPlugin: FormbakerPlugin = {
    field: (_f) => ({
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (v: unknown) => ({ value: v }),
      },
    }),
    mergeFields: (_fs) => ({
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (v: unknown) => {
          if (v === null || typeof v !== "object")
            return { issues: [{ message: "not object" }] };
          return { value: v };
        },
      },
    }),
    evaluateCondition: (condition, value) => {
      if (condition === "true") return value != null && value !== false;
      return true;
    },
  };

  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("produces one control per field with correct default values", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text" });
    form = addNode(form, { id: "age", type: "field", fieldType: "number" });
    form = addNode(form, { id: "agree", type: "field", fieldType: "checkbox" });
    form = addNode(form, {
      id: "color",
      type: "field",
      fieldType: "select",
      options: ["x", "y"],
    });

    const fb = new FormBuilder();
    const group = formbakerToFormGroup(form, fb);

    expect(Object.keys(group.controls)).toEqual([
      "name",
      "age",
      "agree",
      "color",
    ]);
    expect(group.get("name")?.value).toBe("");
    expect(group.get("age")?.value).toBeNull();
    expect(group.get("agree")?.value).toBe(false);
    expect(group.get("color")?.value).toBeNull();
  });

  it("applies required/min/max validators and rejects invalid values", () => {
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
      validation: { min: 18, max: 120 },
    });

    const fb = new FormBuilder();
    const group = formbakerToFormGroup(form, fb);

    expect(group.valid).toBe(false);
    expect(group.get("name")?.valid).toBe(false);
    expect(group.get("name")?.errors).toEqual({ required: true });
    expect(group.get("age")?.valid).toBe(true);
    expect(group.get("age")?.errors).toBeNull();

    group.get("name")?.setValue("Alice");
    group.get("age")?.setValue(25);
    expect(group.valid).toBe(true);

    group.get("age")?.setValue(17);
    expect(group.get("age")?.errors).toEqual({
      min: { min: 18, actual: 17 },
    });

    group.get("age")?.setValue(200);
    expect(group.get("age")?.errors).toEqual({
      max: { max: 120, actual: 200 },
    });
  });

  it("omits required validator for optional fields", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "bio",
      type: "field",
      fieldType: "textarea",
      validation: { min: 10 },
    });

    const fb = new FormBuilder();
    const group = formbakerToFormGroup(form, fb);

    expect(group.get("bio")?.valid).toBe(true);

    group.get("bio")?.setValue("short");
    expect(group.get("bio")?.valid).toBe(false);
    expect(group.get("bio")?.errors).toEqual({
      minlength: { requiredLength: 10, actualLength: 5 },
    });
  });

  it("produces empty group when no fields", () => {
    const fb = new FormBuilder();
    const group = formbakerToFormGroup(create({ pluginName: "zod" }), fb);
    expect(Object.keys(group.controls)).toEqual([]);
  });

  describe("visibility with opts.values", () => {
    it("formbakerToFormGroup excludes fields hidden by a dependency", () => {
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

      const fb = new FormBuilder();

      const hidden = formbakerToFormGroup(form, fb, {
        values: { trigger: false },
      });
      expect(Object.keys(hidden.controls)).toEqual(["trigger"]);

      const visible = formbakerToFormGroup(form, fb, {
        values: { trigger: true },
      });
      expect(Object.keys(visible.controls)).toEqual(["trigger", "target"]);
    });

    it("rebuildFormGroup removes hidden fields when values are provided", () => {
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

      const fb = new FormBuilder();
      const group = fb.group({
        trigger: fb.control(false),
        target: fb.control("hello"),
      });

      rebuildFormGroup(form, group, fb, { values: { trigger: false } });
      expect(Object.keys(group.controls)).toEqual(["trigger"]);
    });

    it("rebuildFormGroup adds newly-visible fields when values change", () => {
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

      const fb = new FormBuilder();
      const group = fb.group({
        trigger: fb.control(true),
      });

      rebuildFormGroup(form, group, fb, { values: { trigger: true } });
      expect(Object.keys(group.controls)).toEqual(["trigger", "target"]);
    });

    it("rebuildFormGroup preserves existing control values on add", () => {
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

      const fb = new FormBuilder();
      const group = fb.group({
        trigger: fb.control(true),
        target: fb.control("existing"),
      });

      rebuildFormGroup(form, group, fb, { values: { trigger: true } });
      expect(group.get("target")?.value).toBe("existing");
    });
  });

  it("rebuildFormGroup adds new controls and removes deleted ones", () => {
    const fb = new FormBuilder();
    const group = fb.group({
      keep: fb.control("keep"),
      remove: fb.control("remove"),
    });

    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "keep", type: "field", fieldType: "text" });
    form = addNode(form, {
      id: "email",
      type: "field",
      fieldType: "text",
      validation: { required: true },
    });

    rebuildFormGroup(form, group, fb);

    expect(Object.keys(group.controls)).toEqual(["keep", "email"]);
    expect(group.get("remove")).toBeNull();
    expect(group.get("email")?.value).toBe("");
  });
});
