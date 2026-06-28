/**
 * Tests for the Angular FormBuilder integration.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, addDependency, registerPlugin } from "formbaker";
import type { FormbakerPlugin } from "formbaker";
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
  // Minimal test plugin for visibility tests — only needed for evaluateCondition.
  const testPlugin: FormbakerPlugin = {
    field: (_f) => ({ "~standard": { version: 1, vendor: "test", validate: (v: unknown) => ({ value: v }) } }),
    mergeFields: (_fs) => ({ "~standard": { version: 1, vendor: "test", validate: (v: unknown) => {
      if (v === null || typeof v !== "object") return { issues: [{ message: "not object" }] };
      return { value: v };
    } } }),
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

  describe("visibility with opts.values", () => {
    it("formbakerToFormGroup excludes fields hidden by a dependency", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "trigger", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "target", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "trigger", target: "target", condition: "true",
      });

      const hidden = formbakerToFormGroup(form, fakeFb, fakeValidators, {
        values: { trigger: false },
      });
      expect(Object.keys(hidden.controls)).toEqual(["trigger"]);

      const visible = formbakerToFormGroup(form, fakeFb, fakeValidators, {
        values: { trigger: true },
      });
      expect(Object.keys(visible.controls)).toEqual(["trigger", "target"]);
    });

    it("rebuildFormGroup removes hidden fields when values are provided", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "trigger", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "target", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "trigger", target: "target", condition: "true",
      });

      const ctrls: Record<string, { value: unknown }> = {
        trigger: fakeFb.control(false),
        target: fakeFb.control("hello"),
      };
      let removed = "";
      const group: FormGroupLike = {
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

      rebuildFormGroup(form, group, fakeFb, fakeValidators, {
        values: { trigger: false },
      });
      expect(removed).toBe("target");
      expect(Object.keys(group.controls)).toEqual(["trigger"]);
    });

    it("rebuildFormGroup adds newly-visible fields when values change", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "trigger", type: "field", fieldType: "checkbox" });
      form = addNode(form, { id: "target", type: "field", fieldType: "text" });
      form = addDependency(form, {
        source: "trigger", target: "target", condition: "true",
      });

      const ctrls: Record<string, { value: unknown }> = {
        trigger: fakeFb.control(true),
      };
      let added = "";
      const group: FormGroupLike = {
        controls: ctrls,
        addControl(name, ctrl) {
          added = name;
          ctrls[name] = ctrl;
        },
        removeControl: () => {},
        get(name) {
          return ctrls[name] ?? null;
        },
      };

      rebuildFormGroup(form, group, fakeFb, fakeValidators, {
        values: { trigger: true },
      });
      expect(added).toBe("target");
      expect(Object.keys(group.controls)).toEqual(["trigger", "target"]);
    });
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
