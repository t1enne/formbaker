import { describe, it, expect, beforeAll } from "vitest";
import {
  addNode,
  addDependency,
  removeNode,
  moveNode,
  create,
  getSortedNodes,
  validate,
  registerPlugin,
} from "formbaker";
import { testPlugin } from "./testPlugin";

describe("sections as tree nodes", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("rejects section ids without leading #", () => {
    expect(() =>
      addNode(create({ pluginName: "test" }), { id: "s1", type: "section" }),
    ).toThrow("Section id must start with #");
  });

  it("accepts section ids with leading #", () => {
    const form = addNode(create({ pluginName: "test" }), {
      id: "#s1",
      type: "section",
      label: "Personal",
    });
    expect(form.nodes["#s1"]!.type).toBe("section");
    expect(form.nodes["#s1"]!.label).toBe("Personal");
  });

  it("assigns sibling-local order within the same parent", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "#s1", type: "section" });
    form = addNode(form, { id: "a", type: "field", fieldType: "text", parentId: "#s1" });
    form = addNode(form, { id: "b", type: "field", fieldType: "text", parentId: "#s1" });
    form = addNode(form, { id: "c", type: "field", fieldType: "text", parentId: "#s1" });

    expect(form.nodes.a!.order).toBe(1);
    expect(form.nodes.b!.order).toBe(2);
    expect(form.nodes.c!.order).toBe(3);
    expect(form.nodes["#s1"]!.order).toBe(1);

    const sorted = getSortedNodes(form);
    expect(sorted.map((n) => n.id)).toEqual(["#s1", "a", "b", "c"]);
  });

  it("removing a section cascades to its children", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "#s1", type: "section" });
    form = addNode(form, { id: "child1", type: "field", fieldType: "text", parentId: "#s1" });
    form = addNode(form, { id: "child2", type: "field", fieldType: "text", parentId: "#s1" });

    const [result] = removeNode(form, "#s1");
    expect(result.nodes["#s1"]).toBeUndefined();
    expect(result.nodes["child1"]).toBeUndefined();
    expect(result.nodes["child2"]).toBeUndefined();
  });

  it("removing a section clears dependency edges from/to descendants", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "#s1", type: "section" });
    form = addNode(form, { id: "trigger", type: "field", fieldType: "checkbox", parentId: "#s1" });
    form = addNode(form, {
      id: "target",
      type: "field",
      fieldType: "text",
      validation: { required: true },
    });
    form = addDependency(form, {
      source: "trigger",
      target: "target",
      condition: "true",
    });

    const [result] = removeNode(form, "#s1");
    expect(result.nodes["trigger"]).toBeUndefined();
    expect(result.dependencies.forward["trigger"] ?? []).toEqual([]);
    expect(result.dependencies.backward["target"] ?? []).toEqual([]);
  });

  it("rejects removing a node with outbound dependencies", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "a", type: "field", fieldType: "text" });
    form = addNode(form, { id: "b", type: "field", fieldType: "text" });
    form = addDependency(form, { source: "a", target: "b", condition: "any" });

    const [, success] = removeNode(form, "a");
    expect(success).toBe(false);
  });

  it("rejects dependencies from a section as source", () => {
    const form = addNode(create({ pluginName: "test" }), {
      id: "#s1",
      type: "section",
    });
    expect(() =>
      addDependency(form, {
        source: "#s1",
        target: "nonexistent",
        condition: "string",
      }),
    ).toThrow();
  });

  it("moveNode reorders within the same parent", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "a", type: "field", fieldType: "text" });
    form = addNode(form, { id: "b", type: "field", fieldType: "text" });
    form = addNode(form, { id: "c", type: "field", fieldType: "text" });

    form = moveNode(form, "b", "c");

    const sorted = getSortedNodes(form);
    expect(sorted.map((n) => n.id)).toEqual(["a", "c", "b"]);
    expect(form.nodes.b!.order).toBe(3);
  });

  it("moveNode rejects moving a node to itself", () => {
    const form = addNode(create({ pluginName: "test" }), {
      id: "a",
      type: "field",
      fieldType: "text",
    });
    expect(() => moveNode(form, "a", "a")).toThrow();
  });

  it("moveNode renumbers siblings after move", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "a", type: "field", fieldType: "text" });
    form = addNode(form, { id: "b", type: "field", fieldType: "text" });
    form = addNode(form, { id: "c", type: "field", fieldType: "text" });

    form = moveNode(form, "c", "a");
    expect(form.nodes.a!.order).toBe(1);
    expect(form.nodes.c!.order).toBe(2);
    expect(form.nodes.b!.order).toBe(3);
  });

  it("ancestor visibility: hiding a parent section hides children", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, {
      id: "hideSwitch",
      type: "field",
      fieldType: "checkbox",
    });
    form = addNode(form, { id: "#s1", type: "section" });
    form = addNode(form, {
      id: "child",
      type: "field",
      fieldType: "text",
      validation: { required: true },
      parentId: "#s1",
    });
    form = addDependency(form, {
      source: "hideSwitch",
      target: "#s1",
      condition: "true",
    });

    expect(validate(form, { hideSwitch: false }).success).toBe(true);
    expect(validate(form, { hideSwitch: true }).success).toBe(false);
    expect(validate(form, { hideSwitch: true, child: "ok" }).success).toBe(true);
  });

  it("supports nested sections (section tree)", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "#root", type: "section", label: "Root" });
    form = addNode(form, { id: "#child", type: "section", label: "Child", parentId: "#root" });
    form = addNode(form, { id: "leaf", type: "field", fieldType: "text", parentId: "#child" });

    const sorted = getSortedNodes(form);
    expect(sorted.map((n) => n.id)).toEqual(["#root", "#child", "leaf"]);

    const [result] = removeNode(form, "#root");
    expect(Object.keys(result.nodes)).toEqual([]);
  });
});
