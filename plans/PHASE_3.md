# PHASE 3: Interactive Form Builder + Live Preview

## Summary
Build the visual form editor (`/app/forms/[id]/edit`) that replaces raw JSON editing
with a three-panel builder: structure tree (left), live preview (center), property
editor (right). Powered by Preact + signals on the client, consuming the `formbaker`
library bundled through Vite/Astro. The builder produces and consumes the same
`Formbaker` JSON schema the engine uses — no translation layer.

---

## Architecture

### Client vs Server Responsibilities

| Layer | Responsibility |
|---|---|
| **Server (Astro SSR)** | Auth check via middleware, load form JSON from DB, serve the edit page shell, handle PUT /api/forms/[id] |
| **Client (Preact island)** | All builder UX: tree rendering, property editing, undo/redo, live preview, auto-save to localStorage |
| **Formbaker engine** | Runs on both sides: server for validation/API, browser for live preview. Same `formbaker` package via file: dependency |

The split is clean: the server is a thin data pipe (load/save JSON). The client owns
the entire editing experience. There is no server-side rendering for the builder UI.

### Data Flow
```
Server (SSR)
  │ GET /api/forms/[id] → JSON
  ▼
Astro page (edit.astro)
  │ passes `form={serialized JSON}` as prop
  ▼
FormBuilder island (client:load)
  │ deserializes into signal<Formbaker>
  │ user edits → signal updates → preview re-renders
  │ auto-save → localStorage
  │ explicit Save → PUT /api/forms/[id] → server persists
  ▼
LivePreview component
  │ reads signal, calls formbaker engine (isVisible, getSortedNodes)
  │ renders HTML form with current values
  ▼
EmbedTab component
  │ reads signal, shows <iframe> snippet pointing at /api/embed/[id]
```

---

## Component Tree

Every component is a Preact function component inside `src/components/form-builder/`.
The root island is mounted in `src/pages/app/forms/[id]/edit.astro`.

### Page Shell

```
src/pages/app/forms/[id]/edit.astro          Astro page (SSR, auth check)
├── imports FormBuilder island
├── passes form={JSON.stringify(form)} prop
└── passes formId prop
```

### Island Root

```
src/components/form-builder/FormBuilder.tsx   Main island (client:load)
├── Receives: form (serialized JSON), formId
├── Initializes builder signals
├── Manages undo/redo stack
├── Manages view mode (builder | embed)
└── Renders:
    ├── BuilderToolbar
    └── [view === 'builder' ? BuilderLayout : EmbedTab]
```

### Toolbar

```
src/components/form-builder/BuilderToolbar.tsx
├── Props: none (reads signals directly)
├── Actions:
│   ├── [Add Section]     → opens AddNodeModal with type=section
│   ├── [Add Field]       → opens AddNodeModal with type=field
│   ├── [Undo]            → pops undo stack
│   ├── [Redo]            → pops redo stack
│   ├── [Save]            → serializes form signal → PUT /api/forms/[id]
│   └── [Embed]           → toggles view mode to 'embed'
├── Shows: save status (saved / unsaved / saving), undo/redo availability
```

### Builder Layout (Three-Panel)

```
src/components/form-builder/BuilderLayout.tsx
├── Left:  NodeTreePanel       (~25% width)
├── Center: LivePreview        (~45% width)
└── Right: PropertyEditor      (~30% width)
```

### Structure Tree (Left Panel)

```
src/components/form-builder/NodeTreePanel.tsx
├── Reads: formSignal, selectedNodeIdSignal
├── Renders: flat list of nodes in DFS order (via getSortedNodes)
│   └── NodeTreeItem (for each node)
│       ├── Indentation based on parentId depth
│       ├── Icon: § for section, type-specific icon for fields
│       ├── Label: node.label ?? node.id
│       ├── Click → sets selectedNodeIdSignal
│       ├── Active highlight when selectedNodeId === node.id
│       └── Children: rendered inline in flat list (not nested DOM)
└── Bottom: Add buttons (contextual to selection)
```

```
src/components/form-builder/NodeTreeItem.tsx
├── Props: node (FormbakerNode), depth, isSelected, isLast
├── Renders: single row in the tree
├── Click handler: dispatch select-node
├── Visual: depth-based left padding, connector lines (│ ├ └), selection highlight
```

### Property Editor (Right Panel)

```
src/components/form-builder/PropertyEditor.tsx
├── Reads: selectedNodeIdSignal, formSignal
├── If no node selected: shows placeholder "Select a node to edit"
├── If section selected: renders SectionPropertyEditor
├── If field selected: renders FieldPropertyEditor + DependencyEditor
└── Delete button with confirmation
```

