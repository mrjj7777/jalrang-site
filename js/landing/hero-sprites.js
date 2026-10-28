// L1: the pictures the water and the splash are drawn with, made once and then only copied, so a frame never shades
// a pixel of its own (no pixel loop runs while the film plays):
//   drops     red-water beads at ten sizes: a translucent body lit through from behind (bright where the light focuses,
//             deep red where it is thick), a thin bright rim and a crisp white-pink specular window. Drawn stretched
//             along their velocity when they are fast.
//   bubbles   air in red water at eight sizes: a crisp bright rim, a dark band just inside it (the light bent out of
//             view), a clear middle and one highlight.
//   caustic   JJ's own footage of light under rippling water (footage/v01-water-surface-alt.mp4, frames 98 to 141, the
//             stretch with a full, crisp network), baked into assets/hero/caustic.webp: 16 frames of 256 x 256 in a
//             4 x 4 sheet, light only (the floor taken away: the luminance minus its own local mean), tiling seamlessly
//             (the borders crossfaded into each other) and looping (the first 6 frames crossfaded with the 6 after the
//             end). The light is in the alpha channel and the colour is white, so one 'source-in' fill tints it (each
//             frame once, the first time it is shown) and it can be added to the water ('lighter') or laid over the 3D
//             bottle (source-over). 181 KB, fetched after the page is ready; until it is here (and if it never comes) a
//             procedural network of the same scale stands in.
//             The recipe: research script bake_caustic.py (the round-4 hero report), T 256, WebP quality 60, alpha 35.
import { TAU, clamp } from './hero-film.js';

const make = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// ---- an atlas: one row of cells, each a sprite of radius r (device px) centred in it ----
function atlas(radii, paint) {
  const pad = 2;
  const cells = radii.map((r) => ({ r, s: Math.ceil(2 * r + 2 * pad) }));
  const W = cells.reduce((a, c) => a + c.s + 1, 0), H = Math.max(...cells.map((c) => c.s));
  const cv = make(W, H), x = cv.getContext('2d');
  let ox = 0;
  for (const c of cells) {
    c.x = ox; c.y = 0;
    paint(x, ox + c.s / 2, c.s / 2, c.r);
    ox += c.s + 1;
  }
  // the cell for a sprite of radius r (device px): the smallest one at least that large, so it is only ever drawn smaller
  const pick = (r) => { for (const c of cells) if (c.r >= r * 0.94) return c; return cells[cells.length - 1]; };
  return { cv, cells, pick };
}

// a bead of red water
function bead(x, cx, cy, r) {
  if (r < 1.6) {
    x.fillStyle = '#C4401F'; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255, 228, 214, 0.9)'; x.fillRect(cx - r * 0.7, cy - r * 0.7, Math.max(0.6, r * 0.6), Math.max(0.6, r * 0.6));
    return;
  }
  // the body: deep red at the edges, where the liquid is thick along the line of sight; bright orange-red low on the
  // far side, where the light that came through the bead is focused
  const g = x.createRadialGradient(cx + 0.3 * r, cy + 0.36 * r, 0, cx + 0.08 * r, cy + 0.1 * r, 1.14 * r);
  g.addColorStop(0, '#F47A50'); g.addColorStop(0.32, '#D84A29'); g.addColorStop(0.72, '#9C2414'); g.addColorStop(1, '#5A1107');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  // the rim: a thin bright edge where the light grazes it
  const lw = Math.max(0.7, 0.09 * r);
  x.strokeStyle = 'rgba(255, 150, 116, 0.55)'; x.lineWidth = lw;
  x.beginPath(); x.arc(cx, cy, r - lw / 2, 0.15 * Math.PI, 1.35 * Math.PI, false); x.stroke();
  x.strokeStyle = 'rgba(255, 196, 172, 0.35)';
  x.beginPath(); x.arc(cx, cy, r - lw / 2, 1.35 * Math.PI, 2.15 * Math.PI, false); x.stroke();
  // the specular window: crisp, white-pink, upper left; and a small second one, lower right
  x.fillStyle = 'rgba(255, 245, 238, 0.96)';
  x.beginPath(); x.ellipse(cx - 0.36 * r, cy - 0.4 * r, Math.max(0.65, 0.26 * r), Math.max(0.5, 0.16 * r), -0.7, 0, TAU); x.fill();
  if (r > 4) {
    x.fillStyle = 'rgba(255, 226, 210, 0.5)';
    x.beginPath(); x.ellipse(cx + 0.4 * r, cy + 0.46 * r, 0.11 * r, 0.06 * r, -0.7, 0, TAU); x.fill();
  }
}
export const dropAtlas = () => atlas([1.2, 1.8, 2.6, 3.6, 5, 7, 9.5, 13, 18, 25], bead);

