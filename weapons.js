/**
 * Weapons & Projectile Physics System for Retro Tank Battle
 * - Arsenal: Standard Shell, Heavy Nuke, MIRV Cluster Bomb, Dirt Bomb, Bouncy Shot, Sniper Piercer
 * - Sub-stepping continuous collision detection (CCD) against terrain & tanks
 * - Trajectory affected by gravity, drag, and variable wind
 * - MIRV mid-air apex cluster separation
 * - Direct hit and proximity splash damage calculation
 */

const WEAPONS = {
  standard: {
    id: 'standard',
    name: 'Standard Shell',
    icon: '💣',
    desc: 'Balanced cannon shell with moderate explosive yield.',
    radius: 26,
    directDmg: 50,
    maxSplashDmg: 38,
    gravityMult: 1.0,
    speedMult: 1.0,
    color: '#FFF1E8',
    trailColor: '#C2C3C7',
    isNuke: false,
    isDirt: false,
    isMirv: false,
    bouncesLeft: 0,
  },
  nuke: {
    id: 'nuke',
    name: 'Heavy Nuke',
    icon: '☢️',
    desc: 'Heavy thermonuclear payload. Massive crater & apocalyptic damage.',
    radius: 54,
    directDmg: 102,
    maxSplashDmg: 84,
    gravityMult: 1.15,
    speedMult: 0.88,
    color: '#FFEC27',
    trailColor: '#FFA300',
    isNuke: true,
    isDirt: false,
    isMirv: false,
    bouncesLeft: 0,
  },
  mirv: {
    id: 'mirv',
    name: 'MIRV Cluster',
    icon: '💥',
    desc: 'Splits at trajectory apex into 5 devastating bomblets.',
    radius: 20,
    directDmg: 30,
    maxSplashDmg: 24,
    gravityMult: 1.0,
    speedMult: 1.0,
    color: '#FF77A8',
    trailColor: '#FF77A8',
    isNuke: false,
    isDirt: false,
    isMirv: true,
    bouncesLeft: 0,
  },
  dirt: {
    id: 'dirt',
    name: 'Dirt Bomb',
    icon: '⛰️',
    desc: 'Terraformer shell. Raises a solid earthen hill to bury or shield.',
    radius: 34,
    directDmg: 0,
    maxSplashDmg: 0,
    gravityMult: 1.05,
    speedMult: 0.95,
    color: '#FFA300',
    trailColor: '#AB5236',
    isNuke: false,
    isDirt: true,
    isMirv: false,
    bouncesLeft: 0,
  },
  bouncy: {
    id: 'bouncy',
    name: 'Bouncy Shot',
    icon: '⚽',
    desc: 'Rubber-coated warhead that bounces off terrain up to 3 times.',
    radius: 28,
    directDmg: 54,
    maxSplashDmg: 42,
    gravityMult: 1.0,
    speedMult: 1.0,
    color: '#00E436',
    trailColor: '#00E436',
    isNuke: false,
    isDirt: false,
    isMirv: false,
    bouncesLeft: 3,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Piercer',
    icon: '⚡',
    desc: 'Ultra-fast kinetic slug that pierces through terrain.',
    radius: 20,
    directDmg: 72,
    maxSplashDmg: 26,
    gravityMult: 0.45,
    speedMult: 1.6,
    color: '#29ADFF',
    trailColor: '#29ADFF',
    isNuke: false,
    isDirt: false,
    isMirv: false,
    bouncesLeft: 0,
    pierceCount: 16,
  },
  drill: {
    id: 'drill',
    name: 'Tunnel Drill',
    icon: '⛏️',
    desc: 'Subterranean missile. Burrows directly through the ground to obliterate targets.',
    radius: 34,
    directDmg: 65,
    maxSplashDmg: 45,
    gravityMult: 0.9,
    speedMult: 1.15,
    color: '#FFA300',
    trailColor: '#FF77A8',
    isNuke: false,
    isDirt: false,
    isMirv: false,
    isDrill: true,
    bouncesLeft: 0,
  },
};