```
src/components/form-builder/SectionPropertyEditor.tsx
├── Props: nodeId
├── Editable fields:
│   ├── Label (text input)
│   ├── Description (textarea)
│   └── Section ID (read-only after creation, must start with #)
└── Each change: directly mutates formSignal (via updateNode helper)
```

```
src/components/form-builder/FieldPropertyEditor.tsx
├── Props: nodeId
├── Editable fields:
│   ├── Field ID (read-only)
│   ├── Label (text input)
│   ├── Description (textarea)
│   ├── Field Type (select: text|textarea|select|checkbox|radio|number|date|file)
│   ├── Placeholder (text input, shown for text/textarea/number)
│   ├── Required (checkbox)
│   ├── Min (number, for text/number — min length or min value)
│   ├── Max (number, for text/number — max length or max value)
│   ├── Default Value (type-dependent input)
│   └── Options (for select fields: add/remove/reorder string options)
├── Validation section:
│   ├── Required toggle → sets validation.required
│   ├── Min input → sets validation.min
│   ├── Max input → sets validation.max
│   └── Custom message inputs
└── Each change: directly mutates formSignal
```

```
src/components/form-builder/DependencyEditor.tsx
├── Props: nodeId (target field)
├── Shows: list of backward dependencies for this node
├── Add dependency:
│   ├── Source: dropdown of all field nodes (not sections)
│   ├── Condition: ConditionBuilder (based on source field type)
│   └── Combinator: AND | OR | XOR (only when multiple deps on same target)
├── Each dependency row shows: source → target, condition summary, delete button
└── Calls: addDependency / removeDependency on formSignal
```

```
src/components/form-builder/ConditionBuilder.tsx
├── Props: sourceField (FormbakerField), currentCondition, onChange
├── Renders differently per source fieldType:
│   ├── checkbox: [Is checked] [Is unchecked] → condition = true / false
│   ├── select:   [Equals] [option from list] → condition = optionIndex
│   ├── text:     [Is not empty] [Equals] [value] → condition = string
│   ├── number:   [Is not zero] [> value] [< value] [= value] → condition = {op, value}
│   └── radio:    [Is selected] [Is not selected] → condition = true / false
└── Serializes condition to the format the plugin expects (opaque 'any' on FormbakerDependency)
```

### Live Preview (Center Panel)

```
src/components/form-builder/LivePreview.tsx
├── Reads: formSignal, previewValuesSignal (Record<string, unknown>)
├── Uses: formbaker engine (isVisible, getSortedNodes)
├── Renders: full HTML form
│   ├── <h2>{form.label}</h2>
│   ├── PreviewSection for each section
│   │   ├── <fieldset><legend>{section.label}</legend>
│   │   └── PreviewField for each visible field in section
│   └── Stray fields (no parentId / untracked parent)
└── On field change: updates previewValuesSignal → re-evaluates visibility
```

```
src/components/form-builder/PreviewSection.tsx
├── Props: section (FormbakerSection), fields (FormbakerField[]), values, onChange
├── Renders: <fieldset> with legend, containing PreviewField components
└── Checks visibility via isVisible before rendering
```

```
src/components/form-builder/PreviewField.tsx
├── Props: field (FormbakerField), value, onChange, error
├── Renders appropriate input based on fieldType:
│   ├── text:     <input type="text" />
│   ├── textarea: <textarea />
│   ├── number:   <input type="number" />
│   ├── checkbox: <input type="checkbox" />
│   ├── radio:    <input type="radio" /> (group)
│   ├── select:   <select><option>…</select>
│   ├── date:     <input type="date" />
│   └── file:     <input type="file" /> (display-only, no actual upload)
├── Shows: label, placeholder, required indicator, validation error
└── On change: calls onChange(field.id, newValue)
```

### Embed Tab

```
src/components/form-builder/EmbedTab.tsx
├── Shown when view mode toggled to 'embed'
├── Back button: returns to builder view
├── Embed snippet:
│   └── <pre><code>
│       <iframe src="https://formbaker.dev/api/embed/{formId}"
│               width="100%" height="600" frameborder="0">
│       </iframe>
│       </code></pre>
├── Copy button: copies snippet to clipboard
└── Embed preview: actual <iframe> pointing at embed endpoint (for visual verification)
```

### Add Node Modal

```
src/components/form-builder/AddNodeModal.tsx
├── Props: type ('field' | 'section'), parentId (for fields), onClose, onAdd
├── Field mode:
│   ├── Field ID (auto-generated UUID, editable)
│   ├── Label (text)
│   ├── Field Type (select)
│   └── [Add Field] button → calls addNode on formSignal → closes
├── Section mode:
│   ├── Section ID (text, must start with #)
│   ├── Label (text)
│   └── [Add Section] button → calls addNode on formSignal → closes
```

---

## State Management

### Signals Architecture

All state lives in `src/lib/builder-state.ts`. No prop drilling — components import
signals directly.

