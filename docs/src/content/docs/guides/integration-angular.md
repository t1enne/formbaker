---
title: Angular Integration
description: Using Formbaker with Angular Reactive Forms — syncing FormGroup structure dynamically.
---

The `rebuildFormGroup` function syncs an Angular `FormGroup` to match the
current form structure. When a dependency hides a field, its control is
removed from the group. When it reappears, the control is re-added with
its previous value preserved.

## Setup

```bash
npm install formbaker formbaker-integrations @angular/forms
```

## Basic usage

```ts
import { Component, OnInit } from "@angular/core";
import { FormGroup, FormControl } from "@angular/forms";
import { create } from "formbaker";
import { rebuildFormGroup } from "formbaker-integrations/angular";

@Component({
  selector: "app-survey",
  template: `
    <form [formGroup]="fg" (ngSubmit)="onSubmit()">
      <input formControlName="name" />
      <ng-container *ngIf="hasControl('pet_name')">
        <input formControlName="pet_name" />
      </ng-container>
      <button type="submit">Submit</button>
    </form>
  `,
})
export class SurveyComponent implements OnInit {
  form = create({ pluginName: "zod" }, nodes, dependencies);
  fg = new FormGroup({});

  ngOnInit() {
    // Sync FormGroup structure to current visible fields
    this.fg = rebuildFormGroup(this.form, this.fg, {
      values: {}, // or pass existing values
    });
  }

  hasControl(name: string): boolean {
    return this.fg.contains(name);
  }

  onSubmit() {
    console.log(this.fg.value);
  }
}
```

## Value changes

When values change, call `rebuildFormGroup` again to update visibility:

```ts
this.fg.valueChanges.subscribe((values) => {
  this.fg = rebuildFormGroup(this.form, this.fg, { values });
});
```

Passing `values` enables visibility evaluation. The function preserves
existing control values through the rebuild — if a field hides and
reappears, its previous value is restored.

## Validation

The `FormGroup` is rebuilt with validators derived from the form engine.
Only visible fields participate in validation. Hidden fields are removed
from the group entirely.
