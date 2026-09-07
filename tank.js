/**
 * Tank Entity for Retro Tank Battle
 * - Animated pixel-art treads & chassis
 * - Rotating turret with recoil kickback
 * - Slope alignment & ground tracking
 * - Falling physics & fall damage calculation
 * - Dynamic health, damage smoke/fire states
 * - Dramatic multi-explosion death sequence with detached flying turret
 */

class Tank {
  constructor(id, name, x, colorScheme) {
    this.id = id; // 1 or 2
    this.name = name; // "PLAYER 1" or "PLAYER 2"
    this.x = x;
    this.y = 200;
    this.targetY = 200;
    this.vy = 0;
    this.isFalling = false;
    this.fallDistance = 0;
    this.slopeAngle = 0;

    this.maxHp = 100;
    this.hp = 100;
    this.maxFuel = 80;
    this.fuel = 80;

    this.angle = 45; // 0 to 180 degrees (relative to player facing forward)
    this.power = 65; // 5 to 100 percent

    // Ammunition inventory
    this.inventory = {
      standard: Infinity,
      nuke: 2,
      mirv: 3,
      dirt: 3,
      bouncy: 3,
      sniper: 2,
      drill: 2,
    };
    this.selectedWeapon = 'standard';

    // Visual colors (Pico-8 / EGA)
    this.colors = colorScheme;

    // Animation & Recoil state
    this.treadOffset = 0;
    this.recoil = 0;
    this.isDead = false;
    this.deathTimer = 0;
    this.deathExplosionsLeft = 0;

    // Flying detached turret physics on death
    this.detachedTurret = null;
  }

  resetTurn() {
    this.fuel = this.maxFuel;
    this.recoil = 0;
  }

  /**
   * Calculate absolute world aim angle in radians
   */
  getWorldAimAngle() {
    const deg = this.angle;
    const rad = (deg * Math.PI) / 180;
    if (this.id === 1) {
      // Facing right: 0° is +X (right), 90° is straight up, 180° is -X (left)
      return -rad;
    } else {
      // Facing left: 0° is -X (left), 90° is straight up, 180° is +X (right)
      return -Math.PI + rad;
    }
  }

  /**
   * Get muzzle tip position in world coordinates for spawning projectile
   */
  getMuzzlePosition() {
    const turretBaseX = this.x;
    const turretBaseY = this.y - 7;
    const worldAngle = this.getWorldAimAngle();
    const barrelLen = 13 - this.recoil;

    return {
      x: turretBaseX + Math.cos(worldAngle) * barrelLen,
      y: turretBaseY + Math.sin(worldAngle) * barrelLen,
      angle: worldAngle,
    };
  }

