---
title: Conditional Wizard Example
description: A multi-step wizard where each step determines what comes next.
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

This example builds an insurance quote wizard. The user's answers
determine which follow-up questions appear.

## Form definition

```ts
import { create } from "formbaker";

const wizard = create(
  { pluginName: "zod" },
  [
    // Step 1: What to insure
    {
      id: "type",
      type: "radio",
      question: "What do you need to insure?",
      required: true,
      options: [
        { value: "car", label: "Car" },
        { value: "home", label: "Home" },
        { value: "life", label: "Life" },
      ],
    },
    // Car-specific
    {
      id: "make",
      type: "text",
      question: "Car make",
      required: true,
    },
    {
      id: "model",
      type: "text",
      question: "Car model",
      required: true,
    },
    {
      id: "year",
      type: "number",
      question: "Year",
      required: true,
      min: 1900,
      max: 2026,
    },
    // Home-specific
    {
      id: "home_type",
      type: "radio",
      question: "Home type",
      options: [
        { value: "house", label: "House" },
        { value: "apartment", label: "Apartment" },
        { value: "condo", label: "Condo" },
      ],
    },
    {
      id: "sqft",
      type: "number",
      question: "Square footage",
      min: 100,
    },
    // Life-specific
    {
      id: "age",
      type: "number",
      question: "Your age",
      min: 18,
      max: 120,
    },
    // Shared
    {
      id: "coverage",
      type: "select",
      question: "Coverage level",
      options: [
        { value: "basic", label: "Basic" },
        { value: "standard", label: "Standard" },
        { value: "premium", label: "Premium" },
      ],
    },
  ],
  [
    // Car fields visible when type is "car"
    { target: "make", source: "type", condition: { equals: "car" } },
    { target: "model", source: "type", condition: { equals: "car" } },
    { target: "year", source: "type", condition: { equals: "car" } },

    // Home fields visible when type is "home"
    { target: "home_type", source: "type", condition: { equals: "home" } },
    { target: "sqft", source: "type", condition: { equals: "home" } },

    // Life field visible when type is "life"
    { target: "age", source: "type", condition: { equals: "life" } },

    // Coverage only shows once a type is chosen (not empty)
    { target: "coverage", source: "type", condition: { notEmpty: true } },
  ],
);
```

## Step-by-step rendering

<Tabs>
  <TabItem label="React">

```tsx
function Wizard() {
  const { register, isInSchema, watch } = useFormbakerForm(wizard);
  const type = watch("type");

  return (
    <form>
      <fieldset>
        <legend>What do you need to insure?</legend>
        <label>
          <input type="radio" value="car" {...register("type")} /> Car
        </label>
        <label>
          <input type="radio" value="home" {...register("type")} /> Home
        </label>
        <label>
          <input type="radio" value="life" {...register("type")} /> Life
        </label>
      </fieldset>

      {type === "car" && (
        <div className="step">
          <h2>Car Details</h2>
          <input placeholder="Make" {...register("make")} />
          <input placeholder="Model" {...register("model")} />
          <input type="number" placeholder="Year" {...register("year")} />
        </div>
      )}

      {type === "home" && (
        <div className="step">
          <h2>Home Details</h2>
          <select {...register("home_type")}>
            <option value="house">House</option>
            <option value="apartment">Apartment</option>
            <option value="condo">Condo</option>
          </select>
          <input type="number" placeholder="Square footage" {...register("sqft")} />
        </div>
      )}

      {type === "life" && (
        <div className="step">
          <h2>Life Insurance</h2>
          <input type="number" placeholder="Your age" {...register("age")} />
        </div>
      )}

      {isInSchema("coverage") && (
        <div>
          <label>Coverage level</label>
          <select {...register("coverage")}>
            <option value="basic">Basic</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
        </div>
      )}
    </form>
  );
}
```

  </TabItem>
</Tabs>

## Key techniques

- **Mutually exclusive fields** — car fields, home fields, and life fields
  are each guarded by the `type` value. Only one group is visible at a
  time.
- **Late-appearing fields** — `coverage` only appears after the user
  selects a type (`notEmpty` condition).
- **No wizard state machine** — no step tracking, no back/next logic. The
  form structure _is_ the wizard.
