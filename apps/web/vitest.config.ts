import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/*.spec.ts are Playwright tests (pnpm test:e2e) — Vitest's default
    // include glob would otherwise also pick them up as unit tests and fail
    // immediately, since they call Playwright's test(), not Vitest's.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
