import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve("./src") } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Keep local and CI runs deterministic on constrained developer machines.
    fileParallelism: false,
    maxWorkers: 1,
    pool: "threads",
  },
});