// a bubble of air in red water
function bubble(x, cx, cy, r) {
  if (r < 1.8) {
    x.strokeStyle = 'rgba(255, 210, 192, 0.85)'; x.lineWidth = 0.8;
    x.beginPath(); x.arc(cx, cy, Math.max(0.6, r - 0.4), 0, TAU); x.stroke();
    return;
  }
  // inside: a hair lighter than the water, and the dark band just inside the rim
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255, 170, 140, 0.16)'); g.addColorStop(0.62, 'rgba(255, 150, 120, 0.08)');
  g.addColorStop(0.84, 'rgba(66, 9, 4, 0.32)'); g.addColorStop(0.97, 'rgba(66, 9, 4, 0.12)'); g.addColorStop(1, 'rgba(66, 9, 4, 0)');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  // the rim: crisp and bright, brighter on the lit side
  const lw = Math.max(0.8, 0.075 * r);
  x.lineWidth = lw;
  x.strokeStyle = 'rgba(255, 214, 196, 0.92)';
  x.beginPath(); x.arc(cx, cy, r - lw / 2, 0.85 * Math.PI, 1.95 * Math.PI, false); x.stroke();
  x.strokeStyle = 'rgba(255, 186, 160, 0.62)';
  x.beginPath(); x.arc(cx, cy, r - lw / 2, 1.95 * Math.PI, 2.85 * Math.PI, false); x.stroke();
  // one highlight, upper left (and, on the larger ones, the light that came through, lower right)
  x.fillStyle = 'rgba(255, 248, 244, 0.95)';
  x.beginPath(); x.ellipse(cx - 0.4 * r, cy - 0.42 * r, Math.max(0.6, 0.2 * r), Math.max(0.45, 0.12 * r), -0.75, 0, TAU); x.fill();
  if (r > 5) {
    x.strokeStyle = 'rgba(255, 200, 176, 0.45)'; x.lineWidth = Math.max(0.7, 0.06 * r);
    x.beginPath(); x.arc(cx, cy, r * 0.7, 0.15 * Math.PI, 0.4 * Math.PI); x.stroke();
  }
}
export const bubbleAtlas = () => atlas([1.4, 2.2, 3.2, 4.5, 6.2, 8.5, 12, 17], bubble);

// ---- the caustic light ----
export const CAUSTIC = { url: 'assets/hero/caustic.webp', frames: 16, cols: 4, T: 256 };
const idle = (timeout = 400) => new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(() => res(), { timeout }) : setTimeout(res, 40)));

