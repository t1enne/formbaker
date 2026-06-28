---
title: Configurator UI Example
description: Building a form builder — let users create forms through a UI.
---

This example shows the pattern for a form configurator: a user-facing UI
that lets non-developers build forms, which are saved as JSON and
rendered at runtime.

## Architecture

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────┐
│  Form Builder UI  │────▶│    Database   │────▶│   Runtime    │
│  (admin panel)    │     │  (JSON blob)  │     │  (end-user)  │
└──────────────────┘     └──────────────┘     └──────────────┘
```

The key insight: `create()` accepts data that came from `JSON.parse()`.
There is no difference between a hand-coded form and one built in a UI.

## Storing form definitions

```ts
// Builder exports a serializable definition
const definition = form.definition;

await db.forms.create({
  id: "customer-survey",
  name: "Customer Satisfaction Survey",
  definition,
  version: 1,
  published: true,
});
```

## Loading and rendering

```ts
// Runtime loads from DB
async function loadForm(formId: string) {
  const record = await db.forms.findOne({ id: formId });
  if (!record) throw new Error("Form not found");

  // Rebuild the engine from stored definition
  return create(record.definition);
}

// Then render with React Hook Form
function DynamicForm({formId}: {formId: string}) {
  const [form, setForm] = useState<FormbakerInstance | null>(null);

  useEffect(() => {
    loadForm(formId).then(setForm);
  }, [formId]);

  if (!form) return <p>Loading…</p>;

  return <FormRenderer form={form} />;
}

function FormRenderer({ form }: { form: FormbakerInstance }) {
  const { register, isInSchema, visibleFields } = useFormbakerForm(form);

  return (
    <form>
      {visibleFields.map((id) => {
        const node = form.getNode(id); // you'd add this to the instance
        if (!node) return null;

        switch (node.type) {
          case "text":
            return <input key={id} {...register(id)} placeholder={node.question} />;
          case "textarea":
            return <textarea key={id} {...register(id)} placeholder={node.question} />;
          case "select":
            return (
              <select key={id} {...register(id)}>
                {node.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            );
          case "radio":
            return (
              <fieldset key={id}>
                <legend>{node.question}</legend>
                {node.options?.map((o) => (
                  <label key={o.value}>
                    <input type="radio" value={o.value} {...register(id)} />
                    {o.label}
                  </label>
                ))}
              </fieldset>
            );
          default:
            return null;
        }
      })}
      <button type="submit">Submit</button>
    </form>
  );
}
```

## Versioning

Form definitions evolve. Users might add fields, change conditions, or
reorder sections. Include a version number:

```ts
const stored = {
  version: 2,
  definition: form.definition,
};

// Migration on load:
function migrate(stored: StoredForm): FormDefinition {
  if (stored.version === 1) {
    // v1 → v2: rename 'label' to 'question'
    stored.definition.nodes = stored.definition.nodes.map((n) => ({
      ...n,
      question: n.question ?? n.label,
    }));
    stored.version = 2;
  }
  return stored.definition;
}
```

## Pre-built field palette

A configurator UI typically provides a palette of field types to drag in.
Since Formbaker nodes are plain objects, building a palette is simple:

```ts
const fieldTemplates: Record<string, Partial<Node>> = {
  text: { type: "text", question: "New text field" },
  number: { type: "number", question: "New number field" },
  checkbox: { type: "checkbox", question: "New checkbox" },
  select: { type: "select", question: "Choose one", options: [] },
  radio: { type: "radio", question: "Choose one", options: [] },
  textarea: { type: "textarea", question: "Long answer" },
  section: { type: "section", label: "New section" },
};

function addFieldFromPalette(form: FormbakerInstance, templateKey: string) {
  const template = fieldTemplates[templateKey];
  const id = crypto.randomUUID();
  return form.addNode({ id, ...template });
}
```

## Dependency builder

The most complex part of a configurator is the dependency UI. A minimal
builder provides:

1. Choose a source field
2. Choose a target field
3. Choose a condition type
4. Enter the condition value

```ts
function buildDependency(
  source: string,
  target: string,
  conditionType: string,
  value: unknown,
): Dependency {
  return {
    target,
    source,
    condition: { [conditionType]: value } as Condition,
  };
}
```

The engine handles the rest — cycle detection, evaluation ordering,
visibility chains.
