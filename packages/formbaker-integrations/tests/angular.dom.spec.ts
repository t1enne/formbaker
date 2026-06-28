/**
 * Angular FormBuilder integration tests with happy-dom.
 *
 * Uses the real @angular/forms FormBuilder and Validators.
 * Tests formbakerToFormGroup and rebuildFormGroup directly, which is the
 * correct level for Angular — these produce FormGroup instances with
 * controls that consumers iterate in templates via *ngIf / formControlName.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, registerPlugin } from "formbaker";
import { testPlugin, buildForm, buildVisibilityForm } from "formbaker/test-utils";
// Angular JIT requires the platform to be loaded before @angular/forms.
import "@angular/platform-browser-dynamic";
import { FormBuilder } from "@angular/forms";
import { formbakerToFormGroup, rebuildFormGroup } from "../src/angular";

beforeAll(() => {
  registerPlugin("test", testPlugin);
});

describe("angular FormBuilder integration (real)", () => {
  it("produces one control per field with correct default values", () => {
    const form = buildForm(
      { id: "name", type: "field", fieldType: "text" },
      { id: "age", type: "field", fieldType: "number" },
      { id: "agree", type: "field", fieldType: "checkbox" },
      { id: "color", type: "field", fieldType: "select", options: ["x", "y"] },
    );

    const fb = new FormBuilder();
    const group = formbakerToFormGroup(form, fb);

    expect(Object.keys(group.controls)).toEqual(["name", "age", "agree", "color"]);
    expect(group.get("name")?.value).toBe("");
    expect(group.get("age")?.value).toBeNull();
    expect(group.get("agree")?.value).toBe(false);
    expect(group.get("color")?.value).toBeNull();
  });

  it("applies required/min/max validators and rejects invalid values", () => {
    const form = buildForm(
      { id: "name", type: "field", fieldType: "text", validation: { required: true } },
      { id: "age", type: "field", fieldType: "number", validation: { min: 18, max: 120 } },
    );

    const group = formbakerToFormGroup(form, new FormBuilder());

    expect(group.valid).toBe(false);
    expect(group.get("name")?.valid).toBe(false);
    expect(group.get("name")?.errors).toEqual({ required: true });
    expect(group.get("age")?.valid).toBe(true);
    expect(group.get("age")?.errors).toBeNull();

    group.get("name")?.setValue("Alice");
    group.get("age")?.setValue(25);
    expect(group.valid).toBe(true);

    group.get("age")?.setValue(17);
    expect(group.get("age")?.errors).toEqual({ min: { min: 18, actual: 17 } });

    group.get("age")?.setValue(200);
    expect(group.get("age")?.errors).toEqual({ max: { max: 120, actual: 200 } });
  });

  it("omits required validator for optional fields", () => {
    const form = buildForm({
      id: "bio",
      type: "field",
      fieldType: "textarea",
      validation: { min: 10 },
    });

    const group = formbakerToFormGroup(form, new FormBuilder());

    expect(group.get("bio")?.valid).toBe(true);

    group.get("bio")?.setValue("short");
    expect(group.get("bio")?.valid).toBe(false);
    expect(group.get("bio")?.errors).toEqual({
      minlength: { requiredLength: 10, actualLength: 5 },
    });
  });

  it("produces empty group when no fields", () => {
    const group = formbakerToFormGroup(create({ pluginName: "test" }), new FormBuilder());
    expect(Object.keys(group.controls)).toEqual([]);
  });

  describe("visibility with opts.values", () => {
    it("formbakerToFormGroup excludes fields hidden by a dependency", () => {
      const form = buildVisibilityForm();
      const fb = new FormBuilder();

      const hidden = formbakerToFormGroup(form, fb, { values: { toggle: false } });
      expect(Object.keys(hidden.controls)).toEqual(["toggle", "name"]);

      const visible = formbakerToFormGroup(form, fb, { values: { toggle: true } });
      expect(Object.keys(visible.controls)).toEqual(["toggle", "name", "extra"]);
    });

    it("rebuildFormGroup removes hidden fields when values are provided", () => {
      const form = buildVisibilityForm();
      const fb = new FormBuilder();
      const group = fb.group({
        toggle: fb.control(false),
        name: fb.control("hello"),
        extra: fb.control("world"),
      });

      rebuildFormGroup(form, group, fb, { values: { toggle: false } });
      expect(Object.keys(group.controls)).toEqual(["toggle", "name"]);
    });

    it("rebuildFormGroup adds newly-visible fields when values change", () => {
      const form = buildVisibilityForm();
      const fb = new FormBuilder();
      const group = fb.group({
        toggle: fb.control(true),
        name: fb.control("hello"),
      });

      rebuildFormGroup(form, group, fb, { values: { toggle: true } });
      expect(Object.keys(group.controls)).toEqual(["toggle", "name", "extra"]);
    });

    it("rebuildFormGroup preserves existing control values", () => {
      const form = buildVisibilityForm();
      const fb = new FormBuilder();
      const group = fb.group({
        toggle: fb.control(true),
        name: fb.control("unchanged"),
        extra: fb.control("keepme"),
      });

      rebuildFormGroup(form, group, fb, { values: { toggle: true } });
      expect(group.get("extra")?.value).toBe("keepme");
    });
  });

  it("rebuildFormGroup adds new controls and removes deleted ones", () => {
    const fb = new FormBuilder();
    const group = fb.group({
      keep: fb.control("keep"),
      remove: fb.control("remove"),
    });

    const form = buildForm(
      { id: "keep", type: "field", fieldType: "text" },
      { id: "email", type: "field", fieldType: "text", validation: { required: true } },
    );

    rebuildFormGroup(form, group, fb);

    expect(Object.keys(group.controls)).toEqual(["keep", "email"]);
    expect(group.get("remove")).toBeNull();
    expect(group.get("email")?.value).toBe("");
  });
});
