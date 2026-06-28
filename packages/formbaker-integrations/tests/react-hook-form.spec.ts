/**
 * Tests for the react-hook-form integration.
 *
 * The integration is a thin wrapper around useForm + standardSchemaResolver.
 * We test that it produces a resolver that validates using the Formbaker schema
 * with both arktype and zod plugins.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { create, addNode, registerPlugin, getSchema } from "formbaker";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

const fakeCtx = {
  criteriaMode: "firstError" as const,
  fields: {},
  names: [],
  shouldUseNativeValidation: false,
};

describe("react-hook-form integration", () => {
  beforeAll(() => {
    // Both plugins need to be registered for the param tests
  });

  it("validates with arktype plugin", async () => {
    registerPlugin("arktype", (await import("@formbaker/plugins/arktype")).arktypePlugin);
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

    expect(
      Object.keys((await resolver({ name: "", age: 15 }, undefined as any, fakeCtx as any)).errors!)
        .length,
    ).toBeGreaterThan(0);
    expect(
      (await resolver({ name: "Alice", age: 25 }, undefined as any, fakeCtx as any)).errors,
    ).toEqual({});
  });

  it("validates with zod plugin", async () => {
    registerPlugin("zod", (await import("@formbaker/plugins/zod")).zodPlugin);
    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "email",
      type: "field",
      fieldType: "text",
      validation: { required: true, min: 5 },
    });

    const resolver = standardSchemaResolver(getSchema(form, {}) as any);

    expect(
      Object.keys((await resolver({ email: "a" }, undefined as any, fakeCtx as any)).errors!)
        .length,
    ).toBeGreaterThan(0);
    expect((await resolver({ email: "a@b.co" }, undefined as any, fakeCtx as any)).errors).toEqual(
      {},
    );
  });
});
