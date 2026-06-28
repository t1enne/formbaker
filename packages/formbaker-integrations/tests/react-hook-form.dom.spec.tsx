/**
 * React Hook Form integration tests with happy-dom.
 *
 * Tests resolver validation directly and field visibility via
 * rendered React components using useFormbakerForm.
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { create, addNode, addDependency, registerPlugin, getSchema } from "formbaker";
import type { Formbaker } from "formbaker";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import * as React from "react";

// --- React test component ---
import { useFormbakerForm } from "../src/react-hook-form";

/**
 * Renders fields with conditional visibility based on the formbaker schema.
 *
 * Uses React.useState for the visibility values (not RHF watch) so the
 * isInSchema check in useFormbakerForm re-evaluates when the toggle changes.
 */
function TestForm({ form }: { form: Formbaker }) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const { register, isInSchema } = useFormbakerForm(form, values);

  const handleToggle = () => {
    setValues((prev) => ({ ...prev, showExtra: !prev.showExtra }));
  };

  return (
    <form>
      <label>
        <input
          type="checkbox"
          onChange={handleToggle}
          checked={!!values.showExtra}
          data-testid="toggle"
        />
        Show extra
      </label>

      <label>
        Name:
        <input {...register("name")} data-testid="name" />
      </label>

      {isInSchema("extra") && (
        <label>
          Extra:
          <input {...register("extra")} data-testid="extra" />
        </label>
      )}
    </form>
  );
}

/** Build an arktype form with name (required) and age (min:18). */
function buildResolverForm() {
  let f = create({ pluginName: "arktype" });
  f = addNode(f, {
    id: "name",
    type: "field",
    fieldType: "text",
    validation: { required: true },
  });
  f = addNode(f, {
    id: "age",
    type: "field",
    fieldType: "number",
    validation: { min: 18 },
  });
  return f;
}

function makeResolver(form: Formbaker) {
  return standardSchemaResolver(getSchema(form, {}) as any);
}

/** resolver() call context — shared boilerplate. */
async function resolve(
  resolver: ReturnType<typeof standardSchemaResolver>,
  data: Record<string, unknown>,
) {
  return resolver(
    data,
    undefined as any,
    {
      criteriaMode: "firstError" as const,
      fields: {},
      names: [],
      shouldUseNativeValidation: false,
    } as any,
  );
}

/** Build arktype form: showExtra (checkbox) → extra (text) visibility dep. */
function buildVisibilityForm() {
  let f = create({ pluginName: "arktype" });
  f = addNode(f, { id: "showExtra", type: "field", fieldType: "checkbox" });
  f = addNode(f, { id: "name", type: "field", fieldType: "text" });
  f = addNode(f, { id: "extra", type: "field", fieldType: "text" });
  f = addDependency(f, {
    source: "showExtra",
    target: "extra",
    condition: "true",
  });
  return f;
}

describe("react-hook-form integration", () => {
  beforeAll(async () => {
    registerPlugin("arktype", (await import("@formbaker/plugins/arktype")).arktypePlugin);
  });

  afterEach(() => {
    cleanup();
  });

  describe("resolver validation", () => {
    it("validates against arktype schema — fails with invalid values", async () => {
      const result = await resolve(makeResolver(buildResolverForm()), {
        name: "",
        age: 15,
      });
      expect(result.errors).toBeDefined();
      expect(result.errors!.name).toBeDefined();
    });

    it("validates against arktype schema — passes with valid values", async () => {
      const result = await resolve(makeResolver(buildResolverForm()), {
        name: "Alice",
        age: 25,
      });
      expect(result.errors).toEqual({});
      expect(result.values).toEqual({ name: "Alice", age: 25 });
    });
  });

  describe("field visibility via rendered component", () => {
    it("hides field when dependency condition is not met", () => {
      const form = buildVisibilityForm();
      render(<TestForm form={form} />);
      expect(screen.queryByTestId("extra")).toBeNull();
      expect(screen.getByTestId("name")).toBeDefined();
    });

    it("shows field after toggling the dependency condition", () => {
      const form = buildVisibilityForm();
      render(<TestForm form={form} />);
      fireEvent.click(screen.getByTestId("toggle"));
      expect(screen.getByTestId("extra")).toBeDefined();
    });

    it("hides field again after toggling back", () => {
      const form = buildVisibilityForm();
      render(<TestForm form={form} />);
      fireEvent.click(screen.getByTestId("toggle"));
      fireEvent.click(screen.getByTestId("toggle"));
      expect(screen.queryByTestId("extra")).toBeNull();
    });
  });
});
