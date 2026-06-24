import { type } from "arktype";
import {
  Formbaker,
  FormResult,
  FormbakerDependency,
  PlainObject,
  FormbakerSection,
  PositionedNode,
  PositionedSection,
  PositionedField,
} from "./types";
import { isEqualDepencency, toFormSchema } from "./utils";
import { invariant, merge, omit, sortBy } from "es-toolkit";
import { arktypeResolver } from "@hookform/resolvers/arktype";
import dagre from "@dagrejs/dagre";
import type { formbakerErrors } from "@/consts/formbaker-errors";

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 100;

const create = <S extends PlainObject, T extends Formbaker<S>>(
  params: Partial<T> = {},
): T => {
  return {
    id: params.id ?? Date.now().toString(),
    label: params.label ?? {},
    fields: params.fields ?? {},
    sections: params.sections ?? {},
    dependencies: params.dependencies ?? {
      forward: {},
      backward: {},
    },
  } as T;
};

const addNode = <T extends Formbaker>(
  form: T,
  field: Partial<T["fields"][string]> & Pick<T["fields"][string], "id">,
): T => {
  invariant(!form.fields[field.id], `Duplicate field id ${field.id}`);
  const l =
    Object.keys(form.fields).length + Object.keys(form.sections).length + 1;
  form.fields[field.id] = { ...field, order: l, type: field.type ?? "text" };

  return form;
};

const addDependency = <T extends Formbaker>(form: T, dep: FormbakerDependency): T => {
  const { target, source } = dep;
  const isSection = (id: string) => Object.keys(form.sections).includes(id);

  invariant(!isSection(source), "Cannot introduce relations from a section");

  invariant(target !== "" && source !== "", "Empty target/source ids");
  invariant(
    !isCyclical(form.dependencies, dep),
    "Cannot introduce cyclical dependency",
  );

  // Add to forward map
  const forwardMap =
    form.dependencies.forward[source] ?? ([] as FormbakerDependency[]);
  forwardMap.push(dep);

  // Add to backward map
  const backwardMap =
    form.dependencies.backward[target] ?? ([] as FormbakerDependency[]);
  backwardMap.push(dep);

  form.dependencies.forward[source] = forwardMap;
  form.dependencies.backward[target] = backwardMap;

  return form;
};

const removeDependency = <
  T extends Pick<Formbaker, "fields" | "dependencies" | "sections">,
>(
  form: T,
  dependency: FormbakerDependency,
) => {
  const { target, source } = dependency;
  // Add to forward map
  const forwardMap =
    form.dependencies.forward[source] ?? ([] as FormbakerDependency[]);

  // Add to backward map
  const backwardMap =
    form.dependencies.backward[target] ?? ([] as FormbakerDependency[]);
  // find the idx to remove
  const fidx = forwardMap.findIndex((d) => isEqualDepencency(dependency, d));
  const bidx = backwardMap.findIndex((d) => isEqualDepencency(dependency, d));

  form.dependencies.forward[source] = forwardMap.toSpliced(fidx, 1);
  form.dependencies.backward[target] = backwardMap.toSpliced(bidx, 1);

  return form;
};

const removeNode = <T extends Formbaker>(
  form: T,
  nodeId: string,
): [T, boolean] => {
  const forward = form.dependencies.forward[nodeId] || [];
  if (forward.length) {
    return [form, false];
  }
  form.fields = omit(form.fields, [nodeId]);
  Object.values(form.dependencies.forward)
    .flat()
    .filter((d) => d.target === nodeId || d.source === nodeId)
    .forEach((d) => removeDependency(form, d));

  return [form, true];
};

const addSection = <T extends Formbaker>(
  form: T,
  section: Partial<FormbakerSection> & Pick<FormbakerSection, "id">,
) => {
  invariant(section.id[0] == "#", "Section id must start with #");
  invariant(!form.sections[section.id], "Duplicate section id");
  const l =
    Object.keys(form.fields).length + Object.keys(form.sections).length + 1;
  form.sections = merge(form.sections, {
    [section.id]: {
      ...section,
      order: l,
    },
  });

  return form;
};

const removeSection = <T extends Formbaker>(form: T, sectionId: string) => {
  const section = form.sections[sectionId];
  invariant(section.id, `No section ${sectionId}`);
  form.sections = omit(form.sections, [sectionId]);
  return form;
};

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
  const schema = getSchema(form, values);
  const validatorfn = type(schema);
  const out = validatorfn(values) as T | type.errors;
  return out instanceof type.errors
    ? { success: false, data: out.summary, schema }
    : { success: true, data: out, schema };
};

