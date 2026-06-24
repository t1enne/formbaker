import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/libs/formbaker/engine": resolve(__dirname, "src/engine.ts"),
      "@/libs/formbaker/utils": resolve(__dirname, "src/utils.ts"),
      "@/libs/formbaker": resolve(__dirname, "src/"),
    },
  },
  test: {
    include: ["src/tests/**/*.spec.ts"],
    exclude: [],
  },
});
