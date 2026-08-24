/**
 * Runs migrations via tsx instead of the knex CLI's own TS loader (sucrase),
 * which doesn't resolve the `.js`-suffixed relative imports our migrations
 * use under Node's native ESM loader. `npm run migrate` / `migrate:rollback`
 * both go through this file so there's one working code path.
 */
import { db } from "./client.js";

const direction = process.argv[2] ?? "latest";

async function main(): Promise<void> {
  if (direction === "latest") {
    const [batch, log] = await db.migrate.latest();
    console.log(`Batch ${batch} run: ${log.length} migrations`, log);
  } else if (direction === "rollback") {
    const [batch, log] = await db.migrate.rollback();
    console.log(`Batch ${batch} rolled back: ${log.length} migrations`, log);
  } else {
    throw new Error(`Unknown direction "${direction}" — use "latest" or "rollback"`);
  }
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
