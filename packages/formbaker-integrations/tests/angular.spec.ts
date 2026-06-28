/**
 * Tests for the Angular FormBuilder integration.
 */
import { describe, expect, it } from "vitest";
import { create, addNode } from "formbaker";
import type { ValidatorFn } from "@angular/forms";
import {
  formbakerToFormGroup,
  rebuildFormGroup,
  type FormbakerValidators,
  type FormBuilderLike,
  type FormGroupLike,
} from "../src/angular";

// --- Fakes ---

const fakeFb: FormBuilderLike = {
  control(value) {
    return { value };
  },
  group(controls) {
    return { controls };
  },
};

const fakeValidators: FormbakerValidators = {
  required: (msg) => (() => ({ required: true, message: msg })) as unknown as ValidatorFn,
  minLength: (_v, msg) =>
    (() => ({ minLength: true, value: _v, message: msg })) as unknown as ValidatorFn,
  maxLength: (_v, msg) =>
    (() => ({ maxLength: true, value: _v, message: msg })) as unknown as ValidatorFn,
  min: (_v, msg) => (() => ({ min: true, value: _v, message: msg })) as unknown as ValidatorFn,
  max: (_v, msg) => (() => ({ max: true, value: _v, message: msg })) as unknown as ValidatorFn,
};

describe("angular FormBuilder integration", () => {
  it("produces one control per field with correct default values", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text" });
    form = addNode(form, { id: "age", type: "field", fieldType: "number" });
    form = addNode(form, { id: "agree", type: "field", fieldType: "checkbox" });
    form = addNode(form, { id: "color", type: "field", fieldType: "select", options: ["x", "y"] });

    const group = formbakerToFormGroup(form, fakeFb, fakeValidators);

    expect(Object.keys(group.controls)).toEqual(["name", "age", "agree", "color"]);
    expect((group.controls["name"]! as any).value).toBe("");
    expect((group.controls["age"]! as any).value).toBeNull();
    expect((group.controls["agree"]! as any).value).toBe(false);
    expect((group.controls["color"]! as any).value).toBeNull();
  });

  it("applies required/min/max validators based on validation config", () => {
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

    const called: string[] = [];
    const spy: FormbakerValidators = {
      required: (_m) => {
        called.push("required");
        return (() => ({ required: true })) as unknown as ValidatorFn;
      },
      minLength: (_v, _m) => {
        called.push("minLength");
        return (() => ({})) as unknown as ValidatorFn;
      },
      maxLength: (_v, _m) => {
        called.push("maxLength");
        return (() => ({})) as unknown as ValidatorFn;
      },
      min: (_v, _m) => {
        called.push("min");
        return (() => ({})) as unknown as ValidatorFn;
      },
      max: (_v, _m) => {
        called.push("max");
        return (() => ({})) as unknown as ValidatorFn;
      },
    };

    formbakerToFormGroup(form, fakeFb, spy);
    expect(called).toEqual(["required", "min", "max"]);
  });

  it("omits required validator for optional fields", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "bio",
      type: "field",
      fieldType: "textarea",
      validation: { min: 10 },
    });

    const called: string[] = [];
    const spyValidators: FormbakerValidators = {
      required: (_m) => {
        called.push("required");
        return fakeValidators.required("");
      },
      minLength: (_v, _m) => {
        called.push("minLength");
        return fakeValidators.minLength(0, "");
      },
      maxLength: (_v, _m) => {
        called.push("maxLength");
        return fakeValidators.maxLength(0, "");
      },
      min: (_v, _m) => called.push("min") as never,
      max: (_v, _m) => called.push("max") as never,
    };
    formbakerToFormGroup(form, fakeFb, spyValidators);
    expect(called).not.toContain("required");
    expect(called).toContain("minLength");
  });

  it("produces empty group when no fields", () => {
    expect(
      formbakerToFormGroup(create({ pluginName: "zod" }), fakeFb, fakeValidators).controls,
    ).toEqual({});
  });

  it("rebuildFormGroup adds new controls and removes deleted ones", () => {
    const ctrls: Record<string, { value: unknown }> = {
      keep: fakeFb.control("keep"),
      remove: fakeFb.control("remove"),
    };
    let added = "";
    let removed = "";
    const mutableGroup: FormGroupLike = {
      controls: ctrls,
      addControl(name, ctrl) {
        added = name;
        ctrls[name] = ctrl;
      },
      removeControl(name) {
        removed = name;
        delete ctrls[name];
      },
      get(name) {
        return ctrls[name] ?? null;
      },
    };

    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "keep", type: "field", fieldType: "text" });
    form = addNode(form, { id: "email", type: "field", fieldType: "text" });

    rebuildFormGroup(form, mutableGroup, fakeFb, fakeValidators);

    expect(removed).toBe("remove");
    expect(added).toBe("email");
    expect(Object.keys(mutableGroup.controls)).toEqual(["keep", "email"]);
  });
});
