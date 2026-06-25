import {
  Formbaker,
  FormbakerDependency,
  FormbakerField,
  FormbakerSection,
} from "./types";

/** Signature for a plugin's dependency evaluation. */
type EvaluateCondition = (condition: unknown, value: unknown) => boolean;

/**
 * This works assuming that relationships between fields are within a section
 * or field -> section.
 * Won't work if we attempt to connect a field from one section to a field
 * in another section.
 */

/**
 * Checks if a node should be included based on its backward dependencies.
 * Dependency conditions are evaluated via the plugin's evaluateCondition callback.
 */
const shouldInclude = (
  form: Formbaker,
  node: FormbakerField | FormbakerSection,
  value: Record<string, unknown> | undefined,
  evaluateCondition?: EvaluateCondition,
) => {
  if (!node) {
    return false;
  }
  const deps = form.dependencies.backward[node.id];
  if (!deps || deps.length === 0) {
    return true;
  }
  if (value === undefined || !evaluateCondition) {
    return true;
  }
  // WARN: evaluate whether OR or AND should be used here
  return deps.some((d) => evaluateCondition(d.condition, value[d.source]));
};

const isEqualDepencency = (a: FormbakerDependency, b: FormbakerDependency) => {
  if (a.source !== b.source) {
    return false;
  }
  if (a.target !== b.target) {
    return false;
  }
  if (a.condition !== b.condition) {
    return false;
  }
  return true;
};

// --- Replacing es-toolkit functions ---

/** Assertion: throws if condition is falsy. */
function invariant(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? "Invariant failed");
  }
}

/** Checks if value is strictly undefined. */
function isUndefined(x: unknown): x is undefined {
  return x === void 0;
}

/** Creates a new object with specified keys omitted. */
function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const result: Record<string, unknown> = { ...obj };
  for (const key of keys) {
    delete result[key as string];
  }
  return result as unknown as Omit<T, K>;
}

/**
 * Sorts an array by iteratee functions or property keys (ascending).
 * Returns a new array; does not mutate the original.
 */
function sortBy<T>(
  arr: T[],
  criteria: Array<((item: T) => unknown) | keyof T>,
): T[] {
  return arr.slice().sort((a, b) => {
    for (let i = 0; i < criteria.length; i++) {
      const criterion = criteria[i]!;
      const fn: (item: T) => unknown =
        typeof criterion === "function"
          ? (criterion as (item: T) => unknown)
          : (item: T) => item[criterion as keyof T];
      const va = fn(a);
      const vb = fn(b);
      if (va != null && vb != null) {
        if (va < vb) return -1;
        if (va > vb) return 1;
      }
    }
    return 0;
  });
}

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && !Number.isNaN(v);

export {
  shouldInclude,
  isEqualDepencency,
  invariant,
  isUndefined,
  omit,
  sortBy,
  isNumber,
};
