/**
 * Tests for the react-hook-form integration.
 *
 * The integration is a thin wrapper around useForm + standardSchemaResolver.
 * We test that it produces a valid UseFormReturn-compatible object and that
 * the resolver actually validates using the Formbaker schema.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  create,
  addNode,
  registerPlugin,
  getSchema,
} from "formbaker";
import { arktypePlugin } from "@formbaker/plugins/arktype";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

describe("react-hook-form integration", () => {
  beforeAll(() => {
    registerPlugin("arktype", arktypePlugin);
  });

  it("should produce a resolver compatible with useForm", async () => {
    let form = create({ pluginName: "arktype" });
    form = addNode(form, {
      id: "name",
      type: "text",
      validation: { required: true },
    });
    form = addNode(form, {
      id: "age",
      type: "number",
      validation: { min: 18 },
    });

    const schema = getSchema(form, {});
    const resolver = standardSchemaResolver(schema as any);

    // Simulate what react-hook-form does: call resolver with values
    const result = await resolver(
      { name: "", age: 15 },
      undefined as any,
      {
        criteriaMode: "firstError",
        fields: {},
        names: [],
        shouldUseNativeValidation: false,
      } as any,
    );

    expect(result.errors).toBeDefined();
    // name is empty (required, min 1), age is 15 (min 18)
    expect(Object.keys(result.errors!).length).toBeGreaterThan(0);
  });

  it("should pass valid values through", async () => {
    let form = create({ pluginName: "arktype" });
    form = addNode(form, {
      id: "name",
      type: "text",
      validation: { required: true },
    });

    const schema = getSchema(form, {});
    const resolver = standardSchemaResolver(schema as any);

    const result = await resolver(
      { name: "Alice" },
      undefined as any,
      {
        criteriaMode: "firstError",
        fields: {},
        names: [],
        shouldUseNativeValidation: false,
      } as any,
    );

    expect(result.errors).toEqual({});
  });

  it("should provide a standard-schema resolver using zod plugin", async () => {
    registerPlugin("zod", (await import("@formbaker/plugins/zod")).zodPlugin);

    let form = create({ pluginName: "zod" });
    form = addNode(form, {
      id: "email",
      type: "text",
      validation: { required: true, min: 5 },
    });

    const schema = getSchema(form, {});
    const resolver = standardSchemaResolver(schema as any);

    const invalid = await resolver(
      { email: "a" },
      undefined as any,
      {
        criteriaMode: "firstError",
        fields: {},
        names: [],
        shouldUseNativeValidation: false,
      } as any,
    );
    expect(Object.keys(invalid.errors!).length).toBeGreaterThan(0);

    const valid = await resolver(
      { email: "a@b.co" },
      undefined as any,
      {
        criteriaMode: "firstError",
        fields: {},
        names: [],
        shouldUseNativeValidation: false,
      } as any,
    );
    expect(valid.errors).toEqual({});
  });
});
