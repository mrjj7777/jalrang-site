// L1 "Jal meets Rang": the 2D layer, a compositor working in layers and blend modes. Everything costly is made once
// (the sprites and the caustic light in hero-sprites.js, the bottle's dry and wet pictures here); a frame only copies
// and fills. Three canvases:
//   back   inside the stage, under the wordmark: the air, the red water (in cross-section, like a glass tank), its
//          surface, the caustic light, the far half of the splash, the bubbles behind the bottle; in 2D also the
//          bottle itself and everything in front of it
//   front  (3D only) fixed over the WebGL bottle (z 31): what the water does to the bottle (a red veil and the light on
//          it), the near half of the splash, the bubbles in front; the words are cut out of it, since they stand at the
//          front of the tank
//   mul    (3D only) a small canvas over the bottle with mix-blend-mode: multiply: the water's absorption (it takes most
//          of the green and blue out of whatever is seen through it), inside the bottle's outline, below the waterline
// The water is a vertical Beer-Lambert gradient (bright warm red just under the surface, darker with depth) that the
// camera's exposure settles to flat Sindoor as it follows the bottle down (TL.red, over its progress c), so the next chapters find their
// ground. The surface is one profile y(x) (low living waves, the cavity round the bottle, the ripples of the impact
// and of the drops that land, the foot of the jet) seen from a little above: a thin dark band of the top surface over
// a bright meniscus line with glints; when the camera goes under, the band turns into the bright, shimmering
// underside. The light under the water is JJ's real caustic footage, added ('lighter') and faded with depth.
// Everything the film shows is a function of the film state (intro.js builds it each frame from the bottle's physics,
// hero-phys.js: the splash's clock q, the camera's depth cam and its progress c) plus the clock for idle life; under ?test
// the clock stands still and the film's time is set, so the same time always gives the same picture.
import { TL, TAU, clamp, lerp, ss, hash, swayAt } from './hero-film.js';
import { Splash } from './hero-splash.js';
import { Caustic, dropAtlas, bubbleAtlas } from './hero-sprites.js';

const KAJAL = '#1A1612';
const SINDOOR = [195, 54, 29];
const STEP = 4;                   // px between two samples of the surface
const RAMP = 256;                 // rows of a vertical ramp (drawBack)
// the water's colour with depth (px under the surface, as shares of the stage height), before the exposure settles it:
// a thin bright layer where the light comes in, Sindoor, then deeper and darker (oxblood at the foot of the first screen)
const DEPTH = [[0, [222, 80, 50]], [0.014, [206, 63, 37]], [0.05, [192, 51, 28]], [0.12, [166, 40, 21]], [0.24, [134, 30, 15]], [0.5, [104, 22, 11]]];
const LIGHT = 'rgb(255, 150, 110)';                // the caustic light, already reddened by the water
const ABSORB = [246, 134, 112];                    // what the water lets through (multiply): little green, less blue
const DARK = [112, 22, 10];                        // the deep water the light falls off into, below the bottle in the hold
const VEIL = 0.13;                                 // and what it adds of its own colour (the light it scatters)
const BAND = 0.3;                                  // the depth of the surface seen beyond the near edge, in bottle heights
const EYE = 4.2;                                   // the camera's distance from the tank, in bottle heights
// the 3D bottle's outline (the right half, bottle units, base to cap top), as js/gl/bottle.js profile(): intro.js projects
// it through the 3D camera every frame (pose3d()), so the water's masks fit the WebGL bottle exactly
export const PROFILE = (() => {
  const pts = [[0.372, 0.014], [0.38, 0.05], [0.38, 2.02]];
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push([0.21 + 0.17 * Math.cos(a), 2.02 + 0.3 * Math.sin(a)]); }
  pts.push([0.212, 2.33], [0.212, 2.395], [0.25, 2.402], [0.25, 2.64]);
  return pts;
})();

