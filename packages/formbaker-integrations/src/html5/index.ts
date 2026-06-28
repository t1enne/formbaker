/**
 * HTML5 Constraint Validation API integration for Formbaker.
 *
 * Bridges a Formbaker form definition into the browser's native
 * `setCustomValidity` / `reportValidity` system so form elements
 * show native validation bubbles powered by Formbaker schemas.
 *
 * No framework dependency — works with plain HTML forms. Just
 * provide a getter that maps field IDs to their DOM elements.
 *
 * @example
 * ```ts
 * import { attachCustomValidation, validateForm } from "@formbaker/integrations/html5";
 *
 * const getEl = (id: string) => document.getElementById(id) as HTMLInputElement;
 *
 * // Live validation on blur/input
 * const cleanup = attachCustomValidation(form, getEl);
 *
 * // Or validate explicitly on submit
 * formEl.addEventListener("submit", (e) => {
 *   e.preventDefault();
 *   if (validateForm(form, getEl)) {
 *     // submit data
 *   }
 * });
 * ```
 */
import { getSchema, createVisibilityChecker } from "formbaker";
import type { Formbaker } from "formbaker";
import type { StandardSchemaV1 } from "@standard-schema/spec";

// --- Types ---

export interface AttachOptions {
  /** Event types that trigger field-level validation. Default: ["blur", "input"]. */
  validateOn?: string[];
  /** Called when a field passes validation. */
  onValid?: (fieldId: string) => void;
  /** Called when a field fails validation. */
  onInvalid?: (fieldId: string, message: string) => void;
}

/**
 * Type guard: checks if an HTMLElement has the native constraint validation API.
 */
const isValidityElement = (el: HTMLElement | null): el is HTMLInputElement =>
  el !== null && "setCustomValidity" in el && "validity" in el;

/**
 * Collect current values from the DOM elements for all visible fields.
 * Only reads elements that have a `value` property (input, select, textarea).
 *
 * Coerces types based on the field's type attribute:
 * - `number` fields: parsed to Number (empty string → undefined)
 * - `checkbox` fields: read via `.checked`
 * - Everything else: string value
 */
const collectValues = (
  form: Formbaker,
  getElement: (fieldId: string) => HTMLElement | null,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const id of Object.keys(form.nodes)) {
    const el = getElement(id);
    if (!el || !("value" in el)) continue;
    const input = el as HTMLInputElement;
    if (input.type === "number") {
      values[id] = input.value === "" ? undefined : Number(input.value);
    } else if (input.type === "checkbox") {
      values[id] = input.checked;
    } else {
      values[id] = input.value;
    }
  }
  return values;
};

/**
 * Gather visible field IDs given current DOM values.
 */
const getVisibleFieldIds = (
  form: Formbaker,
  getElement: (fieldId: string) => HTMLElement | null,
): Set<string> => {
  const values = collectValues(form, getElement);
  const isVisible = createVisibilityChecker(form);
  const visible = new Set<string>();
  for (const id of Object.keys(form.nodes)) {
    if (isVisible(id, values)) visible.add(id);
  }
  return visible;
};

// --- Public API ---

/**
 * Validate all visible fields against the Formbaker schema.
 *
 * Calls `setCustomValidity(msg)` on each element — empty string clears
 * the error. Then calls `reportValidity()` on the first invalid element
 * to show the native validation bubble.
 *
 * @param form       - A Formbaker form definition.
 * @param getElement - Function returning the DOM element for a field ID.
 * @returns `true` if all visible fields are valid.
 */
export const validateForm = (
  form: Formbaker,
  getElement: (fieldId: string) => HTMLElement | null,
): boolean => {
  const values = collectValues(form, getElement);
  const schema = getSchema(form, values);
  const result = schema["~standard"].validate(values);

  // Standard Schema allows async validate; Formbaker is sync-only.
  // See the same ponytail in formbaker's engine.ts.
  if (result instanceof Promise) {
    throw new Error("Async validation is not supported in HTML5 integration");
  }

  // Build a map of fieldId → error message from validation issues
  const errorMap = new Map<string, string>();
  if (result.issues) {
    for (const issue of result.issues) {
      // Standard Schema v1 issues have a `path` or use `key` in the issue.
      // Formbaker produces issues with key-like path entries.
      const fieldId = getFieldIdFromIssue(issue, values);
      if (fieldId && !errorMap.has(fieldId)) {
        errorMap.set(fieldId, issue.message);
      }
    }
  }

  // Apply custom validity messages to visible fields
  let allValid = true;
  const visibleIds = getVisibleFieldIds(form, getElement);

  for (const id of visibleIds) {
    const el = getElement(id);
    if (!isValidityElement(el)) continue;
    const msg = errorMap.get(id) ?? "";
    el.setCustomValidity(msg);
    if (msg) allValid = false;
  }

  // Show the native validation bubble on the first invalid field
  if (!allValid) {
    for (const id of visibleIds) {
      const el = getElement(id);
      if (isValidityElement(el) && !el.validity.valid) {
        el.reportValidity();
        break;
      }
    }
  }

  return allValid;
};

