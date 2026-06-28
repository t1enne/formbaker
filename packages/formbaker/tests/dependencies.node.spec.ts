import {
  create,
  addNode,
  removeNode,
  addDependency,
  validate,
  removeDependency,
  registerPlugin,
} from "formbaker";
import { testPlugin } from "./testPlugin";

import { describe, it, expect, beforeAll } from "vitest";

describe("formbaker dependencies", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("should handle optional subsections", () => {
    const form = (() => {
      let f = create({ pluginName: "test" });
      f = addNode(f, { id: "parent", type: "field", fieldType: "text" });
      f = addNode(f, {
        id: "child",
        type: "field",
        fieldType: "number",
        validation: { required: true },
      });
      f = addDependency(f, {
        source: "parent",
        target: "child",
        condition: "string",
      });
      return f;
    })();
    const tests = [
      [{}, true],
      [{ parent: "invalid" }, false],
      [{ parent: "valid" }, false],
      [{ parent: "valid", child: 0 }, true],
    ] as const;

    tests.forEach(([input, expected]) => {
      const r = validate(form, input);
      const msg = `Input: ${JSON.stringify(input, null, 2)}. Schema: ${JSON.stringify(r.schema, null, 2)}`;
      expect(r.success, msg).toBe(expected);
    });
  });

  it("should handle optional subfields", () => {
    const form = addDependency(
      create({
        pluginName: "test",
        nodes: {
          parent: {
            id: "parent",
            defaultValue: null,
            type: "field",
            fieldType: "checkbox",
          },
          child: {
            id: "child",
            defaultValue: null,
            type: "field",
            fieldType: "checkbox",
            validation: { required: true },
          },
        },
      }),
      {
        source: "parent",
        target: "child",
        condition: "true",
      },
    );

    const tests = [
      [{ parent: null }, true],
      [{ parent: true }, false], // should fail for child condition
      [{ parent: true, child: true }, true],
    ];

    tests.forEach(([input, expected]) => {
      const r = validate(form, input);
      const msg = `Input: ${JSON.stringify(input, null, 2)}. Schema: ${JSON.stringify(r.schema, null, 2)}`;
      expect(r.success, msg).toBe(expected);
    });
  });

  it("should detect immediate self-references", () => {
    const form = create({
      pluginName: "test",
      nodes: {
        fieldA: { id: "fieldA", type: "field", fieldType: "text" },
      },
    });
    expect(() =>
      addDependency(form, {
        source: "fieldA",
        target: "fieldA",
        condition: "any",
      }),
    ).toThrow();
  });

  it("handle removal of dependencies", () => {
    let form = create({
      pluginName: "test",
      nodes: {
        fieldA: { id: "fieldA", type: "field", fieldType: "text" },
        fieldB: { id: "fieldB", type: "field", fieldType: "text" },
        fieldC: { id: "fieldC", type: "field", fieldType: "text" },
      },
    });
    const d = {
      source: "fieldA",
      target: "fieldB",
      condition: "any",
    };
    form = addDependency(form, d);
    form = addDependency(form, {
      source: "fieldB",
      target: "fieldC",
      condition: "any",
    });

    const result = removeDependency(form, d);

    expect(result.dependencies.forward[d.source]!.length).toBe(0);
    expect(result.dependencies.backward[d.target]!.length).toBe(0);
    // original form is unchanged
    expect(form.dependencies.forward[d.source]!.length).toBe(1);
  });

  it("should handle AND dependencies — all must pass", () => {
    const form = (() => {
      let f = create({ pluginName: "test" });
      f = addNode(f, { id: "a", type: "field", fieldType: "checkbox" });
      f = addNode(f, { id: "b", type: "field", fieldType: "checkbox" });
      f = addNode(f, {
        id: "target",
        type: "field",
        fieldType: "text",
        validation: { required: true },
      });
      f = addDependency(f, {
        source: "a",
        target: "target",
        condition: "true",
        dependencyType: "AND",
      });
      f = addDependency(f, {
        source: "b",
        target: "target",
        condition: "true",
        dependencyType: "AND",
      });
      return f;
    })();

    const tests = [
      [{}, true], // empty values → include (no values to evaluate)
      [{ a: true, b: true }, false], // AND passes, target included but required fails
      [{ a: true, b: true, target: "ok" }, true], // AND passes, target validates
      [{ a: true, b: false }, true], // AND fails (b falsy) → target excluded
      [{ a: false, b: false }, true], // AND fails → target excluded
    ] as const;

    tests.forEach(([input, expected]) => {
      const r = validate(form, input);
      const msg = `Input: ${JSON.stringify(input)}. Expected ${expected}`;
      expect(r.success, msg).toBe(expected);
    });
  });

  it("should handle XOR dependencies — exactly one must pass", () => {
    const form = (() => {
      let f = create({ pluginName: "test" });
      f = addNode(f, { id: "a", type: "field", fieldType: "checkbox" });
      f = addNode(f, { id: "b", type: "field", fieldType: "checkbox" });
      f = addNode(f, {
        id: "target",
        type: "field",
        fieldType: "text",
        validation: { required: true },
      });
      f = addDependency(f, {
        source: "a",
        target: "target",
        condition: "true",
        dependencyType: "XOR",
      });
      f = addDependency(f, {
        source: "b",
        target: "target",
        condition: "true",
        dependencyType: "XOR",
      });
      return f;
    })();

    const tests = [
      [{}, true], // empty values → include
      [{ a: true, b: false, target: "ok" }, true], // exactly one (a) → included, target validates
      [{ a: false, b: true, target: "ok" }, true], // exactly one (b) → included, target validates
      [{ a: true, b: true }, true], // both pass → excluded (not exactly one)
      [{ a: false, b: false }, true], // neither passes → excluded
    ] as const;

    tests.forEach(([input, expected]) => {
      const r = validate(form, input);
      const msg = `Input: ${JSON.stringify(input)}. Expected ${expected}`;
      expect(r.success, msg).toBe(expected);
    });
  });

  it("should handle mixed AND + OR groups — groups OR'd together", () => {
    const form = (() => {
      let f = create({ pluginName: "test" });
      f = addNode(f, {
        id: "has_express",
        type: "field",
        fieldType: "checkbox",
      });
      f = addNode(f, { id: "has_phone", type: "field", fieldType: "checkbox" });
      f = addNode(f, { id: "is_gift", type: "field", fieldType: "checkbox" });
      f = addNode(f, {
        id: "delivery_prefs",
        type: "field",
        fieldType: "text",
        validation: { required: true },
      });
      // AND group: has_express AND has_phone must both be true
      f = addDependency(f, {
        source: "has_express",
        target: "delivery_prefs",
        condition: "true",
        dependencyType: "AND",
      });
      f = addDependency(f, {
        source: "has_phone",
        target: "delivery_prefs",
        condition: "true",
        dependencyType: "AND",
      });
      // OR group: is_gift alone is enough
      f = addDependency(f, {
        source: "is_gift",
        target: "delivery_prefs",
        condition: "true",
        dependencyType: "OR",
      });
      return f;
    })();

    const tests = [
      [{}, true], // empty values → include
      [{ is_gift: true, delivery_prefs: "no" }, true], // OR group passes alone
      [{ has_express: true, has_phone: true, delivery_prefs: "yes" }, true], // AND group passes alone
      [{ has_express: true }, true], // AND fails, OR fails → exclude
      [{ has_express: true, is_gift: true, delivery_prefs: "ok" }, true], // AND fails (no phone), OR passes → include
      [
        {
          has_express: true,
          has_phone: true,
          is_gift: true,
          delivery_prefs: "y",
        },
        true,
      ], // both pass → include
    ] as const;

    tests.forEach(([input, expected]) => {
      const r = validate(form, input);
      const msg = `Input: ${JSON.stringify(input)}. Expected ${expected}`;
      expect(r.success, msg).toBe(expected);
    });
  });

  it("should default missing dependencyType to OR", () => {
    const form = (() => {
      let f = create({ pluginName: "test" });
      f = addNode(f, { id: "a", type: "field", fieldType: "checkbox" });
      f = addNode(f, {
        id: "target",
        type: "field",
        fieldType: "text",
        validation: { required: true },
      });
      // No dependencyType → defaults to OR
      f = addDependency(f, {
        source: "a",
        target: "target",
        condition: "true",
      });
      return f;
    })();

    const tests = [
      [{ a: true }, false], // a passes, target included but required
      [{ a: false }, true], // a fails, target excluded
    ] as const;

    tests.forEach(([input, expected]) => {
      const r = validate(form, input);
      const msg = `Input: ${JSON.stringify(input)}. Expected ${expected}`;
      expect(r.success, msg).toBe(expected);
    });
  });

  it("should remove nodes and its edges", () => {
    let form = create({
      pluginName: "test",
      nodes: {
        fieldA: { id: "fieldA", type: "field", fieldType: "text" },
        fieldB: { id: "fieldB", type: "field", fieldType: "text" },
        fieldC: { id: "fieldC", type: "field", fieldType: "text" },
      },
    });
    form = addDependency(form, {
      source: "fieldA",
      target: "fieldB",
      condition: "any",
    });
    form = addDependency(form, {
      source: "fieldB",
      target: "fieldC",
      condition: "any",
    });

    // remove node in the middle — has outbound edges, should fail
    let [, success] = removeNode(form, "fieldA");
    expect(success).toBeFalsy();

    // remove terminal node
    const [result, success2] = removeNode(form, "fieldC");
    expect(success2).toBeTruthy();

    expect(result.nodes["fieldC"]).toBeFalsy();
    expect(result.dependencies.forward["fieldB"]!.length).toBe(0);
    // original form is unchanged
    expect(form.nodes["fieldC"]).toBeTruthy();
  });
});
