---
title: Core Concepts
description: Understand how Formbaker models forms — nodes, sections, dependencies, and plugins.
---

Formbaker models form _structure_, not form state. It answers: what fields
exist right now, and what rules should validate them? Your form library
handles values, dirty tracking, and submission.

## Nodes

A **node** is a field definition. It describes the shape of one input:

```ts
const nameField = {
  id: "name", // unique identifier
  type: "text", // text | number | checkbox | radio | textarea | select | file
  question: "Your name", // label displayed to the user
  required: true,
  minLength: 2,
  maxLength: 100,
};
```

Every node has an `id`, a `type`, and a `question`. Additional constraints
vary by type — `min`/`max` for numbers, `options` for selects and radios,
etc.

## Sections

**Sections** group related fields. A section has a `label`, an optional
`description`, and can contain child fields via `parentId`:

```ts
const personalSection = {
  id: "personal",
  type: "section",
  label: "Personal Information",
  description: "Tell us about yourself",
};

const nameField = {
  id: "name",
  type: "text",
  question: "Your name",
  parentId: "personal", // belongs to this section
  required: true,
};
```

Nodes without `parentId` sit at the top level. Sections and nodes are
ordered independently — you can reorder either.

## Dependencies

A **dependency** controls when a node or section is visible. It's a
directed edge in a graph from a source node to a target node:

```ts
const dep = {
  target: "pet_name", // hide/show this node
  source: "has_pet", // based on this node's value
  condition: { equals: true }, // when source equals this
};
```

Dependencies come in three combinators:

- **OR** (default) — the target is visible if _any_ dependency is satisfied
- **AND** — visible only if _all_ dependencies are satisfied
- **XOR** — visible if _exactly one_ dependency is satisfied

Cyclic dependencies are detected and throw immediately.

## The Plugin System

Formbaker doesn't bundle a validation library. Instead, it delegates
validation to a **plugin** — a named function that takes the current form
state and returns a [Standard Schema
V1](https://github.com/standard-schema/standard-schema)-compatible schema.

```ts
import { registerPlugin } from "formbaker";
import { zodPlugin } from "formbaker-plugins/zod";
import { arktypePlugin } from "formbaker-plugins/arktype";

registerPlugin("zod", zodPlugin);
registerPlugin("arktype", arktypePlugin);

// Later, in a form definition:
const form = create({ pluginName: "zod" }, nodes, dependencies);
```

Because plugins are referenced by name, form definitions are pure data —
no functions, no imports. A form created by `JSON.parse()` is
indistinguishable from one built by `create()`.

## Immutable API

Every mutation returns a new form:

```ts
const form = create({ pluginName: "zod" }, [nameNode]);
const withPet = form.addNode(petNode); // new form, original unchanged
const moved = withPet.moveNode("pet_name", 0); // reordered
```

This makes Formbaker a natural fit for React's `useState`, Redux, Angular
signals, or any immutable state pattern.
