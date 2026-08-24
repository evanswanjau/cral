import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Bundle workspace packages (they're TS source, not pre-built) but leave
// real third-party dependencies as plain node_modules requires — no point
// bundling express/pg/knex/etc, and some have native bindings that don't
// bundle cleanly anyway.
const thirdPartyDeps = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@cral/"));

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external: thirdPartyDeps,
});
