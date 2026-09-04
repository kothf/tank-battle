/**
 * Main Game Loop, State Machine, HUD & Controller for Retro Tank Battle
 */

class TankBattleGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.width = 640;
    this.height = 360;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Subsystems
    this.terrain = new TerrainSystem(this.width, this.height);
    this.particles = new ParticleSystem();

    // Players
    this.player1 = null;
    this.player2 = null;
    this.activePlayer = null;

    // Environmental state
    this.wind = 0; // -5 to +5
    this.projectiles = [];
    this.stars = [];
    this.clouds = [];

    // State machine: 'INIT', 'PLAYER_TURN', 'FIRING', 'FLYING', 'SETTLING', 'GAME_OVER'
    this.state = 'INIT';
    this.settleFrames = 0;
    this.winner = null;

    // Input state
    this.keys = {};
    this.isDrivingLeft = false;
    this.isDrivingRight = false;
    this.aimAdjustDir = 0;
    this.powerAdjustDir = 0;

    // Stats
    this.stats = {
      p1Shots: 0,
      p1Hits: 0,
      p2Shots: 0,
      p2Hits: 0,
    };

    this.initEnvironment();
    this.initTanks();
    this.setupEventListeners();
    this.startNewMatch();

    // Start requestAnimationFrame loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * Ambient stars and drifting background clouds
   */
  initEnvironment() {
    this.stars = [];
    for (let i = 0; i < 45; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * (this.height * 0.45),
        size: Math.random() < 0.2 ? 2 : 1,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
      });
    }

    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: Math.random() * this.width,
        y: 20 + Math.random() * 70,
        w: 35 + Math.random() * 35,
        h: 8 + Math.random() * 8,
        speed: 0.1 + Math.random() * 0.25,
      });
    }
  }

  initTanks() {
    const p1Colors = {
      hull: '#00E436',
      hullDark: '#008751',
      accent: '#29ADFF',
      barrel: '#C2C3C7',
    };

    const p2Colors = {
      hull: '#FF004D',
      hullDark: '#7E2553',
      accent: '#FFEC27',
      barrel: '#C2C3C7',
    };

    this.player1 = new Tank(1, 'PLAYER 1', 95, p1Colors);
    this.player2 = new Tank(2, 'PLAYER 2', 545, p2Colors);
    this.activePlayer = this.player1;
  }

  startNewMatch() {
    this.terrain.generate();
    this.particles.reset();
    this.projectiles = [];
    this.winner = null;

    // Reset Player 1
    this.player1.hp = 100;
    this.player1.x = 95;
    this.player1.y = this.terrain.getSurfaceY(95);
    this.player1.angle = 45;
    this.player1.power = 65;
    this.player1.isDead = false;
    this.player1.detachedTurret = null;
    this.player1.inventory = { standard: Infinity, nuke: 2, mirv: 3, dirt: 3, bouncy: 3, sniper: 2 };
    this.player1.selectedWeapon = 'standard';
    this.player1.resetTurn();

    // Reset Player 2
    this.player2.hp = 100;
    this.player2.x = 545;
    this.player2.y = this.terrain.getSurfaceY(545);
    this.player2.angle = 45;
    this.player2.power = 65;
    this.player2.isDead = false;
    this.player2.detachedTurret = null;
    this.player2.inventory = { standard: Infinity, nuke: 2, mirv: 3, dirt: 3, bouncy: 3, sniper: 2 };
    this.player2.selectedWeapon = 'standard';
    this.player2.resetTurn();

    this.activePlayer = this.player1;
    this.randomizeWind();

    this.state = 'PLAYER_TURN';
    this.updateHUD();

    const victoryModal = document.getElementById('victoryModal');
    if (victoryModal) victoryModal.classList.add('hidden');

    if (window.soundFX) {
      window.soundFX.playTurnStart(true);
    }
  }

  randomizeWind() {
    // Wind between -5 and +5 (integer or half integer)
    this.wind = Math.round((Math.random() * 10 - 5) * 10) / 10;
  }

  /**
   * Main game loop
   */
  loop(currentTime) {
    const dt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    this.update();
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  /**
   * Logic update
   */
  update() {
    // Update ambient clouds & stars
    this.updateEnvironment();

    // Apply tank physics
    this.player1.updatePhysics(this.terrain, this.particles);
    this.player2.updatePhysics(this.terrain, this.particles);

    // Update particles & floating combat text
    this.particles.update(this.terrain);

    // Continuous input handling for active player during their turn
    if (this.state === 'PLAYER_TURN') {
      this.handleContinuousInput();
    }

    // Update projectiles in flight
    if (this.state === 'FLYING') {
      this.updateProjectiles();
    }

    // Settling state after explosion
    if (this.state === 'SETTLING') {
      this.settleFrames--;

      // Let tanks fall or adjust if ground beneath them collapsed
      const p1Falling = this.player1.isFalling;
      const p2Falling = this.player2.isFalling;

      if (this.settleFrames <= 0 && !p1Falling && !p2Falling) {
        this.checkWinConditionOrNextTurn();
      }
    }

    // Check dead tank animations
    if (this.state === 'GAME_OVER') {
      // Keep running particle & death animations
    }
  }

  updateEnvironment() {
    // Clouds drift with wind + intrinsic movement
    const windPush = this.wind * 0.04;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.x += c.speed + windPush;
      if (c.x > this.width + c.w) c.x = -c.w;
      if (c.x < -c.w) c.x = this.width + c.w;
    }

    // Stars twinkle
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].twinkle += this.stars[i].twinkleSpeed;
    }
  }

  handleContinuousInput() {
    const tank = this.activePlayer;
    let moved = false;

    // Movement: Left
    if (this.keys['KeyA'] || this.keys['ArrowLeft'] || this.isDrivingLeft) {
      if (tank.drive(-1, this.terrain)) {
        moved = true;
      }
    }

    // Movement: Right
    if (this.keys['KeyD'] || this.keys['ArrowRight'] || this.isDrivingRight) {
      if (tank.drive(1, this.terrain)) {
        moved = true;
      }
    }

    // Sound engine management
    if (moved) {
      if (window.soundFX) window.soundFX.startEngine();
      this.updateHUD();
    } else {
      if (window.soundFX) window.soundFX.stopEngine();
    }

    // Angle adjustment
    if (this.keys['KeyW'] || this.keys['ArrowUp'] || this.aimAdjustDir > 0) {
      tank.angle = Math.min(180, tank.angle + 0.6);
      this.updateHUD();
    }
    if (this.keys['KeyS'] || this.keys['ArrowDown'] || this.aimAdjustDir < 0) {
      tank.angle = Math.max(0, tank.angle - 0.6);
      this.updateHUD();
    }

    // Power adjustment
    if (this.keys['KeyE'] || this.powerAdjustDir > 0) {
      tank.power = Math.min(100, tank.power + 0.5);
      this.updateHUD();
    }
    if (this.keys['KeyQ'] || this.powerAdjustDir < 0) {
      tank.power = Math.max(5, tank.power - 0.5);
      this.updateHUD();
    }
  }

  /**
   * Fire weapon from active tank
   */
  fire() {
    if (this.state !== 'PLAYER_TURN') return;

    const tank = this.activePlayer;
    const weaponId = tank.selectedWeapon;
    const weaponDef = WEAPONS[weaponId];

    if (!weaponDef) return;

    // Check ammunition
    if (tank.inventory[weaponId] <= 0) {
      tank.selectedWeapon = 'standard';
      this.updateHUD();
      return;
    }

    // Consume ammunition
    if (tank.inventory[weaponId] !== Infinity) {
      tank.inventory[weaponId]--;
    }

    // Muzzle position & trajectory angle
    const muzzle = tank.getMuzzlePosition();
    const speed = (2.2 + (tank.power / 100) * 8.2) * weaponDef.speedMult;
    const vx = Math.cos(muzzle.angle) * speed;
    const vy = Math.sin(muzzle.angle) * speed;

    // Recoil kickback on tank
    tank.recoil = 4;

    // Sound effect
    if (window.soundFX) {
      window.soundFX.playShoot(weaponId);
    }

    // Spawn primary projectile
    const proj = new Projectile(muzzle.x, muzzle.y, vx, vy, weaponDef, tank.id);
    this.projectiles = [proj];

    // Muzzle flash / blast sparks
    this.particles.createExplosion(muzzle.x, muzzle.y, 8);

    this.state = 'FLYING';
    this.updateHUD();
  }

  updateProjectiles() {
    const tanks = [this.player1, this.player2];
    let anyAlive = false;
    const newSubProjectiles = [];

    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.isDead) continue;

      const result = p.update(this.wind, this.terrain, tanks, this.particles);

      if (result.subProjectiles && result.subProjectiles.length > 0) {
        newSubProjectiles.push(...result.subProjectiles);
      }

      if (!p.isDead) {
        anyAlive = true;
      }
    }

    if (newSubProjectiles.length > 0) {
      this.projectiles.push(...newSubProjectiles);
      anyAlive = true;
    }

    // Once all projectiles have exploded or left screen, transition to SETTLING
    if (!anyAlive) {
      this.state = 'SETTLING';
      this.settleFrames = 45; // ~0.75 seconds to let craters, sand, and dust settle
    }
  }

  checkWinConditionOrNextTurn() {
    const p1Dead = this.player1.hp <= 0;
    const p2Dead = this.player2.hp <= 0;

    if (p1Dead || p2Dead) {
      this.state = 'GAME_OVER';
      if (p1Dead && p2Dead) {
        this.winner = 'DRAW';
      } else if (p2Dead) {
        this.winner = 'PLAYER 1';
      } else {
        this.winner = 'PLAYER 2';
      }
      this.showVictoryModal();
      if (window.soundFX) {
        window.soundFX.playVictory();
      }
      this.updateHUD();
      return;
    }

    // Switch to next player
    this.activePlayer = this.activePlayer === this.player1 ? this.player2 : this.player1;
    this.activePlayer.resetTurn();

    // If active player's weapon is out of ammo, default to standard shell
    if (this.activePlayer.inventory[this.activePlayer.selectedWeapon] <= 0) {
      this.activePlayer.selectedWeapon = 'standard';
    }

    this.randomizeWind();
    this.state = 'PLAYER_TURN';
    this.updateHUD();

    if (window.soundFX) {
      window.soundFX.playTurnStart(this.activePlayer.id === 1);
    }
  }

  showVictoryModal() {
    const modal = document.getElementById('victoryModal');
    const title = document.getElementById('victoryTitle');
    const subtitle = document.getElementById('victorySubtitle');

    if (modal && title) {
      if (this.winner === 'DRAW') {
        title.innerText = 'MUTUAL DESTRUCTION!';
        title.style.color = '#FFA300';
        subtitle.innerText = 'Both tanks were obliterated!';
      } else if (this.winner === 'PLAYER 1') {
        title.innerText = 'PLAYER 1 VICTORIOUS!';
        title.style.color = '#00E436';
        subtitle.innerText = 'Player 2 was reduced to smoking scrap metal.';
      } else {
        title.innerText = 'PLAYER 2 VICTORIOUS!';
        title.style.color = '#FF004D';
        subtitle.innerText = 'Player 1 was reduced to smoking scrap metal.';
      }
      modal.classList.remove('hidden');
    }
  }

  /**
   * Rendering loop
   */
  draw() {
    const ctx = this.ctx;

    // Apply Screen Shake
    const shake = this.particles.getShakeOffset();
    ctx.save();
    ctx.translate(Math.round(shake.x), Math.round(shake.y));

    // 1. Draw Sky Gradient & Parallax Background
    this.drawSkyBackground(ctx);

    // 2. Draw Destructible Terrain
    this.terrain.draw(ctx);

    // 3. Draw Aim Preview Reticle for active tank during turn
    if (this.state === 'PLAYER_TURN' && !this.activePlayer.isDead) {
      this.drawAimGuide(ctx, this.activePlayer);
    }

    // 4. Draw Tanks
    this.player1.draw(ctx);
    this.player2.draw(ctx);

    // 5. Draw Projectiles
    for (let i = 0; i < this.projectiles.length; i++) {
      this.projectiles[i].draw(ctx);
    }

    // High-altitude off-screen projectile indicator
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.isDead && p.y < 0 && p.x >= 0 && p.x <= this.width) {
        ctx.save();
        ctx.fillStyle = '#FFEC27';
        ctx.beginPath();
        ctx.moveTo(p.x, 8);
        ctx.lineTo(p.x - 4, 1);
        ctx.lineTo(p.x + 4, 1);
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#FFF1E8';
        ctx.textAlign = 'center';
        ctx.fillText(`▲${Math.round(-p.y)}`, p.x, 18);
        ctx.restore();
      }
    }

    // 6. Draw Particles, Explosions, Floating Texts & Flash
    this.particles.draw(ctx);

    ctx.restore();
  }

  drawSkyBackground(ctx) {
    // Retro dusk/twilight sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    skyGrad.addColorStop(0, '#0c1021'); // Deep navy night
    skyGrad.addColorStop(0.45, '#1e1b4b'); // Twilight indigo
    skyGrad.addColorStop(0.75, '#4c1d95'); // Dusk violet
    skyGrad.addColorStop(1, '#831843'); // Sunset magenta
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Twinkling stars
    ctx.fillStyle = '#FFF1E8';
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const alpha = 0.3 + 0.7 * Math.abs(Math.sin(s.twinkle));
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
    }
    ctx.globalAlpha = 1.0;

    // Distant mountain silhouettes (two parallax layers)
    // Layer 1: Far dark violet mountains
    ctx.fillStyle = '#22143b';
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.65);
    ctx.lineTo(80, this.height * 0.52);
    ctx.lineTo(190, this.height * 0.68);
    ctx.lineTo(310, this.height * 0.48);
    ctx.lineTo(440, this.height * 0.66);
    ctx.lineTo(550, this.height * 0.51);
    ctx.lineTo(640, this.height * 0.62);
    ctx.lineTo(640, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    // Layer 2: Closer slate hills
    ctx.fillStyle = '#170e28';
    ctx.beginPath();
    ctx.moveTo(0, this.height * 0.72);
    ctx.lineTo(120, this.height * 0.62);
    ctx.lineTo(240, this.height * 0.75);
    ctx.lineTo(380, this.height * 0.61);
    ctx.lineTo(500, this.height * 0.74);
    ctx.lineTo(640, this.height * 0.65);
    ctx.lineTo(640, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    // Clouds drifting
    ctx.fillStyle = '#473b64';
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      ctx.fillRect(Math.floor(c.x), Math.floor(c.y), c.w, c.h);
      ctx.fillRect(Math.floor(c.x + 5), Math.floor(c.y - 3), c.w - 10, c.h + 6);
    }
    ctx.globalAlpha = 1.0;
  }

  /**
   * Aiming guide: short 4-dot trajectory hint from the muzzle
   */
  drawAimGuide(ctx, tank) {
    const muzzle = tank.getMuzzlePosition();
    const speed = (2.2 + (tank.power / 100) * 8.2);
    const vx0 = Math.cos(muzzle.angle) * speed;
    const vy0 = Math.sin(muzzle.angle) * speed;

    ctx.save();
    const dotCount = 5;
    let px = muzzle.x;
    let py = muzzle.y;
    let vx = vx0;
    let vy = vy0;

    for (let step = 1; step <= dotCount; step++) {
      px += vx * 2.5;
      py += vy * 2.5;
      vx += this.wind * 0.0075 * 2.5;
      vy += 0.22 * 2.5;

      const alpha = 1.0 - (step / (dotCount + 1));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = tank.id === 1 ? '#00E436' : '#FF004D';
      ctx.fillRect(Math.floor(px) - 1, Math.floor(py) - 1, 2, 2);
    }
    ctx.restore();
  }

  /**
   * Update HTML DOM HUD elements
   */
  updateHUD() {
    // 1. Health bars
    const p1HpFill = document.getElementById('p1HpFill');
    const p1HpText = document.getElementById('p1HpText');
    const p2HpFill = document.getElementById('p2HpFill');
    const p2HpText = document.getElementById('p2HpText');

    if (p1HpFill) {
      p1HpFill.style.width = `${Math.max(0, this.player1.hp)}%`;
      p1HpText.innerText = `${Math.max(0, this.player1.hp)} / 100`;
    }
    if (p2HpFill) {
      p2HpFill.style.width = `${Math.max(0, this.player2.hp)}%`;
      p2HpText.innerText = `${Math.max(0, this.player2.hp)} / 100`;
    }

    // 2. Fuel Bars
    const fuelFill = document.getElementById('fuelFill');
    const fuelText = document.getElementById('fuelText');
    if (fuelFill && this.activePlayer) {
      const fuelPct = Math.round((this.activePlayer.fuel / this.activePlayer.maxFuel) * 100);
      fuelFill.style.width = `${fuelPct}%`;
      fuelText.innerText = `${fuelPct}%`;
    }

    // 3. Turn Banner
    const turnBanner = document.getElementById('turnBanner');
    const p1Card = document.getElementById('p1Card');
    const p2Card = document.getElementById('p2Card');

    if (turnBanner && this.activePlayer) {
      const isP1 = this.activePlayer.id === 1;
      turnBanner.innerText = isP1 ? "PLAYER 1'S TURN" : "PLAYER 2'S TURN";
      turnBanner.className = isP1 ? 'turn-p1' : 'turn-p2';

      if (p1Card && p2Card) {
        p1Card.classList.toggle('active-player', isP1);
        p2Card.classList.toggle('active-player', !isP1);
      }
    }

    // 4. Wind Indicator
    const windArrow = document.getElementById('windArrow');
    const windText = document.getElementById('windText');
    if (windArrow && windText) {
      const absWind = Math.abs(this.wind);
      const dirText = this.wind > 0 ? 'EAST' : (this.wind < 0 ? 'WEST' : 'CALM');
      windText.innerText = `${dirText} ${absWind.toFixed(1)}`;
      windArrow.innerText = this.wind === 0 ? '•' : (this.wind > 0 ? '➡' : '⬅');
      windArrow.style.transform = 'none';
      windArrow.style.color = absWind > 3 ? '#FF004D' : '#29ADFF';
    }

    // 5. Controls: Angle & Power sliders/text
    const angleSlider = document.getElementById('angleSlider');
    const angleVal = document.getElementById('angleVal');
    const powerSlider = document.getElementById('powerSlider');
    const powerVal = document.getElementById('powerVal');
    const powerMeterFill = document.getElementById('powerMeterFill');

    if (this.activePlayer) {
      const curAngle = Math.round(this.activePlayer.angle);
      const curPower = Math.round(this.activePlayer.power);

      if (angleSlider && document.activeElement !== angleSlider) {
        angleSlider.value = curAngle;
      }
      if (angleVal) angleVal.innerText = `${curAngle}°`;

      if (powerSlider && document.activeElement !== powerSlider) {
        powerSlider.value = curPower;
      }
      if (powerVal) powerVal.innerText = `${curPower}%`;
      if (powerMeterFill) powerMeterFill.style.width = `${curPower}%`;
    }

    // 6. Weapon Cards
    this.updateWeaponCards();

    // 7. Fire Button Status
    const fireBtn = document.getElementById('fireBtn');
    if (fireBtn) {
      if (this.state === 'PLAYER_TURN') {
        fireBtn.disabled = false;
        fireBtn.classList.remove('disabled');
      } else {
        fireBtn.disabled = true;
        fireBtn.classList.add('disabled');
      }
    }
  }

  updateWeaponCards() {
    const container = document.getElementById('weaponSelector');
    if (!container || !this.activePlayer) return;

    const inventory = this.activePlayer.inventory;
    const selected = this.activePlayer.selectedWeapon;

    const weaponKeys = Object.keys(WEAPONS);
    weaponKeys.forEach((wId) => {
      let card = document.getElementById(`wcard-${wId}`);
      if (!card) return;

      const count = inventory[wId];
      const countEl = card.querySelector('.ammo-count');
      if (countEl) {
        countEl.innerText = count === Infinity ? '∞' : `x${count}`;
      }

      if (count <= 0) {
        card.classList.add('out-of-ammo');
      } else {
        card.classList.remove('out-of-ammo');
      }

      if (selected === wId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  selectWeapon(weaponId) {
    if (!this.activePlayer || this.state !== 'PLAYER_TURN') return;
    if (this.activePlayer.inventory[weaponId] <= 0) return;

    this.activePlayer.selectedWeapon = weaponId;
    if (window.soundFX) window.soundFX.playWeaponSelect();
    this.updateHUD();
  }

  /**
   * Keyboard & Pointer Controls Setup
   */
  setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      // Ensure AudioContext is running on first user gesture
      if (window.soundFX) window.soundFX.ensureContext();

      this.keys[e.code] = true;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.fire();
      }

      // Quick Weapon hotkeys: 1 - 6
      if (e.code === 'Digit1') this.selectWeapon('standard');
      if (e.code === 'Digit2') this.selectWeapon('nuke');
      if (e.code === 'Digit3') this.selectWeapon('mirv');
      if (e.code === 'Digit4') this.selectWeapon('dirt');
      if (e.code === 'Digit5') this.selectWeapon('bouncy');
      if (e.code === 'Digit6') this.selectWeapon('sniper');

      // Restart key
      if (e.code === 'KeyR' && (e.ctrlKey || e.metaKey || this.state === 'GAME_OVER')) {
        // Allow default refresh or restart
      }

      // Help hotkey
      if (e.code === 'KeyH') {
        this.toggleHelpModal();
      }

      // Mute hotkey
      if (e.code === 'KeyM') {
        this.toggleMute();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (
        !this.keys['KeyA'] &&
        !this.keys['ArrowLeft'] &&
        !this.keys['KeyD'] &&
        !this.keys['ArrowRight'] &&
        !this.isDrivingLeft &&
        !this.isDrivingRight
      ) {
        if (window.soundFX) window.soundFX.stopEngine();
      }
    });

    // Touch & On-screen UI Event Handlers
    const bindHoldButton = (elId, startFn, endFn) => {
      const el = document.getElementById(elId);
      if (!el) return;

      const onStart = (e) => {
        e.preventDefault();
        if (window.soundFX) window.soundFX.ensureContext();
        startFn();
      };
      const onEnd = (e) => {
        e.preventDefault();
        endFn();
      };

      el.addEventListener('mousedown', onStart);
      el.addEventListener('mouseup', onEnd);
      el.addEventListener('mouseleave', onEnd);
      el.addEventListener('touchstart', onStart, { passive: false });
      el.addEventListener('touchend', onEnd, { passive: false });
      el.addEventListener('touchcancel', onEnd, { passive: false });
    };

    // Drive Buttons
    bindHoldButton('btnDriveLeft', () => { this.isDrivingLeft = true; }, () => { this.isDrivingLeft = false; });
    bindHoldButton('btnDriveRight', () => { this.isDrivingRight = true; }, () => { this.isDrivingRight = false; });

    // Aim Buttons
    bindHoldButton('btnAngleDown', () => { this.aimAdjustDir = -1; }, () => { this.aimAdjustDir = 0; });
    bindHoldButton('btnAngleUp', () => { this.aimAdjustDir = 1; }, () => { this.aimAdjustDir = 0; });

    // Power Buttons
    bindHoldButton('btnPowerDown', () => { this.powerAdjustDir = -1; }, () => { this.powerAdjustDir = 0; });
    bindHoldButton('btnPowerUp', () => { this.powerAdjustDir = 1; }, () => { this.powerAdjustDir = 0; });

    // Angle Slider Input
    const angleSlider = document.getElementById('angleSlider');
    if (angleSlider) {
      angleSlider.addEventListener('input', (e) => {
        if (this.activePlayer) {
          this.activePlayer.angle = parseFloat(e.target.value);
          this.updateHUD();
        }
      });
    }

    // Power Slider Input
    const powerSlider = document.getElementById('powerSlider');
    if (powerSlider) {
      powerSlider.addEventListener('input', (e) => {
        if (this.activePlayer) {
          this.activePlayer.power = parseFloat(e.target.value);
          this.updateHUD();
        }
      });
    }

    // Fire Button
    const fireBtn = document.getElementById('fireBtn');
    if (fireBtn) {
      fireBtn.addEventListener('click', () => {
        if (window.soundFX) window.soundFX.ensureContext();
        this.fire();
      });
    }

    // Weapon Cards Click
    const weaponKeys = Object.keys(WEAPONS);
    weaponKeys.forEach((wId) => {
      const card = document.getElementById(`wcard-${wId}`);
      if (card) {
        card.addEventListener('click', () => {
          if (window.soundFX) window.soundFX.ensureContext();
          this.selectWeapon(wId);
        });
      }
    });

    // Rematch Buttons
    const btnRematch = document.getElementById('btnRematch');
    if (btnRematch) {
      btnRematch.addEventListener('click', () => {
        if (window.soundFX) window.soundFX.playClick(600);
        this.startNewMatch();
      });
    }
    const btnRestartMatch = document.getElementById('btnRestartMatch');
    if (btnRestartMatch) {
      btnRestartMatch.addEventListener('click', () => {
        if (window.soundFX) window.soundFX.playClick(600);
        this.startNewMatch();
      });
    }

    // Sound Toggle Button
    const btnSoundToggle = document.getElementById('btnSoundToggle');
    if (btnSoundToggle) {
      btnSoundToggle.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // Fullscreen Toggle Button
    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    // Help Modal
    const btnHelp = document.getElementById('btnHelp');
    const helpModal = document.getElementById('helpModal');
    const btnCloseHelp = document.getElementById('btnCloseHelp');
    if (btnHelp) {
      btnHelp.addEventListener('click', () => {
        this.toggleHelpModal();
      });
    }
    if (btnCloseHelp && helpModal) {
      btnCloseHelp.addEventListener('click', () => {
        helpModal.classList.add('hidden');
      });
    }

    // Canvas pointer/touch aiming
    let isAimingOnCanvas = false;
    const handleCanvasAim = (clientX, clientY) => {
      if (this.state !== 'PLAYER_TURN' || !this.activePlayer) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      const mx = (clientX - rect.left) * scaleX;
      const my = (clientY - rect.top) * scaleY;

      const tank = this.activePlayer;
      const dx = mx - tank.x;
      const dy = my - (tank.y - 7);

      let worldAngle = Math.atan2(dy, dx);
      let relDeg;
      if (tank.id === 1) {
        let rad = -worldAngle;
        if (rad < 0) rad += Math.PI * 2;
        relDeg = (rad * 180) / Math.PI;
      } else {
        let rad = worldAngle + Math.PI;
        if (rad < 0) rad += Math.PI * 2;
        relDeg = (rad * 180) / Math.PI;
      }

      if (relDeg >= 0 && relDeg <= 180) {
        tank.angle = Math.round(relDeg);
        this.updateHUD();
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      isAimingOnCanvas = true;
      if (window.soundFX) window.soundFX.ensureContext();
      handleCanvasAim(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (isAimingOnCanvas) {
        handleCanvasAim(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', () => {
      isAimingOnCanvas = false;
    });

    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        isAimingOnCanvas = true;
        if (window.soundFX) window.soundFX.ensureContext();
        handleCanvasAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (isAimingOnCanvas && e.touches.length > 0) {
        handleCanvasAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isAimingOnCanvas = false;
    });

    // Scanlines Toggle
    const btnScanlines = document.getElementById('btnScanlines');
    const screenFrame = document.getElementById('screenFrame');
    if (btnScanlines && screenFrame) {
      btnScanlines.addEventListener('click', () => {
        screenFrame.classList.toggle('scanlines-enabled');
        if (window.soundFX) window.soundFX.playClick(500);
      });
    }
  }

  toggleMute() {
    if (!window.soundFX) return;
    const isMuted = window.soundFX.toggleMute();
    const btn = document.getElementById('btnSoundToggle');
    if (btn) {
      btn.innerText = isMuted ? '🔇 MUTE' : '🔊 SOUND';
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  toggleHelpModal() {
    const modal = document.getElementById('helpModal');
    if (modal) {
      modal.classList.toggle('hidden');
      if (window.soundFX) window.soundFX.playClick(600);
    }
  }
}

// Instantiate game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.game = new TankBattleGame();
});