```ts
// src/lib/builder-state.ts

import { signal, computed, batch } from "@preact/signals";
import type { Formbaker, FormbakerNode } from "formbaker";
import { create, addNode, removeNode, addDependency, removeDependency } from "formbaker";

// ── Core state ──────────────────────────────────────────────

/** The current form definition. Mutated in-place via engine functions. */
export const formSignal = signal<Formbaker | null>(null);

/** Currently selected node ID (field or section). */
export const selectedNodeIdSignal = signal<string | null>(null);

/** Current preview form values (keyed by field ID). */
export const previewValuesSignal = signal<Record<string, unknown>>({});

/** Save status for the toolbar indicator. */
export const saveStatusSignal = signal<"clean" | "dirty" | "saving" | "saved" | "error">("clean");

/** View mode: "builder" or "embed". */
export const viewModeSignal = signal<"builder" | "embed">("builder");

// ── Undo/redo ──────────────────────────────────────────────

const MAX_HISTORY = 50;
const undoStack = signal<string[]>([]);  // JSON snapshots
const redoStack = signal<string[]>([]);

export function pushUndo() {
  const form = formSignal.value;
  if (!form) return;
  undoStack.value = [...undoStack.value.slice(-(MAX_HISTORY - 1)), JSON.stringify(form)];
  redoStack.value = []; // clear redo on new action
}

export function undo() {
  const stack = undoStack.value;
  if (stack.length === 0) return;
  const form = formSignal.value;
  if (form) redoStack.value = [...redoStack.value, JSON.stringify(form)];
  const prev = stack[stack.length - 1];
  undoStack.value = stack.slice(0, -1);
  formSignal.value = JSON.parse(prev);
}

export function redo() {
  const stack = redoStack.value;
  if (stack.length === 0) return;
  const form = formSignal.value;
  if (form) undoStack.value = [...undoStack.value, JSON.stringify(form)];
  const next = stack[stack.length - 1];
  redoStack.value = stack.slice(0, -1);
  formSignal.value = JSON.parse(next);
}

// ── Derived ────────────────────────────────────────────────

/** The currently selected node (or null). */
export const selectedNodeSignal = computed<FormbakerNode | null>(() => {
  const form = formSignal.value;
  const id = selectedNodeIdSignal.value;
  if (!form || !id) return null;
  return form.nodes[id] ?? null;
});

/** Sorted node list for the tree panel (calls getSortedNodes). */
export const sortedNodesSignal = computed(() => {
  const form = formSignal.value;
  if (!form) return [];
  // getSortedNodes is imported and runs in browser
  return getSortedNodesCopy(form);
});

// ── Undo/redo availability ─────────────────────────────────

export const canUndoSignal = computed(() => undoStack.value.length > 0);
export const canRedoSignal = computed(() => redoStack.value.length > 0);

// ── Initialization ─────────────────────────────────────────

/** Load an existing form into the builder state. */
export function initBuilder(form: Formbaker) {
  batch(() => {
    formSignal.value = form;
    selectedNodeIdSignal.value = null;
    previewValuesSignal.value = {};
    saveStatusSignal.value = "clean";
    viewModeSignal.value = "builder";
    undoStack.value = [];
    redoStack.value = [];
  });
}

// ── Mutations (with undo push) ─────────────────────────────

export function selectNode(nodeId: string | null) {
  selectedNodeIdSignal.value = nodeId;
}

export function updateNode(nodeId: string, patch: Partial<FormbakerNode>) {
  const form = formSignal.value;
  if (!form || !form.nodes[nodeId]) return;
  pushUndo();
  formSignal.value = {
    ...form,
    nodes: {
      ...form.nodes,
      [nodeId]: { ...form.nodes[nodeId], ...patch },
    },
  };
  saveStatusSignal.value = "dirty";
}

export function addNodeAction(node: Partial<FormbakerNode> & { id: string; type: "field" | "section" }) {
  const form = formSignal.value;
  if (!form) return;
  pushUndo();
  formSignal.value = addNode(form, node);
  saveStatusSignal.value = "dirty";
  selectedNodeIdSignal.value = node.id; // auto-select newly added node
}

export function removeNodeAction(nodeId: string) {
  const form = formSignal.value;
  if (!form) return;
  pushUndo();
  const [newForm, removed] = removeNode(form, nodeId);
  if (removed) {
    formSignal.value = newForm;
    if (selectedNodeIdSignal.value === nodeId) selectedNodeIdSignal.value = null;
    saveStatusSignal.value = "dirty";
  }
  return removed;
}

export function addDependencyAction(dep: Parameters<typeof addDependency>[1]) {
  const form = formSignal.value;
  if (!form) return;
  pushUndo();
  try {
    formSignal.value = addDependency(form, dep);
    saveStatusSignal.value = "dirty";
    return true;
  } catch {
    return false;
  }
}

export function removeDependencyAction(dep: Parameters<typeof removeDependency>[1]) {
  const form = formSignal.value;
  if (!form) return;
  pushUndo();
  formSignal.value = removeDependency(form, dep);
  saveStatusSignal.value = "dirty";
}

export function updatePreviewValue(fieldId: string, value: unknown) {
  previewValuesSignal.value = {
    ...previewValuesSignal.value,
    [fieldId]: value,
  };
}

// ── Persistence ────────────────────────────────────────────

const LOCAL_STORAGE_KEY = "formbaker-builder-autosave";

export function saveToLocalStorage() {
  const form = formSignal.value;
  if (form) localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(form));
}

export function loadFromLocalStorage(): Formbaker | null {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearLocalStorage() {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
}

export async function saveToServer(formId: string) {
  const form = formSignal.value;
  if (!form) return;
  saveStatusSignal.value = "saving";
  try {
    const res = await fetch(`/api/forms/${formId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error("Save failed");
    saveStatusSignal.value = "saved";
    clearLocalStorage();
  } catch {
    saveStatusSignal.value = "error";
    saveToLocalStorage(); // fallback
  }
}
```

### Key Design Decisions

1. **Mutations are in-place on the signal, not immutable.** The formbaker engine
   functions (`addNode`, `removeNode`, etc.) return new objects. We assign the
   result back to the signal. The `pushUndo()` helper captures a JSON snapshot
   *before* the mutation.

2. **Undo/redo uses JSON snapshots**, not command objects. This is simpler for a
   Phase 3 release and works well because `Formbaker` objects are small (typically
   <100 nodes). Upgrade path: switch to an immutable patch-based history if forms
   grow large.

3. **No server collaboration yet.** The builder is single-user. If two tabs are
   open, last-save-wins. The localStorage auto-save prevents data loss on
   accidental close.

4. **getSortedNodesCopy** — the `getSortedNodes` engine function returns positioned
   nodes with x/y coordinates. For the tree panel, we just need a flat DFS-ordered
   list. Creating a small wrapper that extracts just the sort order without
   position data.

---

## Formbaker Bundling Strategy

### Option Chosen: file: dependency in docs/package.json

The `docs/` project is NOT a workspace member of the root monorepo. To use
`formbaker` in the browser, we add it as a local dependency:

```json
// docs/package.json (addition)
{
  "dependencies": {
    "formbaker": "file:../packages/formbaker",
    // ...existing deps
  }
}
```

**Why this works:**
- `formbaker` builds to `dist/` with ESM (`"type": "module"`)
- Astro uses Vite, which resolves `file:` dependencies and bundles them for the
  browser automatically during `astro dev` and `astro build`
- `formbaker`'s only dependency is `@standard-schema/spec` (a small type-spec
  package that Vite handles fine)
- No separate bundling step, no workspace config changes

**What Vite does:**
- During dev: resolves `formbaker` → `../packages/formbaker/dist/index.js`,
  transforms ESM, serves via dev server
- During build: tree-shakes and bundles into the client JS chunk
- The `@standard-schema/spec` package is also bundled into the chunk

**Potential issues and mitigations:**
| Issue | Mitigation |
|---|---|
| `formbaker` source uses `@standard-schema/spec` which is mostly types | The runtime parts are minimal; Vite handles it |
| SSR bundle also bundles formbaker | That's fine — the edit page is SSR anyway for auth |
| File watching for dev | Vite watches `node_modules/formbaker/dist/`; after library changes, run `npm run build -w packages/formbaker` before dev |

### What the user must do before running the builder:
```bash
cd packages/formbaker && npm run build   # ensures dist/ is fresh
cd docs && npm install                    # resolves file: dependency
npm run dev                               # starts Astro dev server
```

### Upgrade path (if file: dependency causes issues):
- Create a `@formbaker/browser` workspace package that wraps formbaker with a
  Vite/Rollup build producing a pre-bundled ESM file
- Publish formbaker to npm and use as a regular dependency

---

## Files to Create

### 1. Configuration changes

**`docs/package.json`** — Add dependencies:
```json
{
  "dependencies": {
    "@astrojs/node": "^11.0.0",
    "@astrojs/starlight": "^0.41.1",
    "@astrojs/preact": "^4.0.0",
    "@preact/signals": "^2.1.0",
    "astro": "^7.0.2",
    "formbaker": "file:../packages/formbaker",
    "preact": "^10.26.0",
    "sharp": "^0.34.5"
  }
}
```

**`docs/astro.config.mjs`** — Add Preact integration:
```js
import preact from '@astrojs/preact';
// ... in defineConfig:
integrations: [
  preact({ compat: false }),  // pure Preact, no React compat
  starlight({ /* ... unchanged ... */ }),
],
```

### 2. Astro page

**`docs/src/pages/app/forms/[id]/edit.astro`**
- SSR page, checks auth via `Astro.locals.user`
- Loads form from API/DB on server side
- Renders the FormBuilder island with form data
- Sets `<title>Edit: {form.label}</title>`

```astro
---
// src/pages/app/forms/[id]/edit.astro
export const prerender = false;

