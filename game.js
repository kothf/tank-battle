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

    // Game Mode & Bot AI ('pvb' = Player vs Bot, 'pvp' = 2 Players)
    this.gameMode = 'pvb';
    this.botDifficulty = 'medium'; // 'easy', 'medium', 'hard'
    this.botState = 'IDLE'; // 'IDLE', 'THINKING', 'DRIVING', 'AIMING', 'FIRING'
    this.botTimer = 0;
    this.botTargetAngle = 45;
    this.botTargetPower = 65;
    this.botDriveDir = 0;
    this.botDriveFrames = 0;
    this.botLastAngle = 45;
    this.botLastPower = 65;
    this.botLastBotX = null;
    this.botLastBotY = null;
    this.botLastPlayerX = null;
    this.botLastPlayerY = null;
    this.botLastBotHp = null;
    this.botLastPlayerHp = null;

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
    this.player1.inventory = { standard: Infinity, nuke: 2, mirv: 3, dirt: 3, bouncy: 3, sniper: 2, drill: 2 };
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
    this.player2.inventory = { standard: Infinity, nuke: 2, mirv: 3, dirt: 3, bouncy: 3, sniper: 2, drill: 2 };
    this.player2.selectedWeapon = 'standard';
    this.player2.resetTurn();

    this.botState = 'IDLE';
    this.botLastAngle = 45;
    this.botLastPower = 65;
    this.botLastBotX = null;
    this.botLastBotY = null;
    this.botLastPlayerX = null;
    this.botLastPlayerY = null;
    this.botLastBotHp = null;
    this.botLastPlayerHp = null;
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
      if (this.gameMode === 'pvb' && this.activePlayer && this.activePlayer.id === 2) {
        this.updateBot();
      } else {
        this.handleContinuousInput();
      }
    }

    // Update projectiles in flight
    if (this.state === 'FLYING') {
      this.updateProjectiles();
    }

    // Settling state after explosion
    if (this.state === 'SETTLING') {
      this.settleFrames--;

      // Only living tanks need to settle; dead tanks are already destroyed
      const p1Falling = !this.player1.isDead && this.player1.isFalling;
      const p2Falling = !this.player2.isDead && this.player2.isFalling;

      // Transition when settled, with failsafe timeout (~1.5s) to prevent state hanging
      if ((this.settleFrames <= 0 && !p1Falling && !p2Falling) || this.settleFrames < -45) {
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

    // Save bot state for stable aim tracking across turns
    if (tank.id === 2) {
      this.botLastAngle = tank.angle;
      this.botLastPower = tank.power;
      this.botLastBotX = tank.x;
      this.botLastBotY = tank.y;
      this.botLastPlayerX = this.player1.x;
      this.botLastPlayerY = this.player1.y;
      this.botLastBotHp = tank.hp;
      this.botLastPlayerHp = this.player1.hp;
    }

    // Muzzle position & trajectory angle
    const muzzle = tank.getMuzzlePosition();
    const speed = (2.2 + (tank.power / 100) * 8.2) * 1.2 * weaponDef.speedMult;
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
      if (p.timeAlive > 360) {
        p.isDead = true;
        continue;
      }

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

    if (this.gameMode === 'pvb' && this.activePlayer.id === 2) {
      this.initiateBotTurn();
    } else {
      if (window.soundFX) {
        window.soundFX.playTurnStart(this.activePlayer.id === 1);
      }
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
        if (this.gameMode === 'pvb') {
          title.innerText = 'VICTORY OVER THE BOT!';
          title.style.color = '#00E436';
          subtitle.innerText = `You out-gunned the ${this.botDifficulty.toUpperCase()} AI and reduced it to scrap!`;
        } else {
          title.innerText = 'PLAYER 1 VICTORIOUS!';
          title.style.color = '#00E436';
          subtitle.innerText = 'Player 2 was reduced to smoking scrap metal.';
        }
      } else {
        if (this.gameMode === 'pvb') {
          title.innerText = 'DEFEATED BY BOT!';
          title.style.color = '#FF004D';
          subtitle.innerText = `The ${this.botDifficulty.toUpperCase()} AI eliminated your tank with calculating precision.`;
        } else {
          title.innerText = 'PLAYER 2 VICTORIOUS!';
          title.style.color = '#FF004D';
          subtitle.innerText = 'Player 1 was reduced to smoking scrap metal.';
        }
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
    const weaponDef = WEAPONS[tank.selectedWeapon] || WEAPONS.standard;
    const speed = (2.2 + (tank.power / 100) * 8.2) * 1.2 * weaponDef.speedMult;
    let vx = Math.cos(muzzle.angle) * speed;
    let vy = Math.sin(muzzle.angle) * speed;

    const windForce = this.wind * 0.0075;
    const baseGravity = 0.22 * weaponDef.gravityMult;

    ctx.save();
    let px = muzzle.x;
    let py = muzzle.y;
    const totalFrames = 30;

    for (let f = 1; f <= totalFrames; f++) {
      vx += windForce;
      vy += baseGravity;
      vx *= 0.999;
      vy *= 0.999;
      px += vx;
      py += vy;

      if (this.terrain.isSolid(px, py) || px < -20 || px > this.width + 20 || py > this.height) {
        break;
      }

      // Draw dot every 2 frames for a clean, non-cluttered trajectory arc
      if (f % 2 === 0) {
        const alpha = Math.max(0.2, 1.0 - (f / (totalFrames + 4)) * 0.8);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = tank.id === 1 ? '#00E436' : '#FF004D';
        ctx.fillRect(Math.floor(px) - 1, Math.floor(py) - 1, 2, 2);
      }
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
    const isBotTurn = this.gameMode === 'pvb' && this.activePlayer && this.activePlayer.id === 2;

    if (turnBanner && this.activePlayer) {
      const isP1 = this.activePlayer.id === 1;
      if (isP1) {
        turnBanner.innerText = "PLAYER 1'S TURN";
        turnBanner.className = 'turn-banner turn-p1';
      } else {
        if (this.gameMode === 'pvb') {
          const diffLabels = { easy: 'RECRUIT', medium: 'VETERAN', hard: 'ELITE' };
          const diffText = diffLabels[this.botDifficulty] || 'BOT';
          if (this.botState === 'THINKING') {
            turnBanner.innerText = `🤖 BOT THINKING [${diffText}]...`;
          } else if (this.botState === 'DRIVING') {
            turnBanner.innerText = `🤖 BOT MOVING [${diffText}]...`;
          } else if (this.botState === 'AIMING') {
            turnBanner.innerText = `🤖 BOT AIMING [${diffText}]...`;
          } else {
            turnBanner.innerText = `🤖 BOT'S TURN [${diffText}]`;
          }
        } else {
          turnBanner.innerText = "PLAYER 2'S TURN";
        }
        turnBanner.className = 'turn-banner turn-p2';
      }

      if (p1Card && p2Card) {
        p1Card.classList.toggle('active-player', isP1);
        p2Card.classList.toggle('active-player', !isP1);
      }
    }

    if (p2Card) {
      const p2HeaderName = p2Card.querySelector('.p-name');
      if (p2HeaderName) {
        if (this.gameMode === 'pvb') {
          const diffLabels = { easy: 'RECRUIT', medium: 'VETERAN', hard: 'ELITE' };
          p2HeaderName.innerText = `🤖 BOT [${diffLabels[this.botDifficulty] || 'BOT'}] (RED)`;
        } else {
          p2HeaderName.innerText = `🟥 P2 (RED)`;
        }
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
      if (this.state === 'PLAYER_TURN' && !isBotTurn) {
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
    if (this.isBotTurn()) return;
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

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!this.isBotTurn()) this.fire();
      }

      // Quick Weapon hotkeys: 1 - 7
      if (!this.isBotTurn()) {
        if (e.code === 'Digit1') this.selectWeapon('standard');
        if (e.code === 'Digit2') this.selectWeapon('nuke');
        if (e.code === 'Digit3') this.selectWeapon('mirv');
        if (e.code === 'Digit4') this.selectWeapon('dirt');
        if (e.code === 'Digit5') this.selectWeapon('bouncy');
        if (e.code === 'Digit6') this.selectWeapon('sniper');
        if (e.code === 'Digit7') this.selectWeapon('drill');
      }

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
        if (this.isBotTurn()) return;
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
        if (this.isBotTurn()) return;
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
        if (this.isBotTurn()) return;
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
        if (this.isBotTurn()) return;
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
          if (this.isBotTurn()) return;
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

    // Mode Buttons (PvP vs PvB)
    const btnModePvP = document.getElementById('btnModePvP');
    const btnModePvB = document.getElementById('btnModePvB');
    if (btnModePvP) {
      btnModePvP.addEventListener('click', () => {
        this.setGameMode('pvp');
      });
    }
    if (btnModePvB) {
      btnModePvB.addEventListener('click', () => {
        this.setGameMode('pvb');
      });
    }

    // Bot Difficulty Buttons
    const diffButtons = document.querySelectorAll('.btn-diff');
    diffButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const level = btn.dataset.level;
        if (level) this.setBotDifficulty(level);
      });
    });

    // Canvas pointer/touch aiming
    let isAimingOnCanvas = false;
    const handleCanvasAim = (clientX, clientY) => {
      if (this.state !== 'PLAYER_TURN' || !this.activePlayer || this.isBotTurn()) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      const mx = (clientX - rect.left) * scaleX;
      const my = (clientY - rect.top) * scaleY;

      const tank = this.activePlayer;
      const dx = mx - tank.x;
      const dy = my - (tank.y - 9);

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
      if (this.isBotTurn()) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.width / rect.width;
      const scaleY = this.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      const tank = this.activePlayer;
      if (!tank) return;

      // Only initiate canvas aiming if clicking within interactive range of the active tank (~150px)
      // This prevents accidental clicks elsewhere on screen from warping the barrel angle.
      const distToTank = Math.hypot(mx - tank.x, my - (tank.y - 9));
      if (distToTank <= 150) {
        isAimingOnCanvas = true;
        if (window.soundFX) window.soundFX.ensureContext();
        handleCanvasAim(e.clientX, e.clientY);
      }
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
      if (this.isBotTurn()) return;
      if (e.touches.length > 0) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.width / rect.width;
        const scaleY = this.height / rect.height;
        const mx = (e.touches[0].clientX - rect.left) * scaleX;
        const my = (e.touches[0].clientY - rect.top) * scaleY;
        const tank = this.activePlayer;
        if (!tank) return;

        const distToTank = Math.hypot(mx - tank.x, my - (tank.y - 9));
        if (distToTank <= 150) {
          isAimingOnCanvas = true;
          if (window.soundFX) window.soundFX.ensureContext();
          handleCanvasAim(e.touches[0].clientX, e.touches[0].clientY);
        }
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

  isBotTurn() {
    return this.gameMode === 'pvb' && this.activePlayer && this.activePlayer.id === 2;
  }

  setGameMode(mode) {
    this.gameMode = mode;
    const btnPvP = document.getElementById('btnModePvP');
    const btnPvB = document.getElementById('btnModePvB');
    const botDiffGroup = document.getElementById('botDiffGroup');

    if (btnPvP) btnPvP.classList.toggle('active', mode === 'pvp');
    if (btnPvB) btnPvB.classList.toggle('active', mode === 'pvb');
    if (botDiffGroup) botDiffGroup.classList.toggle('disabled', mode === 'pvp');

    if (window.soundFX) window.soundFX.playClick(700);

    // If switched to PvB during Player 2's turn, initiate bot turn
    if (mode === 'pvb' && this.activePlayer && this.activePlayer.id === 2 && this.state === 'PLAYER_TURN') {
      this.initiateBotTurn();
    } else if (mode === 'pvp' && this.activePlayer && this.activePlayer.id === 2) {
      this.botState = 'IDLE';
    }

    this.updateHUD();
  }

  setBotDifficulty(level) {
    this.botDifficulty = level;
    const diffButtons = document.querySelectorAll('.btn-diff');
    diffButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.level === level);
    });

    if (window.soundFX) window.soundFX.playClick(850);

    // If bot currently thinking, recalculate aim
    if (this.botState === 'THINKING') {
      this.botTimer = 15;
    }

    this.updateHUD();
  }

  initiateBotTurn() {
    this.botState = 'THINKING';
    this.botTimer = 35; // ~0.6s
    this.botDriveDir = 0;
    this.botDriveFrames = 0;
    if (window.soundFX) {
      window.soundFX.playTurnStart(false);
    }
    this.updateHUD();
  }

  updateBot() {
    const tank = this.activePlayer;
    if (!tank || tank.isDead) return;

    if (this.botState === 'THINKING') {
      this.botTimer--;
      if (this.botTimer <= 0) {
        // Detect if either tank moved or took damage since bot's last shot
        const botMoved = this.botLastBotX !== null && (
          Math.abs(tank.x - this.botLastBotX) > 2.0 ||
          Math.abs(tank.y - this.botLastBotY) > 2.0
        );
        const playerMoved = this.botLastPlayerX !== null && (
          Math.abs(this.player1.x - this.botLastPlayerX) > 2.0 ||
          Math.abs(this.player1.y - this.botLastPlayerY) > 2.0
        );
        const botHit = this.botLastBotHp !== null && tank.hp < this.botLastBotHp;
        const playerHit = this.botLastPlayerHp !== null && this.player1.hp < this.botLastPlayerHp;
        const situationChanged = (this.botLastBotX === null) || botMoved || playerMoved || botHit || playerHit;

        // 1. Select tactical weapon (only pick new weapon if situation changed or current weapon empty)
        if (situationChanged || tank.inventory[tank.selectedWeapon] <= 0) {
          this.botSelectWeapon();
        }

        // 2. Compute ballistic trajectory (retains exact angle if neither tank moved nor was hit)
        const aim = this.calculateBotAim(tank.selectedWeapon, situationChanged);
        this.botTargetAngle = aim.angle;
        this.botTargetPower = aim.power;

        // 3. Check if repositioning is beneficial (only drive if hit or steep slope, never randomly)
        const shouldDrive = situationChanged &&
                            (this.botDifficulty === 'hard' || this.botDifficulty === 'medium') &&
                            tank.fuel >= 20 &&
                            (botHit || Math.abs(tank.slopeAngle) > 0.4);

        if (shouldDrive) {
          this.botDriveDir = tank.x > 450 ? (Math.random() < 0.6 ? -1 : 1) : (Math.random() < 0.6 ? 1 : -1);
          this.botDriveFrames = 15 + Math.floor(Math.random() * 20);
          this.botState = 'DRIVING';
        } else {
          this.botState = 'AIMING';
        }
        this.updateHUD();
      }
    } else if (this.botState === 'DRIVING') {
      this.botDriveFrames--;
      const moved = tank.drive(this.botDriveDir, this.terrain);
      if (moved && window.soundFX) {
        window.soundFX.startEngine();
      }
      this.updateHUD();

      if (this.botDriveFrames <= 0 || !moved || tank.fuel <= 5) {
        if (window.soundFX) window.soundFX.stopEngine();
        // Recalculate aim from new position
        const aim = this.calculateBotAim(tank.selectedWeapon, true);
        this.botTargetAngle = aim.angle;
        this.botTargetPower = aim.power;
        this.botState = 'AIMING';
        this.updateHUD();
      }
    } else if (this.botState === 'AIMING') {
      // Smoothly rotate turret
      const angleDiff = this.botTargetAngle - tank.angle;
      if (Math.abs(angleDiff) > 1.2) {
        tank.angle += Math.sign(angleDiff) * 1.2;
      } else {
        tank.angle = this.botTargetAngle;
      }

      // Smoothly adjust power
      const powerDiff = this.botTargetPower - tank.power;
      if (Math.abs(powerDiff) > 1.5) {
        tank.power += Math.sign(powerDiff) * 1.5;
      } else {
        tank.power = this.botTargetPower;
      }

      this.updateHUD();

      // Check if target aim reached
      if (Math.abs(angleDiff) <= 1.2 && Math.abs(powerDiff) <= 1.5) {
        tank.angle = this.botTargetAngle;
        tank.power = this.botTargetPower;
        this.botState = 'FIRING';
        this.botTimer = 18; // ~0.3s pause before shooting
        this.updateHUD();
      }
    } else if (this.botState === 'FIRING') {
      this.botTimer--;
      if (this.botTimer <= 0) {
        this.botState = 'IDLE';
        this.fire();
      }
    }
  }

  botSelectWeapon() {
    const tank = this.activePlayer;
    const inv = tank.inventory;
    const target = this.player1;

    // Check if middle hill peak is high
    let middlePeakHeight = 999;
    for (let x = 220; x <= 420; x += 20) {
      const sy = this.terrain.getSurfaceY(x);
      if (sy < middlePeakHeight) middlePeakHeight = sy;
    }
    const isObstructed = middlePeakHeight < Math.min(tank.y, target.y) - 15;

    let chosen = 'standard';

    if (this.botDifficulty === 'hard') {
      // Elite AI: smart tactical weapon pick
      if (isObstructed && inv.drill > 0 && Math.random() < 0.75) {
        chosen = 'drill';
      } else if (target.hp <= 55 && inv.nuke > 0) {
        chosen = 'nuke';
      } else if (inv.nuke > 0 && Math.random() < 0.4) {
        chosen = 'nuke';
      } else if (inv.mirv > 0 && Math.random() < 0.5) {
        chosen = 'mirv';
      } else if (!isObstructed && inv.sniper > 0 && Math.random() < 0.4) {
        chosen = 'sniper';
      } else if (inv.bouncy > 0 && Math.random() < 0.3) {
        chosen = 'bouncy';
      } else if (inv.drill > 0 && Math.random() < 0.4) {
        chosen = 'drill';
      }
    } else if (this.botDifficulty === 'medium') {
      // Veteran AI: good variety
      if (isObstructed && inv.drill > 0 && Math.random() < 0.5) {
        chosen = 'drill';
      } else if (inv.mirv > 0 && Math.random() < 0.35) {
        chosen = 'mirv';
      } else if (inv.nuke > 0 && Math.random() < 0.25) {
        chosen = 'nuke';
      } else if (inv.bouncy > 0 && Math.random() < 0.3) {
        chosen = 'bouncy';
      } else if (inv.sniper > 0 && Math.random() < 0.25) {
        chosen = 'sniper';
      } else if (inv.drill > 0 && Math.random() < 0.3) {
        chosen = 'drill';
      }
    } else {
      // Recruit AI: mostly standard, occasional bounce/dirt/drill
      if (inv.bouncy > 0 && Math.random() < 0.25) {
        chosen = 'bouncy';
      } else if (inv.dirt > 0 && Math.random() < 0.2) {
        chosen = 'dirt';
      } else if (inv.drill > 0 && Math.random() < 0.2) {
        chosen = 'drill';
      }
    }

    if (inv[chosen] <= 0) {
      chosen = 'standard';
    }

    tank.selectedWeapon = chosen;
    if (window.soundFX) window.soundFX.playWeaponSelect();
  }

  calculateBotAim(weaponId, situationChanged = true) {
    const weaponDef = WEAPONS[weaponId] || WEAPONS.standard;
    const shooter = this.activePlayer;
    const target = this.player1;

    let windConsidered = this.wind;
    let angleNoise = 0;
    let powerNoise = 0;

    if (this.botDifficulty === 'easy') {
      if (Math.random() < 0.65) windConsidered = 0;
      angleNoise = (Math.random() - 0.5) * 16;
      powerNoise = (Math.random() - 0.5) * 18;
    } else if (this.botDifficulty === 'medium') {
      windConsidered *= 0.75 + Math.random() * 0.5;
      angleNoise = (Math.random() - 0.5) * 5;
      powerNoise = (Math.random() - 0.5) * 6;
    } else {
      angleNoise = (Math.random() - 0.5) * 1.2;
      powerNoise = (Math.random() - 0.5) * 1.5;
    }

    // If neither tank moved nor was hit: retain exact dialed-in barrel angle and only tune power for wind
    if (!situationChanged && this.botLastAngle !== null) {
      const fixedAngle = this.botLastAngle;
      let bestP = this.botLastPower || 65;
      let minD = 999999;
      let foundDirect = false;

      for (let p = 20; p <= 100; p++) {
        const sim = this.simulateBotTrajectory(
          shooter,
          fixedAngle,
          p,
          weaponDef,
          windConsidered,
          target
        );

        if (sim.hitTarget) {
          bestP = p;
          minD = 0;
          foundDirect = true;
          break;
        } else if (sim.minDistance < minD) {
          minD = sim.minDistance;
          bestP = p;
        }
      }

      const finalPower = Math.max(10, Math.min(100, Math.round(bestP + (foundDirect && this.botDifficulty === 'hard' ? 0 : powerNoise * 0.5))));
      return { angle: fixedAngle, power: finalPower };
    }

    // Full search over angles and power when hit or moved
    let bestAngle = 45;
    let bestPower = 65;
    let bestDist = 999999;
    let foundHit = false;

    const minAngle = weaponDef.isDrill ? 14 : 26;
    const maxAngle = weaponDef.isDrill ? 65 : 76;
    const angleStep = 2;
    const powerStep = 2;

    for (let a = minAngle; a <= maxAngle; a += angleStep) {
      for (let p = 30; p <= 100; p += powerStep) {
        const sim = this.simulateBotTrajectory(
          shooter,
          a,
          p,
          weaponDef,
          windConsidered,
          target
        );

        if (sim.hitTarget) {
          bestAngle = a;
          bestPower = p;
          bestDist = 0;
          foundHit = true;
          break;
        } else if (sim.minDistance < bestDist) {
          bestDist = sim.minDistance;
          bestAngle = a;
          bestPower = p;
        }
      }
      if (foundHit && this.botDifficulty === 'hard') break;
    }

    const finalAngle = Math.max(5, Math.min(175, Math.round(bestAngle + (foundHit && this.botDifficulty === 'hard' ? 0 : angleNoise))));
    const finalPower = Math.max(10, Math.min(100, Math.round(bestPower + (foundHit && this.botDifficulty === 'hard' ? 0 : powerNoise))));

    return { angle: finalAngle, power: finalPower };
  }

  simulateBotTrajectory(shooter, angleDeg, powerPct, weaponDef, wind, targetTank) {
    const rad = (angleDeg * Math.PI) / 180;
    const worldAngle = shooter.id === 1 ? -rad : (-Math.PI + rad);
    const slope = shooter.slopeAngle || 0;
    const turretBaseX = shooter.x + 9 * Math.sin(slope);
    const turretBaseY = shooter.y - 9 * Math.cos(slope);
    const barrelLen = 12;

    let x = turretBaseX + Math.cos(worldAngle) * barrelLen;
    let y = turretBaseY + Math.sin(worldAngle) * barrelLen;

    const speed = (2.2 + (powerPct / 100) * 8.2) * 1.2 * weaponDef.speedMult;
    let vx = Math.cos(worldAngle) * speed;
    let vy = Math.sin(worldAngle) * speed;

    const windForce = wind * 0.0075;
    const baseGravity = 0.22 * weaponDef.gravityMult;

    let minDistance = 99999;
    let hitTarget = false;

    for (let f = 1; f <= 300; f++) {
      const prevX = x;
      const prevY = y;

      vx += windForce;
      vy += baseGravity;
      vx *= 0.999;
      vy *= 0.999;

      const targetX = prevX + vx;
      const targetY = prevY + vy;
      const dist = Math.hypot(targetX - prevX, targetY - prevY);
      const steps = Math.max(1, Math.ceil(dist / 2.0));

      let hitSomething = false;

      for (let s = 1; s <= steps; s++) {
        const interpT = s / steps;
        const curX = prevX + (targetX - prevX) * interpT;
        const curY = prevY + (targetY - prevY) * interpT;

        if (curX < -40 || curX > this.terrain.width + 40 || curY > this.terrain.height + 20) {
          hitSomething = true;
          break;
        }

        const d = Math.hypot(curX - targetTank.x, curY - (targetTank.y - 6));
        if (d < minDistance) minDistance = d;

        // Target tank bounding box [x - 9, x + 9] x [y - 12, y + 2]
        if (
          curX >= targetTank.x - 9 &&
          curX <= targetTank.x + 9 &&
          curY >= targetTank.y - 12 &&
          curY <= targetTank.y + 2
        ) {
          hitTarget = true;
          minDistance = 0;
          hitSomething = true;
          break;
        }

        // Drill proximity check
        if (weaponDef.isDrill && f > 6 && d <= 16) {
          hitTarget = true;
          minDistance = 0;
          hitSomething = true;
          break;
        }

        // Solid terrain check
        if (this.terrain.isSolid(curX, curY)) {
          if (!weaponDef.isDrill) {
            hitSomething = true;
            break;
          }
        }
      }

      x = targetX;
      y = targetY;

      if (hitSomething) break;
    }

    return { hitTarget, minDistance };
  }
}

// Instantiate game when DOM is loaded
window.TankBattleGame = TankBattleGame;
window.addEventListener('DOMContentLoaded', () => {
  window.game = new TankBattleGame();
});
