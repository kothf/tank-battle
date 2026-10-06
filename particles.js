/**
 * Particle and FX Engine for Retro Tank Battle
 * - Pixel-art explosions, smoke trails, dirt crumbs, sparks, fire
 * - Floating damage numbers and banners (world space)
 * - Screen shake and flash (screen space)
 * Particles live in one array, compacted in place each frame (no splice),
 * capped at MAX_PARTICLES, and culled to the visible view when drawn.
 */

const MAX_PARTICLES = 2500;

class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.shakeAmount = 0;
    this.flashAlpha = 0;
    this.flashColor = '#FFFFFF';
  }

  reset() {
    this.particles.length = 0;
    this.floatingTexts.length = 0;
    this.shakeAmount = 0;
    this.flashAlpha = 0;
  }

  push(p) {
    if (this.particles.length < MAX_PARTICLES) this.particles.push(p);
  }

  addScreenShake(amount) {
    this.shakeAmount = Math.min(24, this.shakeAmount + amount);
  }

  triggerFlash(color = '#FFFFFF', alpha = 0.8) {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  addFloatingText(x, y, text, color = '#FFEC27', isBig = false) {
    this.floatingTexts.push({ x, y, vy: -0.8, text, color, isBig, life: 1.0, decay: isBig ? 0.012 : 0.02 });
  }

  createExplosion(cx, cy, radius = 25, isNuke = false) {
    const count = isNuke ? 180 : Math.floor(radius * 2.2);
    this.addScreenShake(isNuke ? 16 : Math.min(10, radius * 0.35));
    if (isNuke) this.triggerFlash('#FFEC27', 0.9);
    else if (radius > 30) this.triggerFlash('#FFF1E8', 0.5);

    const colors = isNuke ? ParticleSystem.NUKE_COLORS : ParticleSystem.FIRE_COLORS;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 3.5) * (isNuke ? 1.6 : 1.0);
      const life = 0.5 + Math.random() * 0.6;
      this.push({
        type: 'spark',
        x: cx + (Math.random() - 0.5) * 6, y: cy + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - Math.random() * 1.5,
        gravity: 0.12, drag: 0.96,
        size: Math.random() < 0.25 ? 3 : (Math.random() < 0.5 ? 2 : 1),
        colors, life: 1.0, decay: 1.0 / (life * 60)
      });
    }
    const smokeCount = isNuke ? 35 : Math.floor(radius * 0.6);
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2, dist = Math.random() * radius * 0.6;
      const life = 0.8 + Math.random() * 1.2;
      const r0 = isNuke ? 6 + Math.random() * 8 : 3 + Math.random() * 4;
      this.push({
        type: 'smoke',
        x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.8, vy: -0.4 - Math.random() * 0.8,
        radius: r0, maxRadius: isNuke ? 16 + Math.random() * 12 : 7 + Math.random() * 6,
        color: Math.random() < 0.5 ? '#5F574F' : '#1D2B53',
        life: 1.0, decay: 1.0 / (life * 60)
      });
    }
  }

  createDebris(grains, cx, cy) {
    for (const g of grains) {
      const angle = Math.atan2(g.y - cy, g.x - cx) + (Math.random() - 0.5) * 0.8;
      const speed = 1.2 + Math.random() * 3.2;
      this.push({
        type: 'dirt', x: g.x, y: g.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5,
        gravity: 0.22, bounces: 2,
        color: g.type === 1 ? '#00E436' : (g.type === 3 ? '#5F574F' : '#AB5236'),
        life: 1.0, decay: 0.015
      });
    }
  }

  createTrail(x, y, color = '#C2C3C7', size = 2) {
    this.push({
      type: 'trail',
      x: x + (Math.random() - 0.5) * 2, y: y + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      radius: size, color, life: 1.0, decay: 0.04
    });
  }

  // Small rising flame tongue (napalm, burning wrecks)
  createFlame(x, y) {
    this.push({
      type: 'spark', x: x + (Math.random() - 0.5) * 4, y,
      vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.9,
      gravity: -0.01, drag: 0.97, size: Math.random() < 0.4 ? 2 : 1,
      colors: ParticleSystem.FLAME_COLORS, life: 1.0, decay: 0.05
    });
  }

  createDirtDepositFX(cx, cy, radius = 32) {
    this.addScreenShake(6);
    for (let i = 0; i < 50; i++) {
      const angle = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
      const speed = 1.0 + Math.random() * 3.0;
      this.push({
        type: 'dirt',
        x: cx + (Math.random() - 0.5) * radius * 0.8, y: cy + (Math.random() - 0.5) * radius * 0.5,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: 0.2, bounces: 1,
        color: Math.random() < 0.5 ? '#FFA300' : '#AB5236',
        life: 1.0, decay: 0.02
      });
    }
  }

  update(terrain) {
    if (this.shakeAmount > 0) { this.shakeAmount *= 0.88; if (this.shakeAmount < 0.2) this.shakeAmount = 0; }
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.06);

    const ft = this.floatingTexts;
    let n = 0;
    for (let i = 0; i < ft.length; i++) {
      const t = ft[i];
      t.y += t.vy; t.life -= t.decay;
      if (t.life > 0) ft[n++] = t;
    }
    ft.length = n;

    const ps = this.particles;
    n = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= p.decay;
      if (p.life <= 0) continue;
      switch (p.type) {
        case 'spark':
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity;
          p.x += p.vx; p.y += p.vy;
          p.currentColor = p.colors[Math.min(p.colors.length - 1, Math.floor((1 - p.life) * p.colors.length))];
          break;
        case 'smoke':
          p.x += p.vx; p.y += p.vy;
          p.currentRadius = p.radius + (p.maxRadius - p.radius) * (1 - p.life);
          break;
        case 'dirt':
          p.vy += p.gravity; p.x += p.vx; p.y += p.vy;
          if (terrain && terrain.isSolid(p.x, p.y)) {
            if (p.bounces > 0) { p.bounces--; p.vy = -p.vy * 0.45; p.vx *= 0.6; p.y -= 1; }
            else continue;   // settles into the ground
          }
          break;
        default:   // trail
          p.x += p.vx; p.y += p.vy;
      }
      ps[n++] = p;
    }
    ps.length = n;
  }

  // World-space draw; view = { x, y, w, h } in world units for culling
  draw(ctx, view) {
    const x0 = view ? view.x - 30 : -1e9, x1 = view ? view.x + view.w + 30 : 1e9;
    const y0 = view ? view.y - 30 : -1e9, y1 = view ? view.y + view.h + 30 : 1e9;
    const ps = this.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      if (p.type === 'spark') {
        ctx.fillStyle = p.currentColor || p.colors[0];
        ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = p.life * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x | 0, p.y | 0, (p.currentRadius || p.radius) | 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.type === 'dirt') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x | 0, p.y | 0, 2, 2);
      } else {
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x | 0, p.y | 0, p.radius, p.radius);
        ctx.globalAlpha = 1;
      }
    }

    // Floating combat text with a 1px black outline
    if (this.floatingTexts.length) {
      ctx.textAlign = 'center';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      for (const t of this.floatingTexts) {
        ctx.globalAlpha = Math.max(0, t.life);
        ctx.font = t.isBig ? 'bold 16px "Courier New", monospace' : 'bold 12px "Courier New", monospace';
        ctx.strokeText(t.text, t.x | 0, t.y | 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x | 0, t.y | 0);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Screen-space flash overlay
  drawFlash(ctx, w, h) {
    if (this.flashAlpha <= 0.01) return;
    ctx.globalAlpha = this.flashAlpha;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  getShakeOffset() {
    if (this.shakeAmount <= 0.1) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this.shakeAmount, y: (Math.random() * 2 - 1) * this.shakeAmount };
  }
}

ParticleSystem.FIRE_COLORS = ['#FFF1E8', '#FFEC27', '#FFA300', '#FF004D', '#7E2553', '#5F574F'];
ParticleSystem.NUKE_COLORS = ['#FFF1E8', '#FFEC27', '#FFA300', '#FF004D', '#00E436', '#5F574F'];
ParticleSystem.FLAME_COLORS = ['#FFF1E8', '#FFEC27', '#FFA300', '#FF004D', '#5F574F'];

window.ParticleSystem = ParticleSystem;
