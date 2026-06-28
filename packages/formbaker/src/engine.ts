import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  Formbaker,
  FormResult,
  FormbakerDependency,
  PlainObject,
  PositionedNode,
  FormbakerNode,
  FormbakerField,
  FormbakerSection,
  FormbakerPlugin,
} from "./types";
import { isEqualDepencency, invariant, omit, shouldInclude, isField, isSection } from "./utils";

const pluginRegistry = new Map<string, FormbakerPlugin>();

export const registerPlugin = (name: string, plugin: FormbakerPlugin): void => {
  invariant(typeof name === "string" && name.length > 0, "Plugin name must be a non-empty string");
  invariant(typeof plugin === "object" && plugin !== null, "Plugin must be an object");
  invariant(typeof plugin.field === "function", "Plugin must implement field(field, values)");
  invariant(typeof plugin.mergeFields === "function", "Plugin must implement mergeFields(fields)");
  invariant(
    typeof plugin.evaluateCondition === "function",
    "Plugin must implement evaluateCondition(condition, value)",
  );
  pluginRegistry.set(name, plugin);
};

const resolvePlugin = (name: string): FormbakerPlugin => {
  const plugin = pluginRegistry.get(name);
  invariant(plugin, `Unknown plugin: "${name}"`);
  return plugin;
};

const create = <S extends PlainObject, T extends Formbaker<S>>(params: Partial<T> = {}): T => {
  invariant(params.pluginName, "pluginName is required");
  const { id, label, nodes, dependencies, pluginName } = params;
  return {
    id: id ?? Date.now().toString(),
    label: label ?? "",
    nodes: (nodes as Record<string, FormbakerNode> | undefined) ?? {},
    dependencies: dependencies ?? {
      forward: {},
      backward: {},
    },
    pluginName: pluginName!,
  } as T;
};

/**
 * Get the sibling-local order for a new node: max existing order among
 * nodes (fields only — sections are always root-level) with the same
 * parentId, plus 1. Returns 1 if no siblings exist.
 */
const nextSiblingOrder = (form: Formbaker, parentId: string | undefined): number => {
  const siblings = Object.values(form.nodes).filter(
    (n): n is FormbakerField => isField(n) && (n.parentId ?? "") === (parentId ?? ""),
  );
  const maxOrder = Math.max(0, ...siblings.map((n) => n.order ?? 0));
  return Math.max(1, maxOrder + 1);
};

/** Build the common (field & section) base properties for a new node. */
const nodeBase = (
  form: Formbaker,
  node: Partial<FormbakerNode> & Pick<FormbakerNode, "id" | "type">,
  parentId?: string,
): {
  id: string;
  type: "field" | "section";
  order: number;
  label?: string;
  description?: string;
  meta?: Record<string, unknown>;
  parentId?: string;
} => ({
  id: node.id,
  type: node.type,
  order: nextSiblingOrder(form, parentId),
  label: node.label,
  description: node.description,
  meta: node.meta,
  // Only fields carry a parentId; sections are always root-level.
  ...(isField(node as FormbakerNode) ? { parentId } : {}),
});

/** Build a full field node from a partial input. */
const fieldNode = (
  form: Formbaker,
  node: Partial<FormbakerNode> & Pick<FormbakerNode, "id" | "type">,
  parentId: string | undefined,
): FormbakerField => {
  // ponytail: Partial<FormbakerNode> doesn't carry fieldType/options/defaultValue
  // because those only exist on FormbakerField. We extract them safely from the
  // partial record. Upgrade path: narrow the input type to Partial<FormbakerField>
  // when the caller statically knows it's a field.
  const extra = node as Record<string, unknown>;
  return {
    ...nodeBase(form, node, parentId),
    type: "field",
    fieldType: (extra.fieldType as FormbakerField["fieldType"]) ?? "text",
    validation: extra.validation as FormbakerField["validation"],
    options: extra.options as FormbakerField["options"],
    defaultValue: extra.defaultValue as FormbakerField["defaultValue"],
  };
};

