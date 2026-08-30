import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma config files opt OUT of Prisma's automatic .env loading, so we load
// the repo-root .env explicitly (this package has no .env of its own —
// env vars are defined once at the monorepo root, see .env.example).
loadEnv({ path: path.join(__dirname, "../../.env") });

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
