---
title: Survey Form Example
description: A multi-section survey with conditional follow-up questions.
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

This example builds a customer satisfaction survey. Some fields only
appear based on the user's rating.

## Form definition

```ts
import { create } from "formbaker";

const survey = create(
  { pluginName: "zod" },
  [
    // Section 1: Overall rating
    {
      id: "rating",
      type: "radio",
      question: "How would you rate our service?",
      required: true,
      options: [
        { value: "5", label: "Excellent" },
        { value: "4", label: "Good" },
        { value: "3", label: "Average" },
        { value: "2", label: "Poor" },
        { value: "1", label: "Terrible" },
      ],
    },
    // Conditional: only show for low ratings
    {
      id: "feedback",
      type: "textarea",
      question: "What could we improve?",
      required: true,
      maxLength: 1000,
    },
    // Section 2: Demographics
    {
      id: "demographics",
      type: "section",
      label: "About You",
    },
    {
      id: "age_group",
      type: "select",
      question: "Age group",
      parentId: "demographics",
      options: [
        { value: "under_18", label: "Under 18" },
        { value: "18_24", label: "18–24" },
        { value: "25_44", label: "25–44" },
        { value: "45_plus", label: "45+" },
      ],
    },
    // Conditional: NPS follow-up
    {
      id: "recommend",
      type: "radio",
      question: "How likely are you to recommend us?",
      options: [
        { value: "yes", label: "Would recommend" },
        { value: "no", label: "Would not recommend" },
      ],
    },
    {
      id: "referral_source",
      type: "text",
      question: "Where did you hear about us?",
    },
  ],
  [
    // Show feedback only when rating is low
    {
      target: "feedback",
      source: "rating",
      condition: { in: ["1", "2"] },
    },
    // Show referral source when they'd recommend AND rating is good
    {
      combinator: "AND" as const,
      dependencies: [
        { target: "referral_source", source: "recommend", condition: { equals: "yes" } },
        { target: "referral_source", source: "rating", condition: { in: ["4", "5"] } },
      ],
    },
  ],
);
```

## Usage with React

<Tabs>
  <TabItem label="React Hook Form">

  ```tsx
  import { useFormbakerForm } from "formbaker-integrations/react-hook-form";

  function Survey() {
    const { register, isInSchema, handleSubmit, formState: { errors } } =
      useFormbakerForm(survey);

    return (
      <form onSubmit={handleSubmit((data) => {
        fetch("/api/survey", { method: "POST", body: JSON.stringify(data) });
      })}>
        {/* Rating is always visible */}
        <fieldset>
          <legend>How would you rate our service?</legend>
          {["5","4","3","2","1"].map(v => (
            <label key={v}>
              <input type="radio" value={v} {...register("rating")} />
              {v}
            </label>
          ))}
        </fieldset>

        {/* Feedback — only for low ratings */}
        {isInSchema("feedback") && (
          <div>
            <label>What could we improve?</label>
            <textarea {...register("feedback")} />
            {errors.feedback && <p>{errors.feedback.message}</p>}
          </div>
        )}

        {/* Recommend */}
        {isInSchema("recommend") && (
          <fieldset>
            <legend>How likely are you to recommend us?</legend>
            <label><input type="radio" value="yes" {...register("recommend")} /> Yes</label>
            <label><input type="radio" value="no" {...register("recommend")} /> No</label>
          </fieldset>
        )}

        {/* Referral source — only when happy AND willing to recommend */}
        {isInSchema("referral_source") && (
          <div>
            <label>Where did you hear about us?</label>
            <input {...register("referral_source")} />
          </div>
        )}

        <button type="submit">Submit</button>
      </form>
    );
  }
  ```
  </TabItem>
  <TabItem label="Angular">

  ```ts
  @Component({
    selector: 'app-survey',
    template: `
      <form [formGroup]="fg" (ngSubmit)="onSubmit()">
        <fieldset>
          <legend>How would you rate our service?</legend>
          <label *ngFor="let v of ratings">
            <input type="radio" [value]="v" formControlName="rating" /> {{v}}
          </label>
        </fieldset>

        <ng-container *ngIf="hasControl('feedback')">
          <label>What could we improve?</label>
          <textarea formControlName="feedback"></textarea>
        </ng-container>

        <button type="submit">Submit</button>
      </form>
    `
  })
  export class SurveyComponent implements OnInit {
    ratings = ["5","4","3","2","1"];
    fg = new FormGroup({});

    ngOnInit() {
      this.fg = rebuildFormGroup(survey, this.fg, { values: {} });
      this.fg.valueChanges.subscribe(v => {
        this.fg = rebuildFormGroup(survey, this.fg, { values: v });
      });
    }
  }
  ```
  </TabItem>
</Tabs>

## Behavior

1. Initially, only `rating` is visible (aside from sections).
2. Selecting "1" or "2" shows the `feedback` textarea.
3. Selecting "4" or "5" shows the `recommend` radio.
4. Answering "yes" to recommend shows `referral_source`.
5. The demographics section and `age_group` are always visible.
