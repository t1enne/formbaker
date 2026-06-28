/**
 * React Hook Form integration tests with happy-dom.
 *
 * Exercises the resolver validation directly via standardSchemaResolver
 * and the visibility helpers via createVisibilityChecker.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, addDependency, registerPlugin, createVisibilityChecker } from "formbaker";

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
    registerPlugin(
      "arktype",
      (await import("@formbaker/plugins/arktype")).arktypePlugin,
    );
    registerPlugin(
      "zod",
      (await import("@formbaker/plugins/zod")).zodPlugin,
    );
  });

  describe("resolver validation", () => {
    it("validates against arktype schema — fails with invalid values", async () => {
      const { getSchema } = await import("formbaker");
      const { standardSchemaResolver } = await import(
        "@hookform/resolvers/standard-schema"
      );

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

      const resolver = standardSchemaResolver(getSchema(form, {}) as any);

      const result = await resolver(
        { name: "", age: 15 },
        undefined as any,
        {
          criteriaMode: "firstError" as const,
          fields: {},
          names: [],
          shouldUseNativeValidation: false,
        } as any,
      );

      expect(result.errors).toBeDefined();
      expect(result.errors!.name).toBeDefined();
    });

    it("validates against arktype schema — passes with valid values", async () => {
      const { getSchema } = await import("formbaker");
      const { standardSchemaResolver } = await import(
        "@hookform/resolvers/standard-schema"
      );

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

      const resolver = standardSchemaResolver(getSchema(form, {}) as any);

      const result = await resolver(
        { name: "Alice", age: 25 },
        undefined as any,
        {
          criteriaMode: "firstError" as const,
          fields: {},
          names: [],
          shouldUseNativeValidation: false,
        } as any,
      );

      expect(result.errors).toEqual({});
      expect(result.values).toEqual({ name: "Alice", age: 25 });
    });

    it("validates against zod schema", async () => {
      const { getSchema } = await import("formbaker");
      const { standardSchemaResolver } = await import(
        "@hookform/resolvers/standard-schema"
      );

      let form = create({ pluginName: "zod" });
      form = addNode(form, {
        id: "email",
        type: "field",
        fieldType: "text",
        validation: { required: true, min: 5 },
      });

      const resolver = standardSchemaResolver(getSchema(form, {}) as any);

      const bad = await resolver(
        { email: "a" },
        undefined as any,
        {
          criteriaMode: "firstError" as const,
          fields: {},
          names: [],
          shouldUseNativeValidation: false,
        } as any,
      );
      expect(bad.errors).toBeDefined();
      expect(bad.errors!.email).toBeDefined();

      const good = await resolver(
        { email: "a@b.co" },
        undefined as any,
        {
          criteriaMode: "firstError" as const,
          fields: {},
          names: [],
          shouldUseNativeValidation: false,
        } as any,
      );
      expect(good.errors).toEqual({});
    });
  });

  describe("isInSchema / visibleFields", () => {
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
      form = addNode(form, {
        id: "trigger",
        type: "field",
        fieldType: "checkbox",
      });
      form = addNode(form, {
        id: "child",
        type: "field",
        fieldType: "text",
        parentId: "#s1",
      });
      form = addDependency(form, {
        source: "trigger",
        target: "#s1",
        condition: "true",
      });

      expect(getVisibleFields(form, { trigger: false }).has("child")).toBe(
        false,
      );
      expect(getVisibleFields(form, { trigger: true }).has("child")).toBe(
        true,
      );
    });
  });
});
