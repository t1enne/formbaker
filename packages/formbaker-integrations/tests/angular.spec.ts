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
  control(value, validators) {
    return { value, _validators: validators ?? [] };
  },
  group(controls) {
    return { controls };
  },
};

const fakeValidators: FormbakerValidators = {
  required: (msg) => (() => ({ required: true, message: msg })) as unknown as ValidatorFn,
  minLength: (v, msg) =>
    (() => ({ minLength: true, value: v, message: msg })) as unknown as ValidatorFn,
  maxLength: (v, msg) =>
    (() => ({ maxLength: true, value: v, message: msg })) as unknown as ValidatorFn,
  min: (v, msg) => (() => ({ min: true, value: v, message: msg })) as unknown as ValidatorFn,
  max: (v, msg) => (() => ({ max: true, value: v, message: msg })) as unknown as ValidatorFn,
};

describe("angular FormBuilder integration", () => {
  it("should produce a form group with one control per field", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text" });
    form = addNode(form, { id: "age", type: "field", fieldType: "number" });

    const group = formbakerToFormGroup(form, fakeFb, fakeValidators);

    expect(Object.keys(group.controls)).toEqual(["name", "age"]);
  });

  it("should set default values based on field type", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "a", type: "field", fieldType: "text" });
    form = addNode(form, { id: "b", type: "field", fieldType: "number" });
    form = addNode(form, { id: "c", type: "field", fieldType: "checkbox" });
    form = addNode(form, {
      id: "d",
      type: "field",
      fieldType: "select",
      options: ["x", "y"],
    });

    const group = formbakerToFormGroup(form, fakeFb, fakeValidators);

    expect((group.controls["a"]! as any).value).toBe("");
    expect((group.controls["b"]! as any).value).toBeNull();
    expect((group.controls["c"]! as any).value).toBe(false);
    expect((group.controls["d"]! as any).value).toBeNull();
  });

  it("should call Validators.required / min / max based on validation config", () => {
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

    // Build a tracing FormBuilder that records which validators were requested
    const calls: string[] = [];
    const tracingFb: FormBuilderLike = {
      control(value, validators) {
        calls.push(
          `control(${JSON.stringify(value)}) + ${Array.isArray(validators) ? validators.length : validators ? 1 : 0} validator(s)`,
        );
        return fakeFb.control(value, validators);
      },
      group(controls) {
        return fakeFb.group(controls);
      },
    };

    formbakerToFormGroup(form, tracingFb, fakeValidators);

    // name gets 1 validator (required), age gets 2 (min, max)
    expect(calls).toEqual(['control("") + 1 validator(s)', "control(null) + 2 validator(s)"]);
  });

  it("should not apply required validator for optional fields", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "bio",
      type: "field",
      fieldType: "textarea",
      validation: { min: 10 },
    });

    // Spy on which validator factories were called
    const called: string[] = [];
    const spyValidators: FormbakerValidators = {
      required: (msg) => {
        called.push("required");
        return fakeValidators.required(msg);
      },
      minLength: (v, msg) => {
        called.push("minLength");
        return fakeValidators.minLength(v, msg);
      },
      maxLength: (v, msg) => {
        called.push("maxLength");
        return fakeValidators.maxLength(v, msg);
      },
      min: (v, msg) => {
        called.push("min");
        return fakeValidators.min(v, msg);
      },
      max: (v, msg) => {
        called.push("max");
        return fakeValidators.max(v, msg);
      },
    };

    formbakerToFormGroup(form, fakeFb, spyValidators);

    expect(called).not.toContain("required");
    expect(called).toContain("minLength");
  });

  it("should produce an empty group when there are no fields", () => {
    const form = create({ pluginName: "zod" });
    const group = formbakerToFormGroup(form, fakeFb, fakeValidators);

    expect(group.controls).toEqual({});
  });

  it("rebuildFormGroup should add controls for new fields", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "field", fieldType: "text" });

    const ctrls: Record<string, { value: unknown }> = {
      name: fakeFb.control(""),
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

    // Add a second field
    form = addNode(form, { id: "email", type: "field", fieldType: "text" });

    rebuildFormGroup(form, mutableGroup, fakeFb, fakeValidators);

    expect(added).toBe("email");
    expect(removed).toBe("");
    expect(Object.keys(mutableGroup.controls)).toContain("email");
  });

  it("rebuildFormGroup should remove controls for removed fields", () => {
    const ctrls: Record<string, { value: unknown }> = {
      keep: fakeFb.control("keep"),
      remove: fakeFb.control("remove"),
    };
    let removed = "";
    const mutableGroup: FormGroupLike = {
      controls: ctrls,
      addControl: () => {},
      removeControl(name) {
        removed = name;
        delete ctrls[name];
      },
      get(name) {
        return ctrls[name] ?? null;
      },
    };

    // Create a form without the "remove" field
    const form1 = create({ pluginName: "zod" });
    const form = addNode(form1, { id: "keep", type: "field", fieldType: "text" });

    rebuildFormGroup(form, mutableGroup, fakeFb, fakeValidators);

    expect(removed).toBe("remove");
    expect(Object.keys(mutableGroup.controls)).toEqual(["keep"]);
  });
});
