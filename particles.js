/**
 * Particle and FX Engine for Retro Tank Battle
 * - Procedural pixel-art explosions, smoke trails, falling dirt crumbs, and fiery sparks
 * - Floating damage numbers and combat banners
 * - Screen shake and flash effects
 */

class ParticleSystem {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
    this.shakeAmount = 0;
    this.flashAlpha = 0;
    this.flashColor = '#FFFFFF';
  }

  reset() {
    this.particles = [];
    this.floatingTexts = [];
    this.shakeAmount = 0;
    this.flashAlpha = 0;
  }

  addScreenShake(amount) {
    this.shakeAmount = Math.min(24, this.shakeAmount + amount);
  }

  triggerFlash(color = '#FFFFFF', durationAlpha = 0.8) {
    this.flashColor = color;
    this.flashAlpha = durationAlpha;
  }

  /**
   * Spawn floating damage or notification text
   */
  addFloatingText(x, y, text, color = '#FFEC27', isBig = false) {
    this.floatingTexts.push({
      x,
      y,
      vy: -0.8,
      text,
      color,
      isBig,
      life: 1.0,
      decay: isBig ? 0.012 : 0.02,
    });
  }

  /**
   * General particle explosion
   */
  createExplosion(cx, cy, radius = 25, isNuke = false) {
    const count = isNuke ? 180 : Math.floor(radius * 2.2);

    // Screen shake and flash
    this.addScreenShake(isNuke ? 16 : Math.min(10, radius * 0.35));
    if (isNuke) {
      this.triggerFlash('#FFEC27', 0.9);
    } else if (radius > 30) {
      this.triggerFlash('#FFF1E8', 0.5);
    }

    const colors = isNuke
      ? ['#FFF1E8', '#FFEC27', '#FFA300', '#FF004D', '#00E436', '#5F574F']
      : ['#FFF1E8', '#FFEC27', '#FFA300', '#FF004D', '#7E2553', '#5F574F'];

    // Fire sparks
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 3.5) * (isNuke ? 1.6 : 1.0);
      const life = 0.5 + Math.random() * 0.6;
      const size = Math.random() < 0.25 ? 3 : (Math.random() < 0.5 ? 2 : 1);

      this.particles.push({
        type: 'spark',
        x: cx + (Math.random() - 0.5) * 6,
        y: cy + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (Math.random() * 1.5), // Biased slightly upwards
        gravity: 0.12,
        drag: 0.96,
        size,
        colorIndex: 0,
        colors,
        life: 1.0,
        decay: 1.0 / (life * 60),
      });
    }

    // Heavy billowy smoke clouds
    const smokeCount = isNuke ? 35 : Math.floor(radius * 0.6);
    for (let i = 0; i < smokeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * (radius * 0.6);
      const life = 0.8 + Math.random() * 1.2;

      this.particles.push({
        type: 'smoke',
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -0.4 - Math.random() * 0.8,
        radius: isNuke ? 6 + Math.random() * 8 : 3 + Math.random() * 4,
        maxRadius: isNuke ? 16 + Math.random() * 12 : 7 + Math.random() * 6,
        color: Math.random() < 0.5 ? '#5F574F' : '#1D2B53',
        life: 1.0,
        decay: 1.0 / (life * 60),
      });
    }
  }

  /**
   * Flying dirt debris from carved craters
   */
  createDebris(grains, cx, cy) {
    grains.forEach((grain) => {
      const angle = Math.atan2(grain.y - cy, grain.x - cx) + (Math.random() - 0.5) * 0.8;
      const speed = 1.2 + Math.random() * 3.2;

      this.particles.push({
        type: 'dirt',
        x: grain.x,
        y: grain.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        gravity: 0.22,
        bounces: 2,
        color: grain.type === 1 ? '#00E436' : (grain.type === 3 ? '#5F574F' : '#AB5236'),
        life: 1.0,
        decay: 0.015,
      });
    });
  }

  /**
   * Smoke trail behind projectile
   */
  createTrail(x, y, color = '#C2C3C7', size = 2) {
    this.particles.push({
      type: 'trail',
      x: x + (Math.random() - 0.5) * 2,
      y: y + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      radius: size,
      color,
      life: 1.0,
      decay: 0.04,
    });
  }

  /**
   * Dirt Bomb deposit burst
   */
  createDirtDepositFX(cx, cy, radius = 32) {
    this.addScreenShake(6);
    for (let i = 0; i < 50; i++) {
      const angle = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
      const speed = 1.0 + Math.random() * 3.0;

      this.particles.push({
        type: 'dirt',
        x: cx + (Math.random() - 0.5) * radius * 0.8,
        y: cy + (Math.random() - 0.5) * radius * 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0.2,
        bounces: 1,
        color: Math.random() < 0.5 ? '#FFA300' : '#AB5236',
        life: 1.0,
        decay: 0.02,
      });
    }
  }

  /**
   * Update particle positions and lifecycles
   */
  update(terrain) {
    // Screen shake decay
    if (this.shakeAmount > 0) {
      this.shakeAmount *= 0.88;
      if (this.shakeAmount < 0.2) this.shakeAmount = 0;
    }

    // Flash decay
    if (this.flashAlpha > 0) {
      this.flashAlpha -= 0.06;
      if (this.flashAlpha < 0) this.flashAlpha = 0;
    }

    // Floating text update
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= ft.decay;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      if (p.type === 'spark') {
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity;
        p.x += p.vx;
        p.y += p.vy;

        // Color shifts from initial bright to dark as life drains
        const step = 1 - p.life;
        const colorIdx = Math.min(p.colors.length - 1, Math.floor(step * p.colors.length));
        p.currentColor = p.colors[colorIdx];
      } else if (p.type === 'smoke') {
        p.x += p.vx;
        p.y += p.vy;
        p.currentRadius = p.radius + (p.maxRadius - p.radius) * (1 - p.life);
      } else if (p.type === 'dirt') {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;

        // Simple bounce on terrain
        if (terrain && terrain.isSolid(p.x, p.y)) {
          if (p.bounces > 0) {
            p.bounces--;
            p.vy = -p.vy * 0.45;
            p.vx *= 0.6;
            p.y -= 1;
          } else {
            p.life = 0; // Settle into terrain
          }
        }
      } else if (p.type === 'trail') {
        p.x += p.vx;
        p.y += p.vy;
      }
    }
  }

  /**
   * Render particles to main canvas
   */
  draw(ctx) {
    // Draw particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (p.type === 'spark') {
        ctx.fillStyle = p.currentColor || p.colors[0];
        const s = p.size;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), s, s);
      } else if (p.type === 'smoke') {
        ctx.save();
        ctx.globalAlpha = p.life * 0.7;
        ctx.fillStyle = p.color;
        const r = Math.floor(p.currentRadius || p.radius);
        ctx.beginPath();
        ctx.arc(Math.floor(p.x), Math.floor(p.y), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'dirt') {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
      } else if (p.type === 'trail') {
        ctx.save();
        ctx.globalAlpha = p.life * 0.5;
        ctx.fillStyle = p.color;
        const r = p.radius;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), r, r);
        ctx.restore();
      }
    }

    // Draw floating combat texts with retro 1px black outline
    ctx.save();
    for (let i = 0; i < this.floatingTexts.length; i++) {
      const ft = this.floatingTexts[i];
      ctx.globalAlpha = Math.max(0, ft.life);
      ctx.font = ft.isBig ? 'bold 16px "Courier New", monospace' : 'bold 12px "Courier New", monospace';
      ctx.textAlign = 'center';

      // 1px black outline
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, Math.floor(ft.x) - 1, Math.floor(ft.y));
      ctx.fillText(ft.text, Math.floor(ft.x) + 1, Math.floor(ft.y));
      ctx.fillText(ft.text, Math.floor(ft.x), Math.floor(ft.y) - 1);
      ctx.fillText(ft.text, Math.floor(ft.x), Math.floor(ft.y) + 1);

      // Text body
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, Math.floor(ft.x), Math.floor(ft.y));
    }
    ctx.restore();

    // Draw flash overlay if active
    if (this.flashAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, 640, 360);
      ctx.restore();
    }
  }

  /**
   * Get current screen shake offset
   */
  getShakeOffset() {
    if (this.shakeAmount <= 0.1) return { x: 0, y: 0 };
    return {
      x: (Math.random() * 2 - 1) * this.shakeAmount,
      y: (Math.random() * 2 - 1) * this.shakeAmount,
    };
  }
}

window.ParticleSystem = ParticleSystem;
