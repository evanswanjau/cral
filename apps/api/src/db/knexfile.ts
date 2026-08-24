import type { Knex } from "knex";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Absolute path — a relative "./migrations" resolves against process.cwd(),
// which is wrong whenever this file is imported programmatically (as
// db/migrate.ts and db/client.ts do) rather than run via the knex CLI.
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL ?? "postgres://cral:cral_dev_password@localhost:5432/cral_dev",
  migrations: {
    directory: migrationsDir,
    extension: "ts",
    loadExtensions: [".ts"],
  },
  pool: { min: 2, max: 10 },
};

export default config;
