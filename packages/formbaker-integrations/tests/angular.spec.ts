/**
 * Tests for the Angular FormBuilder integration.
 *
 * Angular's FormBuilder / FormGroup classes cannot be instantiated without
 * the full Angular DI runtime, so we provide minimal objects that match the
 * method signatures. These are typed against the real @angular/forms types
 * via `satisfies` so the compiler catches any drift.
 */
import { describe, expect, it } from "vitest";
import { create, addNode } from "formbaker";
import type { FormBuilder, FormGroup, FormControl, ValidatorFn } from "@angular/forms";
import {
  formbakerToFormGroup,
  rebuildFormGroup,
  type FormbakerValidators,
} from "../src/angular";

const fakeFb = {
  control(value: unknown, validators?: ValidatorFn | ValidatorFn[]) {
    return { value, validators: validators ?? [], controls: undefined } as unknown as FormControl;
  },
  group(controls: Record<string, FormControl>) {
    return { controls } as unknown as FormGroup;
  },
} satisfies FormBuilder;

const fakeValidators = {
  required: (msg?: string) => (() => ({ required: true, message: msg })) as unknown as ValidatorFn,
  minLength: (v: number, msg?: string) => (() => ({ minLength: true, value: v, message: msg })) as unknown as ValidatorFn,
  maxLength: (v: number, msg?: string) => (() => ({ maxLength: true, value: v, message: msg })) as unknown as ValidatorFn,
  min: (v: number, msg?: string) => (() => ({ min: true, value: v, message: msg })) as unknown as ValidatorFn,
  max: (v: number, msg?: string) => (() => ({ max: true, value: v, message: msg })) as unknown as ValidatorFn,
} satisfies FormbakerValidators;

describe("angular FormBuilder integration", () => {
  it("should produce a form group with one control per field", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "name", type: "text" });
    form = addNode(form, { id: "age", type: "number" });

    const group = formbakerToFormGroup(form, fakeFb, fakeValidators);

    expect(Object.keys(group.controls)).toEqual(["name", "age"]);
  });

  it("should set default values based on field type", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, { id: "a", type: "text" });
    form = addNode(form, { id: "b", type: "number" });
    form = addNode(form, { id: "c", type: "checkbox" });
    form = addNode(form, {
      id: "d",
      type: "select",
      options: ["x", "y"],
    });

    const group = formbakerToFormGroup(form, fakeFb, fakeValidators);

    expect(group.controls["a"]!.value).toBe("");
    expect(group.controls["b"]!.value).toBeNull();
    expect(group.controls["c"]!.value).toBe(false);
    expect(group.controls["d"]!.value).toBeNull();
  });

  it("should call Validators.required / min / max based on validation config", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "name",
      type: "text",
      validation: { required: true },
    });
    form = addNode(form, {
      id: "age",
      type: "number",
      validation: { min: 18, max: 120 },
    });

    // Build a tracing FormBuilder that records which validators were requested
    const calls: string[] = [];
    const tracingFb = {
      control(value: unknown, validators?: ValidatorFn | ValidatorFn[]) {
        calls.push(
          `control(${JSON.stringify(value)}) + ${Array.isArray(validators) ? validators.length : validators ? 1 : 0} validator(s)`,
        );
        return fakeFb.control(value, validators);
      },
      group(controls: Record<string, FormControl>) {
        return fakeFb.group(controls);
      },
    } satisfies FormBuilder;

    formbakerToFormGroup(form, tracingFb, fakeValidators);

    // name gets 1 validator (required), age gets 2 (min, max)
    expect(calls).toEqual([
      'control("") + 1 validator(s)',
      'control(null) + 2 validator(s)',
    ]);
  });

  it("should not apply required validator for optional fields", () => {
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "bio",
      type: "textarea",
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
    form = addNode(form, { id: "name", type: "text" });

    let added = "";
    let removed = "";
    const mutableGroup = {
      controls: { name: fakeFb.control("") } as Record<string, FormControl>,
      addControl(name: string, ctrl: FormControl) {
        added = name;
        mutableGroup.controls[name] = ctrl;
      },
      removeControl(name: string) {
        removed = name;
        delete mutableGroup.controls[name];
      },
      get(name: string) {
        return mutableGroup.controls[name] ?? null;
      },
    } satisfies FormGroup;

    // Add a second field
    form = addNode(form, { id: "email", type: "text" });

    rebuildFormGroup(form, mutableGroup as FormGroup, fakeFb, fakeValidators);

    expect(added).toBe("email");
    expect(removed).toBe("");
    expect(Object.keys(mutableGroup.controls)).toContain("email");
  });

  it("rebuildFormGroup should remove controls for removed fields", () => {
    let removed = "";
    const mutableGroup = {
      controls: {
        keep: fakeFb.control("keep") as FormControl,
        remove: fakeFb.control("remove") as FormControl,
      },
      addControl: () => {},
      removeControl(name: string) {
        removed = name;
        delete mutableGroup.controls[name];
      },
      get(name: string) {
        return mutableGroup.controls[name] ?? null;
      },
    } satisfies FormGroup;

    // Create a form without the "remove" field
    const form1 = create({ pluginName: "zod" });
    const form = addNode(form1, { id: "keep", type: "text" });

    rebuildFormGroup(form, mutableGroup as FormGroup, fakeFb, fakeValidators);

    expect(removed).toBe("remove");
    expect(Object.keys(mutableGroup.controls)).toEqual(["keep"]);
  });
});
