/**
 * Weapons & Projectile Physics for Retro Tank Battle
 * - 13-weapon arsenal (order = hotkeys 1..9, 0, then [ / ] to cycle)
 * - Sub-stepped continuous collision against terrain and tanks
 * - Gravity, drag and wind; homing steering; rolling bombs
 * - Detonations may spawn children: MIRV/Funky bomblets, napalm flames,
 *   an air-strike bomber. Everything in flight implements
 *   update(wind, terrain, tanks, particles) -> { exploded, subProjectiles }
 */

const GRAVITY = 0.22;
const WIND_FORCE = 0.0075;

// Muzzle speed for a power setting (shared by the game, the aim guide and the bot).
// RANGE_SCALE is set by the map size. Range goes with speed squared, so speed
// scales with about sqrt(map width) (a little more, for the drag on longer
// flights): the same power crosses the same share of any map. The 7 % margin
// lets 100 % power reach the farthest spawns against the strongest headwind;
// typical shots sit around 75-85 %.
const rangeScaleFor = width => 1.07 * Math.pow(width / 1800, 0.55);
let RANGE_SCALE = rangeScaleFor(1800);
function launchSpeed(powerPct, weapon) {
  return (3 + (powerPct / 100) * 18) * (weapon ? weapon.speedMult : 1) * RANGE_SCALE;
}

const WEAPONS = {
  standard: { name: 'Standard Shell', short: 'STANDARD', icon: '💣', ammo: Infinity,
    desc: 'Balanced cannon shell with moderate explosive yield.',
    radius: 24, directDmg: 25, maxSplashDmg: 16, color: '#FFF1E8', trailColor: '#C2C3C7' },
  triple: { name: 'Triple Shot', short: 'TRIPLE', icon: '🔱', ammo: 3,
    desc: 'Three shells fired in a 5° spread. Forgiving on long shots.',
    radius: 18, directDmg: 14, maxSplashDmg: 9, color: '#C2C3C7', trailColor: '#83769C', spreadDeg: [-5, 0, 5] },
  nuke: { name: 'Heavy Nuke', short: 'HEAVY NUKE', icon: '☢️', ammo: 2,
    desc: 'Thermonuclear payload. Massive crater and high area damage.',
    radius: 50, directDmg: 50, maxSplashDmg: 35, gravityMult: 1.15, speedMult: 0.88, color: '#FFEC27', trailColor: '#FFA300', isNuke: true },
  mirv: { name: 'MIRV Cluster', short: 'MIRV', icon: '💥', ammo: 3,
    desc: 'Splits at the top of its arc into 5 bomblets.',
    radius: 20, directDmg: 16, maxSplashDmg: 12, color: '#FF77A8', trailColor: '#FF77A8', isMirv: true },
  funky: { name: 'Funky Bomb', short: 'FUNKY BOMB', icon: '🎆', ammo: 2,
    desc: 'Bursts on impact into 6 bouncing bomblets that scatter around.',
    radius: 20, directDmg: 18, maxSplashDmg: 12, color: '#FF77A8', trailColor: '#29ADFF', isFunky: true },
  napalm: { name: 'Napalm', short: 'NAPALM', icon: '🔥', ammo: 2,
    desc: 'Splashes burning fuel that runs downhill and scorches tanks in the pool.',
    radius: 8, directDmg: 6, maxSplashDmg: 3, color: '#FF004D', trailColor: '#FFA300', isNapalm: true },
  homing: { name: 'Homing Missile', short: 'HOMING', icon: '🎯', ammo: 2,
    desc: 'Locks on after the top of its arc and steers toward the enemy.',
    radius: 22, directDmg: 24, maxSplashDmg: 16, speedMult: 0.95, color: '#C2C3C7', trailColor: '#FFF1E8', isHoming: true },
  airstrike: { name: 'Air Strike', short: 'AIR STRIKE', icon: '✈️', ammo: 1,
    desc: 'Smoke marker. A bomber flies over and drops 5 bombs along the mark.',
    radius: 6, directDmg: 0, maxSplashDmg: 0, color: '#FFEC27', trailColor: '#FFEC27', isAirstrike: true },
  roller: { name: 'Roller', short: 'ROLLER', icon: '🛞', ammo: 3,
    desc: 'Lands and rolls downhill, exploding on a tank, a wall, or when it stops.',
    radius: 26, directDmg: 26, maxSplashDmg: 18, color: '#1D2B53', trailColor: '#5F574F', isRoller: true },
  bouncy: { name: 'Bouncy Shot', short: 'BOUNCY', icon: '⚽', ammo: 3,
    desc: 'Rubber-coated warhead that bounces off terrain up to 3 times.',
    radius: 26, directDmg: 28, maxSplashDmg: 18, color: '#00E436', trailColor: '#00E436', bouncesLeft: 3 },
  sniper: { name: 'Sniper Piercer', short: 'SNIPER', icon: '⚡', ammo: 2,
    desc: 'Ultra-fast kinetic slug that pierces through terrain.',
    radius: 18, directDmg: 35, maxSplashDmg: 12, gravityMult: 0.45, speedMult: 1.6, color: '#29ADFF', trailColor: '#29ADFF', pierceCount: 16 },
  drill: { name: 'Tunnel Drill', short: 'DRILL', icon: '⛏️', ammo: 2,
    desc: 'Burrows through the ground toward the target before detonating.',
    radius: 30, directDmg: 32, maxSplashDmg: 20, gravityMult: 0.9, speedMult: 1.15, color: '#FFA300', trailColor: '#FF77A8', isDrill: true },
  dirt: { name: 'Dirt Bomb', short: 'DIRT BOMB', icon: '⛰️', ammo: 3,
    desc: 'Terraformer. Raises a hill of earth to bury a tank or build a wall.',
    radius: 34, directDmg: 0, maxSplashDmg: 0, gravityMult: 1.05, speedMult: 0.95, color: '#FFA300', trailColor: '#AB5236', isDirt: true }
};
// Child munitions (not selectable)
const SUB_MUNITIONS = {
  mirvlet: { name: 'MIRV bomblet', radius: 16, directDmg: 14, maxSplashDmg: 10, color: '#FF77A8', trailColor: '#FF77A8' },
  funkylet: { name: 'Funky bomblet', radius: 14, directDmg: 12, maxSplashDmg: 8, color: '#29ADFF', trailColor: '#FF77A8', bouncesLeft: 1 },
  airbomb: { name: 'Air-strike bomb', radius: 22, directDmg: 18, maxSplashDmg: 12, color: '#5F574F', trailColor: '#C2C3C7' }
};
for (const [id, w] of Object.entries(Object.assign({}, WEAPONS, SUB_MUNITIONS))) {
  w.id = id;
  if (w.gravityMult === undefined) w.gravityMult = 1.0;
  if (w.speedMult === undefined) w.speedMult = 1.0;
}
const WEAPON_ORDER = Object.keys(WEAPONS);