class Projectile {
  constructor(x, y, vx, vy, weaponDef, ownerTankId) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = vx;
    this.vy = vy;
    this.weapon = weaponDef;
    this.ownerId = ownerTankId;

    this.bounces = weaponDef.bouncesLeft || 0;
    this.pierceLeft = weaponDef.pierceCount || 0;
    this.isDrill = weaponDef.isDrill || false;
    this.hasSplit = false;
    this.timeAlive = 0;
    this.isDead = false;
    this.isSubMunition = false;
  }

  /**
   * Update physics and check collisions
   * Returns: { exploded: bool, subProjectiles: [] }
   */
  update(wind, terrain, tanks, particleSys) {
    if (this.isDead) return { exploded: false, subProjectiles: [] };

    this.timeAlive++;
    this.prevX = this.x;
    this.prevY = this.y;

    // Apply wind and gravity
    const windForce = wind * 0.0075;
    const baseGravity = 0.22 * this.weapon.gravityMult;

    this.vx += windForce;
    this.vy += baseGravity;

    // Slight air friction
    this.vx *= 0.999;
    this.vy *= 0.999;

    // Emit smoke trail
    if (particleSys && this.timeAlive % 2 === 0) {
      particleSys.createTrail(this.x, this.y, this.weapon.trailColor, this.isSubMunition ? 1 : 2);
    }

    // MIRV Apex check: once projectile reaches apex and begins descending, split!
    if (this.weapon.isMirv && !this.hasSplit && !this.isSubMunition) {
      // Apex condition: vy >= -0.2 and airborne for at least 15 frames
      if (this.vy >= -0.2 && this.timeAlive >= 14) {
        this.hasSplit = true;
        this.isDead = true;

        if (window.soundFX) {
          window.soundFX.playClusterSplit();
        }

        const bomblets = [];
        const spreads = [-1.8, -0.9, 0.0, 0.9, 1.8];
        for (let i = 0; i < spreads.length; i++) {
          const spX = spreads[i];
          const spY = (Math.random() - 0.5) * 0.8;
          const sub = new Projectile(
            this.x,
            this.y,
            this.vx + spX,
            this.vy + spY,
            { ...this.weapon, radius: 18, directDmg: 29, maxSplashDmg: 22 },
            this.ownerId
          );
          sub.isSubMunition = true;
          sub.timeAlive = 10;
          bomblets.push(sub);
        }

        // Particle pop on separation
        if (particleSys) {
          particleSys.createExplosion(this.x, this.y, 12);
        }

        return { exploded: false, subProjectiles: bomblets };
      }
    }

    // Continuous collision detection: Sub-step along the line segment
    const targetX = this.x + this.vx;
    const targetY = this.y + this.vy;
    const dist = Math.hypot(targetX - this.x, targetY - this.y);
    const steps = Math.max(1, Math.ceil(dist / 2.0)); // 2px step resolution

    let hit = false;
    let hitX = targetX;
    let hitY = targetY;
    let hitDirectTank = null;

    for (let s = 1; s <= steps; s++) {
      const interpT = s / steps;
      const curX = this.prevX + (targetX - this.prevX) * interpT;
      const curY = this.prevY + (targetY - this.prevY) * interpT;

      // 1. Check bounds
      if (curX < -50 || curX > terrain.width + 50 || curY > terrain.height + 40) {
        this.isDead = true;
        return { exploded: false, subProjectiles: [] };
      }

      // 2. Check collision against enemy & self tanks
      for (let i = 0; i < tanks.length; i++) {
        const tank = tanks[i];
        if (tank.isDead) continue;
        // Tank bounding box: width ~18, height ~14
        if (
          curX >= tank.x - 9 &&
          curX <= tank.x + 9 &&
          curY >= tank.y - 12 &&
          curY <= tank.y + 2
        ) {
          // Exclude self collision in first 5 frames
          if (tank.id === this.ownerId && this.timeAlive < 6) {
            continue;
          }
          hit = true;
          hitX = curX;
          hitY = curY;
          hitDirectTank = tank;
          break;
        }
      }
      if (hit) break;

      // Subterranean proximity sensor for drill weapon
      if (this.isDrill && this.timeAlive > 6) {
        for (let i = 0; i < tanks.length; i++) {
          const tank = tanks[i];
          if (tank.isDead || tank.id === this.ownerId) continue;
          const dToTank = Math.hypot(curX - tank.x, curY - (tank.y - 4));
          if (dToTank <= 16) {
            hit = true;
            hitX = curX;
            hitY = curY;
            hitDirectTank = tank;
            break;
          }
        }
      }
      if (hit) break;

      // 3. Check collision against terrain
      if (terrain.isSolid(curX, curY)) {
        // If tunnel drill: burrows directly through the ground!
        if (this.isDrill) {
          // Underground bottom abyss or timeout check
          if (curY >= terrain.height - 8 || this.timeAlive > 220) {
            hit = true;
            hitX = curX;
            hitY = Math.min(curY, terrain.height - 8);
            break;
          }

          // Carve narrow tunnel through the subterranean rock
          if (s % 2 === 0) {
            terrain.carveCrater(curX, curY, 4);
          }

          // Subterranean visual FX & sound
          if (particleSys && Math.random() < 0.6) {
            particleSys.createTrail(curX, curY, '#FFA300', 3);
            particleSys.particles.push({
              type: 'spark',
              x: curX,
              y: curY,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -0.4 - Math.random() * 1.2,
              gravity: 0.12,
              drag: 0.96,
              size: 2,
              colorIndex: 0,
              colors: ['#FFEC27', '#FFA300', '#FF004D'],
              life: 0.6,
              decay: 0.05,
            });
          }

          if (window.soundFX && Math.random() < 0.25) {
            window.soundFX.playDrillGrind();
          }

          // Slight friction retention
          this.vx *= 0.995;
          this.vy *= 0.995;
          continue; // Keeps tunneling through the ground!
        }

        // If bouncy weapon and bounces remaining
        if (this.bounces > 0) {
          this.bounces--;
          this.x = curX;
          this.y = curY;
          // Normal approximation: check neighbors
          const leftSolid = terrain.isSolid(curX - 2, curY);
          const rightSolid = terrain.isSolid(curX + 2, curY);
          const topSolid = terrain.isSolid(curX, curY - 2);

          if (topSolid || curY >= terrain.getSurfaceY(curX) - 1) {
            this.vy = -Math.abs(this.vy) * 0.65;
          } else if (leftSolid || rightSolid) {
            this.vx = -this.vx * 0.65;
          } else {
            this.vy = -this.vy * 0.6;
            this.vx *= 0.8;
          }

          if (window.soundFX) {
            window.soundFX.playBounce();
          }
          if (particleSys) {
            particleSys.createTrail(curX, curY, '#00E436', 3);
          }
          return { exploded: false, subProjectiles: [] };
        }

        // If sniper piercer
        if (this.pierceLeft > 0) {
          this.pierceLeft--;
          terrain.carveCrater(curX, curY, 5);
          if (particleSys && Math.random() < 0.4) {
            particleSys.createTrail(curX, curY, '#29ADFF', 2);
          }
          // Slow down slightly while burrowing
          this.vx *= 0.94;
          this.vy *= 0.94;
          continue;
        }

        // Solid hit on ground
        hit = true;
        hitX = curX;
        hitY = curY;
        break;
      }
    }

    if (hit) {
      this.isDead = true;
      this.detonate(hitX, hitY, hitDirectTank, terrain, tanks, particleSys);
      return { exploded: true, subProjectiles: [] };
    }

    this.x = targetX;
    this.y = targetY;
    return { exploded: false, subProjectiles: [] };
  }

  /**
   * Detonation logic: craters, terraforming, direct & splash damage
   */
  detonate(hitX, hitY, hitDirectTank, terrain, tanks, particleSys) {
    const w = this.weapon;

    // Case 1: Terraformer / Dirt Bomb
    if (w.isDirt) {
      terrain.depositDirt(hitX, hitY, w.radius);
      if (particleSys) {
        particleSys.createDirtDepositFX(hitX, hitY, w.radius);
        particleSys.addFloatingText(hitX, hitY - 15, 'TERRAFORMED!', '#FFA300', true);
      }
      if (window.soundFX) {
        window.soundFX.playDirtDeposit();
      }
      return;
    }

    // Case 2: Explosive Warhead
    const { removedCount, debrisGrains } = terrain.carveCrater(hitX, hitY, w.radius);

    if (particleSys) {
      particleSys.createExplosion(hitX, hitY, w.radius, w.isNuke);
      if (debrisGrains && debrisGrains.length > 0) {
        particleSys.createDebris(debrisGrains, hitX, hitY);
      }
    }

    if (window.soundFX) {
      window.soundFX.playExplosion(w.radius);
    }

    // Calculate damage for all tanks
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      if (tank.isDead) continue;

      const dist = Math.hypot(tank.x - hitX, (tank.y - 6) - hitY);
      let totalDamage = 0;

      // Direct hit check
      if (hitDirectTank === tank || dist <= 10) {
        totalDamage += w.directDmg;
        if (particleSys) {
          particleSys.addFloatingText(tank.x, tank.y - 25, 'DIRECT HIT!', '#FF004D', true);
        }
      } else if (dist <= w.radius * 1.2) {
        // Splash damage falloff
        const splashRatio = 1.0 - (dist / (w.radius * 1.2));
        totalDamage += Math.round(w.maxSplashDmg * splashRatio);
      }

      if (totalDamage > 0) {
        tank.takeDamage(totalDamage, 'blast');
        if (particleSys) {
          particleSys.addFloatingText(tank.x, tank.y - 12, `-${totalDamage}`, '#FFEC27', false);
        }
      }
    }
  }

  /**
   * Render projectile to canvas
   */
  draw(ctx) {
    if (this.isDead) return;

    ctx.save();
    const angle = Math.atan2(this.vy, this.vx);
    ctx.translate(Math.floor(this.x), Math.floor(this.y));
    ctx.rotate(angle);

    if (this.weapon.isNuke) {
      // Big fat missile with hazard nose
      ctx.fillStyle = '#1D2B53';
      ctx.fillRect(-6, -3, 12, 6);
      ctx.fillStyle = '#FFEC27';
      ctx.fillRect(-2, -2, 6, 4);
      ctx.fillStyle = '#FF004D';
      ctx.fillRect(4, -1, 3, 2);
    } else if (this.weapon.isDirt) {
      // Earth canister
      ctx.fillStyle = '#AB5236';
      ctx.fillRect(-4, -2, 8, 4);
      ctx.fillStyle = '#FFA300';
      ctx.fillRect(-1, -1, 3, 2);
    } else if (this.weapon.id === 'bouncy') {
      // Green bouncy ball
      ctx.fillStyle = '#00E436';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.weapon.id === 'sniper') {
      // Glowing needle slug
      ctx.fillStyle = '#29ADFF';
      ctx.fillRect(-6, -1, 12, 2);
      ctx.fillStyle = '#FFF1E8';
      ctx.fillRect(-2, 0, 4, 1);
    } else if (this.weapon.id === 'drill') {
      // Subterranean hardened drill missile
      ctx.fillStyle = '#5F574F';
      ctx.fillRect(-6, -3, 8, 6);
      ctx.fillStyle = '#C2C3C7';
      ctx.beginPath();
      ctx.moveTo(2, -4);
      ctx.lineTo(9, 0); // Cone drill head
      ctx.lineTo(2, 4);
      ctx.closePath();
      ctx.fill();
      // Tungsten carbide spiraled ridges
      ctx.fillStyle = '#FFEC27';
      ctx.fillRect(-3, -2, 2, 4);
      ctx.fillStyle = '#FFA300';
      ctx.fillRect(0, -2, 2, 4);
      // Rocket thruster exhaust
      ctx.fillStyle = '#FF004D';
      ctx.fillRect(-8, -1.5, 2, 3);
    } else {
      // Standard / MIRV shell
      ctx.fillStyle = this.weapon.color;
      ctx.fillRect(-3, -1.5, 6, 3);
      ctx.fillStyle = '#FFA300';
      ctx.fillRect(-4, -1, 1, 2);
    }

    ctx.restore();
  }
}

window.WEAPONS = WEAPONS;
window.Projectile = Projectile;
