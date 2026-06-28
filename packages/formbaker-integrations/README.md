# @formbaker/integrations

Framework integrations for Formbaker — bridges between Formbaker form definitions and popular form state / validation libraries. Also includes standalone utilities that consume a Formbaker form without implementing the `FormbakerPlugin` interface.

**Plugins vs integrations:** a *plugin* implements `FormbakerPlugin` (field/mergeFields/evaluateCondition) and plugs into `registerPlugin()` / `create({pluginName})`. An *integration* consumes a Formbaker form in other ways — wiring it into a framework's form state, building runtime DTOs, etc. If it goes through `registerPlugin`, it's a plugin; otherwise it's an integration.

## Available integrations

| Integration      | Doc                                        | Import                                                                                           |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| React Hook Form  | [Readme](./src/react-hook-form/README.md)  | `import { useFormbakerForm } from "@formbaker/integrations/react-hook-form"`                     |
| Angular          | [Readme](./src/angular/README.md)          | `import { formbakerToFormGroup, rebuildFormGroup } from "@formbaker/integrations/angular"`       |
| HTML5 (native)   | [Readme](./src/html5/README.md)            | `import { attachCustomValidation, validateForm } from "@formbaker/integrations/html5"`           |
| class-validator  | —                                          | `import { formbakerToClassValidator } from "@formbaker/integrations/class-validator"`            |

## Overview

Each integration consumes a Formbaker form definition (or a schema derived from it) and produces something the target framework can use:

- **React Hook Form** — a `useForm` hook pre-configured with a `resolver` that rebuils the validation schema on every value change. Handles dependency-driven visibility automatically — hidden fields don't validate.
- **Angular** — builds or rebuilds an `@angular/forms` `FormGroup` from a Formbaker form. `rebuildFormGroup` adds/removes controls as dependencies change visibility.
- **HTML5** — wires Formbaker validation into the browser's native Constraint Validation API (`setCustomValidity` / `reportValidity`). Works with plain HTML forms — no framework required. Just provide a getter that maps field IDs to DOM elements.
- **class-validator** — builds a runtime class decorated with class-validator decorators from a Formbaker form. Create an instance, assign values, then pass to `validate`/`validateSync` from `class-validator`.
