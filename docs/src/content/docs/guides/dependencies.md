---
title: Dependencies & Visibility
description: Control when fields appear using dependency conditions and logical combinators.
---

Dependencies make your form dynamic. A dependency is a rule: "show field X
when field Y has value Z."

## Basic dependency

```ts
const dep = {
  target: "pet_name", // field to show/hide
  source: "has_pet", // field to watch
  condition: { equals: true }, // when source value matches
};
```

When the user checks "has_pet", "pet_name" becomes visible. When they
uncheck it, "pet_name" hides and its validation is removed from the
schema.

## Condition types

| Condition   | Example                  | Description                          |
| ----------- | ------------------------ | ------------------------------------ |
| `equals`    | `{ equals: true }`       | Source value must match exactly      |
| `notEquals` | `{ notEquals: "" }`      | Source value must differ             |
| `in`        | `{ in: ["cat", "dog"] }` | Source value must be one of          |
| `notIn`     | `{ notIn: [""] }`        | Source value must not be one of      |
| `gt`        | `{ gt: 18 }`             | Source value greater than (numbers)  |
| `gte`       | `{ gte: 0 }`             | Greater than or equal                |
| `lt`        | `{ lt: 100 }`            | Less than                            |
| `lte`       | `{ lte: 99 }`            | Less than or equal                   |
| `regex`     | `{ regex: "^\\d{5}$" }`  | Source value matches pattern         |
| `empty`     | `{ empty: true }`        | Value is empty (null, undefined, "") |
| `notEmpty`  | `{ notEmpty: true }`     | Value is non-empty                   |

## Combinators: AND, OR, XOR

When multiple dependencies target the same node, you choose how they
combine:

```ts
// ALL must be satisfied (AND)
combinator: "AND",
dependencies: [
  { target: "advanced_field", source: "role", condition: { equals: "admin" } },
  { target: "advanced_field", source: "beta", condition: { equals: true } },
]
```

```ts
// ANY must be satisfied (OR — the default)
dependencies: [
  { target: "contact", source: "pref_email", condition: { equals: true } },
  { target: "contact", source: "pref_phone", condition: { equals: true } },
];
```

```ts
// EXACTLY ONE must be satisfied (XOR)
combinator: "XOR",
dependencies: [
  { target: "promo", source: "tier1", condition: { equals: true } },
  { target: "promo", source: "tier2", condition: { equals: true } },
]
```

## Dependent sections

You can target a section with a dependency. When a section is hidden, all
its child fields are hidden too:

```ts
{
  target: "business_section",
  source: "type",
  condition: { equals: "business" },
}
```

## Chained visibility

A hidden field can itself be a source for another dependency. When the
parent hides, all children are hidden transitively:

```ts
// When 'type' ≠ "business", the section hides,
// so 'employees' hides no matter what 'has_employees' says.
dependencies: [
  { target: "business_section", source: "type", condition: { equals: "business" } },
  { target: "employees", source: "has_employees", condition: { equals: true } },
];
```

## Cyclic detection

Formbaker prevents infinite loops:

```ts
// THROWS: cycle detected
dependencies: [
  { target: "a", source: "b", condition: { equals: true } },
  { target: "b", source: "a", condition: { equals: true } },
];
```

A `CycleError` is thrown at `addDependency` time so you catch the bug
immediately, not when a user fills out the form.
