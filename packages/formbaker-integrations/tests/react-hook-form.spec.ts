/**
 * Tests for the react-hook-form integration.
 *
 * The integration is a thin wrapper around useForm + standardSchemaResolver.
 * We test that it produces a resolver that validates using the Formbaker schema
 * with both arktype and zod plugins, and that isInSchema / visibleFields report
 * visibility correctly.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, addDependency, registerPlugin, createVisibilityChecker } from "formbaker";

// --- isInSchema / visibleFields logic ---
// The hook calls createVisibilityChecker internally. We construct forms and
// verify the same path produces correct visibility results.

const getVisibleFields = (
  form: ReturnType<typeof create>,
  values: Record<string, unknown>,
): Set<string> => {
  const isIncluded = createVisibilityChecker(form);
  const visible = new Set<string>();
  for (const id of Object.keys(form.nodes)) {
    if (isIncluded(id, values)) visible.add(id);
  }
  return visible;
};

describe("react-hook-form integration", () => {
  beforeAll(async () => {
    registerPlugin("arktype", (await import("@formbaker/plugins/arktype")).arktypePlugin);
    registerPlugin("zod", (await import("@formbaker/plugins/zod")).zodPlugin);
  });

  describe("useFormbakerForm — isInSchema / visibleFields", () => {
    it("reports all fields visible when there are no dependencies", () => {
      let form = create({ pluginName: "arktype" });
      form = addNode(form, { id: "a", type: "field", fieldType: "text" });
      form = addNode(form, { id: "b", type: "field", fieldType: "number" });

      const visible = getVisibleFields(form, {});
      expect(visible.has("a")).toBe(true);
      expect(visible.has("b")).toBe(true);
      expect(visible.size).toBe(2);
    });

    it("excludes fields inside a hidden section", () => {
      let form = create({ pluginName: "arktype" });
      form = addNode(form, { id: "#s1", type: "section" });
      form = addNode(form, { id: "trigger", type: "field", fieldType: "checkbox" });
      form = addNode(form, {
        id: "child",
        type: "field",
        fieldType: "text",
        parentId: "#s1",
      });
      form = addDependency(form, {
        source: "trigger", target: "#s1", condition: "true",
      });

      expect(getVisibleFields(form, { trigger: false }).has("child")).toBe(false);
      expect(getVisibleFields(form, { trigger: true }).has("child")).toBe(true);
    });
  });

  describe("resolver integration", () => {
    it("validates with arktype plugin", async () => {
      const { standardSchemaResolver } = await import("@hookform/resolvers/standard-schema");
      const { getSchema } = await import("formbaker");

      let form = create({ pluginName: "arktype" });
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
        validation: { min: 18 },
      });

      const fakeCtx = {
        criteriaMode: "firstError" as const,
        fields: {},
        names: [],
        shouldUseNativeValidation: false,
      };

      const resolver = standardSchemaResolver(getSchema(form, {}) as any);

      expect(
        Object.keys(
          (await resolver({ name: "", age: 15 }, undefined as any, fakeCtx as any)).errors!,
        ).length,
      ).toBeGreaterThan(0);
      expect(
        (await resolver({ name: "Alice", age: 25 }, undefined as any, fakeCtx as any)).errors,
      ).toEqual({});
    });

    it("validates with zod plugin", async () => {
      const { standardSchemaResolver } = await import("@hookform/resolvers/standard-schema");
      const { getSchema } = await import("formbaker");

      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "email",
        type: "field",
        fieldType: "text",
        validation: { required: true, min: 5 },
      });

      const fakeCtx = {
        criteriaMode: "firstError" as const,
        fields: {},
        names: [],
        shouldUseNativeValidation: false,
      };

      const resolver = standardSchemaResolver(getSchema(form, {}) as any);

      expect(
        Object.keys(
          (await resolver({ email: "a" }, undefined as any, fakeCtx as any)).errors!,
        ).length,
      ).toBeGreaterThan(0);
      expect(
        (await resolver({ email: "a@b.co" }, undefined as any, fakeCtx as any)).errors,
      ).toEqual({});
    });
  });
});
