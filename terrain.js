/**
 * Destructible Procedural Terrain System for Retro Tank Battle
 * - Procedural multi-octave heightmap with flattened spawn plateaus
 * - Pixel-level destructible grid (world-sized, larger than the screen)
 * - Craters and dirt domes are applied immediately to the grid; gravity,
 *   sand-slide and repainting run once per frame on a dirty rectangle
 *   (flush), so many small carves (Tunnel Drill) stay cheap.
 * - Invariant after every flush: each column is solid from its surface down
 *   to the bottom (no holes), which lets settling scan only the dirty rows.
 */

class TerrainSystem {
  constructor(width = 1800, height = 540) {
    this.width = width;
    this.height = height;

    // Grid: 0 = Air, 1 = Grass, 2 = Dirt, 3 = Rock, 4 = Deposited Dirt
    this.grid = new Uint8Array(width * height);
    this.surfaceHeights = new Int16Array(width);

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');

    this.dirty = null;     // { x0, x1, y0, y1 } pending settle/repaint
    this.version = 0;      // bumps on every change (minimap cache key)
  }

  /**
   * Procedural terrain. Feature size is set in pixels (not fractions of the
   * width) so a wider world gets more hills, not stretched ones.
   */
  generate(spawnXs = []) {
    this.grid.fill(0);
    const H = this.height, W = this.width, s = H / 360;
    const baseHeight = H * 0.6;
    const p = [0, 0, 0, 0, 0].map(() => Math.random() * 100);
    const plateaus = spawnXs.map(x => ({ x, y: null }));

    const heightAt = x => {
      const u = x / 640;
      let h =
        Math.sin(u * 3.5 + p[0]) * 45 +
        Math.cos(u * 7.2 + p[1]) * 22 +
        Math.sin(u * 14.5 + p[2]) * 10 +
        Math.cos(u * 25.0 + p[3]) * 4 +
        Math.sin(x / W * Math.PI * 2 + p[4]) * 30;   // one world-scale swell
      return baseHeight + h * s;
    };
    plateaus.forEach(pl => { pl.y = heightAt(pl.x); });

    for (let x = 0; x < W; x++) {
      let groundY = heightAt(x);
      // blend toward a flat pad around each spawn point
      for (const pl of plateaus) {
        const d = Math.abs(x - pl.x);
        if (d < 60) {
          const t = d < 30 ? 1 : 1 - (d - 30) / 30;
          const k = t * t * (3 - 2 * t);
          groundY = groundY * (1 - k) + pl.y * k;
        }
      }
      groundY = Math.round(Math.max(H * 0.3, Math.min(H - 40, groundY)));
      this.surfaceHeights[x] = groundY;
      for (let y = groundY; y < H; y++) {
        const depth = y - groundY;
        this.grid[y * W + x] = depth < 3 ? 1 : (depth < 26 ? 2 : 3);
      }
    }
    this.dirty = null;
    this.render(0, 0, W, H);
    this.version++;
  }