// A procedural stand-in, built the way caustics are made: light falling through a wavy surface is bent by its slope, and
// where the bending folds the light together it is bright. The surface is a few waves with whole numbers of crests across
// the tile (so it tiles); the light's concentration is 1 / |det J| of the bending map, J = I + S (its curvature), bright in
// thin curved lines where the map folds. One pass over the tile's 256 x 256 pixels, once, at start (the cells as small as
// the footage's, and none repeated inside the tile); each wave's sine is split into a row's and a column's
// (sin(a + b) = sin a cos b + cos a sin b), so the pass itself only multiplies (12 to 15 ms in the test container,
// half what the plain pass took).
const WAVES = [[6, 2, 0.0085, 0.3], [2, 8, 0.007, 1.9], [-4, 6, 0.0055, 4.1], [8, -4, 0.004, 2.7], [10, 6, 0.0025, 5.3], [-12, 2, 0.0015, 0.9], [-3, -7, 0.0035, 3.4]];
function procedural(T) {
  const S = 0.075, cv = make(T, T), x = cv.getContext('2d');
  const im = x.createImageData(T, T), d = im.data, W = WAVES.length;
  const sa = new Float32Array(W * T), ca = new Float32Array(W * T), sb = new Float32Array(W * T), cb = new Float32Array(W * T);
  const kxx = new Float32Array(W), kyy = new Float32Array(W), kxy = new Float32Array(W);
  for (let w = 0; w < W; w++) {
    const [m, n, a, ph] = WAVES[w], q = a * TAU * TAU;
    kxx[w] = m * m * q; kyy[w] = n * n * q; kxy[w] = m * n * q;
    for (let i = 0; i < T; i++) {
      const A = (TAU * m * (i + 0.5)) / T + ph, B = (TAU * n * (i + 0.5)) / T;
      sa[w * T + i] = Math.sin(A); ca[w * T + i] = Math.cos(A); sb[w * T + i] = Math.sin(B); cb[w * T + i] = Math.cos(B);
    }
  }
  for (let py = 0; py < T; py++) {
    for (let px = 0; px < T; px++) {
      let hxx = 0, hyy = 0, hxy = 0;
      for (let w = 0, o = 0; w < W; w++, o += T) {
        const s = sa[o + px] * cb[o + py] + ca[o + px] * sb[o + py];
        hxx -= kxx[w] * s; hyy -= kyy[w] * s; hxy -= kxy[w] * s;
      }
      const J = (1 + S * hxx) * (1 + S * hyy) - S * S * hxy * hxy;
      const I = 1 / Math.max(Math.abs(J), 0.12);          // capped: the folds' lines a little soft, as a lens makes them
      const k = (py * T + px) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(255 * clamp(clamp((I - 2.2) * 0.11) + 0.12 * clamp((I - 1) * 0.3)));
    }
  }
  x.putImageData(im, 0, 0);
  return cv;
}

export class Caustic {
  constructor(opts = {}) {
    Object.assign(this, CAUSTIC, opts);
    this.sheet = null;
    this.failed = false;
    this.job = null;
    this.proc = procedural(this.T);
    this.tint = '';
    this.tiles = [];                                  // the footage's frames, each tinted once, on first use
    this.std = null;                                  // the stand-in, tinted
    this.at = -1;                                     // the clock when the sheet arrived (for the crossfade from the stand-in)
  }
  get n() { return this.sheet ? this.frames : 0; }    // frames ready (the tests' ready() and the old ink's interface)
  get ready() { return !!this.sheet; }
  load({ fast = false } = {}) {
    if (this.job) return this.job;
    this.job = (async () => {
      if (!fast) await idle();
      try {
        const img = new Image();
        img.decoding = 'async';
        img.src = this.url;
        await img.decode();                           // decoded off the main thread
        this.sheet = img;
        this.tiles = [];
      } catch { this.failed = true; }                 // the stand-in carries on, and nobody is told
      return this.ready;
    })();
    return this.job;
  }
  // a tile in the light's colour (T x T, the light in its alpha), made once: a canvas that never changes again, so a
  // pattern made from it is made once too, and a frame only places it
  tinted(src, sx, sy, s) {
    const T = this.T, c = make(T, T), x = c.getContext('2d');
    x.drawImage(src, sx, sy, s, s, 0, 0, T, T);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = this.tint;
    x.fillRect(0, 0, T, T);
    return c;
  }
  tile(i) { return this.tiles[i] || (this.tiles[i] = this.tinted(this.sheet, (i % this.cols) * this.T, Math.floor(i / this.cols) * this.T, this.T)); }
  // The light at fractional frame f, in colour `tint`: the tiles to lay, each with its share (the shares add up to one).
  // The two neighbouring frames of the footage, mixed by the fraction (laid with 'lighter', their light adds up exactly),
  // and the stand-in while the footage fades in (k: its share, 0 to 1, after it arrives).
  layers(f, tint, k = 1, out = []) {
    if (tint !== this.tint) { this.tint = tint; this.tiles = []; this.std = null; }
    out.length = 0;
    const has = !!this.sheet, kk = has ? clamp(k) : 0;
    if (kk < 1) out.push([this.std || (this.std = this.tinted(this.proc, 0, 0, this.proc.width)), 1 - kk]);
    if (kk > 0) {
      const n = this.frames, i0 = ((Math.floor(f) % n) + n) % n, t = f - Math.floor(f);
      out.push([this.tile(i0), kk * (1 - t)]);
      if (t > 0.002) out.push([this.tile((i0 + 1) % n), kk * t]);
    }
    return out;
  }
}
