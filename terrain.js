/**
 * Destructible Procedural Terrain System for Retro Tank Battle
 * - Procedural multi-octave heightmap generation with smoothed spawn plateaus
 * - 2D pixel-level destructible grid (640x360)
 * - True circular crater carving
 * - Sand-slide & gravity settling for floating overhangs and steep cliffs
 * - Terraforming dome creation for Dirt Bomb
 * - 16-color retro palette texturing
 */

class TerrainSystem {
  constructor(width = 640, height = 360) {
    this.width = width;
    this.height = height;

    // Grid: 0 = Air, 1 = Grass, 2 = Dirt, 3 = Rock, 4 = Deposited Dirt
    this.grid = new Uint8Array(width * height);
    this.surfaceHeights = new Int16Array(width);

    // Offscreen rendering canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Palette Colors
    this.colors = {
      sky: '#0f172a',
      grass: '#00E436',
      grassDark: '#008751',
      dirt: '#AB5236',
      dirtDark: '#7E2553',
      rock: '#5F574F',
      rockDark: '#1D2B53',
      freshDirt: '#FFA300',
      freshDirtDark: '#AB5236',
    };

    this.settleQueue = [];
  }

  /**
   * Procedural terrain generator with varied seeds & safe tank spawn plateaus
   */
  generate() {
    this.grid.fill(0);

    const baseHeight = this.height * 0.62; // ~223px
    const p1 = Math.random() * 100;
    const p2 = Math.random() * 100;
    const p3 = Math.random() * 100;
    const p4 = Math.random() * 100;

    // Generate column heights
    for (let x = 0; x < this.width; x++) {
      const nx = x / this.width;

      // Multi-octave harmonics
      let h =
        Math.sin(nx * 3.5 + p1) * 45 +
        Math.cos(nx * 7.2 + p2) * 22 +
        Math.sin(nx * 14.5 + p3) * 10 +
        Math.cos(nx * 25.0 + p4) * 4;

      // Center valley or rolling dip variation
      const centerDist = Math.abs(nx - 0.5);
      h += (0.5 - centerDist) * 30;

      let groundY = Math.round(baseHeight + h);

      // Smooth out Player 1 spawn plateau (x: 65 - 135)
      if (x >= 60 && x <= 140) {
        const t = (x - 60) / 80;
        const smoothT = t * t * (3 - 2 * t);
        const targetP1 = baseHeight + Math.sin(0.15 * 3.5 + p1) * 25;
        groundY = Math.round(groundY * (1 - Math.sin(smoothT * Math.PI)) + targetP1 * Math.sin(smoothT * Math.PI));
      }

      // Smooth out Player 2 spawn plateau (x: 500 - 580)
      if (x >= 500 && x <= 580) {
        const t = (x - 500) / 80;
        const smoothT = t * t * (3 - 2 * t);
        const targetP2 = baseHeight + Math.sin(0.85 * 3.5 + p1) * 25;
        groundY = Math.round(groundY * (1 - Math.sin(smoothT * Math.PI)) + targetP2 * Math.sin(smoothT * Math.PI));
      }

      // Clamp between boundaries
      groundY = Math.max(130, Math.min(this.height - 40, groundY));
      this.surfaceHeights[x] = groundY;

      // Fill vertical column in 2D grid
      for (let y = groundY; y < this.height; y++) {
        const depth = y - groundY;
        let type;
        if (depth < 3) {
          type = 1; // Grass
        } else if (depth < 26) {
          type = 2; // Dirt
        } else {
          type = 3; // Rock
        }
        this.grid[y * this.width + x] = type;
      }
    }

    this.updateSurfaceHeights();
    this.renderFullTerrain();
  }

