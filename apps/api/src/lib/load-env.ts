import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Always load the repo-root .env regardless of process.cwd() — npm
// workspace scripts, tsx, and vitest all set cwd differently.
const rootEnvPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", ".env");
config({ path: rootEnvPath, quiet: true });