import FormBuilder from '../../../components/form-builder/FormBuilder';
import { getFormById } from '../../../lib/db/forms';

const { id } = Astro.params;
const form = await getFormById(id);

// Auth check
if (!Astro.locals.user) return Astro.redirect('/login');
if (!form) return Astro.redirect('/app/dashboard');
if (form.userId !== Astro.locals.user.id) return new Response('Forbidden', { status: 403 });
---

<FormBuilder
  form={JSON.stringify(form.definition)}
  formId={id}
  client:load
/>
```

### 3. State management

**`docs/src/lib/builder-state.ts`** — All signals and mutation helpers (see full
listing in the State Management section above).

### 4. Component files

All components go in `docs/src/components/form-builder/`:

| File | Description | Key points |
|---|---|---|
| `FormBuilder.tsx` | Island root | Initializes signals from props, sets up undo/redo keyboard shortcuts (Ctrl+Z/Y), auto-save interval (every 30s), view mode switch |
| `BuilderToolbar.tsx` | Top toolbar | Reads `saveStatusSignal`, `canUndoSignal`, `canRedoSignal`. Renders `<button>` elements. Undo/redo disabled states. Save button with status indicator dot (green=saved, yellow=dirty, red=error) |
| `BuilderLayout.tsx` | Three-panel shell | CSS grid: `grid-template-columns: 280px 1fr 320px`. Handles panel collapse on small screens (single-column stack) |
| `NodeTreePanel.tsx` | Left tree panel | Maps `sortedNodesSignal` to `NodeTreeItem` components. Auto-scrolls to selected node. Shows empty state when no nodes exist |
| `NodeTreeItem.tsx` | Single tree row | Recursively indents based on parentId depth. Shows field type icon (T for text, ☑ for checkbox, etc.) and label. Click handler calls `selectNode`. Delete button (×) on hover |
| `PropertyEditor.tsx` | Right panel router | Reads `selectedNodeSignal`. Switches between `SectionPropertyEditor`, `FieldPropertyEditor`, and empty state. Delete button with confirmation dialog |
| `SectionPropertyEditor.tsx` | Section props | Editable: label, description. Section ID shown read-only. |
| `FieldPropertyEditor.tsx` | Field props | Editable: label, description, fieldType (select), placeholder, required, min, max, defaultValue, options (for select). Validation section with required/min/max + custom messages |
| `DependencyEditor.tsx` | Dependency list | Shows backward deps for selected field. Add button opens inline form: source select, condition builder, combinator (if >1 dep). Each dep row: "When [source] [condition] → show this" with delete × |
| `ConditionBuilder.tsx` | Condition UI | Dispatches to type-specific sub-components based on source field's fieldType. CheckboxCondition, SelectCondition, TextCondition, NumberCondition |
| `LivePreview.tsx` | Center preview | Renders `PreviewSection` and `PreviewField` components. Calls `isVisible` from formbaker before rendering each node. Passes `previewValuesSignal` and `updatePreviewValue` down |
| `PreviewSection.tsx` | Section in preview | `<fieldset>` with `<legend>`. Only renders if `isVisible` returns true. Renders visible child fields |
| `PreviewField.tsx` | Field in preview | Renders the correct `<input>` based on fieldType. Controlled component: value from `previewValuesSignal`, onChange calls `updatePreviewValue`. Shows validation error if field is required and empty |
| `EmbedTab.tsx` | Embed view | Replaces the three-panel layout when active. Shows `<pre><code>` with iframe snippet. Copy-to-clipboard button. Actual `<iframe>` preview |
| `AddNodeModal.tsx` | Add node dialog | Modal overlay. Two modes (field/section). Auto-generates UUID for ID. Validates section ID starts with `#`. Calls `addNodeAction` on submit |

