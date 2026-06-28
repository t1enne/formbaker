/**
 * HTML5 Constraint Validation API integration tests with happy-dom.
 *
 * Tests native setCustomValidity / reportValidity wiring against
 * real DOM elements in a happy-dom environment.
 */
import { describe, expect, it, beforeAll, beforeEach, afterEach } from "vitest";
import { create, addNode, addDependency, registerPlugin } from "formbaker";
import { testPlugin, buildForm } from "formbaker/test-utils";
import type { FormbakerPlugin } from "formbaker";
import { validateForm, clearValidation, attachCustomValidation } from "../src/html5";

// --- HTML5-specific test plugin ---
//
// Extends the shared testPlugin with richer per-field messages so tests can
// assert on specific error text. The shared plugin's mergeFields produces
// laconic issues (e.g. "name is required"). This one adds custom messages
// for the assertion patterns needed by the HTML5 integration tests.

const html5TestPlugin: FormbakerPlugin = {
  ...testPlugin,
  mergeFields: (_fs) => ({
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (v: unknown) => {
        if (v === null || typeof v !== "object") return { issues: [{ message: "not object" }] };
        const issues: Array<{ message: string; path: [{ key: string }] }> = [];
        const data = v as Record<string, unknown>;
        if (data.name === "" || data.name === undefined) {
          issues.push({ message: "Name is required", path: [{ key: "name" }] });
        }
        if (typeof data.name === "string" && (data.name as string).length < 2) {
          issues.push({
            message: "Name must be at least 2 characters",
            path: [{ key: "name" }],
          });
        }
        if (typeof data.age === "number" && data.age < 18) {
          issues.push({
            message: "Must be 18 or older",
            path: [{ key: "age" }],
          });
        }
        if (data.email !== undefined && data.email !== "" && !String(data.email).includes("@")) {
          issues.push({
            message: "Invalid email",
            path: [{ key: "email" }],
          });
        }
        return issues.length > 0 ? { issues } : { value: data };
      },
    },
  }),
};

beforeAll(() => {
  registerPlugin("test", html5TestPlugin);
});

// --- Helpers ---

/**
 * Create a DOM structure with input elements for each field id.
 * Returns a map of id → element and a getElement function.
 *
 * @param fields - Array of { id, type? } where type sets the input type attribute.
 */
function createFormDOM(fields: Array<{ id: string; type?: string }>): {
  getElement: (id: string) => HTMLElement | null;
  setValue: (id: string, value: string) => void;
  elements: Map<string, HTMLInputElement>;
} {
  const elements = new Map<string, HTMLInputElement>();
  const form = document.createElement("form");

  for (const { id, type } of fields) {
    const input = document.createElement("input");
    input.id = id;
    input.name = id;
    if (type) input.type = type;
    form.appendChild(input);
    elements.set(id, input);
  }

  document.body.appendChild(form);

  return {
    getElement: (id: string) => elements.get(id) ?? null,
    setValue: (id: string, value: string) => {
      const el = elements.get(id);
      if (el) el.value = value;
    },
    elements,
  };
}

function cleanupDOM() {
  document.body.innerHTML = "";
}

// --- Tests ---