const clearForm = <T extends Formbaker>(form: T): T => {
  form.fields = {};
  form.dependencies = { forward: {}, backward: {} };
  return form;
};

const getSchema = <T extends Formbaker>(
  form: T,
  values: any,
  formbakerErrs?: typeof formbakerErrors,
) => {
  return Object.values(form.fields)
    .map(toFormSchema(form, values, formbakerErrs))
    .reduce((a, c) => merge(a, c), {});
};

const formbakerResolver =
  (formbaker: Formbaker) =>
  (...args: any[]) => {
    const values = args[0];
    console.debug(values);
    const schema = getSchema(formbaker, values);
    return arktypeResolver(schema)(...(args as [any, any, any]));
  };

const getSortedNodes = <S extends PlainObject, T extends Formbaker<S>>(
  form: T,
): Array<PositionedNode<S>> => {
  const unsorted: Array<{ id: string; type: "_section" | "_node" }> = [];

  for (const id in form.sections) {
    unsorted.push({ id, type: "_section" });
  }

  for (const id in form.fields) {
    unsorted.push({ id, type: "_node" });
  }

  const getOrder = (id: string) =>
    (form.fields[id] ?? form.sections[id])?.order ?? 0;

  const sorted = sortBy(unsorted, [(n) => getOrder(n.id)]);

  const getPositionedNode = (
    { id, type }: (typeof sorted)[number],
    order: number,
  ): PositionedNode<S> => {
    if (type === "_node") {
      return {
        type,
        id,
        node: merge(form.fields[id], { order: order + 1 }),
        position: { x: 0, y: 0 },
      } satisfies PositionedField<S>;
    }
    if (type === "_section") {
      const section = form.sections[id];
      return {
        type,
        id,
        section: merge(section, { order: order + 1 }),
        position: { x: 0, y: 0 },
      } satisfies PositionedSection;
    }
    throw new Error(`unrecognized node type: ${type}`);
  };

  return sorted.map(getPositionedNode);
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

const layoutedGraph = (f: Formbaker, rankdir = "TB") => {
  const nodes = Object.values(f.fields);
  const edges = Object.values(f.dependencies.forward).flat();
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir,
    nodesep: 150, // Horizontal spacing between nodes (default is 50)
    ranksep: 200, // Vertical spacing between nodes (default is 50)
    edgesep: 50, // Spacing between edges
    marginx: 50, // Margin on the x-axis
    marginy: 50, // Margin on the y-axis
  });
  graph.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });
  dagre.layout(graph);
  const positionedNodes = nodes.map((node) => {
    const nodeWithPosition = graph.node(node.id);
    const position = {
      x: nodeWithPosition.x - NODE_WIDTH / 2,
      y: nodeWithPosition.y - NODE_HEIGHT / 2,
    };
    return { ...node, position };
  });

  return { nodes: positionedNodes, edges };
};

const moveNode = <T extends Formbaker>(
  form: T,
  nodeId: string,
  targetNodeId: string,
): T => {
  const node = form.fields[nodeId] ?? form.sections[nodeId];
  const target = form.fields[targetNodeId] ?? form.sections[targetNodeId];
  invariant(node, "no such node");
  invariant(target, "no such node");
  invariant(nodeId !== targetNodeId, "Cannot move a node to itself");

  // Build sorted list of all items (nodes + sections)
  const allIds = getSortedNodes(form);
  const activeIdx = allIds.findIndex((n) => n.id === nodeId);
  const overIdx = allIds.findIndex((n) => n.id === targetNodeId);
  invariant(activeIdx !== -1, "Active node not found in sorted list");
  invariant(overIdx !== -1, "Target node not found in sorted list");

  // Remove active from its position, insert after over
  const active = allIds.splice(activeIdx, 1)[0]!;
  // If we removed an item before overIdx, adjust the index
  const insertAfterIdx = activeIdx < overIdx ? overIdx - 1 : overIdx;
  allIds.splice(insertAfterIdx + 1, 0, active);

  // Reindex order values: 1-based sequential
  allIds.forEach((item, idx) => {
    const entry = form.fields[item.id] ?? form.sections[item.id];
    if (entry) {
      entry.order = idx + 1;
    }
  });

  return form;
};

export {
  create,
  addNode,
  addDependency,
  addSection,
  removeDependency,
  removeNode,
  removeSection,
  validate,
  clearForm,
  getSchema,
  formbakerResolver,
  getSortedNodes,
  getOrderingMap,
  layoutedGraph,
  moveNode,
};
