import {
  create,
  addNode,
  removeNode,
  addDependency,
  validate,
  removeDependency,
  registerPlugin,
} from "@/engine";
import { arktypePlugin } from "@/plugins/arktype";

import { describe, it, expect, beforeAll } from "vitest";

describe("formbaker dependencies", () => {
  beforeAll(() => {
    registerPlugin("arktype", arktypePlugin);
  });
  it("should handle optional subsections", () => {
    const createForm = () => {
      let f = create({ pluginName: "arktype" });
      f = addNode(f, { id: "parent", type: "text" });
      f = addNode(f, {
        id: "child",
        type: "number",
        validation: { required: true },
      });
      f = addDependency(f, {
        source: "parent",
        target: "child",
        condition: "string",
      });
      return f;
    };
    const form = createForm();
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
        pluginName: "arktype",
        fields: {
          parent: {
            id: "parent",
            defaultValue: null,
            type: "checkbox",
          },
          child: {
            id: "child",
            defaultValue: null,
            type: "checkbox",
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
      pluginName: "arktype",
      fields: {
        fieldA: { id: "fieldA", type: "text" },
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
      pluginName: "arktype",
      fields: {
        fieldA: { id: "fieldA", type: "text" },
        fieldB: { id: "fieldB", type: "text" },
        fieldC: { id: "fieldC", type: "text" },
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

  it("should remove nodes and its edges", () => {
    let form = create({
      pluginName: "arktype",
      fields: {
        fieldA: { id: "fieldA", type: "text" },
        fieldB: { id: "fieldB", type: "text" },
        fieldC: { id: "fieldC", type: "text" },
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

    expect(result.fields["fieldC"]).toBeFalsy();
    expect(result.dependencies.forward["fieldB"]!.length).toBe(0);
    // original form is unchanged
    expect(form.fields["fieldC"]).toBeTruthy();
  });
});