// a train of ripples that has left its source and travels out at speed c (d: distance from the source, tau: time
// since); it trails off behind its front, and fades with distance and with time
function packet(d, tau, c, lam, A, Ld, Tt) {
  const f = c * tau - d;
  if (f < -0.5 * lam) return 0;
  const front = ss(-0.5 * lam, 0.35 * lam, f);
  const trail = Math.exp(-Math.max(0, f) / (2.1 * lam));
  return A * front * trail * Math.sin((TAU * f) / lam) * Math.exp(-d / Ld) * Math.exp(-tau / Tt);
}
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c, a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a.toFixed(3)})`;
const canvas = (w = 1, h = 1) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

export class HeroFX {
  constructor(back, front, mul) {
    this.back = back; this.front = front; this.mulC = mul;
    // the back canvas is opaque (every frame paints all of it, or keeps what it painted): the compositor need not blend it
    // nor draw what lies under it. Until the first frame it is the air, not black.
    this.bx = back.getContext('2d', { alpha: false });
    this.bx.fillStyle = KAJAL; this.bx.fillRect(0, 0, back.width, back.height);
    this.fx = front ? front.getContext('2d') : null;
    this.mx = mul ? mul.getContext('2d') : null;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.g = null;
    this.ev = [];                              // idle events (seconds): a droplet falling, the pointer's ripples
    this.sig = '';
    this.lastT = -1;
    this.draws = 0;
    this.F = { n: 0, ys: null, ev: [], lands: [], wet: 0 };
    this.fine = true;                          // the costly extras (mist, every other bubble); intro.js gives them up on a slow device
    this.film = false;                         // the last draw was the film moving (p changed), not only the idle life
    this.gl3d = false;                         // the bottle is the WebGL one (intro.js): the front and mul canvases are in use
    this.testing = false;                      // ?test: no crossfades on the clock
    this.pack = null;                          // the packshot <img> (2D): the bottle is drawn from it
    this.drops = dropAtlas();                  // sprites; their radii are device px, so one set serves every pixel ratio
    this.bubbles = bubbleAtlas();
    this.caustic = new Caustic();
    this.splash = null;
    this.lit = [];                             // this frame's light: [tile, share] (hero-sprites.js Caustic.layers)
    this.pats = [[null, 0], [null, 0], [null, 0]]; this.npat = 0;   // the same as patterns, [pattern, share]
    this.patOf = new WeakMap();                // a tile's pattern, made once
    this.bfx = canvas(); this.bfxX = this.bfx.getContext('2d');
    this.lc = canvas(); this.lcx = this.lc.getContext('2d');        // the caustic light, faded with depth, at half resolution
    // two vertical ramps (the water's colour with depth, and how much of the light it lets through), each a canvas one
    // pixel wide used as a pattern: a gradient of many stops is the slowest fill there is on a software GPU, a pattern
    // several times quicker
    this.ramps = [0, 1].map(() => { const c = canvas(1, RAMP); return { cv: c, x: c.getContext('2d'), stops: [] }; });
    this.frontOn = false; this.mulOn = false; this.mulAt = [0, 0];
    this.dryOK = false;
    this.airTop = 0;                           // the highest y the last frame drew anything but air at (drawBack)
  }
  // the perf gate reads this (tools/perf: it logs it as "reflections", the extras the earlier film gave up first)
  get noRefl() { return !this.fine; }

  resize(w, h, dpr) {
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.back.width = Math.max(1, Math.round(w * dpr)); this.back.height = Math.max(1, Math.round(h * dpr));
    this.bx.fillStyle = KAJAL; this.bx.fillRect(0, 0, this.back.width, this.back.height);
    this.lc.width = Math.max(1, Math.round((w * dpr) / 2)); this.lc.height = Math.max(1, Math.round((h * dpr) / 2));
    if (this.front) {
      // the front canvas only matters over the WebGL bottle; in 2D it stays a pixel
      const on = this.gl3d;
      this.front.width = on ? Math.max(1, Math.round(w * dpr)) : 1; this.front.height = on ? Math.max(1, Math.round(h * dpr)) : 1;
      this.front.style.width = w + 'px'; this.front.style.height = h + 'px';
    }
    this.F.n = Math.ceil(w / STEP) + 1;
    this.F.ys = new Float32Array(this.F.n);
    this.sig = '';
    this.airTop = 0;                           // a canvas just sized is empty: the next frame paints all of it
  }

  // g (css px of the stage): { w, h, line, margin, cx, bw, hB, capTop, rim, clear, narrow, fs, capH, gapHalf,
  //   words: [{ text, x, base, x0, x1, cx, hw, rise() }] }; see layout() in intro.js
  setGeometry(g, fonts) {
    this.g = g;
    this.k = g.hB / 346;                       // sizes are set on the phone's bottle (346 px at 390 x 844)
    this.R = g.hB * (this.gl3d ? 0.38 / 2.72 : 0.151);   // the radius of the bottle it draws: the 3D one's, or the packshot's
    this.eye = (g.line + g.capTop) / 2;        // the camera's eye is level with the bottle's middle
    this.splash = new Splash(this.drops, this.bubbles);
    this.splash.build(g, this.R, g.sim);
    this.lands = this.splash.lands;
    this.buildBottle();
    this.buildWords(fonts);
    // the header takes the Sindoor ground once the surface and its bright underside have left the top: the camera's depth at which that is
    let a = 0, b = g.line + 0.6 * g.h;
    for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (this.surfY(m) - Math.min(0, this.bandAt(m)) + 2 < 0) b = m; else a = m; }
    this.tokCam = b;
    this.sig = '';
    this.airTop = 0;
  }

  // ---- the packshot's pictures: dry (as photographed) and wet (seen through the water). In 2D they are the bottle; in
  // 3D only the dry one is used, as what the crown's sheet bends (the WebGL bottle's outline is projected: this.sil) ----
  buildBottle() {
    const dpr = this.dpr;
    const box = this.box = this.packBox();
    // the light's working canvas (and the mul canvas): the bottle itself (not the packshot's wide box), with room for the
    // lean of its fall and its roll
    const hB = this.g.hB;
    this.bw = Math.ceil(0.6 * hB) + 4; this.bh = Math.ceil(1.06 * hB) + 4;
    this.bfx.width = Math.ceil(this.bw * dpr); this.bfx.height = Math.ceil(this.bh * dpr);
    if (this.mulC) {
      this.mulC.width = this.gl3d ? this.bfx.width : 1; this.mulC.height = this.gl3d ? this.bfx.height : 1;
      this.mulC.style.width = (this.gl3d ? this.bw : 1) + 'px'; this.mulC.style.height = (this.gl3d ? this.bh : 1) + 'px';
    }
    const W = Math.ceil(box.w * dpr), H = Math.ceil(box.h * dpr);
    this.dry = canvas(W, H); this.wet = canvas(W, H);
    const d = this.dry.getContext('2d');
    if (this.pack && this.pack.naturalWidth) {
      d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'high';
      d.drawImage(this.pack, box.sx, 0, box.sw, box.nh, 0, 0, W, H);
    } else { this.dryOK = false; return; }
    this.dryOK = true;
    // wet: what the water lets through (multiply), the outline kept, and the water's own colour laid over it
    const x = this.wet.getContext('2d');
    x.drawImage(this.dry, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = rgb(ABSORB); x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(this.dry, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = rgb(SINDOOR, VEIL); x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
  }
  // the packshot's box (state.js L.packshot: the bottle fills 99% of the file's height, the file centred), cropped to the
  // bottle and a margin (the file is more than twice as wide as the bottle: every pixel copied counts)
  packBox() {
    const ih = this.g.hB / 0.99, img = this.pack;
    const nw = img && img.naturalWidth ? img.naturalWidth : 720, nh = img && img.naturalHeight ? img.naturalHeight : 971;
    const full = (ih * nw) / nh, w = Math.min(full, 0.42 * this.g.hB);
    return { w, h: ih, sx: (nw * (1 - w / full)) / 2, sw: (nw * w) / full, nh };
  }
  setPack(img) { this.pack = img; if (this.g) { this.buildBottle(); this.sig = ''; } }
  // the WebGL bottle's outline on screen (stage px, [x0, y0, x1, y1, ...]) as the current path, a hair generous
  silPath(ctx) {
    const s = this.sil;
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
    ctx.closePath();
  }
  // does this frame know where the bottle is (2D: its picture; 3D: its projected outline)?
  get bottleOK() { return this.gl3d ? !!(this.sil && this.sil.length > 8) : this.dryOK; }

  // ---- the words, as a mask (3D: cut out of the front canvas, since they stand at the front of the tank) ----
  buildWords(fonts) {
    this.wordMask = null;
    const g = this.g;
    if (!this.gl3d || !fonts || !g.words || !g.words.length) return;
    const dpr = this.dpr, cv = canvas(g.w * dpr, g.h * dpr), x = cv.getContext('2d');
    x.scale(dpr, dpr);
    x.fillStyle = '#fff';
    x.font = `${g.fs}px ${fonts}`;
    x.textBaseline = 'alphabetic';
    for (const wd of g.words) x.fillText(wd.text, wd.x, wd.base);
    this.wordMask = cv;
  }

  // ---- idle events (seconds): a droplet falls from the top edge; the pointer ruffles the line ----
  addDrop(now, x) {
    const k = this.k, g = this.g;
    const gi = 2300 * k * (g.h / 844), y0 = -8;
    const tL = Math.sqrt((2 * (g.line - y0)) / gi);
    this.ev.push({ type: 'drop', t0: now, x, gi, y0, tL, r: 2.9 * k, seed: Math.floor(x * 7) });
  }
  addPing(now, x, A) {
    this.ev.push({ type: 'ring', t0: now, x, A: A * this.k, lam: 40 * this.k, c: 300 * (this.w / 1505) + 120, Ld: 260 * (this.w / 1505) + 60, Tt: 1.1 });
  }
  tickEvents(now) {
    const ev = this.ev;
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i];
      if (e.type === 'drop' && now - e.t0 > e.tL && !e.landed) {
        e.landed = true;
        ev.push({ type: 'ring', t0: e.t0 + e.tL, x: e.x, A: 3 * this.k, lam: 44 * this.k, c: 340 * (this.w / 1505) + 120, Ld: 300 * (this.w / 1505) + 80, Tt: 1.3 });
      }
      const life = e.type === 'drop' ? e.tL + 0.7 : 2.6;
      if (now - e.t0 > life) ev.splice(i, 1);
    }
  }
  get live() { return this.ev.length > 0; }

  // ---- where things are (cam: how far the camera has gone down, px) ----
  surfY(cam) { return this.g.line - cam; }                               // the surface at rest, on screen
  // the sine of the camera's angle down to the surface (< 0 once the camera is under it)
  seAt(cam) { return clamp((this.surfY(cam) - this.eye) / (EYE * this.g.hB), -0.5, 0.5); }
  // the band of surface seen beyond the near edge (px): > 0 above the line (the top, seen from above), < 0 below it
  // (the underside, seen from below)
  bandAt(cam) { return this.seAt(cam) * BAND * this.g.hB; }

  // the surface: how far (px, up) the water stands above its rest level at x
  upAt(x) {
    const F = this.F, g = this.g;
    let u = 0;
    // living waves: low, long, slow (the clock), and two shorter ones across them
    const t = F.t;
    u += F.waves * (0.55 * Math.sin(x * 0.019 - t * 0.9 + 0.4) + 0.35 * Math.sin(x * 0.047 + t * 1.45 + 2.1) + 0.2 * Math.sin(x * 0.11 - t * 2.3 + 4.0));
    if (F.tau > 0) {
      const d = Math.max(0, Math.abs(x - g.cx) - this.R);
      u += ss(0, 0.4 * F.lam, d) * packet(d, F.tau, F.c, F.lam, F.A0, F.Ld, F.Tt);
      const q = 1 - clamp(d / F.cavW);
      u -= F.cav * q * q * (0.6 + 0.4 * q);                                 // the cavity: the surface pulled down round the bottle, a curved funnel
      u += this.splash.jetFoot(F.q, Math.abs(x - g.cx));
    }
    for (let i = 0; i < F.lands.length; i++) {
      const L = F.lands[i];
      u += packet(Math.abs(x - L.x), L.tau, F.cl, F.laml, L.A, 160 * this.k, 0.05);
    }
    for (let i = 0; i < F.ev.length; i++) {
      const e = F.ev[i];
      if (e.type === 'ring') u += packet(Math.abs(x - e.x), e.tau, e.c, e.lam, e.A, e.Ld, e.Tt);
    }
    return u;
  }
  yAt(x) { const F = this.F, t = clamp(x, 0, this.w) / STEP, i = Math.min(F.n - 2, Math.max(0, Math.floor(t))); return lerp(F.ys[i], F.ys[i + 1], t - i); }

  // everything this frame needs, computed once from p and the clock
  // film: the film's state (intro.js, hero-phys.js frameAt): q the splash's clock, cam the camera's depth, c its progress, b the bottle
  prepare(film, t, arr) {
    const g = this.g, k = this.k, F = this.F, kw = g.w / 1505;
    const q = F.q = film.q;
    F.c = film.c; F.dr = film.c;                           // dr: the light's drift follows the camera
    F.t = t; F.h = this.h; F.line = g.line; F.cx = g.cx; F.arr = arr;
    F.cam = film.cam;
    F.Yw = g.line - F.cam;
    F.se = this.seAt(F.cam); F.ce = Math.sqrt(1 - F.se * F.se);
    F.band = F.se * BAND * g.hB;
    F.tau = q - TL.hit;
    F.waves = 1.1 * k * (1 - 0.6 * ss(TL.hit, TL.hit + 0.04, q));
    F.lam = 70 * k; F.c = 2.4 * g.w; F.A0 = 7 * k; F.Ld = 0.6 * g.w; F.Tt = 0.16;
    F.cl = 1300 * kw + 500; F.laml = 30 * k;
    F.cav = g.hB * 0.07 * this.splash.vs * ss(0, 0.02, F.tau) * (1 - ss(this.splash.ps - 0.03, this.splash.ps + 0.004, q));
    // the cavity's mouth: hidden inside the crown's foot while the crown stands, then the surface slopes down to the glass
    F.cavW = g.hB * (0.012 + 0.07 * ss(this.splash.tp + 0.01, this.splash.tp + 0.06, F.tau));
    F.lands.length = 0;
    for (const L of this.lands) { const tau = q - L.p0; if (tau > 0 && tau < 0.1) F.lands.push({ x: L.x, tau, A: L.A }); }
    F.ev.length = 0;
    for (const e of this.ev) { const tau = t - e.t0; if (tau > 0) { e.tau = tau; F.ev.push(e); } }
    F.u = ss(TL.red[0], TL.red[1], F.c);                                     // the exposure settles the red to Sindoor
    F.hold = ss(TL.hold[0], TL.hold[1], F.c);
    // the surface, sampled (the near edge, on screen)
    let maxUp = 0;
    for (let i = 0; i < F.n; i++) {
      const up = this.upAt(Math.min(i * STEP, g.w));
      F.ys[i] = F.Yw - up;
      if (Math.abs(up) > maxUp) maxUp = Math.abs(up);
    }
    F.maxUp = maxUp;
    this.thin();
    F.Ys = F.Yw - F.band / 2 + 0.6 * F.cav;                                // the middle plane at the axis: the crown stands there
    // the bottle on screen: its path, the sway, its box
    const b = F.b = film.b;
    const sw = F.sw = swayAt(t, g, F.hold);
    F.bx = g.cx + sw.dx;
    F.base = b.y + sw.dy;
    F.mid = F.base - g.hB / 2;
    F.rot = b.tilt + sw.rot;
    // the waterline on the bottle: the surface at the bottle's plane, curving round its front
    const cutMid = this.cutAt(F.bx);
    F.wet = F.arr.line < 0.5 || cutMid > F.base + 3 ? 0 : cutMid < F.base - g.hB - 14 ? 1 : 0.5;
    F.bot = { cut: clamp(cutMid, F.base - g.hB, F.base), base: F.base, half: this.R };
    this.splash.prep(F);
  }
  // The samples the surface is drawn through: a path costs a software GPU (and a slow phone) by its points, so where the
  // surface runs nearly straight most samples are left out. A sample is kept when the straight line from the last kept one
  // would pass more than a third of a device pixel from a sample in between, and at least every 8th (so the far edge of
  // the band, made from the same samples, stays smooth). At rest that keeps about one in three; round the cavity and the
  // jet, nearly all.
  thin() {
    const F = this.F, ys = F.ys, n = F.n, tol = 0.34 / this.dpr;
    if (!F.keep || F.keep.length < n) F.keep = new Int32Array(n);
    const K = F.keep;
    let m = 0, a = 0;
    K[m++] = 0;
    for (let j = 2; j < n; j++) {
      let ok = j - a <= 8;
      for (let k = a + 1; ok && k < j; k++) if (Math.abs(ys[k] - (ys[a] + ((ys[j] - ys[a]) * (k - a)) / (j - a))) > tol) ok = false;
      if (!ok) { a = j - 1; K[m++] = a; }
    }
    if (n > 1) K[m++] = n - 1;
    F.nk = m;
  }
  cutAt(x) {
    const F = this.F, R = this.R, dx = x - F.bx;
    return this.yAt(x) - F.band / 2 + 0.15 * F.cav + F.se * Math.sqrt(Math.max(0, R * R - dx * dx));
  }
  bob(x) { const m = 3 * this.k; return clamp(-0.8 * this.upAt(x), -m, m); }

  // ---- one frame: returns true if it drew ----
  render(film, t, arr) {
    if (!this.g || !this.w) return false;
    this.tickEvents(t);
    const sig = `${film.q.toFixed(5)}|${film.cam.toFixed(2)}|${film.b.y.toFixed(2)}|${film.b.tilt.toFixed(5)}|${film.b.ry.toFixed(4)}|${arr.line.toFixed(3)}|${arr.jal.toFixed(3)}|${arr.rang.toFixed(3)}|${this.caustic.n}|${this.dryOK}`;
    const same = sig === this.sig;
    // the water lives on the clock (its light drifts, its surface moves, the bottle sways): when the film itself is still
    // that is drawn at 24 frames a second, the rate of film; under ?test the clock stands still and so does the picture
    if (same && (t === this.lastT || t - this.lastT < 0.0405)) return false;
    this.sig = sig; this.lastT = t; this.film = !same;
    this.prepare(film, t, arr);
    this.light();
    this.drawBack();
    if (this.gl3d) { this.drawFront(); this.drawMul(); }
    this.draws++;
    return true;
  }

  // ---- the caustic light for this frame: the loop's two neighbouring frames (and the stand-in while the footage fades
  // in), each a tile tinted once and its pattern made once; a frame only places them and lays them with their shares ----
  light() {
    const F = this.F, c = this.caustic;
    if (c.ready && c.at < 0) c.at = F.t;
    const kIn = c.ready ? (this.testing ? 1 : ss(0, 0.8, F.t - c.at)) : 0;
    const L = c.layers(F.t * 7 + F.dr * 46, LIGHT, kIn, this.lit);
    this.npat = L.length;
    for (let i = 0; i < L.length; i++) {
      let pt = this.patOf.get(L[i][0]);
      if (!pt) { pt = this.bx.createPattern(L[i][0], 'repeat'); this.patOf.set(L[i][0], pt); }
      this.pats[i][0] = pt; this.pats[i][1] = L[i][1];
    }
  }
  // the light's patterns given one placement (a, d: the scale across and down; e, f: the offset), false where a pattern
  // cannot be placed (no DOMMatrix)
  setLight(a, d, e, f) {
    if (!window.DOMMatrix) return false;
    const m = new DOMMatrix([a, 0, 0, d, e, f]);
    for (let i = 0; i < this.npat; i++) { const pt = this.pats[i][0]; if (!pt.setTransform) return false; pt.setTransform(m); }
    return true;
  }
  // placed for a fill in css px (the context scaled by dpr), shifted by (ox, oy); s: its scale
  placeLight(ox = 0, oy = 0, s = 1) {
    const F = this.F, g = this.g;
    const tw = ((g.narrow ? 1.0 : 0.8) * g.hB * s) / 256;
    return this.setLight(tw, tw * 1.12, -F.t * 7 * this.k + F.dr * 40 * this.k + ox, -F.t * 4.5 * this.k - F.dr * 130 * this.k + oy);
  }
  // fill(): one fill with the light, made once per tile with its share: the first with `op`, the others added to it
  fillLight(ctx, op, alpha, fill) {
    for (let i = 0; i < this.npat; i++) {
      ctx.globalCompositeOperation = i ? 'lighter' : op;
      ctx.globalAlpha = alpha * this.pats[i][1];
      ctx.fillStyle = this.pats[i][0];
      fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // the same light running up through the crown's sheet: finer, stretched along the flow, carried up with it (the main
  // tile only: the sheet moves too fast for the crossfade to show)
  sheetLight() {
    const F = this.F, g = this.g;
    if (!this.npat) return null;
    let best = 0;
    for (let i = 1; i < this.npat; i++) if (this.pats[i][1] > this.pats[best][1]) best = i;
    const pt = this.pats[best][0];
    if (!pt.setTransform || !window.DOMMatrix) return null;
    const tw = (0.32 * g.hB) / 256;
    pt.setTransform(new DOMMatrix([tw, 0, 0, tw * 3.2, g.cx * 0.37 + F.t * 3, -F.dr * g.hB * 9 - F.cam]));
    return pt;
  }

  // the water's colour at depth z (px), with the exposure u: everything but the bright layer under the surface settles
  water(z, u) {
    const h = this.h, q = z / h;
    let c = DEPTH[DEPTH.length - 1][1];
    for (let i = 1; i < DEPTH.length; i++) {
      if (q <= DEPTH[i][0]) { const a = DEPTH[i - 1], b = DEPTH[i]; c = mix(a[1], b[1], clamp((q - a[0]) / (b[0] - a[0]))); break; }
    }
    return mix(c, SINDOOR, u * ss(0.02 * h, 0.1 * h, z));
  }
  // how much of the caustic light shows at depth z, and (in the hold) at screen y: deep in the water the light on the
  // tank's far wall is faint, and where the words are it is fainter still
  lightAt(z, y) {
    const F = this.F, h = this.h, g = this.g;
    const dive = (0.25 + 0.75 * ss(0, 0.025 * h, z)) * (0.1 + 0.9 * Math.exp(-z / (0.2 * h)));
    const words = g.narrow ? 1 - 0.8 * (1 - ss(0.3 * h, 0.4 * h, y)) - 0.75 * ss(0.8 * h, 0.86 * h, y) : 1 - 0.8 * (1 - ss(0.3 * h, 0.42 * h, y)) - 0.6 * ss(0.85 * h, 0.9 * h, y);
    return lerp(dive, 0.32 * words, F.hold);
  }

  // ---- the back canvas ----
  drawBack() {
    const ctx = this.bx, { w, h, g, F, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const a = F.arr.line, k = this.k;
    // the top of what the water can reach this frame, on a step of 4 px (so at rest, where only the small waves move, it
    // stays put, and so do the two ramps below)
    const y0 = Math.max(-2, F.Yw - 4 * Math.ceil(F.maxUp / 4) - 2), N = 10;
    // the air: only where the water is not, and above that only from the highest thing drawn this frame or the last (the
    // rest of the canvas is still Kajal from the frame before: every pass over the screen counts). A droplet falling
    // through the air clears only its own column; the beads it throws up when it lands stay near the surface.
    let top = 0;
    const cols = this.cols || (this.cols = []), was = this.colsWas || (this.colsWas = []);
    was.length = 0; for (const c of cols) was.push(c);
    cols.length = 0;
    if (a >= 0.999 && !(F.q > TL.hit - 0.02 && F.q < this.splash.ps + 0.15)) {
      top = F.Yw - Math.abs(F.band) - F.maxUp - 6;
      if (F.b.y >= -4) top = Math.min(top, F.mid - g.hB * 0.62);
      for (const e of F.ev) {
        if (e.type !== 'drop') continue;
        if (e.tau < e.tL + 0.05) { const m = e.r + 4 * k + 3; cols.push([e.x - m, 2 * m]); }
        else top = Math.min(top, F.Yw - F.maxUp - 24 * k);
      }
      top = Math.max(0, top);
    }
    const from = Math.min(top, this.airTop);
    this.airTop = top;
    ctx.fillStyle = KAJAL;
    if (a < 0.999) ctx.fillRect(0, 0, w, h);
    else {
      if (y0 + F.maxUp * 2 + 6 > from) ctx.fillRect(0, from, w, Math.min(h, y0 + 2 * F.maxUp + 6) - from);
      for (const c of was) if (from > 0) ctx.fillRect(c[0], 0, c[1], from);
      for (const c of cols) if (from > 0) ctx.fillRect(c[0], 0, c[1], from);
    }
    if (a < 0.001) return;
    const wx0 = g.cx - a * g.cx, wx1 = g.cx + a * (w - g.cx);
    // the water's colour with depth, and how much of the light comes through at each depth; once the red has settled,
    // the light falls off a little below the bottle as well (the top stays flat Sindoor for the header): that darkening
    // is laid into both ramps
    const ya = y0 - 8, yb = h + 8, key = `${y0}|${F.Yw.toFixed(2)}|${h}|${F.u.toFixed(4)}|${F.hold.toFixed(4)}`;
    if (key !== this.rampKey) {
      this.rampKey = key;
      const sc = this.ramps[0].stops, sf = this.ramps[1].stops;
      sc.length = sf.length = 0;
      for (let i = 0; i <= N; i++) {
        const y = lerp(y0, h, i / N), z = Math.max(0, y - F.Yw), o = (y - ya) / (yb - ya);
        const dk = 0.17 * F.u * clamp((y - 0.5 * h) / (0.5 * h));
        sc.push([o, rgb(mix(this.water(z, F.u), DARK, dk))]);
        sf.push([o, `rgba(0, 0, 0, ${(1 - 0.36 * this.lightAt(z, y) * (1 - dk)).toFixed(3)})`]);
      }
      this.ramps[0].pt = this.ramps[1].pt = null;
    }
    // the water, in cross-section: from the near edge down. Under the surface's lowest point (on a whole device pixel)
    // it is a plain rectangle, the cheapest fill there is; only the strip the surface moves in is a path (a path's fill
    // costs a software GPU many times a rectangle's of the same size). Once the surface has left the top, all rectangle.
    const under = F.Yw + F.maxUp + Math.max(0, -F.band) < -2;
    const ySplit = under ? -2 : Math.min(h, Math.ceil((F.Yw + F.maxUp + 1) * dpr) / dpr);
    ctx.fillStyle = this.ramp(0, ya, yb);
    if (ySplit < h) ctx.fillRect(wx0, ySplit, wx1 - wx0, h + 2 - ySplit);
    if (!under) {
      ctx.beginPath(); this.surfacePath(ctx, wx0, wx1);
      ctx.lineTo(wx1, ySplit + 2); ctx.lineTo(wx0, ySplit + 2); ctx.closePath();
      ctx.fill();
    }
    if (this.npat && y0 < h) this.waterLight(ctx, y0, ya, yb, under ? null : ySplit, wx0, wx1);
    // the band of surface beyond the near edge, and the rings on it
    this.drawBand(ctx, wx0, wx1);
    // the idle bubbles in the tank, and the far half of the splash
    this.drawIdleBubbles(ctx, false);
    const S = this.splash;
    S.drawSleeve(ctx, F);
    S.drawBubbles(ctx, F, false, dpr, this.fine);
    S.drawSheet(ctx, F, false, S.sheetOn() ? this.sheetLight() : null);
    S.drawFingers(ctx, F, false, dpr);
    S.drawDrops(ctx, F, false, dpr, this.fine);
    S.drawJet(ctx, F, dpr);
    this.drawIdleDrops(ctx);
    if (!this.gl3d) {
      // 2D: the bottle and everything in front of it, here
      this.drawBottle2D(ctx);
      this.frontPass(ctx, wx0, wx1);
    } else this.meniscus(ctx, wx0, wx1);
  }
  // ramp k (0: the water's colour, 1: what it keeps of the light, as alpha taken away) drawn from its stops and made a
  // pattern whose rows run from ya to yb (repeated: its ends lie outside what is drawn), again only when its stops have
  // changed (drawBack); its own gradient where a pattern cannot be placed
  ramp(k, ya, yb) {
    const R = this.ramps[k], x = R.x;
    if (R.pt) return R.pt;
    const gr = x.createLinearGradient(0, 0, 0, RAMP);
    for (const [o, c] of R.stops) gr.addColorStop(clamp(o), c);
    x.globalCompositeOperation = 'copy';
    x.fillStyle = gr; x.fillRect(0, 0, 1, RAMP);
    const pt = this.bx.createPattern(R.cv, 'repeat');
    if (pt && pt.setTransform && window.DOMMatrix) { pt.setTransform(new DOMMatrix([1, 0, 0, (yb - ya) / RAMP, 0, ya])); return (R.pt = pt); }
    const g2 = this.bx.createLinearGradient(0, ya, 0, yb);
    for (const [o, c] of R.stops) g2.addColorStop(clamp(o), c);
    return (R.pt = g2);
  }
  // the light in the water: JJ's caustics in a canvas of half the resolution (the tile is already drawn twice its size,
  // so nothing is lost), only over the strip the water fills (at the first screen, a fifth of it); there what the water
  // does not let through is taken out (the ramp), and so is everything that is not water: the air over the surface
  // (above ySplit, the strip the surface moves in; null: the surface has left the top) and the sides while the line
  // draws out. That is a fill at half the resolution, not a clip of the full canvas (ten times the cost on a software
  // GPU). Then it is added.
  waterLight(ctx, y0, ya, yb, ySplit, wx0, wx1) {
    const w = this.w, h = this.h, lx = this.lcx, sL = this.lc.width / w;
    const ys = Math.max(0, Math.floor(y0 * sL)), hs = this.lc.height - ys, Y = ys / sL, H = hs / sL;
    lx.setTransform(sL, 0, 0, sL, 0, 0);
    lx.clearRect(0, Y, w, H);
    this.placeLight();
    this.fillLight(lx, 'source-over', 1, () => lx.fillRect(0, Y, w, H));
    lx.globalCompositeOperation = 'destination-out';
    lx.fillStyle = this.ramp(1, ya, yb); lx.fillRect(0, Y, w, H);
    if (ySplit != null) {
      const yc = ySplit + 2;
      lx.fillStyle = '#000';
      lx.beginPath();
      lx.rect(0, Y - 2, w, yc - Y + 2);
      this.surfacePath(lx, wx0, wx1); lx.lineTo(wx1, yc); lx.lineTo(wx0, yc); lx.closePath();
      if (wx0 > 0.5) lx.rect(0, yc, wx0, h + 2 - yc);
      if (wx1 < w - 0.5) lx.rect(wx1, yc, w - wx1, h + 2 - yc);
      lx.fill('evenodd');
    }
    lx.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.lc, 0, ys, this.lc.width, hs, 0, Y, w, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  // the near edge as a path, from x0 to x1 (moveTo the first point)
  surfacePath(ctx, x0, x1) {
    const F = this.F;
    const i0 = Math.ceil(x0 / STEP), i1 = Math.floor(x1 / STEP);
    ctx.moveTo(x0, this.yAt(x0));
    const K = F.keep;
    for (let j = 0; j < F.nk; j++) { const i = K[j]; if (i < i0) continue; if (i > i1) break; ctx.lineTo(i * STEP, F.ys[i]); }
    ctx.lineTo(x1, this.yAt(x1));
  }
  // the colours of the band: the top seen from above (dark: it mirrors the air) or the underside from below (bright)
  bandFill(ctx, b) {
    const F = this.F, gr = ctx.createLinearGradient(0, F.Yw - b, 0, F.Yw);
    if (b > 0) { gr.addColorStop(0, 'rgb(32, 13, 10)'); gr.addColorStop(0.6, 'rgb(54, 16, 11)'); gr.addColorStop(1, 'rgb(88, 22, 12)'); }
    else {
      // the underside, from below: a mirror of the lit water, bright at the glass and fading into the depth
      gr.addColorStop(0, 'rgba(200, 62, 36, 0)'); gr.addColorStop(0.4, 'rgba(232, 104, 72, 0.55)');
      gr.addColorStop(0.82, 'rgba(250, 156, 122, 0.86)'); gr.addColorStop(1, 'rgba(255, 196, 172, 0.95)');
    }
    return gr;
  }

  // ---- the band of surface: above the line the top seen from above (dark: it mirrors the air, with the light's
  // glints and the rings of the impact on it); below the line its underside seen from below (bright, shimmering) ----
  drawBand(ctx, x0, x1) {
    const { F, g } = this;
    const b = F.band;
    if (Math.abs(b) < 0.6 || F.Yw + Math.max(0, -b) < -4) return;
    const i0 = Math.ceil(x0 / STEP), i1 = Math.floor(x1 / STEP);
    // the far edge moves less than the near one (its waves are seen from further away)
    const far = (i) => F.ys[i] - b - 0.35 * (F.ys[i] - F.Yw);
    ctx.save();
    ctx.beginPath();
    this.surfacePath(ctx, x0, x1);
    for (let j = F.nk - 1; j >= 0; j--) { const i = F.keep[j]; if (i > i1) continue; if (i < i0) break; ctx.lineTo(i * STEP, far(i)); }
    ctx.lineTo(x0, this.yAt(x0) - b);
    ctx.closePath();
    ctx.fillStyle = this.bandFill(ctx, b); ctx.fill();
    this.bandLight(ctx, b);
    // the rings of the impact are cut to the band (a clip: costly on a software GPU, so only while they are there; the
    // glints are placed inside it anyway)
    const rings = F.tau > 0 && F.tau < 0.3 && b > 0.5;
    if (rings) ctx.clip();
    // glints: small bright sparkles where a wave's slope faces the light; each lives a moment and is gone (the clock and
    // the scroll move them), never in rows. The top seen from above has a few; the underside seen from below shimmers.
    const k = this.k, B = Math.abs(b), under = b < 0;
    const cell = (under ? 9 : 15) * k + 4, rows = Math.max(1, Math.round(B / (under ? 4 : 5)));
    const slot = Math.floor(F.t * 3 + F.dr * 90);                               // a sparkle's life
    const fr = F.t * 3 + F.dr * 90 - slot;
    for (let r = 0; r < rows; r++) {
      for (let x = x0 - (x0 % cell); x < x1; x += cell) {
        const id = Math.round(x / cell) * 31 + r * 977;
        // two generations at a time: one born in this slot, one in the last; each lives two slots, rising then fading
        for (let s = 0; s < 2; s++) {
          const n = slot - s, q = hash(id + n * 7919);
          if (q < (under ? 0.8 : 0.88)) continue;
          const a = Math.sin((Math.PI * (s + fr)) / 2);
          const xs = x + cell * hash(id + 3 + n * 13), fy = (r + hash(id + 5 + n)) / rows;
          const L = (1.5 + 6 * Math.pow(hash(id + 11 + n), 2)) * k * (1 - 0.4 * fy);
          ctx.globalAlpha = a * (under ? 0.85 : 0.5) * (0.5 + 0.5 * q);
          ctx.fillStyle = under ? 'rgb(255, 240, 232)' : 'rgb(255, 206, 190)';
          ctx.fillRect(xs, this.yAt(xs) - b * fy - 0.4, L, Math.max(0.7, 0.85 * k));
        }
      }
    }
    ctx.globalAlpha = 1;
    // the rings of the impact: flat ellipses opening on the surface
    if (rings) {
      ctx.lineWidth = Math.max(0.8, 1.1 * this.k);
      for (let i = 0; i < 3; i++) {
        const tau = F.tau - 0.006 - i * 0.022;
        if (tau <= 0) continue;
        const ra = this.R * 1.2 + 0.9 * F.c * tau;
        const al = 0.6 * Math.pow(Math.max(0, 1 - tau / 0.22), 1.4) * ss(0, 0.02, tau);
        if (al < 0.01) continue;
        ctx.strokeStyle = `rgba(255, 196, 176, ${al.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(g.cx, F.Ys + 0.5, ra, Math.max(1, b * 0.5 * Math.min(1, ra / (this.R * 4))), 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // the light on the band (the current path): the same moving caustic light, squashed by the angle it is seen at; bright
  // in the underside, which mirrors the lit water, faint on the top, which mirrors the dark air
  bandLight(ctx, b) {
    const { F, g } = this;
    const tw = (0.55 * g.hB) / 256;
    if (!this.npat || !this.setLight(tw, tw * 0.24, F.t * 9 * this.k - F.dr * 120, F.Yw)) return;
    this.fillLight(ctx, 'lighter', b < 0 ? 0.7 : 0.22, () => ctx.fill());
  }
  // the part of the band between the bottle and the front glass, drawn again over the bottle's width
  frontBand(ctx) {
    const { F } = this;
    if (Math.abs(F.band) < 0.6 || F.wet !== 0.5) return;
    const half = this.box.w / 2 + 3, x0 = F.bx - half, x1 = F.bx + half, n = 14;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); if (i) ctx.lineTo(x, this.cutAt(x)); else ctx.moveTo(x, this.cutAt(x)); }
    for (let i = n; i >= 0; i--) { const x = lerp(x0, x1, i / n); ctx.lineTo(x, this.yAt(x)); }
    ctx.closePath();
    ctx.fillStyle = this.bandFill(ctx, F.band); ctx.fill();
    this.bandLight(ctx, F.band);
  }

  // ---- the meniscus: the bright line where the surface meets the front glass, with glints ----
  meniscus(ctx, x0, x1) {
    const F = this.F;
    if (F.Yw < -20 || x1 <= x0) return;
    const k = this.k, below = F.band < 0;
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    // the meniscus has a body: the bright line where it catches the light, and just under it a darker one (its curve
    // turns away from the light)
    const lw = Math.max(1, 1.5 * Math.min(1.4, k));
    ctx.save();
    ctx.translate(0, lw * 0.9);
    ctx.lineWidth = lw * 0.9;
    ctx.strokeStyle = 'rgba(96, 18, 9, 0.55)';
    ctx.beginPath(); this.surfacePath(ctx, x0, x1); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = lw;
    ctx.strokeStyle = below ? 'rgba(255, 226, 214, 0.95)' : 'rgba(255, 200, 182, 0.88)';
    ctx.beginPath(); this.surfacePath(ctx, x0, x1); ctx.stroke();
    // glints: brighter short stretches that travel along the line with the small waves
    ctx.strokeStyle = 'rgba(255, 249, 245, 0.95)';
    ctx.lineWidth = Math.max(1.2, 2 * Math.min(1.3, k));
    ctx.beginPath();
    const sp = 22 * k + 8, ph = F.t * 21 * k - F.dr * 220;
    for (let x = x0 + (((ph % sp) + sp) % sp) - sp; x < x1; x += sp) {
      const q = hash(Math.floor((x - ph) / sp) * 7 + 3);
      if (q < 0.62) continue;
      const L = (2 + (10 * (q - 0.62)) / 0.38) * k;
      const xa = Math.max(x0, x), xb = Math.min(x1, x + L);
      if (xb <= xa) continue;
      ctx.moveTo(xa, this.yAt(xa) - 0.2); ctx.lineTo(xb, this.yAt(xb) - 0.2);
    }
    ctx.stroke();
  }

  // ---- the bottle, 2D: dry above the waterline, seen through the water below it, the light on the wet part ----
  place(ctx, img, dy = 0) {
    const { F, box, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(F.bx, F.mid + dy);
    ctx.rotate(-F.rot);
    ctx.drawImage(img, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // clip to the region below (below = true) or above the waterline, over the bottle's width
  cutClip(ctx, below) {
    const { F, g } = this;
    const half = this.box.w / 2 + g.hB * 0.12, x0 = F.bx - half, x1 = F.bx + half, n = 16;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); if (i) ctx.lineTo(x, this.cutAt(x)); else ctx.moveTo(x, this.cutAt(x)); }
    const yb = below ? this.h + 40 : -40 - g.hB;
    ctx.lineTo(x1, yb); ctx.lineTo(x0, yb); ctx.closePath();
    ctx.clip();
  }
  drawBottle2D(ctx) {
    const { F } = this;
    if (!this.dryOK || F.b.y < -4) return;
    if (!F.wet) { this.place(ctx, this.dry); return; }
    if (F.wet < 1) { ctx.save(); this.cutClip(ctx, false); this.place(ctx, this.dry); ctx.restore(); }
    ctx.save();
    if (F.wet < 1) this.cutClip(ctx, true);
    // seen from above, what is under the water looks a little higher than it is (refraction): a small step at the line
    const lift = F.wet < 1 ? -clamp(F.se / 0.12, 0, 1) * 2.2 * this.k : 0;
    this.place(ctx, this.wet, lift);
    this.bottleLight(ctx, lift, 'lighter', 0.34);
    ctx.restore();
  }
  // the caustic light on the bottle: the pattern, cut to the bottle's outline, then added (2D) or laid over (3D)
  bottleLight(ctx, lift, op, alpha) {
    const { F, box, dpr } = this;
    if (!this.npat) return;
    const bw = this.bw, bh = this.bh, ox = F.bx - bw / 2, oy = F.mid + lift - bh / 2;
    const x = this.bfxX;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.placeLight(-ox + 31 * this.k, -oy - 17 * this.k, 0.86);
    this.fillLight(x, 'copy', 1, () => x.fillRect(0, 0, bw, bh));
    x.globalCompositeOperation = 'destination-in';
    if (this.gl3d) { x.translate(-ox, -oy); this.silPath(x); x.fillStyle = '#fff'; x.fill(); }
    else { x.translate(bw / 2, bh / 2); x.rotate(-F.rot); x.drawImage(this.dry, -box.w / 2, -box.h / 2, box.w, box.h); }
    x.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha * (1 - 0.35 * F.hold);
    ctx.drawImage(this.bfx, ox, oy, bw, bh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- in front of the bottle: the near surface across it, the bubbles in front, the near half of the splash ----
  frontPass(ctx, wx0, wx1) {
    const { F } = this;
    const S = this.splash, dpr = this.dpr;
    this.frontBand(ctx);
    S.drawBubbles(ctx, F, true, dpr, this.fine);
    this.drawIdleBubbles(ctx, true);
    if (S.on) {
      // the near half of the crown rises out of the water: nothing of it shows below the surface's near edge
      ctx.save();
      ctx.beginPath(); this.surfacePath(ctx, 0, this.w); ctx.lineTo(this.w, -60); ctx.lineTo(0, -60); ctx.closePath(); ctx.clip();
      if (this.dryOK && S.sheetOn()) {
        // the bottle seen through the curved sheet is bent by it: magnified across, as through a lens of water (in 3D the
        // packshot stands in for the WebGL bottle there: the same front view, its turn is over by now)
        ctx.save();
        S.sheetPath(ctx, F, true); ctx.clip('evenodd');
        ctx.translate(F.bx, F.mid); ctx.rotate(-F.rot); ctx.scale(1.075, 1.012);
        ctx.drawImage(this.dry, -this.box.w / 2, -this.box.h / 2 - this.g.hB * 0.006, this.box.w, this.box.h);
        ctx.restore();
      }
      S.drawSheet(ctx, F, true, S.sheetOn() ? this.sheetLight() : null);
      S.drawFingers(ctx, F, true, dpr);
      ctx.restore();
    }
    S.drawDrops(ctx, F, true, dpr, this.fine);
    if (this.gl3d) {
      const half = this.box.w / 2 + 6;
      this.meniscus(ctx, Math.max(wx0, F.bx - half), Math.min(wx1, F.bx + half));
    } else this.meniscus(ctx, wx0, wx1);
  }

  // ---- the front canvas (3D): the water on the WebGL bottle, then the front pass; the words cut out ----
  drawFront() {
    const ctx = this.fx, { w, g, F, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.front.width, this.front.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.frontOn = F.arr.line > 0.001 && F.q > TL.hit - 0.05;
    if (!this.frontOn) return;
    const a = F.arr.line, wx0 = g.cx - a * g.cx, wx1 = g.cx + a * (w - g.cx);
    if (F.wet && this.bottleOK) {
      ctx.save();
      if (F.wet < 1) this.cutClip(ctx, true);
      // the water's own colour over the bottle (its absorption is the mul canvas), and the light on it
      this.silPath(ctx);
      ctx.fillStyle = rgb(SINDOOR, VEIL * 1.4); ctx.fill();
      this.bottleLight(ctx, 0, 'source-over', 0.42);
      ctx.restore();
    }
    this.frontPass(ctx, wx0, wx1);
    // the words stand at the front of the tank: nothing in it is drawn over them
    if (this.wordMask && F.hold <= 0) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (const wd of g.words) {
        const dy = (1 - (wd.rise ? wd.rise() : 1)) * 1.1 * g.fs + (g.narrow ? 0 : this.bob(wd.cx));
        const sx = Math.max(0, Math.floor((wd.x0 - 8) * dpr)), sw = Math.min(this.wordMask.width - sx, Math.ceil((wd.x1 - wd.x0 + 16) * dpr));
        if (sw > 0) ctx.drawImage(this.wordMask, sx, 0, sw, this.wordMask.height, sx, Math.round(dy * dpr), sw, this.wordMask.height);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  // ---- the mul canvas (3D): the absorption over the bottle, inside its outline, below the waterline ----
  drawMul() {
    const ctx = this.mx, { F, dpr } = this;
    if (!ctx) return;
    const ox = F.bx - this.bw / 2, oy = F.mid - this.bh / 2;
    this.mulAt = [ox, oy];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.mulC.width, this.mulC.height);
    this.mulOn = !!(F.wet && this.bottleOK && this.frontOn);
    if (!this.mulOn) return;
    ctx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
    ctx.save();
    if (F.wet < 1) this.cutClip(ctx, true);
    this.silPath(ctx);
    ctx.fillStyle = ctx.strokeStyle = rgb(ABSORB);
    ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();                        // a hair over the outline, so no unabsorbed edge is left
    ctx.restore();
  }

  // ---- idle life on the clock: a few tiny bubbles rising in the tank now and then; in the hold, a thread of them
  // from the bottle's cap and the odd one from below. Index i is born at a fixed time, so the clock alone says where
  // each one is (and under ?test, with the clock still, they stand where they are). ----
  drawIdleBubbles(ctx, front) {
    const { F, g, h } = this, A = this.bubbles, dpr = this.dpr, k = this.k;
    const t = F.t;
    // in the tank (before the dive): one every second or so, from below the screen up to the surface
    const tank = 1 - ss(TL.hit, TL.hit + 0.05, F.q);
    if (tank > 0.01 && F.arr.line > 0.9) {
      const per = 1.1, life = 7;
      for (let i = Math.floor((t - life) / per); i <= Math.floor(t / per); i++) {
        if ((hash(i * 3 + 1) < 0.5) !== front) continue;
        const tb = i * per + 0.8 * hash(i), age = t - tb;
        if (age < 0 || age > life) continue;
        const x = g.margin + hash(i * 5 + 2) * (g.w - 2 * g.margin);
        if (Math.abs(x - g.cx) < this.R * 1.4) continue;
        const v = (0.045 + 0.04 * hash(i + 11)) * h, y = h + 10 - age * v;
        const r = (0.9 + 1.8 * hash(i * 7 + 4)) * k;
        if (y - r < this.yAt(x) + 2) continue;
        ctx.globalAlpha = tank;
        this.splash.sprite(ctx, A, x + 2.2 * k * Math.sin(age * 4 + i), y, r, 0, 0, dpr);
      }
      ctx.globalAlpha = 1;
    }
    // in the hold: a thread from the cap, and the odd one rising past from below
    if (F.hold > 0.01) {
      const per = 0.85, life = 6;
      for (let i = Math.floor((t - life) / per); i <= Math.floor(t / per); i++) {
        if ((hash(i * 3 + 7) < 0.45) !== front) continue;
        const tb = i * per + 0.6 * hash(i + 5), age = t - tb;
        if (age < 0 || age > life) continue;
        const fromCap = hash(i * 11 + 3) < 0.6;
        const x0 = fromCap ? F.bx + (hash(i + 21) - 0.5) * this.R * 0.6 : g.margin + hash(i * 13) * (g.w - 2 * g.margin);
        const y0 = fromCap ? F.base - g.hB - 2 : h + 12;
        const v = (fromCap ? 0.05 : 0.07 + 0.04 * hash(i + 2)) * h;
        const y = y0 - age * v * ss(0, 0.6, age + 0.3);
        if (y < -10) continue;
        const r = (fromCap ? 0.9 + 1.6 * hash(i * 7) : 1.2 + 2.6 * hash(i * 9)) * k;
        ctx.globalAlpha = F.hold * ss(0, 0.25, age);
        this.splash.sprite(ctx, A, x0 + 2.6 * k * Math.sin(age * 3.1 + i) * ss(0, 0.8, age), y, r, 0, 0, dpr);
      }
      ctx.globalAlpha = 1;
    }
  }
  // the idle droplet: a bead falling from the top edge, its ring, three small beads hopping off the surface
  drawIdleDrops(ctx) {
    const { F, k, dpr } = this;
    for (const e of F.ev) {
      if (e.type !== 'drop') continue;
      const t = e.tau;
      if (t < e.tL) {
        const y = e.y0 + 0.5 * e.gi * t * t;
        this.splash.sprite(ctx, this.drops, e.x, y, e.r, 0, e.gi * t * 1.6, dpr);
      } else {
        let a = e.seed >>> 0;
        const R = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; };
        const s = t - e.tL, base = this.yAt(e.x);
        for (let i = 0; i < 3; i++) {
          const vx = (R() * 2 - 1) * 70 * k, hgt = (8 + 9 * R()) * k, life = 0.36 + 0.16 * R(), r = (0.9 + 0.7 * R()) * k;
          if (s < life) { const q = s / life; this.splash.sprite(ctx, this.drops, e.x + vx * s, base - 2 * k - hgt * 4 * q * (1 - q), r, vx * 2, 0, dpr); }
        }
      }
    }
  }
}
