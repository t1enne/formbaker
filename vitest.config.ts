import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist", "node_modules"],
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/**/!(*.dom).spec.ts", "packages/**/!(*.dom).spec.tsx"],
          environment: "node",
        },
      },
      {
        test: {
          name: "dom",
          include: ["packages/**/*.dom.spec.ts", "packages/**/*.dom.spec.tsx"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