const NONE = { exploded: false, subProjectiles: [] };
const sfx = () => window.soundFX;

function enemyOf(ownerId, tanks) {
  return tanks.find(t => !t.isDead && t.id !== ownerId) || null;
}

function inTankBox(tank, x, y) {
  return x >= tank.x - 9 && x <= tank.x + 9 && y >= tank.y - 12 && y <= tank.y + 2;
}

/**
 * Crater + direct/splash damage for an explosive warhead
 */
function applyBlast(x, y, w, directTank, terrain, tanks, ps) {
  const { debrisGrains } = terrain.carveCrater(x, y, w.radius);
  if (ps) {
    ps.createExplosion(x, y, w.radius, !!w.isNuke);
    if (debrisGrains.length) ps.createDebris(debrisGrains, x, y);
  }
  if (sfx()) sfx().playExplosion(w.radius);
  for (const tank of tanks) {
    if (tank.isDead) continue;
    const dist = Math.hypot(tank.x - x, tank.y - 6 - y);
    let dmg = 0;
    if (directTank === tank || dist <= 10) {
      dmg = w.directDmg;
      if (ps && dmg > 0) ps.addFloatingText(tank.x, tank.y - 25, 'DIRECT HIT!', '#FF004D', true);
    } else if (dist <= w.radius * 1.2) {
      dmg = Math.round(w.maxSplashDmg * (1 - dist / (w.radius * 1.2)));
    }
    if (dmg > 0) {
      tank.takeDamage(dmg, 'blast');
      if (ps) ps.addFloatingText(tank.x, tank.y - 12, `-${dmg}`, '#FFEC27', false);
    }
  }
}

