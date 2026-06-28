---
title: Quick Start
description: Get up and running with Formbaker in 5 minutes.
---

import { Steps } from '@astrojs/starlight/components';

<Steps>

1. **Install the packages**

   ```bash
   npm install formbaker formbaker-plugins formbaker-integrations
   ```

2. **Create a form definition**

   ```ts
   import { create } from "formbaker";
   import { arktypePlugin } from "formbaker-plugins/arktype";

   const form = create(
     { pluginName: "arktype" },
     [
       {
         id: "name",
         type: "text",
         question: "Your name",
         required: true,
       },
       {
         id: "has_pet",
         type: "checkbox",
         question: "Do you have a pet?",
       },
       {
         id: "pet_name",
         type: "text",
         question: "Pet's name",
         required: true,
       },
     ],
     // Dependencies: show 'pet_name' only when 'has_pet' is true
     [
       {
         target: "pet_name",
         source: "has_pet",
         condition: { equals: true },
       },
     ],
   );
   ```

3. **Use it with React Hook Form**

   ```tsx
   import { useFormbakerForm } from "formbaker-integrations/react-hook-form";
   import { useForm } from "react-hook-form";

   function MyForm() {
     const { register, isInSchema, handleSubmit } = useFormbakerForm(
       form,
     );

     return (
       <form onSubmit={handleSubmit((data) => console.log(data))}>
         <input {...register("name")} />
         <input type="checkbox" {...register("has_pet")} />

         {isInSchema("pet_name") && (
           <input {...register("pet_name")} />
         )}

         <button type="submit">Submit</button>
       </form>
     );
   }
   ```

4. **That's it**

   The pet name field appears only when "Do you have a pet?" is checked.
   Validation enforces the `required` rule for visible fields only.

</Steps>

## Next Steps

- [Core Concepts](/getting-started/concepts/) — understand sections, dependencies, and the plugin system
- [Defining Forms](/guides/defining-forms/) — all field types and options
- [Dependencies & Visibility](/guides/dependencies/) — AND/OR/XOR combinators
