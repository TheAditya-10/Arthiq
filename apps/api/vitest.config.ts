import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // Integration tests share one Postgres test database and truncate
    // between tests — they must not run concurrently against it.
    fileParallelism: false,
  },
});
