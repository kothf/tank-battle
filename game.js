/**
 * Main loop, state machine, camera, HUD and bot for Retro Tank Battle
 * - World (battlefield) is larger than the screen; a camera follows the
 *   action, zooms with the wheel, V shows the whole field, a minimap pans.
 * - Fixed 60 Hz simulation step (same speed on 60/120/144 Hz screens).
 * - HUD is marked dirty and written once per frame, only changed values.
 */

// Canvas pixels: 360 tall; the width follows the shape of the space the
// screen gets (16:9 = 640 up to 3.2:1), so a wide, short window shows more
// battlefield instead of empty bars.
const VIEW_H = 360, VIEW_ASPECT = [4 / 3, 3.2];
let VIEW_W = 640;
const WORLD_H = 540;                  // battlefield height, pixels
// Battlefield widths (pixels); the 640-px view is ~2, ~3 and ~4.5 screens wide
const MAP_SIZES = { small: 1200, medium: 1800, large: 2800 };
let WORLD_W = MAP_SIZES.medium;
const STEP_MS = 1000 / 60;
const MINIMAP = { w: 192, h: 58, pad: 6 };

class TankBattleGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    let size = 'medium';
    try { size = localStorage.getItem('tankBattle.map') || size; } catch (e) {}
    this.mapSize = MAP_SIZES[size] ? size : 'medium';
    WORLD_W = MAP_SIZES[this.mapSize];
    RANGE_SCALE = rangeScaleFor(WORLD_W);
    this.width = WORLD_W;
    this.height = WORLD_H;

    this.terrain = new TerrainSystem(WORLD_W, WORLD_H);
    this.particles = new ParticleSystem();

    this.player1 = null;
    this.player2 = null;
    this.activePlayer = null;

    this.wind = 0;
    this.projectiles = [];
    this.stars = [];
    this.clouds = [];

    // 'PLAYER_TURN' | 'FLYING' | 'SETTLING' | 'GAME_OVER'
    this.state = 'INIT';
    this.settleFrames = 0;
    this.winner = null;
    this.frame = 0;

    // Camera (world units; zoom = canvas px per world px)
    this.fitZoom = Math.min(1, VIEW_W / WORLD_W);
    // manualZoom: the wheel took over from the automatic both-tanks framing
    this.cam = { x: 0, y: 0, zoom: 1, userZoom: 1, manualZoom: false, overview: false, free: false, fx: 0, fy: 0, focus: { x: 0, y: 0 } };

    this.keys = {};
    this.isDrivingLeft = false;
    this.isDrivingRight = false;
    this.aimAdjustDir = 0;
    this.powerAdjustDir = 0;

    this.gameMode = 'pvb';
    this.botDifficulty = 'medium';
    this.botState = 'IDLE';
    this.botTimer = 0;
    this.botTargetAngle = 45;
    this.botTargetPower = 65;
    this.botDriveDir = 0;
    this.botDriveFrames = 0;
    this.botLast = null;   // { angle, dx, botX, botY, botHp, playerX, playerY, playerHp }

    this.hudDirty = true;
    this.el = {};
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = MINIMAP.w;
    this.minimapCanvas.height = MINIMAP.h;
    this.minimapVersion = -1;

    this.initEnvironment();
    this.resizeView();
    if (window.ResizeObserver) new ResizeObserver(() => this.resizeView()).observe(this.canvas.parentElement);
    else window.addEventListener('resize', () => this.resizeView());
    this.initTanks();
    this.cacheDom();
    this.buildWeaponTray();
    this.buildHelp();
    this.setupEventListeners();
    this.startNewMatch();

    this.lastTime = performance.now();
    this.acc = 0;
    requestAnimationFrame(t => this.loop(t));
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  // New battlefield of another width: terrain, clouds and shell range follow
  setMapSize(size) {
    if (!MAP_SIZES[size]) return;
    this.mapSize = size;
    try { localStorage.setItem('tankBattle.map', size); } catch (e) {}
    WORLD_W = MAP_SIZES[size];
    RANGE_SCALE = rangeScaleFor(WORLD_W);
    this.width = WORLD_W;
    this.terrain = new TerrainSystem(WORLD_W, WORLD_H);
    this.fitZoom = Math.min(1, VIEW_W / WORLD_W);
    this.cam.userZoom = Math.max(this.fitZoom, this.cam.userZoom);
    this.cam.manualZoom = false;
    this.minimapVersion = -1;
    this.initClouds();
    this.renderMapButtons();
    if (window.soundFX) window.soundFX.playClick(600);
    this.startNewMatch();
  }
  renderMapButtons() {
    document.querySelectorAll('.btn-map').forEach(b => b.classList.toggle('active', b.dataset.size === this.mapSize));
  }
  initClouds() {
    // about one cloud per 130 px of sky
    this.clouds = Array.from({ length: Math.round(WORLD_W / 130) }, () => ({
      x: Math.random() * WORLD_W, y: 30 + Math.random() * WORLD_H * 0.3,
      w: 35 + Math.random() * 45, h: 8 + Math.random() * 8, speed: 0.1 + Math.random() * 0.25
    }));
  }

  // Sky and stars are screen space: rebuilt when the view width changes
  buildSky() {
    this.stars = Array.from({ length: Math.round(60 * VIEW_W / 640) }, () => ({
      x: Math.random() * VIEW_W, y: Math.random() * VIEW_H * 0.5,
      size: Math.random() < 0.2 ? 2 : 1, twinkle: Math.random() * Math.PI * 2, twinkleSpeed: 0.02 + Math.random() * 0.04
    }));
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = VIEW_W; this.skyCanvas.height = VIEW_H;
    const sc = this.skyCanvas.getContext('2d');
    const g = sc.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, '#0c1021'); g.addColorStop(0.45, '#1e1b4b'); g.addColorStop(0.75, '#4c1d95'); g.addColorStop(1, '#831843');
    sc.fillStyle = g; sc.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // Fit the canvas to its slot: the drawing width follows the slot's shape
  // (within VIEW_ASPECT), and the canvas is sized in CSS pixels to fill it.
  resizeView() {
    const frame = this.canvas.parentElement, fw = frame.clientWidth, fh = frame.clientHeight;
    if (!fw || !fh) return;
    const aspect = Math.max(VIEW_ASPECT[0], Math.min(VIEW_ASPECT[1], fw / fh));
    const cw = Math.min(fw, fh * aspect);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${cw / aspect}px`;
    const w = Math.round(VIEW_H * aspect / 2) * 2;
    if (w === VIEW_W) return;
    VIEW_W = w;
    this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.fitZoom = Math.min(1, VIEW_W / WORLD_W);
    this.buildSky();
    if (this.player1) this.snapCamera();
  }

  initEnvironment() {
    this.buildSky();
    this.initClouds();

    // Parallax mountain strips: periodic so they tile seamlessly
    const strip = (color, base, amp, seed) => {
      const c = document.createElement('canvas'); c.width = 960; c.height = VIEW_H;
      const x = c.getContext('2d');
      x.fillStyle = color; x.beginPath(); x.moveTo(0, VIEW_H);
      for (let i = 0; i <= 960; i += 8) {
        const t = i / 960 * Math.PI * 2;
        x.lineTo(i, VIEW_H * base - amp * (Math.sin(t * 3 + seed) * 0.6 + Math.sin(t * 7 + seed * 2) * 0.3 + Math.sin(t * 13 + seed) * 0.1));
      }
      x.lineTo(960, VIEW_H); x.closePath(); x.fill();
      return c;
    };
    this.mountainsFar = strip('#22143b', 0.62, 40, 1.3);
    this.mountainsNear = strip('#170e28', 0.72, 30, 4.1);
  }

  initTanks() {
    this.player1 = new Tank(1, 'PLAYER 1', 150, { hull: '#00E436', hullDark: '#008751', accent: '#29ADFF', barrel: '#C2C3C7' });
    this.player2 = new Tank(2, 'PLAYER 2', WORLD_W - 150, { hull: '#FF004D', hullDark: '#7E2553', accent: '#FFEC27', barrel: '#C2C3C7' });
    this.activePlayer = this.player1;
  }

  freshInventory() {
    const inv = {};
    WEAPON_ORDER.forEach(id => { inv[id] = WEAPONS[id].ammo; });
    return inv;
  }

  startNewMatch() {
    const p1x = Math.round(WORLD_W * (0.07 + Math.random() * 0.12));
    const p2x = Math.round(WORLD_W * (0.81 + Math.random() * 0.12));
    this.terrain.generate([p1x, p2x]);
    this.particles.reset();
    this.projectiles = [];
    this.winner = null;

    [[this.player1, p1x], [this.player2, p2x]].forEach(([t, x]) => {
      t.hp = 100; t.x = x; t.y = this.terrain.getSurfaceY(x);
      t.angle = 45; t.power = 65; t.isDead = false; t.isFalling = false; t.vy = 0; t.detachedTurret = null;
      t.inventory = this.freshInventory(); t.selectedWeapon = 'standard'; t.burnTally = 0;
      t.resetTurn();
    });

    this.botState = 'IDLE';
    this.botLast = null;
    this.activePlayer = this.player1;
    this.randomizeWind();
    this.state = 'PLAYER_TURN';
    this.cam.free = false;
    this.cam.overview = false;
    this.snapCamera();
    this.updateHUD();

    if (this.el.victoryModal) this.el.victoryModal.classList.add('hidden');
    if (window.soundFX) window.soundFX.playTurnStart(true);
  }

  randomizeWind() {
    this.wind = Math.round((Math.random() * 10 - 5) * 10) / 10;
  }

  // ---------------------------------------------------------------------------
  // Main loop: fixed-step simulation, render every animation frame
  // ---------------------------------------------------------------------------
  loop(now) {
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt > 250) dt = 250;            // tab was hidden: don't fast-forward
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP_MS && steps < 5) { this.update(); this.acc -= STEP_MS; steps++; }
    if (steps === 5) this.acc = 0;
    this.draw();
    if (this.hudDirty) this.renderHUD();
    requestAnimationFrame(t => this.loop(t));
  }

  update() {
    this.frame++;
    this.updateEnvironment();
    this.player1.updatePhysics(this.terrain, this.particles);
    this.player2.updatePhysics(this.terrain, this.particles);
    this.particles.update(this.terrain);

    if (this.state === 'PLAYER_TURN') {
      if (this.isBotTurn()) this.updateBot();
      else this.handleContinuousInput();
    } else if (this.state === 'FLYING') {
      this.updateProjectiles();
      this.updateHUD();
    } else if (this.state === 'SETTLING') {
      this.settleFrames--;
      const falling = (!this.player1.isDead && this.player1.isFalling) || (!this.player2.isDead && this.player2.isFalling);
      if ((this.settleFrames <= 0 && !falling) || this.settleFrames < -45) this.checkWinConditionOrNextTurn();
      this.updateHUD();
    }

    // Napalm burn totals, shown every half second
    if (this.frame % 30 === 0) {
      for (const t of [this.player1, this.player2]) {
        if (t.burnTally > 0) {
          this.particles.addFloatingText(t.x, t.y - 16, `-${t.burnTally} 🔥`, '#FFA300', false);
          t.burnTally = 0;
        }
      }
    }

    this.terrain.flush();
    this.updateCamera();
  }

  updateEnvironment() {
    const push = this.wind * 0.04;
    for (const c of this.clouds) {
      c.x += c.speed + push;
      if (c.x > WORLD_W + c.w) c.x = -c.w;
      if (c.x < -c.w) c.x = WORLD_W + c.w;
    }
    for (const s of this.stars) s.twinkle += s.twinkleSpeed;
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  cameraFocus() {
    const c = this.cam;
    if (c.free) return { x: c.fx, y: c.fy };
    if (this.state === 'FLYING') {
      // follow what is in the air (bomber/shells/flames), averaged
      let sx = 0, sy = 0, n = 0;
      for (const p of this.projectiles) {
        if (p.isDead) continue;
        const wgt = p instanceof Flame ? 0.3 : 1;
        sx += p.x * wgt; sy += Math.max(p.y, -150) * wgt; n += wgt;
      }
      if (n > 0) { c.focus = { x: sx / n, y: sy / n }; return c.focus; }
      return c.focus;
    }
    if (this.state === 'SETTLING' || this.state === 'GAME_OVER') return c.focus;
    // Player turn: frame both tanks (the zoom makes them fit), unless the
    // wheel zoomed in: then look ahead of the shooter
    const t = this.activePlayer, e = t === this.player1 ? this.player2 : this.player1;
    const vw = VIEW_W / this.targetZoom();
    if (!c.manualZoom || Math.abs(e.x - t.x) < vw * 0.8) c.focus = { x: (t.x + e.x) / 2, y: (t.y + e.y) / 2 - 20 };
    else c.focus = { x: t.x + Math.sign(e.x - t.x) * vw * 0.25, y: t.y - 30 };
    return c.focus;
  }
  targetZoom() {
    const c = this.cam;
    if (c.overview) return this.fitZoom;
    if (c.manualZoom || !this.player1) return c.userZoom;
    return this.bothTanksZoom();
  }
  // Largest zoom (up to 1:1) that shows both tanks with room around them
  bothTanksZoom() {
    const a = this.player1, b = this.player2;
    const zx = VIEW_W / (Math.abs(a.x - b.x) + 160), zy = VIEW_H / (Math.abs(a.y - b.y) + 190);
    return Math.max(this.fitZoom, Math.min(1, zx, zy));
  }
  cameraTarget() {
    const z = this.cam.zoom, f = this.cameraFocus();
    const vw = VIEW_W / z, vh = VIEW_H / z;
    // keep the ground under the focus in view (high shells and the bomber get
    // an edge marker instead of dragging the camera into empty sky)
    const fy = this.cam.free ? f.y : Math.max(f.y, this.terrain.getSurfaceY(f.x) - vh * 0.3);
    let x = f.x - vw / 2, y = fy - vh * 0.55;
    x = vw >= WORLD_W ? (WORLD_W - vw) / 2 : Math.max(0, Math.min(WORLD_W - vw, x));
    y = Math.min(WORLD_H - vh, Math.max(-200, y));
    return { x, y };
  }
  updateCamera() {
    const c = this.cam;
    c.zoom += (this.targetZoom() - c.zoom) * 0.15;
    const t = this.cameraTarget();
    const k = this.state === 'FLYING' ? 0.16 : 0.1;
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
  }
  snapCamera() {
    this.cam.zoom = this.targetZoom();
    const t = this.cameraTarget();
    this.cam.x = t.x; this.cam.y = t.y;
  }
  view() {
    const z = this.cam.zoom;
    return { x: this.cam.x, y: this.cam.y, w: VIEW_W / z, h: VIEW_H / z };
  }
  screenToWorld(mx, my) {
    return { x: this.cam.x + mx / this.cam.zoom, y: this.cam.y + my / this.cam.zoom };
  }

  // ---------------------------------------------------------------------------
  // Turn flow
  // ---------------------------------------------------------------------------
  handleContinuousInput() {
    const tank = this.activePlayer;
    let moved = false;
    if (this.keys.KeyA || this.keys.ArrowLeft || this.isDrivingLeft) moved = tank.drive(-1, this.terrain) || moved;
    if (this.keys.KeyD || this.keys.ArrowRight || this.isDrivingRight) moved = tank.drive(1, this.terrain) || moved;
    if (moved) { if (window.soundFX) window.soundFX.startEngine(); this.cam.free = false; this.updateHUD(); }
    else if (window.soundFX) window.soundFX.stopEngine();

    if (this.keys.KeyW || this.keys.ArrowUp || this.aimAdjustDir > 0) { tank.angle = Math.min(180, tank.angle + 0.6); this.updateHUD(); }
    if (this.keys.KeyS || this.keys.ArrowDown || this.aimAdjustDir < 0) { tank.angle = Math.max(0, tank.angle - 0.6); this.updateHUD(); }
    if (this.keys.KeyE || this.powerAdjustDir > 0) { tank.power = Math.min(100, tank.power + 0.5); this.updateHUD(); }
    if (this.keys.KeyQ || this.powerAdjustDir < 0) { tank.power = Math.max(5, tank.power - 0.5); this.updateHUD(); }
  }

  fire() {
    if (this.state !== 'PLAYER_TURN') return;
    const tank = this.activePlayer;
    const weaponId = tank.selectedWeapon, w = WEAPONS[weaponId];
    if (!w) return;
    if (!(tank.inventory[weaponId] > 0)) { tank.selectedWeapon = 'standard'; this.updateHUD(); return; }
    if (tank.inventory[weaponId] !== Infinity) tank.inventory[weaponId]--;

    const muzzle = tank.getMuzzlePosition();
    const speed = launchSpeed(tank.power, w);
    tank.recoil = 4;
    if (window.soundFX) window.soundFX.playShoot(weaponId);

    const spreads = w.spreadDeg || [0];
    this.projectiles = spreads.map(d => {
      const a = muzzle.angle + d * Math.PI / 180;
      return new Projectile(muzzle.x, muzzle.y, Math.cos(a) * speed, Math.sin(a) * speed, w, tank.id);
    });
    this.particles.createExplosion(muzzle.x, muzzle.y, 8);
    this.cam.free = false;
    this.state = 'FLYING';
    this.updateHUD();
  }

  updateProjectiles() {
    const tanks = [this.player1, this.player2];
    let anyAlive = false;
    const spawned = [];
    for (const p of this.projectiles) {
      if (p.isDead) continue;
      const r = p.update(this.wind, this.terrain, tanks, this.particles);
      if (r.exploded) this.cam.focus = { x: p.x, y: p.y };
      if (r.subProjectiles.length) spawned.push(...r.subProjectiles);
      if (!p.isDead) anyAlive = true;
    }
    if (spawned.length) { this.projectiles.push(...spawned); anyAlive = true; }
    // drop finished entities so long turns don't accumulate dead ones
    if (this.frame % 60 === 0) this.projectiles = this.projectiles.filter(p => !p.isDead);
    if (!anyAlive) { this.state = 'SETTLING'; this.settleFrames = 45; }
  }

  checkWinConditionOrNextTurn() {
    const p1Dead = this.player1.hp <= 0, p2Dead = this.player2.hp <= 0;
    if (p1Dead || p2Dead) {
      this.state = 'GAME_OVER';
      this.winner = p1Dead && p2Dead ? 'DRAW' : (p2Dead ? 'PLAYER 1' : 'PLAYER 2');
      this.showVictoryModal();
      if (window.soundFX) window.soundFX.playVictory();
      this.updateHUD();
      return;
    }
    this.activePlayer = this.activePlayer === this.player1 ? this.player2 : this.player1;
    this.activePlayer.resetTurn();
    if (!(this.activePlayer.inventory[this.activePlayer.selectedWeapon] > 0)) this.activePlayer.selectedWeapon = 'standard';
    this.randomizeWind();
    this.state = 'PLAYER_TURN';
    this.cam.free = false;
    this.cam.manualZoom = false;
    this.updateHUD();
    if (this.isBotTurn()) this.initiateBotTurn();
    else if (window.soundFX) window.soundFX.playTurnStart(this.activePlayer.id === 1);
  }

  showVictoryModal() {
    const { victoryModal: modal, victoryTitle: title, victorySubtitle: subtitle } = this.el;
    if (!modal || !title) return;
    const bot = this.gameMode === 'pvb', lvl = this.botDifficulty.toUpperCase();
    let t, color, sub;
    if (this.winner === 'DRAW') { t = 'MUTUAL DESTRUCTION!'; color = '#FFA300'; sub = 'Both tanks were obliterated!'; }
    else if (this.winner === 'PLAYER 1') {
      t = bot ? 'VICTORY OVER THE BOT!' : 'PLAYER 1 VICTORIOUS!'; color = '#00E436';
      sub = bot ? `You out-gunned the ${lvl} AI and reduced it to scrap!` : 'Player 2 was reduced to smoking scrap metal.';
    } else {
      t = bot ? 'DEFEATED BY BOT!' : 'PLAYER 2 VICTORIOUS!'; color = '#FF004D';
      sub = bot ? `The ${lvl} AI eliminated your tank with calculating precision.` : 'Player 1 was reduced to smoking scrap metal.';
    }
    title.innerText = t; title.style.color = color; subtitle.innerText = sub;
    modal.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground(ctx);

    const z = this.cam.zoom, shake = this.particles.getShakeOffset();
    // whole-pixel camera offset keeps pixel art crisp
    ctx.setTransform(z, 0, 0, z, Math.round(-this.cam.x * z + shake.x), Math.round(-this.cam.y * z + shake.y));
    const view = this.view();

    ctx.fillStyle = '#473b64';
    ctx.globalAlpha = 0.4;
    for (const c of this.clouds) {
      if (c.x + c.w < view.x || c.x > view.x + view.w) continue;
      ctx.fillRect(c.x | 0, c.y | 0, c.w, c.h);
      ctx.fillRect((c.x + 5) | 0, (c.y - 3) | 0, c.w - 10, c.h + 6);
    }
    ctx.globalAlpha = 1;

    this.terrain.draw(ctx, view);
    if (this.state === 'PLAYER_TURN' && !this.activePlayer.isDead) this.drawAimGuide(ctx, this.activePlayer);
    this.player1.draw(ctx);
    this.player2.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    this.particles.draw(ctx, view);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.particles.drawFlash(ctx, VIEW_W, VIEW_H);
    this.drawTankBeacons(ctx, view);
    this.drawOffscreenMarkers(ctx, view);
    this.drawMinimap(ctx, view);
  }

  drawBackground(ctx) {
    ctx.drawImage(this.skyCanvas, 0, 0);
    ctx.fillStyle = '#FFF1E8';
    for (const s of this.stars) {
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(s.twinkle));
      ctx.fillRect(s.x | 0, s.y | 0, s.size, s.size);
    }
    ctx.globalAlpha = 1;
    // parallax: far layer moves slowest
    const z = this.cam.zoom;
    [[this.mountainsFar, 0.15], [this.mountainsNear, 0.3]].forEach(([img, f]) => {
      const off = -((this.cam.x * z * f) % 960 + 960) % 960;
      const dy = Math.round(Math.max(-60, Math.min(60, -(this.cam.y * z) * f * 0.3)));
      for (let x = off; x < VIEW_W; x += 960) ctx.drawImage(img, Math.round(x), dy);
    });
  }

  // Trajectory preview: first 30 frames of the shot, stops where it meets the ground
  drawAimGuide(ctx, tank) {
    const w = WEAPONS[tank.selectedWeapon] || WEAPONS.standard;
    const muzzle = tank.getMuzzlePosition();
    const speed = launchSpeed(tank.power, w);
    let px = muzzle.x, py = muzzle.y, vx = Math.cos(muzzle.angle) * speed, vy = Math.sin(muzzle.angle) * speed;
    ctx.fillStyle = tank.id === 1 ? '#00E436' : '#FF004D';
    for (let f = 1; f <= 30; f++) {
      vx += this.wind * WIND_FORCE; vy += GRAVITY * w.gravityMult; vx *= 0.999; vy *= 0.999;
      px += vx; py += vy;
      if (this.terrain.isSolid(px, py) || px < -20 || px > WORLD_W + 20 || py > WORLD_H) break;
      if (f % 2 === 0) {
        ctx.globalAlpha = Math.max(0.2, 1 - f / 34 * 0.8);
        ctx.fillRect((px | 0) - 1, (py | 0) - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Zoomed out, tanks are a few pixels wide: a coloured chevron above each
  drawTankBeacons(ctx, view) {
    const z = this.cam.zoom;
    if (z > 0.75) return;
    ctx.globalAlpha = Math.min(1, (0.75 - z) * 8);
    for (const t of [this.player1, this.player2]) {
      if (t.isDead) continue;
      const sx = Math.round((t.x - view.x) * z), sy = Math.round((t.y - view.y) * z) - 14;
      if (sx < -10 || sx > VIEW_W + 10 || sy < -10 || sy > VIEW_H + 10) continue;
      const bob = Math.round(Math.sin(this.frame * 0.12) * 1.5);
      ctx.fillStyle = t.colors.hull;
      ctx.beginPath(); ctx.moveTo(sx - 5, sy - 6 + bob); ctx.lineTo(sx + 5, sy - 6 + bob); ctx.lineTo(sx, sy + bob); ctx.closePath(); ctx.fill();
      if (t === this.activePlayer && this.state === 'PLAYER_TURN') { ctx.fillStyle = '#FFF1E8'; ctx.fillRect(sx - 1, sy - 11 + bob, 2, 3); }
    }
    ctx.globalAlpha = 1;
  }

  // Edge arrows for shells and the enemy tank when they are out of view
  drawOffscreenMarkers(ctx, view) {
    const mark = (wx, wy, color, label) => {
      const sx = (wx - view.x) * this.cam.zoom, sy = (wy - view.y) * this.cam.zoom;
      if (sx >= 0 && sx <= VIEW_W && sy >= 0 && sy <= VIEW_H) return;
      const cx = Math.max(10, Math.min(VIEW_W - 10, sx)), cy = Math.max(10, Math.min(VIEW_H - 10, sy));
      const a = Math.atan2(sy - cy, sx - cx);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(a);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (label) {
        ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#FFF1E8';
        ctx.fillText(label, Math.max(24, Math.min(VIEW_W - 24, cx - Math.cos(a) * 14)), Math.max(10, Math.min(VIEW_H - 4, cy - Math.sin(a) * 12 + 3)));
      }
    };
    for (const p of this.projectiles) {
      if (p.isDead || p instanceof Flame) continue;
      mark(p.x, p.y, '#FFEC27', p.y < view.y ? `▲${Math.round(view.y - p.y)}` : '');
    }
    if (this.state === 'PLAYER_TURN') {
      const t = this.activePlayer, e = t === this.player1 ? this.player2 : this.player1;
      if (!e.isDead) mark(e.x, e.y - 6, e.colors.hull, `${Math.round(Math.abs(e.x - t.x))}px`);
    }
  }

  drawMinimap(ctx, view) {
    const m = MINIMAP, x0 = VIEW_W - m.w - m.pad, y0 = m.pad;
    if (this.minimapVersion !== this.terrain.version) {
      this.minimapVersion = this.terrain.version;
      const mc = this.minimapCanvas.getContext('2d');
      mc.clearRect(0, 0, m.w, m.h);
      mc.fillStyle = '#3b7d4a';
      const sy = m.h / WORLD_H;
      for (let i = 0; i < m.w; i++) {
        const top = this.terrain.getSurfaceY(Math.floor((i + 0.5) * WORLD_W / m.w)) * sy;
        mc.fillRect(i, top, 1, m.h - top);
      }
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#0b0f1c';
    ctx.fillRect(x0 - 1, y0 - 1, m.w + 2, m.h + 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.minimapCanvas, x0, y0);
    const kx = m.w / WORLD_W, ky = m.h / WORLD_H;
    for (const t of [this.player1, this.player2]) {
      ctx.fillStyle = t.isDead ? '#5F574F' : t.colors.hull;
      ctx.fillRect(Math.round(x0 + t.x * kx) - 2, Math.round(y0 + t.y * ky) - 3, 4, 3);
    }
    ctx.fillStyle = '#FFF1E8';
    for (const p of this.projectiles) {
      if (!p.isDead && p.y > 0) ctx.fillRect(Math.round(x0 + p.x * kx), Math.round(y0 + p.y * ky), 1, 1);
    }
    ctx.strokeStyle = '#FFEC27'; ctx.lineWidth = 1;
    const vx = Math.max(0, view.x), vy = Math.max(0, view.y);
    const vw = Math.min(WORLD_W, view.x + view.w) - vx, vh = Math.min(WORLD_H, view.y + view.h) - vy;
    ctx.strokeRect(Math.round(x0 + vx * kx) + 0.5, Math.round(y0 + vy * ky) + 0.5, Math.max(2, Math.round(vw * kx) - 1), Math.max(2, Math.round(vh * ky) - 1));
    this.minimapRect = { x: x0, y: y0, w: m.w, h: m.h };
  }

  // ---------------------------------------------------------------------------
  // HUD (DOM). updateHUD() only marks dirty; renderHUD() runs once per frame.
  // ---------------------------------------------------------------------------
  cacheDom() {
    ['p1HpFill', 'p1HpText', 'p2HpFill', 'p2HpText', 'fuelFill', 'fuelText', 'turnBanner', 'p1Card', 'p2Card', 'windArrow', 'windText',
      'angleSlider', 'angleVal', 'powerSlider', 'powerVal', 'powerMeterFill', 'fireBtn', 'weaponSelector', 'victoryModal', 'victoryTitle',
      'victorySubtitle', 'helpModal', 'helpArsenal', 'btnOverview'].forEach(id => { this.el[id] = document.getElementById(id); });
    this.el.p2Name = this.el.p2Card ? this.el.p2Card.querySelector('.p-name') : null;
  }
  updateHUD() { this.hudDirty = true; }

  renderHUD() {
    this.hudDirty = false;
    const el = this.el, a = this.activePlayer;
    const text = (node, v) => { if (node && node.__t !== v) { node.__t = v; node.textContent = v; } };
    const style = (node, prop, v) => { if (node && node.style[prop] !== v) node.style[prop] = v; };
    const hp = t => Math.max(0, Math.round(t.hp));
    style(el.p1HpFill, 'width', `${hp(this.player1)}%`); text(el.p1HpText, `${hp(this.player1)} / 100`);
    style(el.p2HpFill, 'width', `${hp(this.player2)}%`); text(el.p2HpText, `${hp(this.player2)} / 100`);
    if (a) {
      const fuel = Math.round(a.fuel / a.maxFuel * 100);
      style(el.fuelFill, 'width', `${fuel}%`); text(el.fuelText, `${fuel}%`);
    }
    const isBot = this.isBotTurn(), diff = { easy: 'RECRUIT', medium: 'VETERAN', hard: 'ELITE' }[this.botDifficulty] || 'BOT';
    if (el.turnBanner && a) {
      const p1 = a.id === 1;
      const botTxt = { THINKING: 'THINKING', DRIVING: 'MOVING', AIMING: 'AIMING' }[this.botState];
      text(el.turnBanner, p1 ? "PLAYER 1'S TURN" : (this.gameMode === 'pvb' ? (botTxt ? `🤖 BOT ${botTxt} [${diff}]...` : `🤖 BOT'S TURN [${diff}]`) : "PLAYER 2'S TURN"));
      const cls = `turn-banner ${p1 ? 'turn-p1' : 'turn-p2'}`;
      if (el.turnBanner.className !== cls) el.turnBanner.className = cls;
      if (el.p1Card) { el.p1Card.classList.toggle('active-player', p1); el.p2Card.classList.toggle('active-player', !p1); }
    }
    text(el.p2Name, this.gameMode === 'pvb' ? `🤖 BOT [${diff}] (RED)` : '🟥 P2 (RED)');
    if (el.windText) {
      const aw = Math.abs(this.wind);
      text(el.windText, `${this.wind > 0 ? 'EAST' : (this.wind < 0 ? 'WEST' : 'CALM')} ${aw.toFixed(1)}`);
      text(el.windArrow, this.wind === 0 ? '•' : (this.wind > 0 ? '➡' : '⬅'));
      style(el.windArrow, 'color', aw > 3 ? '#FF004D' : '#29ADFF');
    }
    if (a) {
      const ang = Math.round(a.angle), pow = Math.round(a.power);
      if (el.angleSlider && document.activeElement !== el.angleSlider && el.angleSlider.value !== String(ang)) el.angleSlider.value = ang;
      text(el.angleVal, `${ang}°`);
      if (el.powerSlider && document.activeElement !== el.powerSlider && el.powerSlider.value !== String(pow)) el.powerSlider.value = pow;
      text(el.powerVal, `${pow}%`);
      style(el.powerMeterFill, 'width', `${pow}%`);
      this.renderWeaponTray();
    }
    if (el.fireBtn) {
      const enabled = this.state === 'PLAYER_TURN' && !isBot;
      el.fireBtn.disabled = !enabled;
      el.fireBtn.classList.toggle('disabled', !enabled);
    }
    if (el.btnOverview) el.btnOverview.classList.toggle('active', this.cam.overview);
  }

  buildWeaponTray() {
    const host = this.el.weaponSelector;
    if (!host) return;
    host.innerHTML = '';
    this.weaponCards = {};
    WEAPON_ORDER.forEach((id, i) => {
      const w = WEAPONS[id];
      const card = document.createElement('div');
      card.className = 'weapon-card';
      card.id = `wcard-${id}`;
      card.title = `${w.name}: ${w.desc}`;
      const key = i < 9 ? String(i + 1) : (i === 9 ? '0' : '');
      card.innerHTML = `<div class="weapon-icon">${w.icon}</div><div class="weapon-title">${w.short}</div>` +
        `<div class="weapon-sub"><span class="ammo-count"></span><span class="key-hint">${key ? `[${key}]` : ''}</span></div>`;
      card.addEventListener('click', () => {
        if (this.isBotTurn()) return;
        if (window.soundFX) window.soundFX.ensureContext();
        this.selectWeapon(id);
      });
      host.appendChild(card);
      this.weaponCards[id] = { card, count: card.querySelector('.ammo-count') };
    });
  }
  renderWeaponTray() {
    const a = this.activePlayer;
    if (!a || !this.weaponCards) return;
    for (const id of WEAPON_ORDER) {
      const { card, count } = this.weaponCards[id];
      const n = a.inventory[id];
      const label = n === Infinity ? '∞' : `x${n}`;
      if (count.__t !== label) { count.__t = label; count.textContent = label; }
      card.classList.toggle('out-of-ammo', !(n > 0));
      card.classList.toggle('selected', a.selectedWeapon === id);
    }
  }
  buildHelp() {
    const ul = this.el.helpArsenal;
    if (!ul) return;
    ul.innerHTML = WEAPON_ORDER.map(id => `<li><strong>${WEAPONS[id].icon} ${WEAPONS[id].name}:</strong> ${WEAPONS[id].desc}</li>`).join('');
  }

  selectWeapon(weaponId) {
    if (!this.activePlayer || this.state !== 'PLAYER_TURN' || this.isBotTurn()) return;
    if (!(this.activePlayer.inventory[weaponId] > 0)) return;
    this.activePlayer.selectedWeapon = weaponId;
    if (window.soundFX) window.soundFX.playWeaponSelect();
    this.updateHUD();
  }
  cycleWeapon(dir) {
    const a = this.activePlayer;
    if (!a) return;
    let i = WEAPON_ORDER.indexOf(a.selectedWeapon);
    for (let k = 0; k < WEAPON_ORDER.length; k++) {
      i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      if (a.inventory[WEAPON_ORDER[i]] > 0) { this.selectWeapon(WEAPON_ORDER[i]); return; }
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  setupEventListeners() {
    window.addEventListener('keydown', e => {
      if (window.soundFX) window.soundFX.ensureContext();
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!this.isBotTurn()) this.fire(); }
      if (!this.isBotTurn()) {
        const m = e.code.match(/^Digit(\d)$/);
        if (m) { const i = m[1] === '0' ? 9 : +m[1] - 1; if (WEAPON_ORDER[i]) this.selectWeapon(WEAPON_ORDER[i]); }
        if (e.code === 'BracketRight') this.cycleWeapon(1);
        if (e.code === 'BracketLeft') this.cycleWeapon(-1);
      }
      if (e.code === 'KeyV') this.toggleOverview();
      if (e.code === 'KeyC') { this.cam.free = false; this.cam.overview = false; this.cam.manualZoom = false; this.updateHUD(); }
      if (e.code === 'KeyH') this.toggleHelpModal();
      if (e.code === 'KeyF') this.toggleFullscreen();
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (!this.keys.KeyA && !this.keys.ArrowLeft && !this.keys.KeyD && !this.keys.ArrowRight && !this.isDrivingLeft && !this.isDrivingRight) {
        if (window.soundFX) window.soundFX.stopEngine();
      }
    });

    const bindHold = (id, start, end) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = e => { e.preventDefault(); if (this.isBotTurn()) return; if (window.soundFX) window.soundFX.ensureContext(); start(); };
      const off = e => { e.preventDefault(); end(); };
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
      el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off, { passive: false }); el.addEventListener('touchcancel', off, { passive: false });
    };
    bindHold('btnDriveLeft', () => { this.isDrivingLeft = true; }, () => { this.isDrivingLeft = false; });
    bindHold('btnDriveRight', () => { this.isDrivingRight = true; }, () => { this.isDrivingRight = false; });
    bindHold('btnAngleDown', () => { this.aimAdjustDir = -1; }, () => { this.aimAdjustDir = 0; });
    bindHold('btnAngleUp', () => { this.aimAdjustDir = 1; }, () => { this.aimAdjustDir = 0; });
    bindHold('btnPowerDown', () => { this.powerAdjustDir = -1; }, () => { this.powerAdjustDir = 0; });
    bindHold('btnPowerUp', () => { this.powerAdjustDir = 1; }, () => { this.powerAdjustDir = 0; });

    const slider = (id, key) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', e => { if (this.isBotTurn() || !this.activePlayer) return; this.activePlayer[key] = parseFloat(e.target.value); this.updateHUD(); });
    };
    slider('angleSlider', 'angle');
    slider('powerSlider', 'power');

    const click = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    click('fireBtn', () => { if (this.isBotTurn()) return; if (window.soundFX) window.soundFX.ensureContext(); this.fire(); });
    click('btnRematch', () => { if (window.soundFX) window.soundFX.playClick(600); this.startNewMatch(); });
    click('btnRestartMatch', () => { if (window.soundFX) window.soundFX.playClick(600); this.startNewMatch(); });
    click('btnSoundToggle', () => this.toggleMute());
    if (window.soundFX) { window.soundFX.onChange(st => this.renderSoundButton(st)); this.renderSoundButton(window.soundFX.status()); }
    click('btnFullscreen', () => this.toggleFullscreen());
    const fsChange = () => this.setFullscreenLayout(!!(document.fullscreenElement || document.webkitFullscreenElement), true);
    document.addEventListener('fullscreenchange', fsChange);
    document.addEventListener('webkitfullscreenchange', fsChange);
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && this.fillWindow) this.setFullscreenLayout(false); });
    click('btnHelp', () => this.toggleHelpModal());
    click('btnCloseHelp', () => this.el.helpModal && this.el.helpModal.classList.add('hidden'));
    click('btnModePvP', () => this.setGameMode('pvp'));
    click('btnModePvB', () => this.setGameMode('pvb'));
    click('btnOverview', () => this.toggleOverview());
    document.querySelectorAll('.btn-map').forEach(btn => btn.addEventListener('click', () => this.setMapSize(btn.dataset.size)));
    this.renderMapButtons();
    document.querySelectorAll('.btn-diff').forEach(btn => btn.addEventListener('click', () => { if (btn.dataset.level) this.setBotDifficulty(btn.dataset.level); }));

    // Canvas: minimap pans the camera, elsewhere drag aims; wheel zooms
    const toCanvas = (cx, cy) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: (cx - r.left) * VIEW_W / r.width, y: (cy - r.top) * VIEW_H / r.height };
    };
    const inMinimap = p => this.minimapRect && p.x >= this.minimapRect.x && p.x <= this.minimapRect.x + this.minimapRect.w && p.y >= this.minimapRect.y && p.y <= this.minimapRect.y + this.minimapRect.h;
    const panTo = p => {
      const m = this.minimapRect;
      this.cam.free = true;
      this.cam.fx = (p.x - m.x) / m.w * WORLD_W;
      this.cam.fy = (p.y - m.y) / m.h * WORLD_H;
    };
    const pivot = tank => ({ x: tank.x + 9 * Math.sin(tank.slopeAngle || 0), y: tank.y - 9 * Math.cos(tank.slopeAngle || 0) });
    const aimAt = p => {
      if (this.state !== 'PLAYER_TURN' || !this.activePlayer || this.isBotTurn()) return;
      const w = this.screenToWorld(p.x, p.y), tank = this.activePlayer, pv = pivot(tank);
      const wa = Math.atan2(w.y - pv.y, w.x - pv.x);
      let rad = tank.id === 1 ? -wa : wa + Math.PI;
      if (rad < 0) rad += Math.PI * 2;
      const deg = rad * 180 / Math.PI;
      if (deg >= 0 && deg <= 180) { tank.angle = Math.round(deg); this.updateHUD(); }
    };
    let drag = null;
    const start = (cx, cy) => {
      if (window.soundFX) window.soundFX.ensureContext();
      const p = toCanvas(cx, cy);
      if (inMinimap(p)) { drag = 'pan'; panTo(p); return; }
      if (this.isBotTurn() || !this.activePlayer) return;
      // only grab the barrel near your own tank, so stray clicks don't swing it
      const pv = pivot(this.activePlayer), w = this.screenToWorld(p.x, p.y);
      if (Math.hypot(w.x - pv.x, w.y - pv.y) * this.cam.zoom > 150) return;
      drag = 'aim'; aimAt(p);
    };
    const move = (cx, cy) => {
      if (!drag) return;
      const p = toCanvas(cx, cy);
      if (drag === 'pan') { const m = this.minimapRect; panTo({ x: Math.max(m.x, Math.min(m.x + m.w, p.x)), y: Math.max(m.y, Math.min(m.y + m.h, p.y)) }); }
      else aimAt(p);
    };
    this.canvas.addEventListener('mousedown', e => start(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => { drag = null; });
    this.canvas.addEventListener('touchstart', e => { if (e.touches.length) start(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    this.canvas.addEventListener('touchmove', e => { if (e.touches.length) move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    window.addEventListener('touchend', () => { drag = null; });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.cam.overview = false;
      if (!this.cam.manualZoom) { this.cam.manualZoom = true; this.cam.userZoom = this.cam.zoom; }
      this.cam.userZoom = Math.max(this.fitZoom, Math.min(2, this.cam.userZoom * Math.exp(-e.deltaY * 0.0015)));
      this.updateHUD();
    }, { passive: false });

    const screenFrame = document.getElementById('screenFrame');
    click('btnScanlines', () => { if (screenFrame) screenFrame.classList.toggle('scanlines-enabled'); if (window.soundFX) window.soundFX.playClick(500); });
  }

  toggleOverview() {
    this.cam.overview = !this.cam.overview;
    if (!this.cam.overview) this.cam.userZoom = Math.max(this.cam.userZoom, 1);
    if (window.soundFX) window.soundFX.playClick(650);
    this.updateHUD();
  }
  toggleMute() {
    const sfx = window.soundFX;
    if (!sfx) return;
    // the first click only starts audio (the gesture unlocks it); later ones mute
    if (sfx.status() === 'locked' && !sfx.muted) { sfx.playClick(650); return; }
    sfx.toggleMute();
    if (!sfx.muted) sfx.playClick(650);
  }
  renderSoundButton(status) {
    const btn = document.getElementById('btnSoundToggle');
    if (!btn) return;
    btn.textContent = status === 'muted' ? '🔇 MUTED' : status === 'on' ? '🔊 SOUND ON' : '🔈 CLICK FOR SOUND';
    btn.title = status === 'muted' ? 'Sound is muted: click or press M to turn it on' : status === 'on' ? 'Click or press M to mute' : 'Browsers start sound after your first click or key press';
    btn.classList.toggle('active', status === 'on');
  }
  // Fullscreen API where there is one; otherwise (iPhone) fill the window.
  // Either way body.fs switches to the fit-to-screen layout.
  toggleFullscreen() {
    const d = document, el = d.documentElement;
    const active = d.fullscreenElement || d.webkitFullscreenElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    const exit = d.exitFullscreen || d.webkitExitFullscreen;
    if (active) { Promise.resolve(exit.call(d)).catch(() => {}); return; }
    if (this.fillWindow) { this.setFullscreenLayout(false); return; }
    if (request) {
      Promise.resolve(request.call(el)).catch(() => this.setFullscreenLayout(true));
    } else this.setFullscreenLayout(true);
  }
  setFullscreenLayout(on, viaApi) {
    this.fillWindow = on && !viaApi;
    document.body.classList.toggle('fs', on);
    const btn = document.getElementById('btnFullscreen');
    if (btn) btn.textContent = on ? '⛶ EXIT FULLSCREEN' : '⛶ FULLSCREEN';
    window.scrollTo(0, 0);
    this.updateHUD();
  }
  toggleHelpModal() {
    if (this.el.helpModal) { this.el.helpModal.classList.toggle('hidden'); if (window.soundFX) window.soundFX.playClick(600); }
  }

  isBotTurn() {
    return this.gameMode === 'pvb' && this.activePlayer && this.activePlayer.id === 2;
  }
  setGameMode(mode) {
    this.gameMode = mode;
    const pvp = document.getElementById('btnModePvP'), pvb = document.getElementById('btnModePvB'), grp = document.getElementById('botDiffGroup');
    if (pvp) pvp.classList.toggle('active', mode === 'pvp');
    if (pvb) pvb.classList.toggle('active', mode === 'pvb');
    if (grp) grp.classList.toggle('disabled', mode === 'pvp');
    if (window.soundFX) window.soundFX.playClick(700);
    if (mode === 'pvb' && this.activePlayer && this.activePlayer.id === 2 && this.state === 'PLAYER_TURN') this.initiateBotTurn();
    else if (mode === 'pvp') this.botState = 'IDLE';
    this.updateHUD();
  }
  setBotDifficulty(level) {
    this.botDifficulty = level;
    document.querySelectorAll('.btn-diff').forEach(btn => btn.classList.toggle('active', btn.dataset.level === level));
    if (window.soundFX) window.soundFX.playClick(850);
    if (this.botState === 'THINKING') this.botTimer = 15;
    this.updateHUD();
  }

  // ---------------------------------------------------------------------------
  // Bot
  // ---------------------------------------------------------------------------
  initiateBotTurn() {
    this.botState = 'THINKING';
    this.botTimer = 35;
    this.botDriveDir = 0;
    this.botDriveFrames = 0;
    if (window.soundFX) window.soundFX.playTurnStart(false);
    this.updateHUD();
  }

  updateBot() {
    const tank = this.activePlayer;
    if (!tank || tank.isDead) return;
    if (this.botState === 'THINKING') {
      if (--this.botTimer > 0) return;
      // Nothing moved and nobody was hit since the last shot: keep the weapon
      // and barrel angle, correct the power (bracketing like a human gunner)
      const L = this.botLast, P = this.player1;
      const botHit = !!L && tank.hp < L.botHp;
      const changed = !L || botHit || P.hp < L.playerHp || Math.abs(tank.x - L.botX) > 2 || Math.abs(tank.y - L.botY) > 2 ||
        Math.abs(P.x - L.playerX) > 2 || Math.abs(P.y - L.playerY) > 2;
      if (changed || !(tank.inventory[tank.selectedWeapon] > 0)) this.botSelectWeapon();
      const aim = this.calculateBotAim(tank.selectedWeapon, changed ? null : L);
      this.botTargetAngle = aim.angle; this.botTargetPower = aim.power;
      const drive = changed && this.botDifficulty !== 'easy' && tank.fuel >= 20 && (botHit || Math.abs(tank.slopeAngle) > 0.4);
      if (drive) {
        // edge of the map: drive inward, otherwise mostly toward the enemy
        const toward = Math.sign(this.player1.x - tank.x) || -1;
        this.botDriveDir = tank.x < 80 ? 1 : tank.x > WORLD_W - 80 ? -1 : (Math.random() < 0.6 ? toward : -toward);
        this.botDriveFrames = 15 + Math.floor(Math.random() * 25);
        this.botState = 'DRIVING';
      } else this.botState = 'AIMING';
      this.updateHUD();
    } else if (this.botState === 'DRIVING') {
      this.botDriveFrames--;
      const moved = tank.drive(this.botDriveDir, this.terrain);
      if (moved && window.soundFX) window.soundFX.startEngine();
      this.updateHUD();
      if (this.botDriveFrames <= 0 || !moved || tank.fuel <= 5) {
        if (window.soundFX) window.soundFX.stopEngine();
        const aim = this.calculateBotAim(tank.selectedWeapon, null);
        this.botTargetAngle = aim.angle; this.botTargetPower = aim.power;
        this.botState = 'AIMING';
      }
    } else if (this.botState === 'AIMING') {
      const da = this.botTargetAngle - tank.angle, dp = this.botTargetPower - tank.power;
      tank.angle = Math.abs(da) > 1.2 ? tank.angle + Math.sign(da) * 1.2 : this.botTargetAngle;
      tank.power = Math.abs(dp) > 1.5 ? tank.power + Math.sign(dp) * 1.5 : this.botTargetPower;
      this.updateHUD();
      if (Math.abs(da) <= 1.2 && Math.abs(dp) <= 1.5) { this.botState = 'FIRING'; this.botTimer = 18; }
    } else if (this.botState === 'FIRING') {
      if (--this.botTimer <= 0) {
        const P = this.player1;
        this.botLast = { angle: tank.angle, dx: this.botAimDx || 0, botX: tank.x, botY: tank.y, botHp: tank.hp, playerX: P.x, playerY: P.y, playerHp: P.hp };
        this.botState = 'IDLE';
        this.fire();
      }
    }
  }

  // Situation-aware weighted pick; falls back to the standard shell
  botSelectWeapon() {
    const tank = this.activePlayer, inv = tank.inventory, target = this.player1;
    let ridge = Infinity;
    const lo = Math.min(tank.x, target.x) + 40, hi = Math.max(tank.x, target.x) - 40;
    for (let x = lo; x <= hi; x += 10) ridge = Math.min(ridge, this.terrain.getSurfaceY(x));
    const obstructed = ridge < Math.min(tank.y, target.y) - 40;
    // target in a hollow: ground rises on both sides
    const inHollow = this.terrain.getSurfaceY(target.x - 50) < target.y - 10 && this.terrain.getSurfaceY(target.x + 50) < target.y - 10;
    const lvl = this.botDifficulty;
    const w = {};
    const add = (id, weight) => { if (inv[id] > 0) w[id] = (w[id] || 0) + weight; };
    add('standard', lvl === 'easy' ? 6 : 3);
    if (lvl === 'easy') { add('bouncy', 1.2); add('dirt', 1); add('triple', 1); add('roller', 0.8); }
    else {
      const k = lvl === 'hard' ? 1.5 : 1;
      add('triple', 1.5); add('mirv', 1.2 * k); add('funky', 1 * k); add('bouncy', 0.8); add('sniper', obstructed ? 0.2 : 0.8);
      if (obstructed) { add('drill', 3 * k); add('homing', 2 * k); add('airstrike', 2 * k); }
      if (inHollow) { add('napalm', 3 * k); add('roller', 2 * k); }
      if (target.hp <= 55) add('nuke', 4 * k); else add('nuke', 0.8 * k);
      add('homing', 0.6); add('napalm', 0.5);
    }
    let total = 0;
    for (const id in w) total += w[id];
    let r = Math.random() * total, chosen = 'standard';
    for (const id in w) { r -= w[id]; if (r <= 0) { chosen = id; break; } }
    tank.selectedWeapon = chosen;
    if (window.soundFX) window.soundFX.playWeaponSelect();
  }

  // Ballistic search: coarse grid, then refine around the best shot.
  // Difficulty = how far from the target the bot aims (and how well it reads
  // the wind), so skill feels the same at any range.
  calculateBotAim(weaponId, last) {
    const w = WEAPONS[weaponId] || WEAPONS.standard;
    const shooter = this.activePlayer, target = this.player1;
    let wind = this.wind, dx;
    if (this.botDifficulty === 'easy') {
      if (Math.random() < 0.65) wind = 0;
      dx = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 90);
    } else if (this.botDifficulty === 'medium') {
      wind *= 0.85 + Math.random() * 0.3;
      dx = (Math.random() - 0.5) * 90;
    } else {
      dx = (Math.random() - 0.5) * 12;
    }
    if (last) dx = last.dx * 0.5;          // bracketing: each repeat shot lands closer
    this.botAimDx = dx;
    const ax = Math.max(10, Math.min(WORLD_W - 10, target.x + dx));
    const aimPoint = { x: ax, y: this.terrain.getSurfaceY(ax) };
    const minA = w.isDrill ? 14 : 20, maxA = w.isDrill ? 65 : 80;
    let best = { a: 45, p: 65, d: Infinity };
    const tryShot = (a, p) => {
      const d = this.simulateBotTrajectory(shooter, a, p, w, wind, aimPoint);
      if (d < best.d) best = { a, p, d };
    };
    if (last) {
      for (let p = 5; p <= 100; p += 0.25) tryShot(last.angle, p);
      return { angle: last.angle, power: best.p };
    }
    for (let a = minA; a <= maxA; a += 3) for (let p = 20; p <= 100; p += 2.5) tryShot(a, p);
    const c = best;
    for (let a = c.a - 3; a <= c.a + 3; a += 0.5) for (let p = c.p - 3; p <= c.p + 3; p += 0.25) if (p >= 5 && p <= 100) tryShot(a, p);
    return { angle: Math.max(5, Math.min(175, best.a)), power: Math.max(5, Math.min(100, best.p)) };
  }

  // Closest approach (px) of a shot to the aim point; 0 = direct hit.
  // Same physics and 2-px collision sub-steps as Projectile.update.
  simulateBotTrajectory(shooter, angleDeg, powerPct, w, wind, target) {
    const wa = shooter.id === 1 ? -angleDeg * Math.PI / 180 : -Math.PI + angleDeg * Math.PI / 180;
    const slope = shooter.slopeAngle || 0;
    let x = shooter.x + 9 * Math.sin(slope) + Math.cos(wa) * 12, y = shooter.y - 9 * Math.cos(slope) + Math.sin(wa) * 12;
    const sp = launchSpeed(powerPct, w);
    let vx = Math.cos(wa) * sp, vy = Math.sin(wa) * sp;
    const g = GRAVITY * w.gravityMult, wf = wind * WIND_FORCE, T = this.terrain;
    let minD = Infinity;
    for (let f = 0; f < 600; f++) {
      vx += wf; vy += g; vx *= 0.999; vy *= 0.999;
      const steps = Math.max(1, Math.ceil(Math.hypot(vx, vy) / 2));
      for (let s = 1; s <= steps; s++) {
        const cx = x + vx * s / steps, cy = y + vy * s / steps;
        if (cx < -30 || cx > WORLD_W + 30 || cy > WORLD_H + 20) return minD;
        const d = Math.hypot(cx - target.x, cy - (target.y - 6));
        if (d < minD) minD = d;
        if (cx >= target.x - 9 && cx <= target.x + 9 && cy >= target.y - 12 && cy <= target.y + 2) return 0;
        if (w.isDrill) { if (f > 8 && d <= 16) return 0; continue; }
        if (T.isSolid(cx, cy)) {
          // splash weapons: where it lands matters, scored by distance to the mark
          return Math.min(minD, Math.hypot(cx - target.x, cy - target.y) * (w.isRoller || w.isNapalm ? 0.8 : 1));
        }
      }
      x += vx; y += vy;
    }
    return minD;
  }
}

window.TankBattleGame = TankBattleGame;
window.addEventListener('DOMContentLoaded', () => { window.game = new TankBattleGame(); });
