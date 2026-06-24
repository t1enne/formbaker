import {
  create,
  addNode,
  removeNode,
  addDependency,
  validate,
  removeDependency,
} from "@/libs/formbaker/engine";
import { flow } from "../utils";
import { describe, it, expect } from "vitest";

describe("formbaker dependencies", () => {
  it("should handle optional subsections", () => {
    const createForm = flow(
      () => create(),
      (f) => addNode(f, { id: "parent", type: "text" }),
      (f) =>
        addNode(f, {
          id: "child",
          type: "number",
          validation: { required: true },
        }),
      (f) =>
        addDependency(f, {
          source: "parent",
          target: "child",
          condition: "string",
        }),
    );
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
    const form = create({
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
    });

    addDependency(form, {
      source: "parent",
      target: "child",
      condition: "true",
    });

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
    const form = create({
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
    addDependency(form, d);
    addDependency(form, {
      source: "fieldB",
      target: "fieldC",
      condition: "any",
    });

    removeDependency(form, d);

    expect(form.dependencies.forward[d.source]!.length).toBe(0);
    expect(form.dependencies.backward[d.target]!.length).toBe(0);
  });

  it("should remove nodes and its edges", () => {
    const form = create({
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
    addDependency(form, d);
    addDependency(form, {
      source: "fieldB",
      target: "fieldC",
      condition: "any",
    });

    // remove node in the middle
    let [, success] = removeNode(form, "fieldA");
    expect(success).toBeFalsy();

    // remove terminal node
    [, success] = removeNode(form, "fieldC");
    expect(success).toBeTruthy();

    expect(form.fields["fieldC"]).toBeFalsy();
    expect(form.dependencies.forward["fieldB"]!.length).toBe(0);
  });
});
