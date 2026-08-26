import type { Knex } from "knex";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Absolute path — a relative "./migrations" resolves against process.cwd(),
// which is wrong whenever this file is imported programmatically (as
// db/migrate.ts and db/client.ts do) rather than run via the knex CLI.
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Hand back DATE (OID 1082) columns as the raw "YYYY-MM-DD" string rather
 * than node-pg's default, which builds a JS Date at *local* midnight.
 *
 * A bare calendar date has no time and no zone — `vehicles.insurance_expiry`
 * is "the day the cover runs out", not an instant — so letting it through a
 * timezone-bearing type corrupts it. In Nairobi (UTC+3) a stored 2027-03-16
 * came back as 2027-03-15T21:00:00.000Z: a full ISO datetime, which renders
 * blank in an <input type="date">, and a day earlier than what was picked.
 * That is spec §2's "Nairobi time only for display — never stored" applied
 * to the read path.
 *
 * Registered here rather than in client.ts so the knex migration CLI, which
 * loads this file directly, gets the same parser. Timestamptz (1184) is left
 * alone: those are real instants and the service layer already .toISOString()s
 * them deliberately.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

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