### 5. CSS

**`docs/src/components/form-builder/builder.css`** — Scoped styles for the builder:
- Three-panel layout grid
- Tree panel: indentation, connector lines (CSS borders/pseudo-elements), selection highlight
- Property panel: form layout, input styling
- Toolbar: flex row, status dot
- Modal: overlay, centered card
- Preview: form styling that mimics real form appearance
- Responsive: single-column stack below 900px

Import this CSS in `FormBuilder.tsx`:
```tsx
import './builder.css';
```

### 6. Server-side API additions

**`docs/src/pages/api/forms/[id].ts`** — PUT handler:
```ts
export const prerender = false;
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const { id } = params;
  const form = await getFormById(id);
  if (!form || form.userId !== locals.user.id) return new Response('Not found', { status: 404 });
  const body = await request.json();
  // Validate structure (has pluginName, nodes is object, dependencies shape)
  await updateFormDefinition(id, body);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
export const GET: APIRoute = async ({ params, locals }) => {
  // Existing or new: return form data for the builder to load
};
```

### 7. Utility

**`docs/src/lib/builder-utils.ts`** — Small helpers:
```ts
// Generate a random ID for new nodes
export function generateId(): string { /* crypto.randomUUID() polyfill or Math.random fallback */ }

// Extract a flat DFS-ordered node list from formbaker's getSortedNodes
export function getFlatNodeList(form: Formbaker): Array<{ node: FormbakerNode; depth: number }> { /* ... */ }

// Serialize condition based on source field type + UI values
export function serializeCondition(sourceField: FormbakerField, uiValue: unknown): unknown { /* ... */ }

// Deserialize condition to UI representation
export function deserializeCondition(sourceField: FormbakerField, condition: unknown): unknown { /* ... */ }
```

