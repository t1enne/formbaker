---
title: Defining Forms
description: All field types, options, and how to structure form definitions.
---

## Creating a form

```ts
import { create } from "formbaker";

const form = create(
  { pluginName: "zod" },
  [/* nodes */],
  [/* dependencies */],
);
```

The first argument is the **form context** — metadata about the form
itself. Currently it holds the `pluginName` and optional configuration.

The second is an array of **nodes** (fields, sections). The third is an
array of **dependencies**.

## Field types

### Text

```ts
{
  id: "name",
  type: "text",
  question: "Your name",
  required: true,
  minLength: 2,
  maxLength: 100,
}
```

### Number

```ts
{
  id: "age",
  type: "number",
  question: "Age",
  required: true,
  min: 0,
  max: 150,
}
```

### Checkbox

```ts
{
  id: "agree",
  type: "checkbox",
  question: "I agree to the terms",
  required: true,
  // checkbox has no min/max — it's boolean
}
```

### Radio

```ts
{
  id: "color",
  type: "radio",
  question: "Favorite color",
  required: true,
  options: [
    { value: "red", label: "Red" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
  ],
}
```

### Select

```ts
{
  id: "country",
  type: "select",
  question: "Country",
  options: [
    { value: "us", label: "United States" },
    { value: "ca", label: "Canada" },
  ],
}
```

### Textarea

```ts
{
  id: "bio",
  type: "textarea",
  question: "About you",
  maxLength: 500,
}
```

### File

```ts
{
  id: "resume",
  type: "file",
  question: "Upload resume",
  // File fields typically delegate validation to the integration
}
```

## Sections

Sections are nodes with `type: "section"`:

```ts
{
  id: "contact",
  type: "section",
  label: "Contact Info",
  description: "How can we reach you?",
}
```

Fields inside a section set `parentId`:

```ts
{
  id: "email",
  type: "text",
  question: "Email",
  parentId: "contact",
  required: true,
}
```

## Ordering

Nodes and sections each have their own ordering. `addNode` appends by
default; use `moveNode(id, position)` to reposition. Ordering is
recalculated automatically — positions are zero-indexed.

## Auto-numbering

Formbaker produces section-question numbering: 1, 1.1, 1.2, 2, 2.1…

```ts
form.produce().numbering
// { "name": "1.1", "email": "1.2", "bio": "2.1" }
```