/**
 * Clear all custom validity messages on visible fields.
 *
 * Call this before re-validating to reset the native validation state.
 *
 * @param form       - A Formbaker form definition.
 * @param getElement - Function returning the DOM element for a field ID.
 */
export const clearValidation = (
  form: Formbaker,
  getElement: (fieldId: string) => HTMLElement | null,
): void => {
  const visibleIds = getVisibleFieldIds(form, getElement);
  for (const id of visibleIds) {
    const el = getElement(id);
    if (isValidityElement(el)) {
      el.setCustomValidity("");
    }
  }
};

/**
 * Wire up live validation on form elements using native constraint validation.
 *
 * Listens on the specified events (default: blur and input) for each visible
 * field. On each event, validates only that field against the full schema.
 *
 * @param form       - A Formbaker form definition.
 * @param getElement - Function returning the DOM element for a field ID.
 * @param options    - Configuration options.
 * @returns A cleanup function that removes all event listeners.
 */
export const attachCustomValidation = (
  form: Formbaker,
  getElement: (fieldId: string) => HTMLElement | null,
  options: AttachOptions = {},
): (() => void) => {
  const { validateOn = ["blur", "input"] } = options;
  const listeners = new Map<string, Array<{ event: string; handler: EventListener }>>();

  // Compute visibility and wire up events for visible fields.
  // Re-evaluates visibility on every event so dependency changes are reflected.
  const refresh = () => {
    const values = collectValues(form, getElement);
    const isVisible = createVisibilityChecker(form);

    for (const id of Object.keys(form.nodes)) {
      const el = getElement(id);
      if (!isValidityElement(el)) continue;
      const visible = isVisible(id, values);

      if (visible && !listeners.has(id)) {
        // Attach listeners
        const handlers = validateOn.map((event) => {
          const handler: EventListener = () => {
            validateSingleField(form, getElement, id, options);
          };
          el.addEventListener(event, handler);
          return { event, handler };
        });
        listeners.set(id, handlers);
      } else if (!visible && listeners.has(id)) {
        // Detach listeners
        const handlers = listeners.get(id)!;
        for (const { event, handler } of handlers) {
          el.removeEventListener(event, handler);
        }
        listeners.delete(id);
        // Clear validity on hidden fields so they don't block form submission
        el.setCustomValidity("");
      }
    }
  };

  // Initial wire-up
  refresh();

  // Re-evaluate visibility on common state-changing events
  const refreshEvents = ["change", "input"];
  const globalListeners: Array<{ event: string; handler: EventListener }> = [];
  for (const event of refreshEvents) {
    const handler: EventListener = (e) => {
      // Only refresh when the event target is a field we care about
      const target = e.target as HTMLElement | null;
      if (target && "id" in target && target.id && form.nodes[target.id]) {
        refresh();
      }
    };
    // Attach at document level for simplicity (delegation)
    document.addEventListener(event, handler, true);
    globalListeners.push({ event, handler });
  }

  return () => {
    for (const [id, handlers] of listeners) {
      const el = getElement(id);
      if (el) {
        for (const { event, handler } of handlers) {
          el.removeEventListener(event, handler);
        }
      }
    }
    listeners.clear();
    for (const { event, handler } of globalListeners) {
      document.removeEventListener(event, handler, true);
    }
  };
};

// --- Internal helpers ---

/**
 * Validate a single field and apply the result to its DOM element.
 */
const validateSingleField = (
  form: Formbaker,
  getElement: (fieldId: string) => HTMLElement | null,
  fieldId: string,
  options: AttachOptions,
): void => {
  const el = getElement(fieldId);
  if (!isValidityElement(el)) return;

  const values = collectValues(form, getElement);
  const schema = getSchema(form, values);
  const result = schema["~standard"].validate(values);

  if (result instanceof Promise) return; // skip async, same ponytail as above

  let message = "";
  if (result.issues) {
    for (const issue of result.issues) {
      const id = getFieldIdFromIssue(issue, values);
      if (id === fieldId) {
        message = issue.message;
        break;
      }
    }
  }

  el.setCustomValidity(message);
  if (message) {
    options.onInvalid?.(fieldId, message);
  } else {
    options.onValid?.(fieldId);
  }
};

/**
 * Extract a field ID from a Standard Schema v1 validation issue.
 *
 * Issues carry a `path` array of `PropertyKey | PathSegment` where
 * PathSegment has a `key: PropertyKey`. Formbaker uses the plugin's
 * mergeFields result which typically produces issues keyed by field name.
 */
const getFieldIdFromIssue = (
  issue: StandardSchemaV1.Issue,
  _values: Record<string, unknown>,
): string | undefined => {
  if (issue.path && issue.path.length > 0) {
    const first = issue.path[0];
    if (typeof first === "object" && first !== null && "key" in first) {
      return String(first.key);
    }
    if (typeof first === "string") return first;
    if (typeof first === "number") return String(first);
    // symbol — unlikely from Formbaker's mergeFields, but handle gracefully
  }
  return undefined;
};
