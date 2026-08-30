import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

loadEnv({ path: path.join(__dirname, "../../.env") });

const API_PORT = 4100;
const WEB_PORT = 3100;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

/**
 * Runs the E2E demo scenario (docs/TESTING_STRATEGY.md §3) against real
 * apps/api + apps/web dev servers and the dedicated test Postgres database
 * — deliberately on different ports (4100/3100) from the normal dev setup
 * (4000/3000) so this suite can run alongside a developer's own running
 * dev servers without port conflicts, and deliberately pointed at
 * TEST_DATABASE_URL (never the dev database) via each webServer's `env`,
 * which `dotenv-cli`'s own env loading (see apps/api's `dev` script)
 * leaves alone since it doesn't override already-set variables.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @arthiq/api dev",
      cwd: path.join(__dirname, "../.."),
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: String(API_PORT),
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
        CORS_ALLOWED_ORIGINS: WEB_URL,
      },
    },
    {
      command: "pnpm --filter @arthiq/web dev",
      cwd: path.join(__dirname, "../.."),
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_API_URL: API_URL,
      },
    },
  ],
});
