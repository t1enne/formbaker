# Unified Nodes Graph

**Status:** Draft  
**Date:** 2026-06-27

## Problem

Currently `Formbaker` has two separate collections: `fields` (flat record of form fields) and `sections` (flat record of cosmetic grouping markers). Sections cannot hold fields. Dependencies cannot target sections. This prevents conditional section visibility — a common form pattern:

```
Are you a minor? [checkbox]
  Yes → Show "Minors" section with guardian_name, school, etc.
  No  → Show "Adult" section with employer, income, etc.
```

To support this, sections must behave like nodes in the same graph as fields.

## Design

### Data Model

One flat record and one property on each node replace the current `fields` + `sections` + `order` triplet:

```typescript
// Formbaker stores all nodes in one flat map
nodes: Record<string, FormbakerNode>

// Each node optionally references its parent
FormbakerNode = {
  id: string;
  parentId?: string;  // undefined = root-level
  order?: number;     // sibling-local ordering
  label?: string;
  description?: string;
  // + type-specific props (see below)
}
```

**`order`** is sibling-local: two nodes with the same `parentId` are sorted by `order`. The engine maintains this automatically on insertion (append at end) and `moveNode` (splice-and-renumber).

A node has a discriminant `type`:

```typescript
interface BaseNode {
    id: string;
    order?: number; 
    label?: string;
    description?: string;
    meta?: Record<string, unknown>;
};

interface FormbakerField extends BaseNode { 
    type: "field"
    parentId?: string;
    validation?: FormbakerValidation;
    fieldType: keyof FormbakerTypeMap; 
};

interface FormbakerSection extends BaseNode {
    type: "section"
};

type FormbakerNode = FormbakerField | FormbakerSection;
```

Hierarchy is derived at runtime from `parentId`. To get children of a section: `Object.values(form.nodes).filter(n => n.parentId === sectionId).sort(by order)`. This is O(n) — acceptable for typical form sizes (hundreds of nodes, not millions).

### Dependencies

The `dependencies` graph (forward/backward adjacency) stays unchanged:

```typescript
dependencies: {
  forward:  { [sourceId]: FormbakerDependency[] },
  backward: { [targetId]: FormbakerDependency[] }
}
```

**Rules:**
- Source must be a field node (sections have no value to evaluate).
- Target can be any node — field or section.
- Cycle detection walks all node types.

When a section is hidden by dependencies, all its descendant fields are hidden.

### Visibility Logic (`shouldInclude`)

For a **field node**: check its own backward deps AND the backward deps of its parent section. If the parent section is hidden, the field is hidden — regardless of the field's own dependency status.

For a **section node**: check its own backward deps only. (Ancestors don't gate sections further unless we add that later.)

Implementation: walk up via `parentId` pointers. No reverse map needed — just `form.nodes[node.parentId]` repeatedly.

### Ordering (`getSortedNodes`)

1. Build parent→children groups from `parentId` pointers.
2. Sort each group by `order`.
3. DFS walk starting from root-level nodes (`parentId === undefined`).

Produces a flat `PositionedNode[]` for consumers.

`getOrderingMap` assigns section numbers (1, 2, 3) and field numbers (1.1, 1.2, 2.1) from the same DFS walk.

## API Changes

### Removed
- `addSection(form, section)` — replaced by `addNode(form, { type: "section", ... })`
- `removeSection(form, sectionId)` — replaced by `removeNode(form, sectionId)`
- `Formbaker.fields` — replaced by `Formbaker.nodes`
- `Formbaker.sections` — replaced by `Formbaker.nodes`
- `FormbakerSection` type — replaced by `FormbakerNode` with `type: "section"`

### Changed
- `addNode(form, node, opts?)` — optional `{ parentId?: string }`. Sets `order` to sibling count + 1.
- `moveNode(form, nodeId, targetNodeId)` — re-parents `nodeId` under `targetNodeId`'s parent, places after `targetNodeId`. Renumbers siblings.
- `removeNode(form, nodeId)` — recursively removes descendants by walking `parentId` pointers.
- `order` stays as a number but becomes sibling-local (not global). Engine maintains it.

### Unchanged
- `addDependency` / `removeDependency` — same signatures
- `validate` / `getSchema` — same signatures
- `registerPlugin` / plugin interface — plugins still see flat fields
- `getSortedNodes` / `getOrderingMap` — same return types

## Condition DSL Gap

The current dependency system has AND/OR/XOR combinators but no NOT. For the minors example:

```
is_minor=true  → show #minors
is_minor=false → show #adults
```

This cannot be expressed with engine-level combinators alone. Solution: the plugin's `evaluateCondition` handles negation. The test plugin (and real plugins) can support `condition: "false"` meaning "value is falsy." This is a plugin concern, not an engine concern.

```typescript
addDependency(form, { source: "is_minor", target: "#minors",  condition: "true" });   // show when truthy
addDependency(form, { source: "is_minor", target: "#adults",  condition: "false" });  // show when falsy
```

## Files to Modify

| File | Scope |
|------|-------|
| `packages/formbaker/src/types.ts` | New `FormbakerNode`, updated `Formbaker`, removed `FormbakerSection`, updated `PositionedNode` |
| `packages/formbaker/src/engine.ts` | All functions updated. `addSection`/`removeSection` removed. `addNode` gains `parentId`. `removeNode` recursive. `getSortedNodes` DFS walk. `getSchema` iterates nodes. |
| `packages/formbaker/src/utils.ts` | `shouldInclude` with ancestor visibility check (walk `parentId` chain). |
| `packages/formbaker/index.ts` | Exports updated (remove `addSection`/`removeSection`/`FormbakerSection`) |
| `packages/formbaker/tests/*.spec.ts` | All tests updated to new API |
| `packages/formbaker-plugins/*.ts` | Update if they reference removed types |
| `packages/formbaker-integrations/src/*.ts` | Update `form.fields` → `form.nodes`, `form.sections` → `form.nodes` |

## Test Additions

1. Section as dependency target — field shows only when parent section is visible
2. Recursive ancestry — deeply nested field hidden when grandparent section is hidden
3. `addNode` with `parentId` — field added to section's child list
4. `removeNode` on section — cascades to all descendants
5. `moveNode` across parents — node moves from one section to another
6. `getSortedNodes` with nested sections — correct DFS order
7. `getOrderingMap` with nested sections — correct dotted numbering
8. Section IDs must start with `#` (existing invariant, preserved)
9. Cycle detection across mixed node types
10. Root-level fields still work (parentId omitted → `""`)

## Non-Goals
- Lazy loading of section subtrees
- Section-level validation rules
- Sections as dependency sources (sections have no value)
- A separate `children` adjacency record (derived at runtime from `parentId`)