  isSolid(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || ix >= this.width) return false;
    if (iy >= this.height) return true;
    if (iy < 0) return false;
    return this.grid[iy * this.width + ix] !== 0;
  }

  getSurfaceY(x) {
    const ix = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return this.surfaceHeights[ix];
  }

  // Grow the pending dirty rectangle
  markDirty(x0, x1, y0, y1) {
    x0 = Math.max(0, x0); x1 = Math.min(this.width - 1, x1);
    y0 = Math.max(0, y0); y1 = Math.min(this.height - 1, y1);
    if (x1 < x0) return;
    // compaction must reach the deepest surface in range (see class comment)
    for (let x = x0; x <= x1; x++) {
      const sy = this.surfaceHeights[x];
      if (sy < y0) y0 = sy;
      if (sy - 1 > y1) y1 = Math.min(this.height - 1, sy - 1);
    }
    const d = this.dirty;
    if (!d) this.dirty = { x0, x1, y0, y1 };
    else { d.x0 = Math.min(d.x0, x0); d.x1 = Math.max(d.x1, x1); d.y0 = Math.min(d.y0, y0); d.y1 = Math.max(d.y1, y1); }
  }

  /**
   * Carve a circular crater. Returns debris samples for the particle FX.
   */
  carveCrater(cx, cy, radius) {
    cx = Math.round(cx); cy = Math.round(cy); radius = Math.round(radius);
    const W = this.width, r2 = radius * radius;
    const startX = Math.max(0, cx - radius), endX = Math.min(W - 1, cx + radius);
    const startY = Math.max(0, cy - radius), endY = Math.min(this.height - 1, cy + radius);
    let removedCount = 0;
    const debrisGrains = [];
    for (let y = startY; y <= endY; y++) {
      const dy2 = (y - cy) * (y - cy), row = y * W;
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 > r2) continue;
        const idx = row + x, prev = this.grid[idx];
        if (prev !== 0) {
          this.grid[idx] = 0;
          removedCount++;
          if (debrisGrains.length < 30 && Math.random() < 0.08) debrisGrains.push({ x, y, type: prev });
        }
      }
    }
    if (removedCount) this.markDirty(startX - 8, endX + 8, startY, endY);
    return { removedCount, debrisGrains };
  }

  /**
   * Dirt Bomb: a solid dome of earth
   */
  depositDirt(cx, cy, radius = 32) {
    cx = Math.round(cx); cy = Math.round(cy); radius = Math.round(radius);
    const W = this.width, r2 = radius * radius;
    const startX = Math.max(0, cx - radius), endX = Math.min(W - 1, cx + radius);
    const startY = Math.max(0, cy - radius), endY = Math.min(this.height - 1, cy + radius);
    for (let y = startY; y <= endY; y++) {
      const dy2 = (y - cy) * (y - cy), row = y * W;
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= r2 && this.grid[row + x] === 0) this.grid[row + x] = 4;
      }
    }
    this.markDirty(startX - 6, endX + 6, startY, endY);
  }

  /**
   * Apply pending changes: gravity collapse, sand-slide, surface heights and
   * repaint of the dirty rectangle only. Call once per frame.
   */
  flush() {
    const d = this.dirty;
    if (!d) return false;
    this.dirty = null;
    const W = this.width, H = this.height;
    const { x0, x1 } = d;
    let y0 = d.y0;
    const y1 = d.y1;

    // 1. Column gravity: compact solid cells to the bottom of [y0, y1]
    for (let x = x0; x <= x1; x++) {
      let writeY = y1;
      for (let y = y1; y >= y0; y--) {
        const i = y * W + x, cell = this.grid[i];
        if (cell !== 0) {
          if (writeY !== y) { this.grid[writeY * W + x] = cell; this.grid[i] = 0; }
          writeY--;
        }
      }
    }
    this.updateSurfaceHeights(x0, x1, y0);

    // 2. Sand-slide: steep steps (> 3 px) crumble sideways
    let yMax = y1;
    for (let pass = 0; pass < 3; pass++) {
      let shifted = false;
      for (let x = x0; x < x1; x++) {
        const hC = this.surfaceHeights[x], hR = this.surfaceHeights[x + 1];
        if (hR - hC > 3 && hC < H && hR - 1 >= 0) {
          this.grid[hC * W + x] = 0;
          this.grid[(hR - 1) * W + x + 1] = 4;
          this.surfaceHeights[x]++; this.surfaceHeights[x + 1]--;
          if (hR - 1 > yMax) yMax = hR - 1;
          shifted = true;
        } else if (hC - hR > 3 && hR < H && hC - 1 >= 0) {
          this.grid[hR * W + x + 1] = 0;
          this.grid[(hC - 1) * W + x] = 4;
          this.surfaceHeights[x + 1]++; this.surfaceHeights[x]--;
          if (hC - 1 > yMax) yMax = hC - 1;
          shifted = true;
        }
      }
      if (!shifted) break;
    }

    // 3. Undisturbed dirt that became the surface grows grass again
    for (let x = x0; x <= x1; x++) {
      const topY = this.surfaceHeights[x];
      if (topY < H && this.grid[topY * W + x] === 2) this.grid[topY * W + x] = 1;
    }

    this.render(x0, y0, x1 - x0 + 1, Math.min(H - 1, yMax + 1) - y0 + 1);
    this.version++;
    return true;
  }

  updateSurfaceHeights(startX = 0, endX = this.width - 1, fromY = 0) {
    const W = this.width, H = this.height;
    for (let x = Math.max(0, startX); x <= Math.min(W - 1, endX); x++) {
      let y = Math.max(0, fromY);
      while (y < H && this.grid[y * W + x] === 0) y++;
      this.surfaceHeights[x] = y;
    }
  }

  /**
   * Repaint a rectangle of the offscreen terrain canvas from the grid
   */
  render(rx, ry, rw, rh) {
    const x0 = Math.max(0, Math.floor(rx)), y0 = Math.max(0, Math.floor(ry));
    const x1 = Math.min(this.width, x0 + rw), y1 = Math.min(this.height, y0 + rh);
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const img = this.ctx.createImageData(w, h);
    const data = new Uint32Array(img.data.buffer);
    const P = TerrainSystem.PALETTE;
    for (let y = y0; y < y1; y++) {
      const dest = (y - y0) * w - x0, src = y * this.width;
      for (let x = x0; x < x1; x++) {
        const cell = this.grid[src + x];
        if (cell === 0) continue;   // ImageData starts transparent
        const dither = (((x * 15485863) ^ (y * 2038074743)) >>> 0) & 7;
        data[dest + x] = P[cell][dither];
      }
    }
    this.ctx.putImageData(img, x0, y0);
  }

  // Draw the visible part of the terrain (world coordinates)
  draw(ctx, view) {
    if (!view) { ctx.drawImage(this.canvas, 0, 0); return; }
    const sx = Math.max(0, Math.floor(view.x)), sy = Math.max(0, Math.floor(view.y));
    const sw = Math.min(this.width, Math.ceil(view.x + view.w) + 1) - sx;
    const sh = Math.min(this.height, Math.ceil(view.y + view.h) + 1) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(this.canvas, sx, sy, sw, sh, sx, sy, sw, sh);
  }
}

// Per cell type: 8 dither variants as little-endian RGBA uint32 (Pico-8 palette)
(function () {
  const px = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  const grassL = px(0, 228, 54), grassD = px(0, 135, 81);
  const dirtL = px(171, 82, 54), dirtD = px(126, 37, 83), dirtS = px(255, 163, 0);
  const rockL = px(95, 87, 79), rockD = px(29, 43, 83), rockS = px(194, 195, 199);
  const freshL = px(255, 163, 0), freshD = px(171, 82, 54);
  const pick = f => Array.from({ length: 8 }, (_, d) => f(d));
  TerrainSystem.PALETTE = [
    null,
    pick(d => (d < 6 ? grassL : grassD)),
    pick(d => (d === 0 ? dirtS : d < 5 ? dirtL : dirtD)),
    pick(d => (d === 0 ? rockS : d < 5 ? rockL : rockD)),
    pick(d => (d < 5 ? freshL : freshD))
  ];
})();

window.TerrainSystem = TerrainSystem;
