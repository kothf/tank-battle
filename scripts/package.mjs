#!/usr/bin/env node
/**
 * Build the distributable game: dist/tank-battle/ plus a versioned archive.
 *
 *   node scripts/package.mjs            # version from package.json
 *   node scripts/package.mjs 2.1.0      # explicit version (CI passes the tag)
 *
 * Output:
 *   dist/tank-battle/                       runtime files only, ?v= stamped
 *   dist/tank-battle-<version>.tar.gz       release asset
 *   dist/tank-battle-<version>.tar.gz.sha256
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = (process.argv[2] || pkg.version).replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) throw new Error(`Not a semver version: ${version}`);

// Everything the game needs at runtime; nothing else ships.
const RUNTIME = ["index.html", "style.css", "audio.js", "terrain.js", "particles.js", "tank.js", "weapons.js", "game.js", "screenshot.png"];

const dist = join(root, "dist");
const out = join(dist, "tank-battle");
rmSync(dist, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of RUNTIME) cpSync(join(root, f), join(out, f));

// Cache busting: CDNs (e.g. Cloudflare) cache .js/.css for hours, so every
// release gets its own asset URLs. Source uses ?v=dev.
const html = readFileSync(join(out, "index.html"), "utf8");
const stamped = html.replace(/\?v=dev\b/g, `?v=${version}`);
if (stamped === html) throw new Error("index.html has no ?v=dev asset URLs to stamp");
writeFileSync(join(out, "index.html"), stamped);
writeFileSync(join(out, "VERSION"), `${version}\n`);

const archive = `tank-battle-${version}.tar.gz`;
// --sort/--mtime/--owner make the archive byte-identical for identical input
execFileSync("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner",
  "--use-compress-program=gzip -n", "-C", dist, "-cf", join(dist, archive), "tank-battle"]);
const sha = createHash("sha256").update(readFileSync(join(dist, archive))).digest("hex");
writeFileSync(join(dist, `${archive}.sha256`), `${sha}  ${archive}\n`);

console.log(`Packaged tank-battle ${version}\n  ${archive}\n  sha256 ${sha}`);
