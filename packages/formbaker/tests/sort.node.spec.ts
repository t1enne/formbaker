import { describe, it, expect, beforeAll } from "vitest";
import {
  addNode,
  create,
  getSortedNodes,
  getOrderingMap,
  registerPlugin,
} from "formbaker";
import { testPlugin } from "./testPlugin";

describe("getOrderingMap", () => {
  beforeAll(() => {
    registerPlugin("test", testPlugin);
  });

  it("numbers flat questions sequentially (no sections)", () => {
    const form = create({
      pluginName: "test",
      nodes: {
        b: { id: "b", type: "field", fieldType: "checkbox" },
        c: { id: "c", type: "field", fieldType: "checkbox" },
        a: { id: "a", type: "field", fieldType: "checkbox" },
      },
    });

    const lo = getOrderingMap(form);
    expect(lo.get("b")).toBe("1");
    expect(lo.get("c")).toBe("2");
    expect(lo.get("a")).toBe("3");
  });

  it("numbers questions with sections: 1, 1.1, 1.2, 2, 2.1", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "#s1", type: "section", label: "Topic A" });
    form = addNode(form, { id: "q1", type: "field", fieldType: "text", parentId: "#s1" });
    form = addNode(form, { id: "q2", type: "field", fieldType: "text", parentId: "#s1" });
    form = addNode(form, { id: "#s2", type: "section", label: "Topic B" });
    form = addNode(form, { id: "q3", type: "field", fieldType: "text", parentId: "#s2" });

    const lo = getOrderingMap(form);
    expect(lo.get("#s1")).toBe("1");
    expect(lo.get("q1")).toBe("1.1");
    expect(lo.get("q2")).toBe("1.2");
    expect(lo.get("#s2")).toBe("2");
    expect(lo.get("q3")).toBe("2.1");
  });

  it("numbers questions with 3+ sections correctly", () => {
    let form = create({ pluginName: "test" });
    form = addNode(form, { id: "#s1", type: "section" });
    form = addNode(form, { id: "q1", type: "field", fieldType: "text", parentId: "#s1" });
    form = addNode(form, { id: "#s2", type: "section" });
    form = addNode(form, { id: "q2", type: "field", fieldType: "text", parentId: "#s2" });
    form = addNode(form, { id: "#s3", type: "section" });
    form = addNode(form, { id: "q3", type: "field", fieldType: "text", parentId: "#s3" });

    const lo = getOrderingMap(form);
    expect(lo.get("#s1")).toBe("1");
    expect(lo.get("q1")).toBe("1.1");
    expect(lo.get("#s2")).toBe("2");
    expect(lo.get("q2")).toBe("2.1");
    expect(lo.get("#s3")).toBe("3");
    expect(lo.get("q3")).toBe("3.1");
  });

  describe("getSortedNodes", () => {
    it("sorts fields by insertion order", () => {
      let form = create({ pluginName: "test" });
      form = addNode(form, { id: "a", type: "field", fieldType: "text" });
      form = addNode(form, { id: "b", type: "field", fieldType: "text" });
      form = addNode(form, { id: "c", type: "field", fieldType: "text" });

      expect(form.nodes.a!.order).toBe(1);
      expect(form.nodes.b!.order).toBe(2);
      expect(form.nodes.c!.order).toBe(3);

      const sorted = getSortedNodes(form);
      const fieldIds = sorted.map((n) => n.id);
      expect(fieldIds).toEqual(["a", "b", "c"]);
    });
  });
});