  isSolid(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width) return false;
    if (iy >= this.height) return true;
    if (iy < 0) return false;
    return this.grid[iy * this.width + ix] !== 0;
  }

  getSurfaceY(x) {
    const ix = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return this.surfaceHeights[ix];
  }

  updateSurfaceHeights(startX = 0, endX = this.width - 1) {
    const minX = Math.max(0, startX);
    const maxX = Math.min(this.width - 1, endX);

    for (let x = minX; x <= maxX; x++) {
      let found = false;
      for (let y = 0; y < this.height; y++) {
        if (this.grid[y * this.width + x] !== 0) {
          this.surfaceHeights[x] = y;
          found = true;
          break;
        }
      }
      if (!found) {
        this.surfaceHeights[x] = this.height;
      }
    }
  }

  /**
   * Carve circular crater out of terrain grid
   * Returns list of dirt particle sparks for the explosion
   */
  carveCrater(cx, cy, radius) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    radius = Math.round(radius);

    const r2 = radius * radius;
    const startX = Math.max(0, cx - radius);
    const endX = Math.min(this.width - 1, cx + radius);
    const startY = Math.max(0, cy - radius);
    const endY = Math.min(this.height - 1, cy + radius);

    let removedCount = 0;
    const debrisGrains = [];

    for (let y = startY; y <= endY; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const rowOffset = y * this.width;

      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= r2) {
          const idx = rowOffset + x;
          const prev = this.grid[idx];
          if (prev !== 0) {
            this.grid[idx] = 0;
            removedCount++;
            // Sample a few debris grains for physics crumbs
            if (Math.random() < 0.08 && debrisGrains.length < 30) {
              debrisGrains.push({
                x,
                y,
                type: prev,
              });
            }
          }
        }
      }
    }

    // Apply sand-slide & gravity logic to affected columns
    const settleMinX = Math.max(0, startX - 8);
    const settleMaxX = Math.min(this.width - 1, endX + 8);

    this.applyGravityAndSandSlide(settleMinX, settleMaxX);
    this.updateSurfaceHeights(settleMinX, settleMaxX);
    this.renderRegion(settleMinX, 0, settleMaxX - settleMinX + 1, this.height);

    return { removedCount, debrisGrains };
  }

  /**
   * Dirt Bomb: creates a solid dome of earth
   */
  depositDirt(cx, cy, radius = 32) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    radius = Math.round(radius);

    const r2 = radius * radius;
    const startX = Math.max(0, cx - radius);
    const endX = Math.min(this.width - 1, cx + radius);
    const startY = Math.max(0, cy - radius);
    const endY = Math.min(this.height - 1, cy + radius);

    for (let y = startY; y <= endY; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const rowOffset = y * this.width;

      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= r2) {
          const idx = rowOffset + x;
          if (this.grid[idx] === 0) {
            this.grid[idx] = 4; // Fresh deposited earth
          }
        }
      }
    }

    const settleMinX = Math.max(0, startX - 6);
    const settleMaxX = Math.min(this.width - 1, endX + 6);

    this.applyGravityAndSandSlide(settleMinX, settleMaxX);
    this.updateSurfaceHeights(settleMinX, settleMaxX);
    this.renderRegion(settleMinX, 0, settleMaxX - settleMinX + 1, this.height);
  }

  /**
   * Gravity and Sand-slide algorithm:
   * 1. Gravity: Floating earth falls down into empty air gaps beneath it.
   * 2. Sand slide: High sheer cliffs crumble sideways if slope > 3 pixels.
   */
  applyGravityAndSandSlide(minX, maxX) {
    // 1. Column-wise gravity collapse (floating overhangs fall straight down)
    for (let x = minX; x <= maxX; x++) {
      let writeY = this.height - 1;
      // Scan upwards from bottom
      for (let y = this.height - 1; y >= 0; y--) {
        const cell = this.grid[y * this.width + x];
        if (cell !== 0) {
          if (writeY !== y) {
            this.grid[writeY * this.width + x] = cell;
            this.grid[y * this.width + x] = 0;
          }
          writeY--;
        }
      }
    }

    // 2. Sand-slide lateral crumbling (angle of repose)
    // Run 3 iterative smoothing passes on steep cliffs
    for (let pass = 0; pass < 3; pass++) {
      let shifted = false;
      this.updateSurfaceHeights(minX, maxX);

      for (let x = minX; x < maxX; x++) {
        const hCurrent = this.surfaceHeights[x];
        const hRight = this.surfaceHeights[x + 1];

        // If current column is significantly higher (smaller Y value) than right neighbor
        if (hRight - hCurrent > 3) {
          // Top pixel of x slides to x + 1
          const topVal = this.grid[hCurrent * this.width + x];
          if (topVal !== 0 && hRight - 1 >= 0) {
            this.grid[hCurrent * this.width + x] = 0;
            this.grid[(hRight - 1) * this.width + (x + 1)] = 4; // Turns into settled dirt
            this.surfaceHeights[x]++;
            this.surfaceHeights[x + 1]--;
            shifted = true;
          }
        } else if (hCurrent - hRight > 3) {
          // Right column is higher than current, slides left
          const topVal = this.grid[hRight * this.width + (x + 1)];
          if (topVal !== 0 && hCurrent - 1 >= 0) {
            this.grid[hRight * this.width + (x + 1)] = 0;
            this.grid[(hCurrent - 1) * this.width + x] = 4;
            this.surfaceHeights[x + 1]++;
            this.surfaceHeights[x]--;
            shifted = true;
          }
        }
      }
      if (!shifted) break;
    }

    // Re-ensure surface pixels have grass styling if they are undisturbed earth
    for (let x = minX; x <= maxX; x++) {
      const topY = this.surfaceHeights[x];
      if (topY < this.height) {
        const idx = topY * this.width + x;
        if (this.grid[idx] === 2) {
          this.grid[idx] = 1; // Resurface top dirt with grass
        }
      }
    }
  }

  /**
   * Render full terrain to offscreen canvas
   */
  renderFullTerrain() {
    this.renderRegion(0, 0, this.width, this.height);
  }

  /**
   * Re-render a specific rectangular region of terrain
   */
  renderRegion(rx, ry, rw, rh) {
    const x0 = Math.max(0, Math.floor(rx));
    const y0 = Math.max(0, Math.floor(ry));
    const x1 = Math.min(this.width, x0 + rw);
    const y1 = Math.min(this.height, y0 + rh);
    const w = x1 - x0;
    const h = y1 - y0;

    if (w <= 0 || h <= 0) return;

    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    // Pico-8 / EGA RGBA values
    const RGBA = {
      // Grass: Vibrant green & darker green trim
      grassLight: [0, 228, 54, 255],
      grassDark: [0, 135, 81, 255],
      // Dirt: warm clay brown & deep soil
      dirtLight: [171, 82, 54, 255],
      dirtDark: [126, 37, 83, 255],
      dirtSpeck: [255, 163, 0, 255],
      // Rock: Slate & deep midnight blue
      rockLight: [95, 87, 79, 255],
      rockDark: [29, 43, 83, 255],
      rockSpeck: [194, 195, 199, 255],
      // Fresh Dirt
      freshLight: [255, 163, 0, 255],
      freshDark: [171, 82, 54, 255],
    };

    for (let y = y0; y < y1; y++) {
      const destRow = (y - y0) * w;
      const srcRow = y * this.width;

      for (let x = x0; x < x1; x++) {
        const destIdx = (destRow + (x - x0)) * 4;
        const cell = this.grid[srcRow + x];

        if (cell === 0) {
          // Transparent air
          data[destIdx + 0] = 0;
          data[destIdx + 1] = 0;
          data[destIdx + 2] = 0;
          data[destIdx + 3] = 0;
          continue;
        }

        // Texture dither noise based on pixel coordinate hash
        const hash = ((x * 15485863) ^ (y * 2038074743)) >>> 0;
        const dither = (hash & 7);

        let color = RGBA.dirtLight;

        if (cell === 1) {
          // Grass
          color = dither < 6 ? RGBA.grassLight : RGBA.grassDark;
        } else if (cell === 2) {
          // Dirt
          if (dither === 0) color = RGBA.dirtSpeck;
          else if (dither < 5) color = RGBA.dirtLight;
          else color = RGBA.dirtDark;
        } else if (cell === 3) {
          // Rock / Stratum
          if (dither === 0) color = RGBA.rockSpeck;
          else if (dither < 5) color = RGBA.rockLight;
          else color = RGBA.rockDark;
        } else if (cell === 4) {
          // Deposited / Terraform Dirt
          color = dither < 5 ? RGBA.freshLight : RGBA.freshDark;
        }

        data[destIdx + 0] = color[0];
        data[destIdx + 1] = color[1];
        data[destIdx + 2] = color[2];
        data[destIdx + 3] = color[3];
      }
    }

    this.ctx.putImageData(imgData, x0, y0);
  }

  /**
   * Draw the offscreen terrain canvas to target main context
   */
  draw(ctx) {
    ctx.drawImage(this.canvas, 0, 0);
  }
}

window.TerrainSystem = TerrainSystem;
