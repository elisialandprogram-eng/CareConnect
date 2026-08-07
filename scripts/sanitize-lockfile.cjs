#!/usr/bin/env node
/**
 * sanitize-lockfile.cjs
 *
 * Rewrites any Replit-internal package registry URLs in package-lock.json
 * back to the public npm registry.
 *
 * Run manually after any `npm install` inside the Replit environment:
 *   node scripts/sanitize-lockfile.cjs
 *
 * The Replit environment injects NPM_CONFIG_REGISTRY=http://package-firewall.replit.local/npm/
 * at the OS level. Any newly-installed package will have its `resolved` URL written
 * as the internal proxy URL instead of registry.npmjs.org. This script corrects that
 * so the lockfile stays portable across all deployment platforms.
 */

const fs = require("fs");
const path = require("path");

const LOCKFILE = path.join(__dirname, "..", "package-lock.json");
const REPLIT_REGISTRY = "http://package-firewall.replit.local/npm/";
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

if (!fs.existsSync(LOCKFILE)) {
  console.error("package-lock.json not found at", LOCKFILE);
  process.exit(1);
}

const original = fs.readFileSync(LOCKFILE, "utf8");
const count = (original.match(new RegExp(REPLIT_REGISTRY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

if (count === 0) {
  console.log("✓ package-lock.json is clean — no Replit registry references found.");
  process.exit(0);
}

const fixed = original.replaceAll(REPLIT_REGISTRY, PUBLIC_REGISTRY);
fs.writeFileSync(LOCKFILE, fixed, "utf8");
console.log(`✓ Sanitized package-lock.json — replaced ${count} Replit registry URL(s) with ${PUBLIC_REGISTRY}`);