/** Build a full section node from a partial input. */
const sectionNode = (
  form: Formbaker,
  node: Partial<FormbakerNode> & Pick<FormbakerNode, "id" | "type">,
): FormbakerSection =>
  ({
    ...nodeBase(form, node),
    type: "section",
  }) as FormbakerSection;

const addNode = <T extends Formbaker>(
  form: T,
  node: Partial<FormbakerNode> & Pick<FormbakerNode, "id" | "type">,
): T => {
  invariant(!form.nodes[node.id], `Duplicate node id ${node.id}`);

  const node2 = node as FormbakerNode;
  const parentId = isField(node2) ? node2.parentId : undefined;
  if (isSection(node2)) {
    invariant(node2.id[0] === "#", "Section id must start with #");
  }

  const fullNode: FormbakerNode = isField(node2)
    ? fieldNode(form, node, parentId)
    : sectionNode(form, node); // no nested sections

  return {
    ...form,
    nodes: {
      ...form.nodes,
      [node.id]: fullNode,
    },
  };
};

const addDependency = <T extends Formbaker>(form: T, dep: FormbakerDependency): T => {
  const { target, source } = dep;
  const sourceNode = form.nodes[source];

  invariant(sourceNode, `Source node "${source}" not found`);
  invariant(isField(sourceNode), `Cannot introduce dependencies from a section ("${source}")`);

  invariant(target !== "" && source !== "", "Empty target/source ids");
  invariant(!isCyclical(form.dependencies, dep), "Cannot introduce cyclical dependency");

  const forwardList = [...(form.dependencies.forward[source] ?? []), dep];
  const backwardList = [...(form.dependencies.backward[target] ?? []), dep];

  return {
    ...form,
    dependencies: {
      forward: {
        ...form.dependencies.forward,
        [source]: forwardList,
      },
      backward: {
        ...form.dependencies.backward,
        [target]: backwardList,
      },
    },
  };
};

const removeDependency = <T extends Formbaker>(form: T, dependency: FormbakerDependency): T => {
  const { target, source } = dependency;
  const fwdList = (form.dependencies.forward[source] ?? []).filter(
    (d) => !isEqualDepencency(dependency, d),
  );
  const bwdList = (form.dependencies.backward[target] ?? []).filter(
    (d) => !isEqualDepencency(dependency, d),
  );

  return {
    ...form,
    dependencies: {
      forward: {
        ...form.dependencies.forward,
        [source]: fwdList,
      },
      backward: {
        ...form.dependencies.backward,
        [target]: bwdList,
      },
    },
  };
};

/**
 * Recursively collect all descendant node IDs (including the given nodeId)
 * by walking parentId pointers. Pure — no mutation.
 */
const collectDescendants = (
  nodes: Record<string, FormbakerNode>,
  nodeId: string,
): readonly string[] =>
  Object.values(nodes)
    .filter((n): n is FormbakerField => isField(n) && n.parentId === nodeId)
    .reduce<readonly string[]>(
      (acc, child) => acc.concat(collectDescendants(nodes, child.id)),
      [nodeId],
    );

/** Fold over removed-node IDs to strip all dependency edges that reference them. */
const stripDeps = (
  deps: Formbaker["dependencies"],
  removedIds: readonly string[],
): Formbaker["dependencies"] =>
  removedIds.reduce((acc, rid) => {
    const fwdDeps = acc.forward[rid] ?? [];
    const bwdDeps = acc.backward[rid] ?? [];
    const afterFwd = fwdDeps.reduce(removeDependencyEdge, acc);
    return bwdDeps.reduce(removeDependencyEdge, afterFwd);
  }, deps);

