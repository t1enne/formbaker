import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  Formbaker,
  FormResult,
  FormbakerDependency,
  PlainObject,
  FormbakerSection,
  PositionedNode,
  PositionedSection,
  PositionedField,
  FormbakerPlugin,
} from "./types";
import {
  isEqualDepencency,
  invariant,
  omit,
  sortBy,
  shouldInclude,
} from "./utils";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

const pluginRegistry = new Map<string, FormbakerPlugin>();

export const registerPlugin = (name: string, plugin: FormbakerPlugin): void => {
  pluginRegistry.set(name, plugin);
};

const resolvePlugin = (name: string): FormbakerPlugin => {
  const plugin = pluginRegistry.get(name);
  if (!plugin) throw new Error(`Unknown plugin: "${name}"`);
  return plugin;
};

const create = <S extends PlainObject, T extends Formbaker<S>>(
  params: Partial<T> = {},
): T => {
  invariant(params.pluginName, "pluginName is required");
  return {
    id: params.id ?? Date.now().toString(),
    label: params.label ?? "",
    fields: params.fields ?? {},
    sections: params.sections ?? {},
    dependencies: params.dependencies ?? {
      forward: {},
      backward: {},
    },
    pluginName: params.pluginName,
  } as T;
};

const addNode = <T extends Formbaker>(
  form: T,
  field: Partial<T["fields"][string]> & Pick<T["fields"][string], "id">,
): T => {
  invariant(!form.fields[field.id], `Duplicate field id ${field.id}`);
  const l =
    Object.keys(form.fields).length + Object.keys(form.sections).length + 1;
  return {
    ...form,
    fields: {
      ...form.fields,
      [field.id]: {
        ...field,
        order: l,
        type: field.type ?? "text",
      } as T["fields"][string],
    },
  };
};

const addDependency = <T extends Formbaker>(
  form: T,
  dep: FormbakerDependency,
): T => {
  const { target, source } = dep;
  const isSection = (id: string) => Object.keys(form.sections).includes(id);

  invariant(!isSection(source), "Cannot introduce relations from a section");

  invariant(target !== "" && source !== "", "Empty target/source ids");
  invariant(
    !isCyclical(form.dependencies, dep),
    "Cannot introduce cyclical dependency",
  );

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

const removeDependency = <
  T extends Pick<Formbaker, "fields" | "dependencies" | "sections">,
>(
  form: T,
  dependency: FormbakerDependency,
): T => {
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

const removeNode = <T extends Formbaker>(
  form: T,
  nodeId: string,
): [T, boolean] => {
  const forward = form.dependencies.forward[nodeId] || [];
  if (forward.length) {
    return [form, false];
  }

  const fields = omit(form.fields, [nodeId]);

  const toRemove = Object.values(form.dependencies.forward)
    .flat()
    .filter((d) => d.target === nodeId || d.source === nodeId);

  let deps = form.dependencies;
  for (const d of toRemove) {
    const { target, source } = d;
    deps = {
      forward: {
        ...deps.forward,
        [source]: (deps.forward[source] ?? []).filter(
          (dep) => !isEqualDepencency(d, dep),
        ),
      },
      backward: {
        ...deps.backward,
        [target]: (deps.backward[target] ?? []).filter(
          (dep) => !isEqualDepencency(d, dep),
        ),
      },
    };
  }

  return [{ ...form, fields, dependencies: deps }, true];
};

const addSection = <T extends Formbaker>(
  form: T,
  section: Partial<FormbakerSection> & Pick<FormbakerSection, "id">,
): T => {
  invariant(section.id[0] == "#", "Section id must start with #");
  invariant(!form.sections[section.id], "Duplicate section id");
  const l =
    Object.keys(form.fields).length + Object.keys(form.sections).length + 1;

  return {
    ...form,
    sections: {
      ...form.sections,
      [section.id]: {
        ...section,
        order: l,
      },
    },
  };
};

const removeSection = <T extends Formbaker>(form: T, sectionId: string): T => {
  const section = form.sections[sectionId];
  invariant(section?.id, `No section ${sectionId}`);
  return {
    ...form,
    sections: omit(form.sections, [sectionId]),
  };
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
    fields: {} as T["fields"],
    dependencies: { forward: {}, backward: {} },
  };
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
  for (const id in form.fields) {
    const field = form.fields[id]!;
    if (!shouldInclude(form, field, values, plugin.evaluateCondition)) continue;
    // Skip optional fields with no current value to avoid arktype's
    // exactOptionalPropertyTypes requiring the key to be present.
    const isOptional = !field.validation?.required;
    if (isOptional && values[id] === undefined) continue;
    merged[id] = plugin.field(field, values);
  }
  return plugin.mergeFields(merged);
};

const formbakerResolver =
  (formbaker: Formbaker) =>
  (...args: any[]) => {
    const values = args[0];
    const schema = getSchema(formbaker, values as Record<string, unknown>);
    return standardSchemaResolver(schema as any)(...(args as [any, any, any]));
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
      const field = form.fields[id];
      invariant(field, `No field found for id: ${id}`);
      return {
        type,
        id,
        node: { ...field, order: order + 1 },
        position: { x: 0, y: 0 },
      } satisfies PositionedField<S>;
    }
    if (type === "_section") {
      const section = form.sections[id];
      invariant(section, `No section found for id: ${id}`);
      return {
        type,
        id,
        section: { ...section, order: order + 1 },
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

  const allIds = getSortedNodes(form);
  const activeIdx = allIds.findIndex((n) => n.id === nodeId);
  const overIdx = allIds.findIndex((n) => n.id === targetNodeId);
  invariant(activeIdx !== -1, "Active node not found in sorted list");
  invariant(overIdx !== -1, "Target node not found in sorted list");

  const sorted = [...allIds];
  const [activeNode] = sorted.splice(activeIdx, 1);
  const insertAfterIdx = activeIdx < overIdx ? overIdx - 1 : overIdx;
  sorted.splice(insertAfterIdx + 1, 0, activeNode!);

  let newFields = form.fields;
  let newSections = form.sections;
  sorted.forEach((item, idx) => {
    const newOrder = idx + 1;
    if (item.id in form.fields) {
      const entry = form.fields[item.id]!;
      if (entry.order !== newOrder) {
        newFields = { ...newFields, [item.id]: { ...entry, order: newOrder } };
      }
    } else if (item.id in form.sections) {
      const entry = form.sections[item.id]!;
      if (entry.order !== newOrder) {
        newSections = {
          ...newSections,
          [item.id]: { ...entry, order: newOrder },
        };
      }
    }
  });

  return { ...form, fields: newFields, sections: newSections };
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
  moveNode,
};