---

## UX Flow Diagrams

### Flow 1: Selecting a Node and Editing Properties

```
User sees three-panel builder
  │
  ├─ Left panel shows tree:
  │   └─ § Personal Info
  │       ├─ T name
  │       ├─ ☑ email
  │       └─ ▼ country
  │
  ├─ Center shows live preview of all visible fields
  │
  └─ Right panel shows "Select a node to edit"
      │
      ▼ User clicks "name" in tree
      │
      ├─ Tree: "name" row highlights
      │
      ├─ Preview: "name" field gets subtle highlight border
      │
      └─ Right panel shows FieldPropertyEditor:
          ┌─────────────────────────┐
          │ Field Properties        │
          │ ─────────────────────── │
          │ ID        name          │
          │ Label     [Full Name  ] │
          │ Desc      [Your full..] │
          │ Type      [text      ▾] │
          │ Placeholder [John Doe ] │
          │ ─────────────────────── │
          │ Validation              │
          │ ☑ Required              │
          │ Min length [2         ] │
          │ Max length [100       ] │
          │ ─────────────────────── │
          │ Dependencies (0)  [+ Add]│
          │ ─────────────────────── │
          │ [Delete Field]          │
          └─────────────────────────┘
      │
      ▼ User changes Label to "Display Name"
      │
      ├─ signal updates → tree re-renders with new label
      ├─ preview re-renders with new label
      └─ saveStatus changes to "dirty" (yellow dot in toolbar)
```

### Flow 2: Adding a Field

```
User clicks [Add Field] in toolbar (or [+] button in tree, contextual to selected section)
  │
  ▼ AddNodeModal opens:
  ┌──────────────────────────────────┐
  │ Add Field                    [×] │
  │ ──────────────────────────────── │
  │ Parent Section: Personal Info    │
  │ Field ID:    [phone         ]    │
  │ Label:       [Phone Number  ]    │
  │ Field Type:  [text         ▾]    │
  │                                  │
  │ [Cancel]           [Add Field]   │
  └──────────────────────────────────┘
  │
  ▼ User fills fields, clicks [Add Field]
  │
  ├─ addNodeAction() called → formSignal updated
  ├─ Tree re-renders: new "phone" row under § Personal Info
  ├─ Preview re-renders: phone input appears in the form
  ├─ Modal closes
  ├─ "phone" is auto-selected (properties panel opens)
  └─ Undo stack records snapshot
```

### Flow 3: Adding a Dependency

```
User has two fields: "has_newsletter" (checkbox) and "email" (text)
User wants email to appear only when newsletter is checked

  │
  ▼ User selects "email" in tree
  │
  ▼ Right panel → DependencyEditor section: "Dependencies (0) [+ Add]"
  │
  ▼ User clicks [+ Add]
  │   Inline form appears:
  │   ┌──────────────────────────────────┐
  │   │ Add Dependency                   │
  │   │ When [has_newsletter ▾]          │
  │   │      [is checked       ▾]        │
  │   │ then show this field             │
  │   │                                  │
  │   │ Combinator: ○ OR  ● AND  ○ XOR   │
  │   │                                  │
  │   │ [Cancel]            [Add Dep]    │
  │   └──────────────────────────────────┘
  │
  ▼ User selects "has_newsletter", "is checked", clicks Add
  │
  ├─ addDependencyAction() called
  │   source: "has_newsletter", target: "email",
  │   condition: true (boolean, for checkbox),
  │   dependencyType: "OR" (default, only one dep)
  │
  ├─ Dependency list updates:
  │   ┌──────────────────────────────────┐
  │   │ Dependencies (1)          [+ Add] │
  │   │ ──────────────────────────────── │
  │   │ When has_newsletter is checked   │
  │   │ → show email                  [×]│
  │   └──────────────────────────────────┘
  │
  └─ Live preview updates:
      ┌──────────────────────────────────┐
      │ ☐ Subscribe to newsletter        │
      │                                  │
      │ (email field is hidden because    │
      │  has_newsletter is unchecked)     │
      └──────────────────────────────────┘

  ▼ User checks "Subscribe to newsletter" in preview
  │
  └─ email field appears in preview (isVisible re-evaluates)
```