/** Remove a single dependency edge from both adjacency maps. */
const removeDependencyEdge = (
  deps: Formbaker["dependencies"],
  dependency: FormbakerDependency,
): Formbaker["dependencies"] => {
  const { target, source } = dependency;
  return {
    forward: {
      ...deps.forward,
      [source]: (deps.forward[source] ?? []).filter((d) => !isEqualDepencency(dependency, d)),
    },
    backward: {
      ...deps.backward,
      [target]: (deps.backward[target] ?? []).filter((d) => !isEqualDepencency(dependency, d)),
    },
  };
};

const removeNode = <T extends Formbaker>(form: T, nodeId: string): [T, boolean] => {
  const node = form.nodes[nodeId];
  if (!node) return [form, false];

  // Check if this node is a source of any forward dependency
  const forward = form.dependencies.forward[nodeId] ?? [];
  if (forward.length) {
    return [form, false];
  }

  // Collect all descendant IDs (including the node itself)
  const toRemove = collectDescendants(form.nodes, nodeId);
  const deps = stripDeps(form.dependencies, toRemove);
  const nodes = omit(form.nodes, toRemove);

  return [{ ...form, nodes, dependencies: deps }, true];
};

const sortByOrder = (a: FormbakerNode, b: FormbakerNode): number => (a.order ?? 0) - (b.order ?? 0);

const isCyclical = (
  dependencies: Formbaker["dependencies"],
  { target, source }: FormbakerDependency,
  visited = new Set<string>(),
): boolean => {
  if (target === source) {
    return true;
  }
  visited.add(source);
  const forwardDeps = dependencies.forward[target] || [];
  return forwardDeps.some(
    (dep) => visited.has(dep.target) || isCyclical(dependencies, dep, visited),
  );
};

const validate = <T>(form: Formbaker, values: T): FormResult<T> => {
  const schema = getSchema(form, values as Record<string, unknown>);
  const result = schema["~standard"].validate(values);
  if (result instanceof Promise) {
    // Standard Schema allows async validate; Formbaker is sync-only for now.
    // ponytail: sync-only ceiling — if a plugin returns async validate, this will
    // return a misleading success. Upgrade path: make validate() async or throw.
    throw new Error("Async validation plugins are not supported yet");
  }
  if (result.issues) {
    return {
      success: false,
      data: result.issues.map((i) => i.message).join("\n"),
      schema,
    };
  }
  return { success: true, data: result.value as T, schema };
};

const clearForm = <T extends Formbaker>(form: T): T => {
  return {
    ...form,
    nodes: {} as T["nodes"],
    dependencies: { forward: {}, backward: {} },
  };
};

/** Extract field nodes from the nodes map. */
const getFieldNodes = (form: Formbaker): FormbakerField[] => {
  return Object.values(form.nodes).filter((n): n is FormbakerField => isField(n));
};

/**
 * Build a combined object schema from all visible fields.
 *
 * Skips optional fields whose current value is `undefined` — the plugin's
 * mergeFields handles optional-key behavior according to its own conventions.
 */
const getSchema = <T extends Formbaker>(
  form: T,
  values: Record<string, unknown>,
): StandardSchemaV1 => {
  const plugin = resolvePlugin(form.pluginName);
  const merged: Record<string, StandardSchemaV1> = {};
  for (const node of getFieldNodes(form)) {
    if (!shouldInclude(form, node, values, plugin.evaluateCondition)) continue;
    // Skip optional fields with no current value to avoid arktype's
    // exactOptionalPropertyTypes requiring the key to be present.
    const isOptional = !node.validation?.required;
    if (isOptional && values[node.id] === undefined) continue;
    merged[node.id] = plugin.field(node, values);
  }
  return plugin.mergeFields(merged);
};

/**
 * Build a parent→children adjacency from parentId pointers, then DFS walk
 * starting from root-level nodes (no parentId / untracked parent).
 */