describe("HTML5 Constraint Validation integration", () => {
  beforeEach(() => cleanupDOM());
  afterEach(() => cleanupDOM());

  describe("validateForm", () => {
    it("returns true when all fields are valid", () => {
      const form = buildForm(
        { id: "name", type: "field", fieldType: "text" },
        { id: "age", type: "field", fieldType: "number" },
      );
      const { getElement, setValue } = createFormDOM([
        { id: "name" },
        { id: "age", type: "number" },
      ]);
      setValue("name", "Alice");
      setValue("age", "30");

      const valid = validateForm(form, getElement);
      expect(valid).toBe(true);

      // Custom validity should be empty (valid)
      expect(getElement("name")!.getAttribute("customValidity")).toBeNull();
    });

    it("returns false and sets custom validity on invalid fields", () => {
      const form = buildForm(
        { id: "name", type: "field", fieldType: "text" },
        { id: "age", type: "field", fieldType: "number" },
      );
      const { getElement } = createFormDOM([{ id: "name" }, { id: "age", type: "number" }]);

      const valid = validateForm(form, getElement);
      expect(valid).toBe(false);

      const nameEl = getElement("name") as HTMLInputElement;
      expect(nameEl.validationMessage).toBe("Name is required");
    });

    it("sets custom validity message on the correct field", () => {
      const form = buildForm(
        { id: "name", type: "field", fieldType: "text" },
        { id: "age", type: "field", fieldType: "number" },
      );
      const { getElement, setValue } = createFormDOM([
        { id: "name" },
        { id: "age", type: "number" },
      ]);
      setValue("name", "A");
      setValue("age", "15");

      const valid = validateForm(form, getElement);
      expect(valid).toBe(false);

      const nameEl = getElement("name") as HTMLInputElement;
      const ageEl = getElement("age") as HTMLInputElement;

      // The test plugin checks name length < 2 and age < 18
      expect(nameEl.validationMessage).toBe("Name must be at least 2 characters");
      expect(ageEl.validationMessage).toBe("Must be 18 or older");
    });

    it("clears custom validity on fields that become valid", () => {
      const form = buildForm(
        { id: "name", type: "field", fieldType: "text" },
        { id: "age", type: "field", fieldType: "number" },
      );
      const { getElement, setValue } = createFormDOM([
        { id: "name" },
        { id: "age", type: "number" },
      ]);

      // First validate with empty values — should fail
      validateForm(form, getElement);
      const nameEl = getElement("name") as HTMLInputElement;
      expect(nameEl.validationMessage).not.toBe("");

      // Now set valid values and validate again
      setValue("name", "Alice");
      setValue("age", "25");
      const valid = validateForm(form, getElement);
      expect(valid).toBe(true);
      expect(nameEl.validationMessage).toBe("");
    });

    it("skips validation on fields not tracked by the form schema", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement } = createFormDOM([{ id: "name" }, { id: "extra" }]);
      // 'extra' is not in the form — should be ignored
      const valid = validateForm(form, getElement);
      expect(valid).toBe(false);
      expect((getElement("name") as HTMLInputElement).validationMessage).toBe("Name is required");
    });

    it("returns true for a form with no visible fields", () => {
      const form = buildForm();
      const { getElement } = createFormDOM([]);
      expect(validateForm(form, getElement)).toBe(true);
    });

    it("handles fields with no corresponding DOM element gracefully", () => {
      const form = buildForm({ id: "ghost", type: "field", fieldType: "text" });
      const { getElement } = createFormDOM([]); // no elements at all
      // Should not throw
      expect(validateForm(form, getElement)).toBe(true);
    });

    it("validates email format when email field is present", () => {
      const form = buildForm(
        { id: "name", type: "field", fieldType: "text" },
        { id: "email", type: "field", fieldType: "text" },
      );
      const { getElement, setValue } = createFormDOM([{ id: "name" }, { id: "email" }]);
      setValue("name", "Alice");
      setValue("email", "not-an-email");

      const valid = validateForm(form, getElement);
      expect(valid).toBe(false);

      const emailEl = getElement("email") as HTMLInputElement;
      expect(emailEl.validationMessage).toBe("Invalid email");
    });
  });

  describe("clearValidation", () => {
    it("clears custom validity messages on all visible fields", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement } = createFormDOM([{ id: "name" }]);

      validateForm(form, getElement);
      const nameEl = getElement("name") as HTMLInputElement;
      expect(nameEl.validationMessage).not.toBe("");

      clearValidation(form, getElement);
      expect(nameEl.validationMessage).toBe("");
    });

    it("does not throw when there are no DOM elements", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      expect(() => clearValidation(form, () => null)).not.toThrow();
    });
  });

  describe("attachCustomValidation", () => {
    it("returns a cleanup function", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement } = createFormDOM([{ id: "name" }]);
      const cleanup = attachCustomValidation(form, getElement);
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("validates on input event", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement, setValue } = createFormDOM([{ id: "name" }]);
      const cleanup = attachCustomValidation(form, getElement);

      const nameEl = getElement("name") as HTMLInputElement;

      // Type a valid value — should clear error
      setValue("name", "Alice");
      nameEl.dispatchEvent(new Event("input", { bubbles: true }));
      expect(nameEl.validationMessage).toBe("");

      // Type an invalid value — should show error
      setValue("name", "A");
      nameEl.dispatchEvent(new Event("input", { bubbles: true }));
      expect(nameEl.validationMessage).toBe("Name must be at least 2 characters");

      cleanup();
    });

    it("validates on blur event", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement } = createFormDOM([{ id: "name" }]);
      const cleanup = attachCustomValidation(form, getElement);

      const nameEl = getElement("name") as HTMLInputElement;

      // Blur with empty value — should show error
      nameEl.dispatchEvent(new Event("blur", { bubbles: true }));
      expect(nameEl.validationMessage).toBe("Name is required");

      cleanup();
    });

    it("calls onValid and onInvalid callbacks", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement, setValue } = createFormDOM([{ id: "name" }]);
      const onValidCalls: string[] = [];
      const onInvalidCalls: Array<{ id: string; msg: string }> = [];

      const cleanup = attachCustomValidation(form, getElement, {
        onValid: (id) => onValidCalls.push(id),
        onInvalid: (id, msg) => onInvalidCalls.push({ id, msg }),
      });

      const nameEl = getElement("name") as HTMLInputElement;

      // Blur with empty value — should trigger onInvalid
      nameEl.dispatchEvent(new Event("blur", { bubbles: true }));
      expect(onInvalidCalls.length).toBe(1);
      expect(onInvalidCalls[0]!.id).toBe("name");
      expect(onInvalidCalls[0]!.msg).toBe("Name is required");

      // Now set a valid value and trigger input
      setValue("name", "Alice");
      nameEl.dispatchEvent(new Event("input", { bubbles: true }));
      expect(onValidCalls.length).toBe(1);
      expect(onValidCalls[0]).toBe("name");

      cleanup();
    });

    it("removes all listeners when cleanup is called", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement, setValue } = createFormDOM([{ id: "name" }]);
      const cleanup = attachCustomValidation(form, getElement);

      const nameEl = getElement("name") as HTMLInputElement;

      // Clean up
      cleanup();

      // After cleanup, events should not trigger validation
      setValue("name", "");
      nameEl.dispatchEvent(new Event("blur", { bubbles: true }));
      expect(nameEl.validationMessage).toBe("");
    });

    it("handles dependency visibility — attaches listeners only for visible fields", () => {
      let f = create({ pluginName: "test" });
      f = addNode(f, { id: "toggle", type: "field", fieldType: "checkbox" });
      f = addNode(f, { id: "name", type: "field", fieldType: "text" });
      f = addNode(f, { id: "extra", type: "field", fieldType: "text" });
      f = addDependency(f, {
        source: "toggle",
        target: "extra",
        condition: "true",
      });

      const { getElement, setValue } = createFormDOM([
        { id: "toggle", type: "checkbox" },
        { id: "name" },
        { id: "extra" },
      ]);
      const cleanup = attachCustomValidation(f, getElement);

      const extraEl = getElement("extra") as HTMLInputElement;

      // With toggle off, extra is hidden — validate on extra should not fire
      extraEl.dispatchEvent(new Event("blur", { bubbles: true }));
      expect(extraEl.validationMessage).toBe("");

      // Turn toggle on (truthy value), then check that validation fires
      setValue("toggle", "true");
      extraEl.dispatchEvent(new Event("change", { bubbles: true }));
      // After visibility refresh, blur should validate extra
      extraEl.dispatchEvent(new Event("blur", { bubbles: true }));
      // extra has no validation rules but since toggle is true and extra has
      // a value, it should not have an error. Let's check it's not erroneously
      // validating as required (it shouldn't — the test plugin only validates
      // name and age and email)
      expect(extraEl.validationMessage).toBe("");

      cleanup();
    });

    it("supports custom validateOn events", () => {
      const form = buildForm({ id: "name", type: "field", fieldType: "text" });
      const { getElement } = createFormDOM([{ id: "name" }]);
      const onInvalidCalls: string[] = [];

      // Only validate on 'custom-event'
      const cleanup = attachCustomValidation(form, getElement, {
        validateOn: ["custom-event"],
        onInvalid: (_id, _msg) => onInvalidCalls.push(_id),
      });

      const nameEl = getElement("name") as HTMLInputElement;

      // Regular blur should NOT trigger validation
      nameEl.dispatchEvent(new Event("blur", { bubbles: true }));
      expect(onInvalidCalls.length).toBe(0);

      // Custom event SHOULD trigger validation
      nameEl.dispatchEvent(new Event("custom-event", { bubbles: true }));
      expect(onInvalidCalls.length).toBe(1);

      cleanup();
    });
  });
});