### Flow 4: Save Workflow

```
User makes changes → saveStatus: "dirty"
  │
  ▼ 30-second auto-save timer fires
  │   → saveToLocalStorage() writes form to localStorage
  │
  ▼ User clicks [Save] in toolbar
  │   → saveStatus: "saving" (spinner in button)
  │
  ▼ saveToServer(formId)
  │   → PUT /api/forms/[id] with JSON body
  │   → Server validates, persists to DB
  │
  ├─ Success:
  │   ├─ saveStatus: "saved" (green dot, fades to "clean" after 2s)
  │   └─ clearLocalStorage()
  │
  └─ Failure:
      ├─ saveStatus: "error" (red dot)
      ├─ saveToLocalStorage() (don't lose work)
      └─ Error toast/message: "Failed to save. Your work is saved locally."
```

---

## Checklist

### Dependencies & Config
- [ ] Add `preact`, `@preact/signals`, `@astrojs/preact` to docs/package.json
- [ ] Add `"formbaker": "file:../packages/formbaker"` to docs/package.json dependencies
- [ ] Add `preact()` integration to astro.config.mjs
- [ ] Run `npm install` in docs/
- [ ] Build formbaker: `npm run build -w packages/formbaker`
- [ ] Verify `import { create } from "formbaker"` works in a test component

### State Layer
- [ ] Create `src/lib/builder-state.ts` with all signals and mutation helpers
- [ ] Create `src/lib/builder-utils.ts` with `generateId`, `getFlatNodeList`, condition serialization
- [ ] Write unit tests (vitest) for `pushUndo`, `undo`, `redo` cycle
- [ ] Write unit tests for `addNodeAction`, `removeNodeAction` with undo
- [ ] Write unit tests for condition serialize/deserialize round-trip

### Page
- [ ] Create `src/pages/app/forms/[id]/edit.astro` with auth check and form loading
- [ ] Create or update `src/pages/api/forms/[id].ts` with GET and PUT handlers
- [ ] Verify SSR renders page shell with correct form data passed as prop
- [ ] Verify API rejects unauthorized requests

### Core Components
- [ ] Create `FormBuilder.tsx` — island root with signal init, keyboard shortcuts, auto-save
- [ ] Create `BuilderToolbar.tsx` — toolbar with all buttons and status indicator
- [ ] Create `BuilderLayout.tsx` — three-panel CSS grid
- [ ] Create `builder.css` — all builder styles

### Tree Panel
- [ ] Create `NodeTreePanel.tsx` — renders flat node list
- [ ] Create `NodeTreeItem.tsx` — indentation, icons, selection, hover delete
- [ ] Verify tree updates when nodes are added/removed/reordered
- [ ] Verify tree scrolls to newly added node

### Property Editor
- [ ] Create `PropertyEditor.tsx` — node type dispatch
- [ ] Create `SectionPropertyEditor.tsx` — label, description
- [ ] Create `FieldPropertyEditor.tsx` — all field properties + validation
- [ ] Verify property changes reflect in tree labels and preview
- [ ] Verify fieldType change updates preview input type
- [ ] Verify delete node works (removes from tree, preview, and dependencies)
- [ ] Verify delete node with forward dependencies is blocked (engine returns false)

### Dependency Editor
- [ ] Create `DependencyEditor.tsx` — list + add/remove
- [ ] Create `ConditionBuilder.tsx` — type-dispatch for conditions
- [ ] Verify adding dependency hides/shows target in preview
- [ ] Verify removing dependency restores visibility
- [ ] Verify AND/OR/XOR combinators work with multiple deps on same target
- [ ] Verify cyclical dependency prevention (engine throws → caught in UI)

### Live Preview
- [ ] Create `LivePreview.tsx` — form renderer using formbaker engine
- [ ] Create `PreviewSection.tsx` — fieldset with legend
- [ ] Create `PreviewField.tsx` — type-appropriate input rendering
- [ ] Verify visibility toggling works (checkbox → show/hide dependent field)
- [ ] Verify all 8 field types render correctly
- [ ] Verify required field shows indicator
- [ ] Verify select fields render options correctly

### Embed Tab
- [ ] Create `EmbedTab.tsx` — snippet + copy button + iframe preview
- [ ] Verify iframe snippet is correct
- [ ] Verify copy-to-clipboard works