class Projectile {
  constructor(x, y, vx, vy, weaponDef, ownerTankId) {
    this.x = x; this.y = y; this.prevX = x; this.prevY = y;
    this.vx = vx; this.vy = vy;
    this.weapon = weaponDef;
    this.ownerId = ownerTankId;
    this.bounces = weaponDef.bouncesLeft || 0;
    this.pierceLeft = weaponDef.pierceCount || 0;
    this.isDrill = !!weaponDef.isDrill;
    this.hasSplit = false;
    this.timeAlive = 0;
    this.isDead = false;
    this.isSubMunition = false;
    // homing
    this.locked = false;
    this.homingFrames = 0;
    // roller
    this.rolling = false;
    this.rollFrames = 0;
  }

  update(wind, terrain, tanks, ps) {
    if (this.isDead) return NONE;
    this.timeAlive++;
    this.prevX = this.x; this.prevY = this.y;
    if (this.rolling) return this.updateRoll(terrain, tanks, ps);

    const w = this.weapon;
    if (this.timeAlive > 480) { this.isDead = true; return NONE; }   // failsafe (~8 s)

    // Homing: lock near the apex, then steer toward the enemy
    let steered = false;
    if (w.isHoming) {
      if (!this.locked && this.timeAlive > 16 && this.vy > -1.0) {
        this.locked = true;
        if (sfx() && sfx().playHomingLock) sfx().playHomingLock();
      }
      const target = this.locked && this.homingFrames < 180 ? enemyOf(this.ownerId, tanks) : null;
      if (target) {
        this.homingFrames++;
        const cur = Math.atan2(this.vy, this.vx);
        // cruise toward a point above the target (clears hills in between),
        // then dive once within 80 px horizontally
        const far = Math.abs(target.x - this.x) > 80;
        const aimY = far ? Math.min(target.y - 70, this.y) : target.y - 6;
        let diff = Math.atan2(aimY - this.y, target.x - this.x) - cur;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const turn = Math.max(-0.07, Math.min(0.07, diff));
        const speed = Math.min(9, Math.max(Math.hypot(this.vx, this.vy), 4) * 1.01);
        this.vx = Math.cos(cur + turn) * speed;
        this.vy = Math.sin(cur + turn) * speed + GRAVITY * 0.25;
        steered = true;
      }
    }
    if (!steered) {
      this.vx += wind * WIND_FORCE;
      this.vy += GRAVITY * w.gravityMult;
    }
    this.vx *= 0.999; this.vy *= 0.999;

    if (ps && this.timeAlive % 2 === 0) ps.createTrail(this.x, this.y, w.trailColor, this.isSubMunition ? 1 : 2);

    // MIRV: split at the apex
    if (w.isMirv && !this.hasSplit && !this.isSubMunition && this.vy >= -0.2 && this.timeAlive >= 14) {
      this.hasSplit = true;
      this.isDead = true;
      if (sfx()) sfx().playClusterSplit();
      if (ps) ps.createExplosion(this.x, this.y, 12);
      const subs = [-1.8, -0.9, 0, 0.9, 1.8].map(spX => {
        const s = new Projectile(this.x, this.y, this.vx + spX, this.vy + (Math.random() - 0.5) * 0.8, SUB_MUNITIONS.mirvlet, this.ownerId);
        s.isSubMunition = true; s.timeAlive = 10;
        return s;
      });
      return { exploded: false, subProjectiles: subs };
    }

    // Continuous collision along this frame's path (2 px steps)
    const targetX = this.x + this.vx, targetY = this.y + this.vy;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) / 2));
    let hit = false, hitX = targetX, hitY = targetY, hitTank = null;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const curX = this.prevX + (targetX - this.prevX) * t;
      const curY = this.prevY + (targetY - this.prevY) * t;

      if (curX < -50 || curX > terrain.width + 50 || curY > terrain.height + 40) { this.isDead = true; return NONE; }

      for (const tank of tanks) {
        if (tank.isDead || !inTankBox(tank, curX, curY)) continue;
        if (tank.id === this.ownerId && this.timeAlive < 6) continue;
        hit = true; hitX = curX; hitY = curY; hitTank = tank; break;
      }
      if (hit) break;

      // Tunnel Drill: proximity fuse underground
      if (this.isDrill && this.timeAlive > 6) {
        for (const tank of tanks) {
          if (tank.isDead || tank.id === this.ownerId) continue;
          if (Math.hypot(curX - tank.x, curY - (tank.y - 4)) <= 16) { hit = true; hitX = curX; hitY = curY; hitTank = tank; break; }
        }
        if (hit) break;
      }

      if (!terrain.isSolid(curX, curY)) continue;

      if (this.isDrill) {
        if (curY >= terrain.height - 8 || this.timeAlive > 220) { hit = true; hitX = curX; hitY = Math.min(curY, terrain.height - 8); break; }
        if (s % 2 === 0) terrain.carveCrater(curX, curY, 4);
        if (ps && Math.random() < 0.6) {
          ps.createTrail(curX, curY, '#FFA300', 3);
          ps.push({ type: 'spark', x: curX, y: curY, vx: (Math.random() - 0.5) * 1.5, vy: -0.4 - Math.random() * 1.2,
            gravity: 0.12, drag: 0.96, size: 2, colors: ['#FFEC27', '#FFA300', '#FF004D'], life: 0.6, decay: 0.05 });
        }
        if (sfx() && Math.random() < 0.25) sfx().playDrillGrind();
        this.vx *= 0.995; this.vy *= 0.995;
        continue;
      }

      if (this.bounces > 0) {
        this.bounces--;
        this.x = curX; this.y = curY;
        const leftSolid = terrain.isSolid(curX - 2, curY), rightSolid = terrain.isSolid(curX + 2, curY);
        const topSolid = terrain.isSolid(curX, curY - 2);
        if (topSolid || curY >= terrain.getSurfaceY(curX) - 1) this.vy = -Math.abs(this.vy) * 0.65;
        else if (leftSolid || rightSolid) this.vx = -this.vx * 0.65;
        else { this.vy = -this.vy * 0.6; this.vx *= 0.8; }
        if (sfx()) sfx().playBounce();
        if (ps) ps.createTrail(curX, curY, w.trailColor, 3);
        return NONE;
      }

      if (this.pierceLeft > 0) {
        this.pierceLeft--;
        terrain.carveCrater(curX, curY, 5);
        if (ps && Math.random() < 0.4) ps.createTrail(curX, curY, '#29ADFF', 2);
        this.vx *= 0.94; this.vy *= 0.94;
        continue;
      }

      // Roller: settle onto the surface and start rolling
      if (w.isRoller) {
        this.rolling = true;
        this.x = curX;
        this.y = terrain.getSurfaceY(curX);
        this.rollDir = Math.sign(this.vx) || 1;
        // prefer downhill if the landing spot slopes
        const l = terrain.getSurfaceY(curX - 4), r = terrain.getSurfaceY(curX + 4);
        if (Math.abs(r - l) > 2) this.rollDir = r > l ? 1 : -1;
        this.rollSpeed = Math.min(3.5, Math.max(1.2, Math.abs(this.vx) * 0.8));
        if (sfx()) sfx().playBounce();
        return NONE;
      }

      hit = true; hitX = curX; hitY = curY; break;
    }

    if (hit) {
      this.isDead = true;
      const subs = this.detonate(hitX, hitY, hitTank, terrain, tanks, ps);
      return { exploded: true, subProjectiles: subs };
    }
    this.x = targetX; this.y = targetY;
    return NONE;
  }

  // Rolling bomb: follow the surface, speed up downhill, slow uphill
  updateRoll(terrain, tanks, ps) {
    this.rollFrames++;
    const nx = this.x + this.rollDir * this.rollSpeed;
    const boom = (tank) => {
      this.isDead = true;
      return { exploded: true, subProjectiles: this.detonate(this.x, this.y - 3, tank || null, terrain, tanks, ps) };
    };
    if (nx < 4 || nx > terrain.width - 4 || this.rollFrames > 360) return boom();
    const sy = terrain.getSurfaceY(nx);
    if (this.y - sy > 4) return boom();                       // hit a wall
    this.rollSpeed += (sy - this.y) * 0.09;                    // slope: + downhill
    this.rollSpeed = Math.min(5, this.rollSpeed * 0.992);
    if (this.rollSpeed < 0.25 && this.rollFrames > 8) return boom();
    this.x = nx; this.y = sy;
    for (const tank of tanks) {
      if (tank.isDead || (tank.id === this.ownerId && this.rollFrames < 30)) continue;
      if (inTankBox(tank, this.x, this.y - 3) || Math.abs(tank.x - this.x) < 10 && Math.abs(tank.y - this.y) < 8) return boom(tank);
    }
    if (ps && this.rollFrames % 3 === 0) ps.createTrail(this.x, this.y - 2, '#5F574F', 2);
    return NONE;
  }

  /**
   * Detonation: returns spawned children (bomblets, flames, bomber)
   */
  detonate(x, y, directTank, terrain, tanks, ps) {
    const w = this.weapon;
    if (w.isDirt) {
      terrain.depositDirt(x, y, w.radius);
      if (ps) { ps.createDirtDepositFX(x, y, w.radius); ps.addFloatingText(x, y - 15, 'TERRAFORMED!', '#FFA300', true); }
      if (sfx()) sfx().playDirtDeposit();
      return [];
    }
    if (w.isAirstrike) {
      if (ps) { ps.addFloatingText(x, y - 18, 'AIR STRIKE INBOUND!', '#FFEC27', true); for (let i = 0; i < 12; i++) ps.createTrail(x, y - i, '#FFEC27', 3); }
      const owner = tanks.find(t => t.id === this.ownerId);
      const dir = owner && owner.x > x ? -1 : 1;   // fly in from the shooter's side
      return [new Bomber(x, dir, this.ownerId, terrain)];
    }
    applyBlast(x, y, w, directTank, terrain, tanks, ps);
    if (w.isFunky) {
      return Array.from({ length: 6 }, (_, i) => {
        const a = -Math.PI / 2 + (i - 2.5) * 0.42 + (Math.random() - 0.5) * 0.2;
        const sp = 2.5 + Math.random() * 2.5;
        const s = new Projectile(x, y - 6, Math.cos(a) * sp, Math.sin(a) * sp, SUB_MUNITIONS.funkylet, this.ownerId);
        s.isSubMunition = true; s.timeAlive = 10;
        return s;
      });
    }
    if (w.isNapalm) {
      if (sfx() && sfx().playNapalm) sfx().playNapalm();
      if (ps) ps.addFloatingText(x, y - 42, 'NAPALM!', '#FF004D', true);
      return Array.from({ length: 18 }, () => new Flame(x, y - 4, (Math.random() - 0.5) * 4, -1 - Math.random() * 2.5, this.ownerId));
    }
    return [];
  }

  draw(ctx) {
    if (this.isDead) return;
    const w = this.weapon;
    ctx.save();
    ctx.translate(this.x | 0, this.y | 0);
    if (!this.rolling) ctx.rotate(Math.atan2(this.vy, this.vx));
    switch (w.id) {
      case 'nuke':
        ctx.fillStyle = '#1D2B53'; ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#FFEC27'; ctx.fillRect(-2, -2, 6, 4);
        ctx.fillStyle = '#FF004D'; ctx.fillRect(4, -1, 3, 2);
        break;
      case 'dirt':
        ctx.fillStyle = '#AB5236'; ctx.fillRect(-4, -2, 8, 4);
        ctx.fillStyle = '#FFA300'; ctx.fillRect(-1, -1, 3, 2);
        break;
      case 'bouncy': case 'funky': case 'funkylet':
        ctx.fillStyle = w.id === 'bouncy' ? '#00E436' : (this.timeAlive % 8 < 4 ? '#FF77A8' : '#29ADFF');
        ctx.beginPath(); ctx.arc(0, 0, w.id === 'funkylet' ? 2 : 3, 0, Math.PI * 2); ctx.fill();
        break;
      case 'sniper':
        ctx.fillStyle = '#29ADFF'; ctx.fillRect(-6, -1, 12, 2);
        ctx.fillStyle = '#FFF1E8'; ctx.fillRect(-2, 0, 4, 1);
        break;
      case 'drill':
        ctx.fillStyle = '#5F574F'; ctx.fillRect(-6, -3, 8, 6);
        ctx.fillStyle = '#C2C3C7'; ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(9, 0); ctx.lineTo(2, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#FFEC27'; ctx.fillRect(-3, -2, 2, 4);
        ctx.fillStyle = '#FFA300'; ctx.fillRect(0, -2, 2, 4);
        ctx.fillStyle = '#FF004D'; ctx.fillRect(-8, -1.5, 2, 3);
        break;
      case 'homing':
        ctx.fillStyle = '#C2C3C7'; ctx.fillRect(-5, -1.5, 9, 3);
        ctx.fillStyle = '#FF004D'; ctx.fillRect(4, -1, 2, 2);
        ctx.fillStyle = '#5F574F'; ctx.fillRect(-5, -3, 2, 6);
        if (this.locked && this.homingFrames < 180) { ctx.fillStyle = '#FFEC27'; ctx.fillRect(-8, -1, 3, 2); }
        break;
      case 'napalm':
        ctx.fillStyle = '#7E2553'; ctx.fillRect(-4, -2.5, 8, 5);
        ctx.fillStyle = '#FF004D'; ctx.fillRect(-2, -1.5, 5, 3);
        break;
      case 'airstrike':
        ctx.fillStyle = '#FFEC27'; ctx.fillRect(-3, -1.5, 6, 3);
        ctx.fillStyle = '#FF004D'; ctx.fillRect(1, -1.5, 2, 3);
        break;
      case 'roller':
        ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(0, -3, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5F574F'; ctx.beginPath(); ctx.arc(0, -3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFEC27'; ctx.fillRect((Math.cos(this.x / 3) * 2) | 0, -3 + ((Math.sin(this.x / 3) * 2) | 0), 1, 1);
        break;
      case 'airbomb':
        ctx.fillStyle = '#5F574F'; ctx.fillRect(-4, -2, 7, 4);
        ctx.fillStyle = '#C2C3C7'; ctx.fillRect(-5, -3, 2, 6);
        break;
      default:   // standard, triple, mirv bomblets
        ctx.fillStyle = w.color; ctx.fillRect(-3, -1.5, 6, 3);
        ctx.fillStyle = '#FFA300'; ctx.fillRect(-4, -1, 1, 2);
    }
    ctx.restore();
  }
}

/**
 * Napalm flame: falls, then flows downhill along the surface and burns
 * tanks it touches (at most 2 HP per flame per tank).
 */
class Flame {
  constructor(x, y, vx, vy, ownerId) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.ownerId = ownerId;
    this.airborne = true;
    this.life = 170 + Math.floor(Math.random() * 40);
    this.timeAlive = 0;
    this.dealt = {};
    this.isDead = false;
  }
  update(wind, terrain, tanks, ps) {
    if (this.isDead) return NONE;
    this.timeAlive++;
    if (--this.life <= 0) { this.isDead = true; return NONE; }
    if (this.airborne) {
      this.vy += GRAVITY; this.vx *= 0.98;
      this.x += this.vx; this.y += this.vy;
      if (this.x < 2 || this.x > terrain.width - 2 || this.y > terrain.height) { this.isDead = true; return NONE; }
      if (this.y >= terrain.getSurfaceY(this.x)) { this.airborne = false; this.y = terrain.getSurfaceY(this.x); }
    } else {
      // flow toward the lower neighbour
      const here = terrain.getSurfaceY(this.x), l = terrain.getSurfaceY(this.x - 2), r = terrain.getSurfaceY(this.x + 2);
      if (l > here + 1 && l >= r) this.x -= 0.5;
      else if (r > here + 1) this.x += 0.5;
      this.y = terrain.getSurfaceY(this.x);
      if (this.y >= terrain.height) { this.isDead = true; return NONE; }
    }
    if (!this.airborne && this.timeAlive % 15 === 0) {
      for (const tank of tanks) {
        if (tank.isDead || Math.abs(tank.x - this.x) > 10 || this.y < tank.y - 14 || this.y > tank.y + 6) continue;
        if ((this.dealt[tank.id] || 0) >= 2) continue;
        this.dealt[tank.id] = (this.dealt[tank.id] || 0) + 1;
        tank.takeDamage(1, 'fire');
        tank.burnTally = (tank.burnTally || 0) + 1;
      }
    }
    if (ps && Math.random() < 0.3) ps.createFlame(this.x, this.y - 1);
    return NONE;
  }
  draw(ctx) {
    if (this.isDead) return;
    const flick = (this.timeAlive >> 2) & 1;
    ctx.fillStyle = flick ? '#FFA300' : '#FF004D';
    ctx.fillRect((this.x | 0) - 1, (this.y | 0) - 3, 3, 3);
    ctx.fillStyle = '#FFEC27';
    ctx.fillRect(this.x | 0, (this.y | 0) - 4 - flick, 1, 2);
  }
}

