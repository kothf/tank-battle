#!/usr/bin/env node
/**
 * End-to-end smoke test in headless Chromium.
 *
 *   node tests/smoke.mjs                 # tests the source tree
 *   node tests/smoke.mjs dist/tank-battle  # tests the packaged build
 *
 * Math.random is seeded, so every run plays the same maps and shots.
 * Set CHROMIUM_PATH to use a specific browser binary.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv[2] || ".");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  try { res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" }); res.end(await readFile(path)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/index.html`;

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
// Deterministic randomness (mulberry32)
await page.addInitScript(() => {
  let s = 0x1234abcd;
  Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.goto(url);
await page.waitForFunction(() => window.game && window.game.state === "PLAYER_TURN");

const ui = await page.evaluate(() => ({
  cards: document.querySelectorAll(".weapon-card").length,
  help: document.querySelectorAll("#helpArsenal li").length,
  world: [game.terrain.width, game.terrain.height],
  weapons: WEAPON_ORDER.length
}));
check(ui.cards === ui.weapons && ui.help === ui.weapons, `weapon tray and help list generated for all ${ui.weapons} weapons`);
check(ui.world[0] > 640, `battlefield wider than the screen (${ui.world.join("x")})`);

// Every weapon: the bot (player 2) aims at player 1, simulation is stepped synchronously
const results = await page.evaluate(() => {
  const g = game, out = [];
  const holes = () => {
    const T = g.terrain;
    for (let x = 0; x < T.width; x++) for (let y = T.surfaceHeights[x]; y < T.height; y++) if (T.grid[y * T.width + x] === 0) return true;
    return false;
  };
  g.setGameMode("pvp"); g.botDifficulty = "hard";
  for (const id of WEAPON_ORDER) {
    let best = 0, done = true, holey = false, kinds = new Set(), maxLive = 0;
    for (let trial = 0; trial < 3; trial++) {
      g.startNewMatch();
      g.activePlayer = g.player2; g.state = "PLAYER_TURN";
      const t = g.player2; t.inventory[id] = 5; t.selectedWeapon = id;
      const aim = g.calculateBotAim(id); t.angle = aim.angle; t.power = aim.power;
      const hp0 = g.player1.hp;
      g.fire();
      let frames = 0;
      while (g.state !== "PLAYER_TURN" && g.state !== "GAME_OVER" && frames < 3000) {
        g.update(); frames++;
        const live = g.projectiles.filter(p => !p.isDead);
        maxLive = Math.max(maxLive, live.length);
        live.forEach(p => kinds.add(p.constructor.name + ":" + (p.weapon ? p.weapon.id : "")));
      }
      if (frames >= 3000) done = false;
      if (holes()) holey = true;
      best = Math.max(best, hp0 - g.player1.hp);
    }
    out.push({ id, best, done, holey, maxLive, kinds: [...kinds] });
  }
  return out;
});
for (const r of results) {
  check(r.done && !r.holey, `${r.id}: turn completes, terrain stays solid (best damage ${r.best})`);
}
const by = Object.fromEntries(results.map(r => [r.id, r]));
const has = (id, k) => by[id].kinds.some(x => x.includes(k));
check(by.triple.maxLive === 3, "Triple Shot fires three shells");
check(has("mirv", "mirvlet"), "MIRV splits into bomblets");
check(has("funky", "funkylet"), "Funky Bomb scatters bomblets");
check(has("napalm", "Flame"), "Napalm spawns flames");
check(has("airstrike", "Bomber") && has("airstrike", "airbomb"), "Air Strike bomber drops bombs");
const damaging = results.filter(r => r.id !== "dirt");
const hits = damaging.filter(r => r.best > 0).length;
check(hits >= damaging.length - 1, `Elite bot damages the target with ${hits}/${damaging.length} damaging weapons`);

// Fixed timestep: ~60 simulation steps per second regardless of display rate
const rate = await page.evaluate(() => new Promise(r => { const f0 = game.frame, t0 = performance.now(); setTimeout(() => r((game.frame - f0) / ((performance.now() - t0) / 1000)), 1500); }));
check(Math.abs(rate - 60) < 6, `simulation runs at ${rate.toFixed(1)} steps/s`);

check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