### Add Node Modal
- [ ] Create `AddNodeModal.tsx` — field and section modes
- [ ] Verify field addition with parentId (contextual to selected section)
- [ ] Verify section ID validation (must start with #)
- [ ] Verify duplicate ID rejection (handled by engine)

### Save & Persistence
- [ ] Verify manual save works (PUT request, success feedback)
- [ ] Verify auto-save to localStorage on 30s interval
- [ ] Verify localStorage restore on page reload (offer to restore)
- [ ] Verify undo/redo works (Ctrl+Z / Ctrl+Y)
- [ ] Verify undo/redo buttons disabled state

### Polish
- [ ] Keyboard shortcuts: Ctrl+S triggers save
- [ ] Unsaved changes warning on tab close (beforeunload)
- [ ] Responsive layout (single-column below 900px)
- [ ] Loading state while form data is being fetched
- [ ] Error state if form not found or forbidden
- [ ] Empty state for new forms (no nodes yet)
- [ ] Confirmation dialog before deleting a node with dependencies

---

## Dependencies

- **PHASE 1 must be complete**: Auth middleware, DB setup, user sessions, form CRUD
  API (`/api/forms/[id]` GET/PUT), and the `/app/forms/[id]/edit` route must exist
  (even if just a placeholder page)
- **PHASE 2**: Form CRUD API is part of Phase 2. The GET/PUT endpoints must be
  operational before Phase 3 builder can load and save

## Risks

1. **Condition serialization is plugin-specific.** The `condition` field on
   `FormbakerDependency` is typed as `any` and evaluated by the plugin's
   `evaluateCondition` callback. The builder needs to serialize conditions in a
   format the target plugin understands. For the built-in "arktype" plugin, we need
   to confirm or define the condition format. Mitigation: start with a simple
   boolean/string/number format that both the builder and the arktype plugin agree
   on. Document the format.

2. **Formbaker ESM bundle in browser.** The `file:` dependency approach should work
   with Vite, but edge cases: `@standard-schema/spec` might have Node-specific
   code; circular imports; ESM/CJS interop. Mitigation: verify on first component
   mount. Fallback: create a pre-built browser bundle of formbaker in the docs
   project.

3. **Performance with large forms.** The `getSortedNodes` + `isVisible` calls run
   on every signal update (every keystroke in the preview). For forms with >500
   nodes, this could lag. Mitigation: debounce preview updates (150ms). For Phase
   3, this is unlikely to be an issue (typical forms are <50 nodes).

4. **Section ID must start with #.** The formbaker engine enforces this at
   validation time. The builder must enforce it in the AddNodeModal and show
   a clear error. Risk: user creates a section without # prefix, engine rejects
   it on save, user loses context.

5. **Undo stack memory.** Storing full JSON snapshots of the entire form on every
   mutation could use memory for large forms. Mitigation: cap at 50 entries.
   For typical forms (<100 nodes, <5KB JSON), 50 snapshots = ~250KB — negligible.

6. **No dirty-state detection on navigation.** If the user navigates away without
   saving, the `beforeunload` event catches browser/tab close but not SPA
   navigation. Mitigation: in Astro, form builder is a full page load, so
   `beforeunload` covers it. If we later add client-side routing, add a navigation
   guard.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Plan is scoped to Phase 3 (interactive form builder + live preview) only. Does not expand into Phase 4/5 territory (stripe, email verification, etc.). All component specifications are bounded to the form builder feature."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Plan covers all required sections: Summary, Architecture, Component Tree, State Management, Formbaker Bundling Strategy, Files to Create, UX Flow Diagrams, Checklist",
    "Component tree enumerates 17 components with exact file paths, props, and responsibilities",
    "State management includes complete signal definitions with code snippets for undo/redo, mutations, persistence",
    "Bundling strategy addresses the file: dependency approach with Vite, risks, and fallback",
    "UX flow diagrams cover the 4 critical paths: node selection/editing, adding a field, adding a dependency, save workflow",
    "Files to Create section lists 21 files with paths, descriptions, and key code snippets where relevant",
    "Dependencies section correctly identifies Phase 1 and Phase 2 prerequisites",
    "Risks section identifies 6 specific risks with mitigations"
  ],
  "residualRisks": [
    "Condition serialization format must be confirmed with arktype plugin implementation",
    "Formbaker ESM bundling via file: dependency not yet verified at runtime",
    "Performance with large forms (>500 nodes) not tested — debounce is mitigation, not solution"
  ],
  "noStagedFiles": true,
  "diffSummary": "Created /home/nasrt/Documents/code/dev/formbaker/plans/PHASE_3.md — comprehensive implementation plan for the interactive form builder UI",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The plan assumes the arktype plugin is the default validation plugin. If another plugin (zod, class-validator) is used, the ConditionBuilder's serialization logic will need adjustment. The plan recommends confirming the arktype condition format before coding begins."
}
```
