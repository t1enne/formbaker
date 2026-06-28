---
title: Dependencies API
description: The dependency graph — conditions, combinators, and cycle detection.
---

## Dependency shape

```ts
interface Dependency {
  target: string;     // node ID to show/hide
  source: string;     // node ID to watch
  condition: Condition;
}

type Condition =
  | { equals: unknown }
  | { notEquals: unknown }
  | { in: unknown[] }
  | { notIn: unknown[] }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { regex: string }
  | { empty: true }
  | { notEmpty: true };
```

## Combinators

When adding dependencies via `addDependency`, the combinator defaults to
`"OR"`:

```ts
// These are equivalent:
form.addDependency({ target: "a", source: "b", condition: { equals: true } });
form.addDependency({ target: "a", source: "b", condition: { equals: true } }, "OR");
```

Supported combinators:

| Combinator | Behavior |
|-----------|----------|
| `"OR"` | Target visible if ANY source condition is satisfied (default) |
| `"AND"` | Target visible only if ALL source conditions are satisfied |
| `"XOR"` | Target visible if EXACTLY ONE source condition is satisfied |

## Condition evaluation

Each condition type evaluates against the current value of the source
node:

```ts
// equals / notEquals — strict equality
{ condition: { equals: "admin" } }
// sourceValue === "admin"

// in / notIn — Set membership
{ condition: { in: ["us", "ca", "uk"] } }
// ["us", "ca", "uk"].includes(sourceValue)

// gt / gte / lt / lte — numeric comparison
{ condition: { gte: 18 } }
// Number(sourceValue) >= 18

// regex — pattern matching
{ condition: { regex: "^\\d{5}$" } }
// /^\d{5}$/.test(sourceValue)

// empty / notEmpty — falsiness check
{ condition: { empty: true } }
// sourceValue === null || sourceValue === undefined || sourceValue === ""
```

## Cycle detection

The dependency graph is checked for cycles on every `addDependency` call.
A directed cycle (A → B → A) throws `CycleError` immediately.

## Removing dependencies

```ts
// Remove all dependencies targeting "pet_name"
form.removeDependency("pet_name");

// Remove only the dependency from "has_pet" to "pet_name"
form.removeDependency("pet_name", "has_pet");
```