  /**
   * Apply ground tracking, slope alignment, and falling physics
   */
  updatePhysics(terrain, particleSys, onFallDamage) {
    if (this.isDead) {
      this.updateDeathSequence(terrain, particleSys);
      return;
    }

    // Measure ground height beneath left tread (x - 7) and right tread (x + 7)
    const leftX = Math.max(0, Math.min(terrain.width - 1, Math.round(this.x - 7)));
    const rightX = Math.max(0, Math.min(terrain.width - 1, Math.round(this.x + 7)));
    const midX = Math.max(0, Math.min(terrain.width - 1, Math.round(this.x)));

    const yLeft = terrain.getSurfaceY(leftX);
    const yRight = terrain.getSurfaceY(rightX);
    const yMid = terrain.getSurfaceY(midX);

    // Tread-supported ground level: The tank chassis rests on its tracks (yLeft & yRight).
    // If straddling a crater, it bridges across the tracks. If perched on a mound, it rests on the mound.
    const trackMidY = (yLeft + yRight) * 0.5;
    const rawGroundY = Math.min(trackMidY, yMid);
    const groundY = Math.min(terrain.height - 4, rawGroundY);

    // Check if tank is airborne / unsupported by ground
    if (this.y < groundY - 1) {
      this.isFalling = true;
      this.vy += 0.35; // Gravity
      this.y += this.vy;
      this.fallDistance += this.vy;

      if (this.y >= groundY) {
        // Tank has landed!
        this.y = groundY;
        const totalFell = this.fallDistance;
        this.isFalling = false;
        this.vy = 0;
        this.fallDistance = 0;

        // Fall damage if dropped more than 18 pixels
        if (totalFell > 18) {
          const dmg = Math.min(30, Math.floor((totalFell - 16) * 0.8));
          if (dmg > 0) {
            this.takeDamage(dmg, 'fall');
            if (particleSys) {
              particleSys.addFloatingText(this.x, this.y - 20, `-${dmg} FALL DMG!`, '#FF004D', true);
              particleSys.addScreenShake(6);
            }
            if (window.soundFX) {
              window.soundFX.playFallDamage();
            }
            if (onFallDamage) onFallDamage(this, dmg);
          }
        }
      }
    } else {
      // Tank is on the ground
      this.y = groundY;
      this.isFalling = false;
      this.vy = 0;
      this.fallDistance = 0;

      // Smooth slope alignment
      const dx = 14;
      const dy = yRight - yLeft;
      const targetSlope = Math.atan2(dy, dx);
      // Clamp max visual slope
      const clampedSlope = Math.max(-0.75, Math.min(0.75, targetSlope));
      this.slopeAngle += (clampedSlope - this.slopeAngle) * 0.2;
    }

    // Recover from recoil
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - 0.4);
    }

    // Emit damage smoke/fire when low on health
    if (!this.isDead && particleSys && Math.random() < 0.25) {
      if (this.hp <= 25) {
        // Fire & dense smoke
        particleSys.particles.push({
          type: 'spark',
          x: this.x + (Math.random() - 0.5) * 8,
          y: this.y - 8,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -0.8 - Math.random() * 0.8,
          gravity: 0.05,
          drag: 0.98,
          size: 2,
          colorIndex: 0,
          colors: ['#FFEC27', '#FFA300', '#FF004D', '#5F574F'],
          life: 1.0,
          decay: 0.04,
        });
      } else if (this.hp <= 50) {
        // Light gray smoke
        particleSys.createTrail(this.x + (Math.random() - 0.5) * 6, this.y - 8, '#5F574F', 2);
      }
    }
  }

  /**
   * Drive tank left or right (costs fuel)
   */
  drive(dir, terrain) {
    if (this.isDead || this.isFalling || this.fuel <= 0) return false;

    const step = dir * 1.0;
    const nextX = this.x + step;

    // Boundaries
    if (nextX < 14 || nextX > terrain.width - 14) return false;

    // Slope check: cannot climb near-vertical cliffs
    const currentY = terrain.getSurfaceY(Math.round(this.x));
    const nextY = terrain.getSurfaceY(Math.round(nextX));
    const rise = currentY - nextY; // positive means uphill

    if (rise > 2.5) {
      // Too steep to climb!
      return false;
    }

    this.x = nextX;
    this.fuel = Math.max(0, this.fuel - 0.8);
    this.treadOffset = (this.treadOffset + dir * 0.5) % 4;

    return true;
  }

  /**
   * Take damage, clamp to 0, trigger death sequence if 0 HP
   */
  takeDamage(amount, source = 'blast') {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);

    if (this.hp <= 0) {
      this.triggerDeath();
    }
  }

  /**
   * Initiate catastrophic tank destruction
   */
  triggerDeath() {
    this.isDead = true;
    this.isFalling = false; // Always clear falling flag on death to prevent state hangs
    this.fallDistance = 0;
    this.deathTimer = 0;
    this.deathExplosionsLeft = 6;

    // Launch detached turret spinning into the sky!
    const turretAngle = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.6;
    const turretSpeed = 3.5 + Math.random() * 2.5;

    this.detachedTurret = {
      x: this.x,
      y: this.y - 7,
      vx: Math.cos(turretAngle) * turretSpeed,
      vy: Math.sin(turretAngle) * turretSpeed,
      rot: 0,
      vRot: (Math.random() - 0.5) * 0.35,
      landed: false,
    };
  }

  /**
   * Multi-stage death explosion animation & wreck settling
   */
  updateDeathSequence(terrain, particleSys) {
    this.deathTimer++;

    // Settle charred wreck to ground if ground below it collapsed or was blown away
    if (terrain) {
      const midX = Math.max(0, Math.min(terrain.width - 1, Math.round(this.x)));
      const groundY = Math.min(terrain.height - 4, terrain.getSurfaceY(midX));
      if (this.y < groundY - 1) {
        this.vy = (this.vy || 0) + 0.35;
        this.y += this.vy;
        if (this.y >= groundY) {
          this.y = groundY;
          this.vy = 0;
          this.isFalling = false;
        }
      } else {
        this.y = groundY;
        this.vy = 0;
        this.isFalling = false;
      }
    }

    // Chain explosions around the hull
    if (this.deathExplosionsLeft > 0 && this.deathTimer % 12 === 0) {
      this.deathExplosionsLeft--;
      const exX = this.x + (Math.random() - 0.5) * 16;
      const exY = this.y - 5 + (Math.random() - 0.5) * 10;
      if (particleSys) {
        particleSys.createExplosion(exX, exY, 18 + Math.random() * 10);
      }
      if (window.soundFX) {
        window.soundFX.playExplosion(22);
      }
    }

    // Update detached flying turret
    if (this.detachedTurret && !this.detachedTurret.landed) {
      const dt = this.detachedTurret;
      dt.vy += 0.25;
      dt.x += dt.vx;
      dt.y += dt.vy;
      dt.rot += dt.vRot;

      if (particleSys && Math.random() < 0.6) {
        particleSys.createTrail(dt.x, dt.y, '#5F574F', 2);
      }

      if (terrain && terrain.isSolid(dt.x, dt.y)) {
        dt.landed = true;
        if (particleSys) {
          particleSys.createExplosion(dt.x, dt.y, 14);
        }
        if (window.soundFX) {
          window.soundFX.playExplosion(15);
        }
      }
    }
  }

  /**
   * Render tank sprite to canvas context
   */
  draw(ctx) {
    ctx.save();
    ctx.translate(Math.floor(this.x || 0), Math.floor(this.y || 0));
    ctx.rotate(this.slopeAngle || 0);

    // If tank is dead, render charred smoking wreck
    if (this.isDead) {
      this.drawCharredWreck(ctx);
      ctx.restore();

      // Draw detached flying turret if present
      if (this.detachedTurret) {
        this.drawDetachedTurret(ctx);
      }
      return;
    }

    const col = this.colors;

    // 1. Treads / Tracks (18px wide, 5px high)
    ctx.fillStyle = '#000000';
    ctx.fillRect(-9, -4, 18, 5);

    ctx.fillStyle = '#5F574F';
    ctx.fillRect(-8, -3, 16, 3);

    // Moving tread links
    ctx.fillStyle = '#C2C3C7';
    for (let i = -7; i <= 7; i += 3) {
      const tx = i + (Math.floor(this.treadOffset) % 3);
      if (tx >= -8 && tx <= 7) {
        ctx.fillRect(tx, -4, 1, 1);
        ctx.fillRect(tx, -1, 1, 1);
      }
    }

    // 2. Chassis / Armor Hull (14px wide, 5px high)
    ctx.fillStyle = col.hullDark;
    ctx.fillRect(-7, -8, 14, 5);

    ctx.fillStyle = col.hull;
    ctx.fillRect(-6, -7, 12, 3);

    // Colored badge / stripe
    ctx.fillStyle = col.accent;
    ctx.fillRect(-3, -7, 6, 2);

    // 3. Turret Dome & Commander Cupola
    ctx.fillStyle = col.hullDark;
    ctx.fillRect(-4, -11, 8, 4);

    ctx.fillStyle = col.hull;
    ctx.fillRect(-3, -10, 6, 3);

    ctx.fillStyle = col.accent;
    ctx.fillRect(-2, -10, 4, 1);

    // 4. Rotating Barrel with Recoil
    const aimWorld = this.getWorldAimAngle();
    // Angle relative to the tank chassis (subtract slopeAngle)
    const barrelRelAngle = (aimWorld || 0) - (this.slopeAngle || 0);

    ctx.save();
    ctx.translate(0, -9);
    ctx.rotate(barrelRelAngle || 0);

    const barrelLength = Math.max(4, 11 - (this.recoil || 0));
    // Barrel shadow / outline
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, -1.5, barrelLength + 1, 3);

    // Barrel metal
    ctx.fillStyle = col.barrel;
    ctx.fillRect(0, -0.5, barrelLength, 2);

    // Muzzle brake
    ctx.fillStyle = col.accent;
    ctx.fillRect(barrelLength - 2, -1.5, 2, 3);

    ctx.restore();

    ctx.restore();
  }

  drawCharredWreck(ctx) {
    // Charred ruined tank body
    ctx.fillStyle = '#1D2B53';
    ctx.fillRect(-9, -4, 18, 5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(-8, -3, 16, 3);
    ctx.fillStyle = '#5F574F';
    ctx.fillRect(-6, -6, 12, 3);
    // Sparks & charred debris
    ctx.fillStyle = '#FFA300';
    ctx.fillRect(-2, -5, 2, 2);
  }

  drawDetachedTurret(ctx) {
    const dt = this.detachedTurret;
    if (!dt) return;
    ctx.save();
    ctx.translate(Math.floor(dt.x || 0), Math.floor(dt.y || 0));
    ctx.rotate(dt.rot || 0);

    // Blown off turret dome
    ctx.fillStyle = '#000000';
    ctx.fillRect(-4, -3, 8, 5);
    ctx.fillStyle = this.colors.hullDark;
    ctx.fillRect(-3, -2, 6, 3);

    // Bent barrel
    ctx.fillStyle = '#5F574F';
    ctx.fillRect(0, -1, 9, 2);

    ctx.restore();
  }
}

window.Tank = Tank;
