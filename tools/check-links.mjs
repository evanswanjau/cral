#!/usr/bin/env node
// npm run check:links - every in-app link against the app's own router.
//
// For apps/customer and apps/merchant it reads the route table (App.tsx,
// and routes.tsx once the customer routes move there), then every link
// literal in the app's .tsx files: to="...", to={"..."}, to={`...`},
// to: "/...", href="...", href={`...`}, navigate("...").
//
// A link is fine when it matches a route (":param" and "*" are
// wildcards; the query and hash are ignored), is mailto:/tel:/http(s),
// or is a same-page "#hash". Anything else is reported, and so is every
// bare href="#". Links built entirely at runtime (to={next}) can't be
// read and are skipped.
//
// Default: print the findings and exit 0 (report mode).
// --strict: exit 1 when anything is found (UI7 puts this in the gate).

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const APPS = ["customer", "merchant"];
const ROUTE_FILES = ["App.tsx", "routes.tsx"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function routePatterns(src) {
  const paths = new Set();
  for (const file of ROUTE_FILES) {
    const p = join(src, file);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/path\s*[:=]\s*\{?\s*["'`]([^"'`]+)["'`]/g)) {
      paths.add(m[1].startsWith("/") ? m[1] : `/${m[1]}`);
    }
  }
  return [...paths].map((path) => ({
    path,
    re: new RegExp(
      "^" +
        path
          .replace(/\/$/, "")
          .split("/")
          .map((seg) => (seg === "*" ? ".*" : seg.startsWith(":") ? "[^/]+" : seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
          .join("/") +
        "/?$",
    ),
  }));
}

const LINK_RES = [
  /\bto=\{?\s*"([^"]*)"/g,
  /\bto=\{\s*'([^']*)'/g,
  /\bto=\{\s*`([^`]*)`/g,
  /\bto:\s*"(\/[^"]*)"/g,
  /\bhref=\{?\s*"([^"]*)"/g,
  /\bhref=\{\s*`([^`]*)`/g,
  /\bnavigate\(\s*"([^"]*)"/g,
  /\bnavigate\(\s*`([^`]*)`/g,
];

function check(link, routes) {
  if (link === "#") return "dead link";
  if (/^(mailto:|tel:|https?:\/\/|\/\/)/.test(link)) return null;
  if (link.startsWith("#") || link.startsWith("?") || link === "") return null;
  if (link.startsWith("${")) return null; // built at runtime
  if (!link.startsWith("/")) return "not an absolute path";
  // "/bookings/${id}" -> "/bookings/x"; "/browse${query}" -> "/browse".
  const path =
    link
      .replace(/\/\$\{[^}]*\}?/g, "/x")
      .replace(/\$\{.*$/, "")
      .split(/[?#]/)[0] || "/";
  return routes.some((r) => r.re.test(path)) ? null : "no route matches";
}

let total = 0;
for (const app of APPS) {
  const src = join(ROOT, "apps", app, "src");
  const routes = routePatterns(src);
  const findings = [];
  let links = 0;
  for (const file of walk(src)) {
    const text = readFileSync(file, "utf8");
    for (const re of LINK_RES) {
      for (const m of text.matchAll(re)) {
        links++;
        const reason = check(m[1], routes);
        if (reason) findings.push(`${relative(ROOT, file).replace(/\\/g, "/")}:${lineOf(text, m.index)}  ${m[1]}  (${reason})`);
      }
    }
  }
  total += findings.length;
  console.log(`${app}: ${routes.length} routes, ${links} links read, ${findings.length} to look at`);
  for (const f of findings.sort()) console.log(`  ${f}`);
}

if (STRICT && total > 0) process.exit(1);
