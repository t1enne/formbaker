import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/libs/formey/engine": resolve(__dirname, "src/engine.ts"),
      "@/libs/formey/utils": resolve(__dirname, "src/utils.ts"),
      "@/libs/formey": resolve(__dirname, "src/"),
    },
  },
  test: {
    include: ["src/tests/**/*.spec.ts"],
    exclude: [],
  },
});