/**
 * Air-strike bomber: crosses the sky and releases 5 bombs, leading each
 * release so the bomb lands on its mark.
 */
class Bomber {
  constructor(targetX, dir, ownerId, terrain) {
    this.dir = dir;
    this.ownerId = ownerId;
    this.y = 40;
    this.x = targetX - dir * 520;
    this.vx = dir * 5;
    this.drops = [-60, -30, 0, 30, 60].map(o => targetX + o).sort((a, b) => dir * (a - b));
    this.next = 0;
    this.endX = targetX + dir * 560;
    this.terrain = terrain;
    this.timeAlive = 0;
    this.isDead = false;
    if (sfx() && sfx().playPlane) sfx().playPlane();
  }
  update(wind, terrain, tanks, ps) {
    if (this.isDead) return NONE;
    this.timeAlive++;
    this.x += this.vx;
    const subs = [];
    if (this.next < this.drops.length) {
      const target = this.drops[this.next];
      const bvx = this.vx * 0.6, bvy = 1.5;
      // fall time to the ground under the mark, then lead the release point
      const h = Math.max(10, terrain.getSurfaceY(target) - this.y);
      const tFall = (-bvy + Math.sqrt(bvy * bvy + 2 * GRAVITY * h)) / GRAVITY;
      const releaseX = target - bvx * tFall;
      if ((this.dir > 0 && this.x >= releaseX) || (this.dir < 0 && this.x <= releaseX)) {
        const b = new Projectile(this.x, this.y + 6, bvx, bvy, SUB_MUNITIONS.airbomb, this.ownerId);
        b.isSubMunition = true; b.timeAlive = 10;
        subs.push(b);
        this.next++;
      }
    }
    if (this.next >= this.drops.length && (this.dir > 0 ? this.x > this.endX : this.x < this.endX)) this.isDead = true;
    if (ps && this.timeAlive % 3 === 0) ps.createTrail(this.x - this.dir * 10, this.y, '#C2C3C7', 2);
    return { exploded: false, subProjectiles: subs };
  }
  draw(ctx) {
    if (this.isDead) return;
    ctx.save();
    ctx.translate(this.x | 0, this.y | 0);
    ctx.scale(this.dir, 1);
    ctx.fillStyle = '#5F574F'; ctx.fillRect(-12, -2, 22, 5);       // fuselage
    ctx.fillStyle = '#C2C3C7'; ctx.fillRect(6, -1, 5, 3);          // nose
    ctx.fillStyle = '#29ADFF'; ctx.fillRect(4, -2, 3, 2);          // canopy
    ctx.fillStyle = '#1D2B53'; ctx.fillRect(-4, -6, 6, 14);         // wings
    ctx.fillStyle = '#5F574F'; ctx.fillRect(-13, -6, 3, 6);         // tail fin
    ctx.restore();
  }
}

window.GRAVITY = GRAVITY;
window.WIND_FORCE = WIND_FORCE;
window.launchSpeed = launchSpeed;
window.WEAPONS = WEAPONS;
window.WEAPON_ORDER = WEAPON_ORDER;
window.SUB_MUNITIONS = SUB_MUNITIONS;
window.Projectile = Projectile;
window.Flame = Flame;
window.Bomber = Bomber;
