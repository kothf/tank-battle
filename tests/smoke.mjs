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

// --- Sound: nothing is created before a gesture; the first click starts it ---
const snd0 = await page.evaluate(() => ({ ctx: !!soundFX.ctx, status: soundFX.status(), label: document.getElementById("btnSoundToggle").textContent }));
check(!snd0.ctx && snd0.status === "locked" && /CLICK FOR SOUND/.test(snd0.label), `no AudioContext before a user gesture (button: "${snd0.label}")`);
await page.mouse.click(300, 400);
await page.waitForFunction(() => soundFX.status() === "on", null, { timeout: 3000 }).catch(() => {});
const snd1 = await page.evaluate(() => {
  let osc = 0; const orig = soundFX.ctx.createOscillator.bind(soundFX.ctx);
  soundFX.ctx.createOscillator = () => { osc++; return orig(); };
  game.fire();
  soundFX.ctx.createOscillator = orig;
  return { state: soundFX.ctx.state, osc, label: document.getElementById("btnSoundToggle").textContent };
});
check(snd1.state === "running" && snd1.osc > 0 && /SOUND ON/.test(snd1.label), `first click starts audio: context ${snd1.state}, firing made ${snd1.osc} oscillators, button "${snd1.label}"`);
await page.keyboard.press("m");
const snd2 = await page.evaluate(() => ({ muted: soundFX.muted, label: document.getElementById("btnSoundToggle").textContent }));
await page.keyboard.press("m");
check(snd2.muted && /MUTED/.test(snd2.label) && !(await page.evaluate(() => soundFX.muted)), "M mutes and unmutes, and the button shows it");
await page.evaluate(() => { while (game.state !== "PLAYER_TURN") game.update(); localStorage.removeItem("tankBattle.muted"); });

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

// --- Map sizes: each one is playable end to end at the hardest spawns --------
const maps = await page.evaluate(() => {
  const g = game, out = [];
  for (const size of ["small", "medium", "large"]) {
    g.setMapSize(size);
    const W = g.terrain.width, gap = [];
    let worst = 0;
    for (let k = 0; k < 4; k++) {
      g.startNewMatch();
      // farthest spawns, full headwind for the bot (player 2 fires left)
      const t1 = g.player1, t2 = g.player2;
      t1.x = Math.round(W * 0.07); t2.x = Math.round(W * 0.93);
      g.terrain.generate([t1.x, t2.x]);
      t1.y = g.terrain.getSurfaceY(t1.x); t2.y = g.terrain.getSurfaceY(t2.x);
      g.activePlayer = t2; g.wind = 5; g.botDifficulty = "hard";
      const aim = g.calculateBotAim("standard");
      const miss = g.simulateBotTrajectory(t2, aim.angle, aim.power, WEAPONS.standard, g.wind, { x: t1.x, y: t1.y });
      worst = Math.max(worst, miss); gap.push(aim.power);
    }
    out.push({ size, W, worst, maxPower: Math.max(...gap), buttons: [...document.querySelectorAll(".btn-map.active")].map(b => b.dataset.size) });
  }
  g.setMapSize("medium");
  return out;
});
// both tanks in view when a turn starts, on every map size and window shape
for (const [w, h] of [[1366, 768], [1206, 700], [844, 390], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  const seen = await page.evaluate(() => {
    const out = [];
    for (const size of ["small", "medium", "large"]) {
      game.setMapSize(size);
      for (let k = 0; k < 3; k++) {
        game.startNewMatch();
        for (let i = 0; i < 120; i++) game.updateCamera();
        const v = game.view(), inView = t => t.x - 9 >= v.x && t.x + 9 <= v.x + v.w && t.y - 14 >= v.y && t.y <= v.y + v.h;
        out.push(inView(game.player1) && inView(game.player2));
      }
    }
    game.setMapSize("medium");
    return out;
  });
  check(seen.every(Boolean), `${w}×${h}: both tanks in view at the start of the turn on small, medium and large maps (${seen.filter(Boolean).length}/${seen.length})`);
}
await page.setViewportSize({ width: 1280, height: 1000 });
// (the standard shell's blast radius is 24 px)
for (const m of maps) check(m.worst < 15 && m.buttons.join() === m.size,
  `${m.size} map ${m.W} px: Elite bot's farthest shot into full headwind lands within ${m.worst.toFixed(1)} px of the target (up to ${m.maxPower.toFixed(1)}% power)`);
check(maps[0].W < maps[1].W && maps[1].W < maps[2].W, "three map sizes: " + maps.map(m => m.W).join(" / ") + " px");

// Fixed timestep: ~60 simulation steps per second regardless of display rate
const rate = await page.evaluate(() => new Promise(r => { const f0 = game.frame, t0 = performance.now(); setTimeout(() => r((game.frame - f0) / ((performance.now() - t0) / 1000)), 1500); }));
check(Math.abs(rate - 60) < 6, `simulation runs at ${rate.toFixed(1)} steps/s`);

// --- Layout: no scrolling in fullscreen, nor in a laptop-sized window -------
const fits = async (w, h, fs) => {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(on => game.setFullscreenLayout(on), fs);
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const c = document.getElementById("gameCanvas").getBoundingClientRect(), f = document.getElementById("screenFrame").getBoundingClientRect(), d = document.documentElement;
    return { scroll: d.scrollHeight - innerHeight, hscroll: d.scrollWidth - innerWidth, cw: c.width, ch: c.height, fw: f.width, fh: f.height,
      px: game.canvas.width, fs: document.body.classList.contains("fs") };
  });
};
for (const [w, h, fs] of [[1920, 1080, true], [1366, 768, true], [1280, 720, true], [844, 390, true], [1366, 768, false], [1920, 1080, false]]) {
  const r = await fits(w, h, fs);
  // the game fills its slot (no bars) and the drawing keeps square pixels
  const fills = Math.abs(r.cw - r.fw) < 2 || Math.abs(r.ch - r.fh) < 2;
  check(r.scroll <= 0 && r.hscroll <= 0 && fills && Math.abs(r.cw / r.ch - r.px / 360) < 0.01 && r.ch > Math.min(200, h * 0.4) && r.fs === fs,
    `${fs ? "fullscreen" : "window"} ${w}×${h}: no scrolling, game fills its ${Math.round(r.fw)}×${Math.round(r.fh)} slot at ${Math.round(r.cw)}×${Math.round(r.ch)} (${r.px}×360 px)`);
}
await page.evaluate(() => game.setFullscreenLayout(false));
await page.setViewportSize({ width: 1280, height: 1000 });
await page.click("#btnFullscreen");
await page.waitForTimeout(300);
const fsOn = await page.evaluate(() => document.body.classList.contains("fs") && /EXIT/.test(document.getElementById("btnFullscreen").textContent));
await page.click("#btnFullscreen");
await page.waitForTimeout(300);
check(fsOn && !(await page.evaluate(() => document.body.classList.contains("fs"))), "fullscreen button enters and leaves the fit-to-screen layout");

check(errors.length === 0, `no page errors${errors.length ? ": " + errors[0] : ""}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
