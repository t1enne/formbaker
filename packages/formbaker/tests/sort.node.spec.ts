import { describe, it, expect, beforeAll } from "vitest";
import {
  addNode,
  addSection,
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
      fields: {
        b: { id: "b", type: "checkbox" },
        c: { id: "c", type: "checkbox" },
        a: { id: "a", type: "checkbox" },
      },
    });

    const lo = getOrderingMap(form);
    expect(lo.get("b")).toBe("1");
    expect(lo.get("c")).toBe("2");
    expect(lo.get("a")).toBe("3");
  });

  it("numbers questions with sections: 1, 1.1, 1.2, 2, 2.1", () => {
    let form = create({ pluginName: "test" });
    form = addSection(form, { id: "#s1", label: "Topic A" });
    form = addNode(form, { id: "q1" });
    form = addNode(form, { id: "q2" });
    form = addSection(form, { id: "#s2", label: "Topic B" });
    form = addNode(form, { id: "q3" });

    const lo = getOrderingMap(form);
    expect(lo.get("#s1")).toBe("1");
    expect(lo.get("q1")).toBe("1.1");
    expect(lo.get("q2")).toBe("1.2");
    expect(lo.get("#s2")).toBe("2");
    expect(lo.get("q3")).toBe("2.1");
  });

  it("numbers questions with 3+ sections correctly", () => {
    let form = create({ pluginName: "test" });
    form = addSection(form, { id: "#s1" });
    form = addNode(form, { id: "q1" });
    form = addSection(form, { id: "#s2" });
    form = addNode(form, { id: "q2" });
    form = addSection(form, { id: "#s3" });
    form = addNode(form, { id: "q3" });

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
      form = addNode(form, { id: "a" });
      form = addNode(form, { id: "b" });
      form = addNode(form, { id: "c" });

      expect(form.fields.a!.order).toBe(1);
      expect(form.fields.b!.order).toBe(2);
      expect(form.fields.c!.order).toBe(3);

      const sorted = getSortedNodes(form);
      const fieldIds = sorted.map((n) => n.id);
      expect(fieldIds).toEqual(["a", "b", "c"]);
    });
  });
});
