# 🎮 Retro Tank Battle (Turn-Based Scorched Earth with AI Bot)

![Retro Tank Battle Screenshot](screenshot.png)

### 🌐 [Play Live Demo on GitHub Pages](https://kothf.github.io/tank-battle/)

A complete, retro-styled turn-based tank artillery battle game inspired by classics such as **Scorched Earth**, **Pocket Tanks**, and **Artillery**, built completely with vanilla HTML5, CSS3, modern JavaScript, HTML5 `<canvas>`, and the Web Audio API. Play 2-player local multiplayer or solo against an intelligent AI Bot with selectable skill levels. Zero external dependencies.

---

## 🌟 Key Features

### 1. 🤖 Play With Intelligent Bot (Selectable Skill Levels)
- **👥 2-Player Local PvP Mode:** Play against a friend on the same device.
- **🤖 Solo vs AI Bot Mode:** Challenge an autonomous computer opponent.
- **3 Selectable Skill Levels:**
  - **🟢 Recruit (Easy):** Relaxed opponent with high aim variance and occasional wind misjudgments; ideal for casual practice.
  - **🟡 Veteran (Medium):** Competitive opponent with solid ballistic approximation, tactical weapon choice, and wind compensation.
  - **🔴 Elite (Hard):** Master sniper AI running real-time subterranean & ballistic trajectory simulations, repositioning from bad slopes, and choosing devastating weapons like Nukes, MIRVs, or Tunnel Drills to bypass terrain!

### 2. 🎯 Tactical Ballistics & Rebalanced Arsenal
- **Enhanced Firing Impulse:** High-velocity launch physics allowing projectiles to crest towering mountains and punch through dynamic wind conditions.
- **Tuned Damage Curve:** Balanced against the 100 HP tank pool (inspired by classic artillery games like *Worms*, *Pocket Tanks*, and *ShellShock Live*) for multi-turn tactical strategy rather than instant one-shot eliminations.
- **Fair Fall Mechanics:** Scaled cliff fall damage with a safe threshold and 30 HP ceiling to reward terrain destruction while keeping duels competitive.

### 3. ⛏️ Brand New Weapon: Tunnel Drill (Subterranean Missile)
- **Earth Penetration:** Fires straight through solid dirt and rock formations instead of exploding on impact.
- **Subterranean Carving:** Drills a tunnel through terrain, emitting fiery sparks and stone-grinding sound effects.
- **Proximity & Contact Trigger:** Explodes with solid direct (32 HP) and splash (20 HP) damage upon reaching or passing directly beneath enemy tanks.
- **Emerge & Fly:** Can enter a mountain, tunnel through the core, exit into the air on the other side, and strike targets beyond.

### 4. Rich Arsenal & Weapon Mechanics
1. **💣 Standard Shell (Infinite Ammo):** Classic cannon shell with balanced trajectory, direct damage (25 HP), and splash damage (16 HP).
2. **☢️ Heavy Nuke (x2 Ammo):** High-mass thermonuclear payload with lower velocity, massive blast crater (50px radius), 50 direct damage, 35 splash damage, blinding flash, and screen shake.
3. **💥 MIRV Cluster (x3 Ammo):** Artillery missile that automatically separates at the apex of its arc into **5 spreading bomblets** (14 direct / 10 splash each), blanketing the terrain.
4. **⛰️ Dirt Bomb / Terraformer (x3 Ammo):** Non-lethal terraforming warhead that deposits a massive solid earthen dome to bury enemies, seal craters, or create defensive ramparts.
5. **⚽ Bouncy Shot (x3 Ammo):** Rubber-coated explosive shell that bounces off terrain up to 3 times (28 direct / 18 splash) before detonating.
6. **⚡ Sniper Piercer (x2 Ammo):** Ultra-high-velocity kinetic slug with flat trajectory that pierces through hills (35 direct / 12 splash).
7. **⛏️ Tunnel Drill (x2 Ammo):** Subterranean torpedo boring directly through mountains and terrain (32 direct / 20 splash).

### 5. Retro Pixel-Art Architecture & Procedural Terrain
- **Virtual Native Resolution:** Internal 640x360 pixel-art canvas.
- **Crisp Pixel Scaling:** Scaled via CSS `image-rendering: pixelated` and `image-rendering: crisp-edges` with responsive arcade framing.
- **Pico-8 / EGA 16-Color Palette:** Vibrant retro tones including layered dithered dirt, rock substrata, rolling hills, twinkling night skies, and animated clouds.
- **CRT Scanlines Mode:** Built-in scanlines toggle button for an authentic arcade cabinet look.
- **Procedural Heightmap & Pixel Destruction:** Projectiles carve true circular craters out of the landscape. Unsupported earth crumbles with gravity.
- **Slope-Tracking Tanks & Fall Damage:** Tanks detect ground elevation beneath treads and smoothly align with slopes, taking realistic drop damage when falling from blown-out cliffs.

### 6. Dynamic Web Audio API Synthesizer
- **Zero External Audio Files:** All retro 8-bit sound effects are generated dynamically via procedural oscillators, filters, noise buffers, and envelopes.
- **Sound Palette:** Cannon thumps, thermonuclear sub-bass booms, MIRV apex separation pops, dirt deposit rumbles, bouncy shell chirps, subterranean drill grinding, engine chugging, impact crunches, and 8-bit victory fanfares.

---

## 🕹️ Controls

The game supports both **full keyboard shortcuts** and **on-screen touch/mouse buttons** for desktop, tablet, and mobile play:

| Action | Keyboard Shortcut | On-Screen Control |
| :--- | :--- | :--- |
| **Drive Tank** | `A` / `D` or `◀` / `▶` Arrow keys | `◀ LEFT` / `RIGHT ▶` buttons (hold to drive) |
| **Aim Angle** | `W` / `S` or `▲` / `▼` Arrow keys | Angle slider, `[-]` / `[+]` buttons, or click/drag directly on canvas |
| **Fire Power** | `Q` / `E` | Power slider, `[-]` / `[+]` buttons |
| **Choose Weapon** | Number keys `1` through `7` | Click weapon inventory cards |
| **Switch Mode** | — | `👥 2 PLAYERS` / `🤖 VS BOT` buttons |
| **Bot Skill** | — | `RECRUIT` / `VETERAN` / `ELITE` buttons |
| **FIRE!** | `SPACE` or `ENTER` | Big red `🔥 FIRE!` button |
| **Toggle Sound** | `M` | `🔊 SOUND` button |
| **Toggle Scanlines** | — | `📺 SCANLINES` button |
| **Help Manual** | `H` | `❓ HELP / KEYS` button |
| **Restart / New Map** | `R` | `🔄 NEW MAP` / `⚔️ REMATCH` button |
| **Fullscreen** | — | `⛶ FULLSCREEN` button |

---

## 🚀 How to Run

Because the project uses pure vanilla HTML5, CSS3, and JavaScript with zero external dependencies and standard relative scripts, you can run it immediately in any of the following ways:

### Method 1: Direct File Open
Simply double-click `index.html` in your file manager or open it directly in any web browser.

### Method 2: Local Web Server (Optional)
If you prefer running via a local HTTP server:
```bash
cd tank-battle
python3 -m http.server 8080
```
Then visit `http://localhost:8080` in your browser.
