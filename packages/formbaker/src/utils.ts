import { Formbaker, FormbakerDependency, FormbakerNode } from "./types";

/** Signature for a plugin's dependency evaluation. */
type EvaluateCondition = (condition: unknown, value: unknown) => boolean;

/**
 * Checks if a node should be included based on:
 * 1. Its own backward dependencies.
 * 2. The visibility of all ancestor sections (via parentId chain).
 *
 * Dependency conditions are evaluated via the plugin's evaluateCondition callback.
 */
const shouldInclude = (
  form: Formbaker,
  node: FormbakerNode,
  value: Record<string, unknown> | undefined,
  evaluateCondition?: EvaluateCondition,
): boolean => {
  if (!node) {
    return false;
  }

  // Check visibility of each ancestor in the parentId chain.
  // If any ancestor section is hidden, this node is hidden.
  const checkAncestors = (n: FormbakerNode): boolean => {
    if (!n.parentId) return true;
    const parent = form.nodes[n.parentId];
    if (!parent) return true; // parent missing — treat as visible
    // Check the parent's own backward deps
    if (!checkNodeDeps(form, parent, value, evaluateCondition)) return false;
    // Recurse further up
    return checkAncestors(parent);
  };

  return checkNodeDeps(form, node, value, evaluateCondition) && checkAncestors(node);
};

/**
 * Check a single node's own backward dependencies.
 */
const checkNodeDeps = (
  form: Formbaker,
  node: FormbakerNode,
  value: Record<string, unknown> | undefined,
  evaluateCondition?: EvaluateCondition,
): boolean => {
  const deps = form.dependencies.backward[node.id];
  if (!deps || deps.length === 0) {
    return true;
  }
  if (value === undefined || !evaluateCondition) {
    return true;
  }

  // Group dependencies by their combinator type.
  const groups = new Map<string, FormbakerDependency[]>();
  for (const d of deps) {
    const key = d.dependencyType ?? "OR";
    const list = groups.get(key);
    if (list) {
      list.push(d);
    } else {
      groups.set(key, [d]);
    }
  }

  // Each group evaluates internally according to its combinator.
  // Groups are then OR'd together.
  const evalDep = (d: FormbakerDependency) => evaluateCondition(d.condition, value[d.source]);
  for (const [type, group] of groups) {
    switch (type) {
      case "AND":
        if (group.every(evalDep)) return true;
        break;
      case "XOR":
        if (group.filter(evalDep).length === 1) return true;
        break;
      default: // OR
        if (group.some(evalDep)) return true;
        break;
    }
  }

  return false;
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
  if ((a.dependencyType ?? "OR") !== (b.dependencyType ?? "OR")) {
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

/** Creates a new object with specified keys omitted (pure — no delete mutations). */
const omit = <T extends Record<string, unknown>, K extends string>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> => {
  const keySet = new Set<string>(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keySet.has(k)),
  ) as Omit<T, K>;
};

const isNumber = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

export { shouldInclude, isEqualDepencency, invariant, omit, isNumber };
