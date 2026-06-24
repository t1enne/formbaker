import { describe, it, expect } from "vitest";
import {
  addNode,
  addSection,
  create,
  getSortedNodes,
  getOrderingMap,
} from "@/engine";

describe("getOrderingMap", () => {
  it("numbers flat questions sequentially (no sections)", () => {
    const form = create({
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
    const form = create();
    addSection(form, { id: "#s1", label: { it: "Topic A" } });
    addNode(form, { id: "q1" });
    addNode(form, { id: "q2" });
    addSection(form, { id: "#s2", label: { it: "Topic B" } });
    addNode(form, { id: "q3" });

    const lo = getOrderingMap(form);
    expect(lo.get("#s1")).toBe("1");
    expect(lo.get("q1")).toBe("1.1");
    expect(lo.get("q2")).toBe("1.2");
    expect(lo.get("#s2")).toBe("2");
    expect(lo.get("q3")).toBe("2.1");
  });

  it("numbers questions with 3+ sections correctly", () => {
    const form = create();
    addSection(form, { id: "#s1" });
    addNode(form, { id: "q1" });
    addSection(form, { id: "#s2" });
    addNode(form, { id: "q2" });
    addSection(form, { id: "#s3" });
    addNode(form, { id: "q3" });

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
      const form = create();
      addNode(form, { id: "a" });
      addNode(form, { id: "b" });
      addNode(form, { id: "c" });

      expect(form.fields.a!.order).toBe(1);
      expect(form.fields.b!.order).toBe(2);
      expect(form.fields.c!.order).toBe(3);

      const sorted = getSortedNodes(form);
      const fieldIds = sorted.map((n) => n.id);
      expect(fieldIds).toEqual(["a", "b", "c"]);
    });
  });
});