const getSortedNodes = <S extends PlainObject, T extends Formbaker<S>>(
  form: T,
): Array<PositionedNode<S>> => {
  const allNodes = Object.values(form.nodes);

  // Partition into roots and children, building adjacency via fold.
  // Only fields can have a parentId; sections are always root-level.
  const childrenByParent = allNodes
    .filter(
      (n) =>
        isField(n) &&
        !!(n as FormbakerField).parentId &&
        !!form.nodes[(n as FormbakerField).parentId!],
    )
    .reduce<Record<string, FormbakerNode[]>>((acc, n) => {
      const pid = (n as FormbakerField).parentId!;
      const group = acc[pid] ? acc[pid].concat(n) : [n];
      acc[pid] = group.toSorted(sortByOrder);
      return acc;
    }, {});

  const rootNodes = allNodes
    .filter((n) => isSection(n) || !isField(n) || !n.parentId || !form.nodes[n.parentId])
    .toSorted(sortByOrder);

  // DFS walk
  const visit = (nodes: FormbakerNode[]): Array<PositionedNode<S>> =>
    nodes.flatMap((node) => {
      const pn: PositionedNode<S> = {
        type: isSection(node) ? "_section" : "_node",
        id: node.id,
        node: node as FormbakerNode & S,
        position: { x: 0, y: 0 },
      };
      const children = childrenByParent[node.id];
      return children ? [pn, ...visit(children)] : [pn];
    });

  return visit(rootNodes);
};

const getOrderingMap = <T extends Formbaker>(form: T) => {
  const sorted = getSortedNodes(form);
  const ordermap = new Map<string, string>();

  let sectionCounter = 0;
  let questionCounter = 0;
  let currentSectionId = "";

  sorted.forEach(({ id, type }) => {
    if (type === "_section") {
      sectionCounter++;
      questionCounter = 0;
      currentSectionId = id;
      ordermap.set(id, `${sectionCounter}`);
    } else if (type === "_node") {
      questionCounter++;
      if (currentSectionId) {
        ordermap.set(id, `${sectionCounter}.${questionCounter}`);
      } else {
        ordermap.set(id, `${questionCounter}`);
      }
    }
  });

  return ordermap;
};

const moveNode = <T extends Formbaker>(form: T, nodeId: string, targetNodeId: string): T => {
  const node = form.nodes[nodeId];
  const target = form.nodes[targetNodeId];
  invariant(node, "no such node");
  invariant(target, "no such node");
  invariant(nodeId !== targetNodeId, "Cannot move a node to itself");

  // Determine new parentId: same parent as the target
  // Only fields can have a parentId; sections stay at root level.
  const newParentId = isField(target) ? target.parentId : undefined;
  const parentKey = newParentId ?? "";

  // All siblings under the same parent (excluding the moving node), sorted
  const siblings = Object.values(form.nodes)
    .filter((n) => isSection(n) || (isField(n) && n.parentId === newParentId))
    .filter((n) => n.id !== nodeId)
    .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Pure insert: slice at insert point, compose new array
  const targetIdx = siblings.findIndex((n) => n.id === targetNodeId);
  const reordered = [...siblings.slice(0, targetIdx + 1), node, ...siblings.slice(targetIdx + 1)];

  // Pure renumber: map to updated nodes, then fold into the nodes record
  const renumbered = reordered.map((n, idx) => {
    const newOrder = idx + 1;
    if ((n.order ?? 0) === newOrder && (!isField(n) || (n.parentId ?? "") === parentKey))
      return [n.id, n] as const;
    // Only fields carry parentId
    const updated = isSection(n)
      ? { ...n, order: newOrder }
      : { ...n, order: newOrder, parentId: newParentId };
    return [n.id, updated] as const;
  });
  const updated = Object.fromEntries(renumbered);

  // Merge back: replace each renumbered node, keep everything else
  return {
    ...form,
    nodes: { ...form.nodes, ...updated },
  };
};

export {
  create,
  addNode,
  addDependency,
  removeDependency,
  removeNode,
  validate,
  clearForm,
  getSchema,
  getSortedNodes,
  getOrderingMap,
  moveNode,
};
