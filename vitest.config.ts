import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/engine": resolve(__dirname, "src/engine.ts"),
      "@/utils": resolve(__dirname, "src/utils.ts"),
      "@/types": resolve(__dirname, "src/types.ts"),
      "@/plugins": resolve(__dirname, "src/plugins/"),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts", "tests/plugins/**/*.spec.ts"],
    exclude: [],
  },
});
