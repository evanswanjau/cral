import "../lib/load-env.js";
import { db } from "../db/client.js";
import { LocalStorageAdapter } from "../adapters/storage/local-adapter.js";
import { B2StorageAdapter } from "../adapters/storage/b2-adapter.js";

/**
 * `npm run storage:migrate-b2 -w apps/api [-- --dry-run]` — one-off: copies
 * every file referenced by a `documents` row out of the local dev directory
 * and into the B2 bucket, under the same key.
 *
 * Driven off the table, not off a directory walk, deliberately. The local
 * storage dir accumulates orphans from test runs and re-seeds (687 files on
 * disk against 114 live rows when this was written); uploading all of them
 * would pay to store bytes nothing points at. A row with no file on disk is
 * reported rather than skipped silently — that's a document that was already
 * broken locally, and it will read the same way after the move.
 *
 * Safe to re-run: PutObject overwrites the same key with the same bytes.
 */
// Single wrapper so the rule is silenced once rather than at six call
// sites - this is a CLI script whose whole output is its report.
// eslint-disable-next-line no-console
const log = (...args: unknown[]): void => console.log(...args);

type DocRow = {
  id: string;
  storage_key: string;
  content_type: string | null;
  size_bytes: number | null;
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const rows: DocRow[] = await db("documents")
    .select("id", "storage_key", "content_type", "size_bytes")
    .orderBy("created_at", "asc");

  const local = new LocalStorageAdapter();
  // Constructed even on a dry run: a missing credential should fail here,
  // before anything reports success.
  const b2 = new B2StorageAdapter();

  log(`${rows.length} document rows to move${dryRun ? " (dry run)" : ""}\n`);

  let moved = 0;
  let bytes = 0;
  const missing: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    let body: Buffer;
    try {
      body = await local.getObject(row.storage_key);
    } catch {
      missing.push(`${row.id}  ${row.storage_key}`);
      continue;
    }

    if (dryRun) {
      moved += 1;
      bytes += body.byteLength;
      continue;
    }

    try {
      await b2.putObject({
        key: row.storage_key,
        body,
        contentType: row.content_type ?? "application/octet-stream",
      });
      // Read back rather than trusting the 200: a truncated upload and a
      // successful one look the same from the PutObject response alone.
      const roundTrip = await b2.getObject(row.storage_key);
      if (roundTrip.byteLength !== body.byteLength) {
        failed.push(`${row.id}  size mismatch: sent ${body.byteLength}, read ${roundTrip.byteLength}`);
        continue;
      }
      moved += 1;
      bytes += body.byteLength;
      process.stdout.write(".");
    } catch (err) {
      failed.push(`${row.id}  ${(err as Error).message}`);
    }
  }

  log(`\n\nuploaded  ${moved} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  if (missing.length > 0) {
    log(`\nno file on disk (${missing.length}) - these rows were already broken locally:`);
    for (const line of missing) log(`  ${line}`);
  }
  if (failed.length > 0) {
    log(`\nFAILED (${failed.length}):`);
    for (const line of failed) log(`  ${line}`);
  }

  await db.destroy();
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
