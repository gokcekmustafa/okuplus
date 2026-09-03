import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
