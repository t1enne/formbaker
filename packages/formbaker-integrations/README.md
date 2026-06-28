# @formbaker/integrations

Framework integrations for Formbaker — bridges between Formbaker form definitions and popular form state / validation libraries.

## Available integrations

| Integration     | Doc                                       | Import                                                                                     |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| React Hook Form | [Readme](./src/react-hook-form/README.md) | `import { useFormbakerForm } from "@formbaker/integrations/react-hook-form"`               |
| Angular         | [Readme](./src/angular/README.md)         | `import { formbakerToFormGroup, rebuildFormGroup } from "@formbaker/integrations/angular"` |
| HTML5 (native)  | [Readme](./src/html5/README.md)           | `import { attachCustomValidation, validateForm } from "@formbaker/integrations/html5"`     |

## Overview

Each integration consumes a Formbaker form definition (or a schema derived from it) and produces something the target framework can use:

- **React Hook Form** — a `useForm` hook pre-configured with a `resolver` that rebuils the validation schema on every value change. Handles dependency-driven visibility automatically — hidden fields don't validate.
- **Angular** — builds or rebuilds an `@angular/forms` `FormGroup` from a Formbaker form. `rebuildFormGroup` adds/removes controls as dependencies change visibility.
- **HTML5** — wires Formbaker validation into the browser's native Constraint Validation API (`setCustomValidity` / `reportValidity`). Works with plain HTML forms — no framework required. Just provide a getter that maps field IDs to DOM elements.
