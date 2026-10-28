// L1. The opening, "Jal meets Rang": one pinned film (the track is 190vh, 250vh on a phone; the stage is pinned), on real physics.
// jal is water, rang is colour, and the name is told as it happens:
//   JAL    a glass tank of red water seen side on: the dark top of the surface, a bright meniscus line, light moving in
//          the water; JAL and RANG standing on the line (on a phone JALRANG whole across the top).
//   fall   the first scroll lets the bottle go (TL.arm). It falls from above the screen under gravity (hero-phys.js: air drag, a
//          small lean, one turn about its axis so the painting is seen all the way round), by itself, on a clock of real time
//          (slowed by PHYS.slow, a cinematic factor), whether or not the visitor keeps scrolling.
//   splash it goes in at the speed it arrived with: added mass, slamming drag, buoyancy; the surface is pushed down round it, a
//          crown of thin red sheets rises and breaks into fingers and beads, hundreds of droplets fly on true arcs, mist hangs,
//          rings run out. The impact speed sets the splash's size (hero-splash.js).
//   dive   the bottle keeps sinking (a little denser than water) and the camera follows it down by a critically damped spring, so
//          the bottle plunges a little past its mark and the camera settles on it; the surface, with what is left of the splash,
//          rises up the screen and leaves it; when the cap goes under, the surface closes over it and a jet shoots up; the air
//          that went down with the bottle streams up past it as bubbles; the red settles to flat Sindoor. The scroll only closes
//          the camera's lag (TL.dive), never goes past the bottle.
//   RANG   the bottle floats freely in Sindoor water, rolling and bobbing very slightly on its own clock; the label, the claim and the
//          sentence are set once the dive is done and the scroll has reached them (TL.words).
// The physics is integrated once (hero-phys.js simulate()) into a table of states by time, so the picture at a time is a lookup:
// the playback is the same on 60 and 120 Hz screens, and a test frame at a time is exact. The film's clock S.T (film seconds since
// the release) runs only while the stage is on screen and the tab is visible, and stops when the film is over; back at the very top
// of the page the drop is armed again. The idle droplets, the pointer's ripples and idle life (the sway, the drift of the light) run on
// the clock S.t as before; under ?test the clock S.t stands still and the film's time is given (S.Tset, __jal.hero.setT, or a fixed
// map from p).
//   3D   the bottle is js/gl/bottle.js in the shared canvas (z 30); what the water does to it is drawn over it: its
//        absorption on a small multiply canvas (z 31), the veil, the light and the near half of the splash on the front
//        canvas (z 31). No clip plane: the waterline crosses the bottle on those canvases.
//   2D   (a phone, no WebGL) the packshot is drawn into the back canvas, dry above the waterline and seen through the
//        water below it; one canvas does everything. It does not turn.
//   calm (reduced motion) no film: Kajal, the line, JAL | RANG, the bottle standing, the claim; no canvas.
import { ENV, store } from '../core/env.js';
import { inkOf, baselineOf } from '../core/ui.js';
import { L } from './state.js';
import { TL, ss, lerp, swayAt } from './hero-film.js';
import { simulate, frameAt } from './hero-phys.js';
import { HeroFX, PROFILE } from './hero-fx.js';

const root = document.documentElement;
const RIM = 0.0155;       // the 3D bottle's visible bottom lies this share of its height below its base centre (perspective)
const KAJAL = { text: '#F7F2E8', ground: '#1A1612' };
const SINDOOR = { text: '#F7F2E8', ground: '#C3361D' };

export function initIntro() {
  const sec = document.getElementById('intro');
  const stage = document.getElementById('introStage');
  const $ = (s) => stage.querySelector(s);
  const back = $('.intro__fx');
  const words = [...stage.querySelectorAll('.intro__w')];
  const masks = words.map((w) => w.querySelector('.intro__mask'));
  const inner = words.map((w) => w.querySelector('.intro__word'));
  const claimBlock = $('.intro__words'), label = claimBlock.querySelector('.t-label'), claim = $('.intro__claim');
  const body = $('.intro__body'), cap = $('.intro__cap'), cue = $('.intro__cue');
  const pkwrap = $('.intro__pkwrap'), pk = $('.intro__pk');
  const bhit = $('.bhit');
  const reveal = [label, claim, body, cap];

  const motion = !L.calm && !ENV.test && !!window.gsap;
  // The 2D layer's rungs, the lowest first: the canvases' pixel ratio (at most) and whether the costly extras are drawn
  // (mist, the finest spray, every other bubble of the plume). Slow frames take it down one rung at a time (watch below),
  // and a rung given up stays given up for the visit (sessionStorage), as in the 3D layer (js/gl/core.js). Never below a
  // ratio of 1: canvases drawn smaller and scaled up made the first raster of the chapter after the film twice as long
  // (software GL at CPU 4x: 460 ms against 210).
  const RUNGS = [{ dpr: 1, fine: false }, { dpr: 1, fine: true }, { dpr: 1.5, fine: true }];
  const hq = parseInt(store.session('hero'), 10);
  const S = {
    hq: hq >= 0 && hq < 2 && !ENV.test ? hq : 2, fam: '',
    p: 0, g: null, G: null, sc: null, gl: false, lined: false, started: false,
    arr: { line: motion ? 0 : 1, jal: motion ? 0 : 1, rang: motion ? 0 : 1, cue: motion ? 0 : 1 },
    nextDrop: 0, ptrAt: 0, hit: false,
    sim: null, film: { b: {} }, armed: false, warmed: 0, raw: 0, pPrev: 0, rewindUntil: 0, pace: 1, paced: false, lastNow: 0, frameNo: 0, Tdrawn: -1, T: 0, Tset: null, pw: 0, last: 0, dt: 0,   // the bottle's physics, this frame's state, the film's clock (film seconds since release)
    t: 0, t0: performance.now() / 1000,     // the clock (seconds); under ?test it is S.t and stands still
  };
  const clock = () => (motion ? performance.now() / 1000 - S.t0 : S.t);
  if (ENV.test) stage.classList.add('is-test');

  // ---- the canvases (not in the calm page) ----
  let fx = null, fg = null, mul = null;
  if (!L.calm) {
    const fixed = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c); return c; };
    mul = fixed('intro__mul');
    fg = fixed('intro__fg');
    fx = new HeroFX(back, fg, mul);
    fx.testing = ENV.test;
    fx.pack = pk;
    // the packshot is drawn into the canvas once it is decoded (off the main thread)
    const take = () => fx.setPack(pk);
    if (pk.complete && pk.naturalWidth) (pk.decode ? pk.decode().catch(() => {}) : Promise.resolve()).then(take);
    else pk.addEventListener('load', () => (pk.decode ? pk.decode().catch(() => {}) : Promise.resolve()).then(take), { once: true });
  }

  // ---- layout: JAL | RANG standing on the line (from the real glyphs' ink), the bottle's boxes ----
  async function layout() {
    const cs = getComputedStyle(stage);
    const margin = parseFloat(cs.getPropertyValue('--margin')) || 72;
    const navH = parseFloat(cs.getPropertyValue('--nav-h')) || 72;
    const w = stage.clientWidth, h = stage.clientHeight;
    const narrow = root.classList.contains('is-narrow');
    const Wc = w - 2 * margin;
    const REF = 100;
    inner.forEach((el) => { el.style.fontSize = REF + 'px'; });
    // the glyphs' own ink; where it cannot be read (the font file did not arrive, so the words are set in the
    // fallback face) the line box stands in for it, and the film runs all the same
    const glyphs = async (text, el) => (await inkOf(text, el)) || { left: 0, right: el.getBoundingClientRect().width / REF, ascent: 0.75, descent: 0.12 };
    const [i1, i2] = await Promise.all([glyphs('JAL', inner[0]), glyphs('RANG', inner[1])]);
    const adv1 = inner[0].getBoundingClientRect().width / REF;        // JAL's advance, in em
    const geo = L.geo(h, 'intro');                                     // base: the line (the bottle's visible bottom), cap: its top
    const line = geo.base, capTop = geo.cap, hB = line - capTop;
    const bw = bodyW(hB);                                              // the bottle's body width
    let F, x1, x2, baseline;
    if (narrow) {
      // the phone: JALRANG whole across the top, margin to margin
      F = Math.min(Wc / (adv1 + i2.right - i1.left), 0.2 * h);
      x1 = margin - i1.left * F; x2 = x1 + adv1 * F;
      baseline = navH + 0.03 * h + Math.max(i1.ascent, i2.ascent) * F;
    } else {
      // wide: JAL's ink ends a clear space left of the bottle, RANG's starts the same space right of it;
      // the size is the largest at which RANG (the longer word) ends on the right margin
      const half = bw / 2 + Math.max(76, 0.058 * Wc);
      const room = Wc / 2 - half;
      F = Math.min(room / (i2.right - i2.left), room / (i1.right - i1.left), 0.4 * h);
      x1 = margin + Wc / 2 - half - i1.right * F;
      x2 = margin + Wc / 2 + half - i2.left * F;
      baseline = line;
    }
    inner.forEach((el) => { el.style.fontSize = F.toFixed(2) + 'px'; });
    const bOff = baselineOf(inner[0]);
    const put = (k, xo, ink) => {
      const padX = 0.1 * F;
      const left = xo + ink.left * F - padX, right = xo + ink.right * F + padX;
      const top = baseline - ink.ascent * F - 0.05 * F, bottom = baseline + ink.descent * F + 0.012 * F + 1;
      masks[k].style.cssText = `left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;width:${(right - left).toFixed(2)}px;height:${(bottom - top).toFixed(2)}px`;
      inner[k].style.left = (xo - left).toFixed(2) + 'px';
      inner[k].style.top = (baseline - bOff - top).toFixed(2) + 'px';
      return { text: k ? 'RANG' : 'JAL', x: xo, base: baseline, x0: xo + ink.left * F, x1: xo + ink.right * F, cx: xo + ((ink.left + ink.right) / 2) * F, hw: ((ink.right - ink.left) / 2) * F, rise: () => (k ? S.arr.rang : S.arr.jal) };
    };
    const wd = [put(0, x1, i1), put(1, x2, i2)];
    stage.style.setProperty('--line', line.toFixed(1) + 'px');
    stage.style.setProperty('--mark-b', (baseline + Math.max(i1.descent, i2.descent) * F).toFixed(1) + 'px');
    // the bottle's boxes: the 2D packshot (calm, and until the canvas has it) and the cursor's hit box
    L.packshot(pk, h, 'intro');
    const bwHit = bw * 1.12;
    bhit.style.cssText = `left:${(w / 2 - bwHit / 2).toFixed(1)}px;top:${capTop.toFixed(1)}px;width:${bwHit.toFixed(1)}px;height:${hB.toFixed(1)}px`;
    const g = { w, h, line, margin, cx: w / 2, bw, hB, capTop, rim: RIM * hB, narrow, fs: F, clear: narrow ? (w / 2 - bw / 2) * 0.7 : Math.max(76, 0.058 * Wc), capH: Math.max(i1.ascent, i2.ascent) * F, words: wd, gapHalf: narrow ? bw : Math.max(76, 0.058 * Wc) + bw / 2 };
    S.g = g;
    g.sim = S.sim = simulate(g);
    if (fx) {
      S.fam = getComputedStyle(inner[0]).fontFamily;
      fx.fine = RUNGS[S.hq].fine;
      fx.resize(w, h, dprOf(RUNGS[S.hq]));
      fx.setGeometry(g, S.fam);
      dom(S.p);
    }
  }
  const dprOf = (r) => Math.min(window.devicePixelRatio || 1, r.dpr);
  // the bottle's body width, for the words' gap and the hit box: the packshot's, or the 3D bottle's (its radius is 0.38 of
  // its 2.72 units). The water measures the bottle it actually draws (hero-fx.js setGeometry).
  const bodyW = (hB) => hB * (L.gl ? (2 * 0.38) / 2.72 : 0.302);

  // ---- slow frames: the mean time from one frame that drew the film to the next, over 30 ms once the page has settled (2 s of
  // drawing, and 2.5 s after the last step), takes the layer down a rung (2 s of drawing: since 21 Oct 2026 the film is a one-off of about 7 s on a real-time clock, so a slow screen must be given the cheaper drawing within the film; it was 4 s while the film followed the scroll all along a 520vh track); a rung that would change neither the ratio nor the extras
  // is skipped. Only two film frames in a row are timed: any frame between them that drew only the idle life (24 a second by
  // design) or nothing (a pause in the scrolling), the chapter out of view and a hidden tab all start the timing again. So a long
  // gap is a slow frame, never a pause: it counts as 250 ms (the film drawn at four frames a second or fewer is slow, however
  // slow; one stall alone, a shader build, moves the mean too little to take a step). ----
  let lastDraw = 0, avg = 16.7, calm = 0, since = 0;
  document.addEventListener('visibilitychange', () => { lastDraw = 0; });
  function watch(now, drew) {
    if (!drew || !fx.film || document.hidden) { lastDraw = 0; return; }
    const dt = lastDraw ? Math.min(250, (now - lastDraw) * 1000) : 0;
    lastDraw = now;
    if (!dt || ENV.test || S.hq === 0) return;
    avg += (dt - avg) * 0.05; calm += dt; since += dt;
    if (calm < 2000 || since < 2500 || avg <= 30) return;
    since = 0;
    const cur = RUNGS[S.hq];
    do { S.hq--; } while (S.hq > 0 && dprOf(RUNGS[S.hq]) >= dprOf(cur) && RUNGS[S.hq].fine === cur.fine);
    store.session('hero', String(S.hq));
    if (S.g) {
      fx.fine = RUNGS[S.hq].fine;
      fx.resize(S.g.w, S.g.h, dprOf(RUNGS[S.hq]));
      fx.setGeometry(S.g, S.fam);
      dom(S.p);
    }
  }

  // ---- the arrival (time, once). main.js calls lineIn() as soon as the real font has been measured and play() once the
  // 3D bottle is ready (at most 2.5 s later), so the words and the cue never arrive over a shader build:
  // the line draws out from the middle with the water under it, then JAL and RANG rise out of the line ----
  function lineIn() {
    if (S.lined) return;
    S.lined = true;
    if (motion) gsap.to(S.arr, { line: 1, duration: 1.05, ease: 'flow' });
  }
  function play() {
    if (S.started) return;
    lineIn();
    S.started = true;
    if (!motion) return;
    gsap.to(S.arr, { jal: 1, duration: 1.0, ease: 'flow', delay: 0.1 });
    gsap.to(S.arr, { rang: 1, duration: 1.0, ease: 'flow', delay: 0.24 });
    gsap.to(S.arr, { cue: 1, duration: 0.7, ease: 'tide', delay: 1.0 });
    // the caustic footage comes once the page has said it is ready (never on its critical path), in an idle moment; the
    // procedural light stands in until then (Data Saver: the procedural light only)
    if (!ENV.saveData && fx) {
      const go = () => setTimeout(() => fx.caustic.load(), 150);
      if (root.dataset.ready === '1') go();
      else {
        const mo = new MutationObserver(() => { if (root.dataset.ready === '1') { mo.disconnect(); go(); } });
        mo.observe(root, { attributes: true, attributeFilter: ['data-ready'] });
        setTimeout(() => { mo.disconnect(); go(); }, 6000);              // a page that never says so still gets its light
      }
    }
    S.nextDrop = clock() + 3.2;
  }
  if (fx && ENV.test) fx.caustic.load({ fast: true });

  // ---- idle (p < 0.02): a droplet now and then, and the pointer ruffling the line ----
  if (!L.calm && motion) {
    addEventListener('pointermove', (e) => {
      const g = S.g, now = clock();
      if (!g || !fx || S.p >= TL.idle || S.arr.line < 0.95 || now - S.ptrAt < 0.16) return;
      const r = stage.getBoundingClientRect();
      if (Math.abs(e.clientY - r.top - g.line) > 40) return;
      S.ptrAt = now;
      fx.addPing(now, e.clientX, 2.2);
    }, { passive: true });
  }

  // ---- the 3D scene ----
  function attach(G) {
    S.sc = G.makeScene(stage, { edition: '01', ground: '#1A1612' });
    S.sc.bottle.root.visible = false;               // unseen until its first pose (update()): never a bare, unplaced bottle
    S.G = G;
    S.cK = new G.T.Color('#1A1612'); S.cS = new G.T.Color('#7A1D0C');
  }

  // ---- one frame ----
  // a style is written only when it changes; the last value written is remembered (reading el.style back each frame, a
  // dozen times, cost more than the writes it saved)
  const was = new WeakMap();
  const set = (el, prop, v) => { let m = was.get(el); if (!m) was.set(el, (m = {})); if (m[prop] !== v) { m[prop] = v; el.style[prop] = v; } };
  const clipOf = (k) => (k >= 0.999 ? 'none' : k <= 0.001 ? 'inset(0% 0% 100% 0%)' : `inset(0% 0% ${((1 - k) * 100).toFixed(2)}% 0%)`);
  // everything the DOM shows that depends on p and on the arrival: the two words (rising out of the line, then
  // riding the water), the cue, the four text blocks (a straight clip, never a fade), the hit box.
  // It also runs once after the layout, so the first painted frame is already the arrival's first frame.
  function dom(p) {
    const g = S.g, F = fx.F;
    const bobbing = !g.narrow && F.maxUp > 0.02 && !(F.hold > 0);
    for (let i = 0; i < 2; i++) {
      const rise = i ? S.arr.rang : S.arr.jal;
      set(inner[i], 'transform', rise >= 0.9995 ? 'none' : `translate3d(0,${((1 - rise) * 1.1 * g.fs).toFixed(2)}px,0)`);
      set(words[i], 'translate', bobbing ? `0 ${fx.bob(g.words[i].cx).toFixed(2)}px` : 'none');
    }
    set(cue, 'clipPath', clipOf(S.arr.cue * (1 - ss(0, TL.cue, p)) * (1 - ss(0, 2 * TL.arm, S.raw))));     // the cue is gone as soon as the drop is let go
    const [a, z] = TL.words;
    const span = z - a;
    reveal.forEach((el, i) => {
      const s0 = a + (span * i) / (reveal.length + 1);
      set(el, 'clipPath', clipOf(ss(s0, s0 + span * 0.45, S.pw)));
    });
    const live = p >= TL.stand && S.film.c >= 1;
    if (live !== S.hit) { S.hit = live; bhit.style.pointerEvents = live ? 'auto' : 'none'; }
  }
  // ---- the film's clock. The drop is physics on real time (hero-phys.js): the first scroll past TL.arm lets the bottle go, and
  // from then on the clock runs by itself (only while the stage is on screen and the tab is visible), whether or not the visitor
  // scrolls; back at the very top the drop is armed again. Under ?test the time is given: S.Tset (film seconds), or a fixed
  // map from the scroll progress p (the old frames by p still mean the same moments: the impact at 0.36, the camera at its end at 0.72). ----
  const testT = (p) => {
    const s = S.sim, h = s.tHit / s.slow, c1 = s.tC1 / s.slow, e = s.tEnd / s.slow;
    if (p <= TL.arm) return 0;
    if (p <= 0.36) return (h * (p - TL.arm)) / (0.36 - TL.arm);          // the impact at p 0.36 (as the scrubbed film had it)
    if (p <= 0.72) return lerp(h, c1, (p - 0.36) / (0.72 - 0.36));      // the camera at its end at 0.72
    return lerp(c1, e, (p - 0.72) / 0.28);
  };
  function clockStep(p, raw, on) {
    const sim = S.sim;
    if (ENV.test) { S.T = S.Tset != null ? S.Tset : testT(p); return; }
    const now = performance.now() / 1000, dt = S.dt = Math.min(0.2, Math.max(0, now - S.last));
    S.last = now;
    const Tend = sim.tEnd / sim.slow, dp = p - S.pPrev;
    S.pPrev = p;
    if (!S.armed) { if (raw >= TL.arm) S.armed = true; else return; }
    // Scrolling back UP plays the film backwards: the film's time can be no later than the scroll says (it reaches 0 exactly at the very
    // top, where the drop is armed again), so the bottle rises out of the water and the splash folds back, never a cut. When the
    // visitor stops scrolling up it plays forward again (after a short grace), so nothing ever hangs.
    if (dp < -1e-4) S.rewindUntil = now + 0.35;
    if (raw < 0.002 || now < S.rewindUntil) S.T = Math.min(S.T, Tend * Math.max(0, Math.min(1, p / TL.stand)));
    else if (on && !document.hidden) S.T = Math.min(S.T + dt, Tend);
    if (raw < 0.002 && S.T <= 0.001) { S.armed = false; S.T = 0; S.pw = 0; }
  }
  // The first time the splash is drawn costs hundreds of milliseconds (the sprites go to the GPU, the GPU's programs are built, the paths and
  // gradients too), and in real time that would be a stutter at the very moment of the impact. So, on the first screen, once its arrival is
  // over, the splash's three stages are drawn on the canvases one stage a frame, and the first screen is drawn over each in the same frame:
  // nothing of it is ever presented.
  const WARM = [0.07, 0.2, 0.42];
  function warm(g, t) {
    const sim = S.sim, tmp = { b: {} };
    frameAt(sim, g, sim.tHit + WARM[S.warmed], 0, tmp);
    fx.render(tmp, t, S.arr);
    // a one-pixel snapshot of each canvas makes it run what was drawn on it now (otherwise the browser throws away what a later clear
    // covers, and the GPU's programs are first built at the impact all the same)
    if (window.createImageBitmap) for (const c of [fx.back, fx.front, fx.mulC]) if (c && c.width > 1) createImageBitmap(c, 0, 0, 1, 1).then((bm) => bm.close(), () => {});
    fx.sig = ''; fx.airTop = 0; lastDraw = 0;
    S.warmed++;
  }
  // the canvases over the bottle are fixed: while the stage scrolls away (or in) they go with it
  function trail(r) {
    const use3d = L.gl && S.gl && !!S.sc;
    const off = Math.abs(r.top) < 1.5 ? 0 : r.top;
    set(fg, 'visibility', use3d && fx.frontOn ? 'visible' : 'hidden');
    set(fg, 'transform', off ? `translate3d(0,${off.toFixed(1)}px,0)` : 'none');
    set(mul, 'visibility', use3d && fx.mulOn ? 'visible' : 'hidden');
    if (use3d && fx.mulOn) set(mul, 'transform', `translate3d(${fx.mulAt[0].toFixed(1)}px,${(fx.mulAt[1] + off).toFixed(1)}px,0)`);
  }
  // the screen's refresh rate, from the quickest of the first frames (a loaded page only makes frames longer): pace = how many screen
  // frames to one film frame, so that the film is drawn at about 72 a second or less
  const rate = [];
  function sense(now) {
    if (S.paced || rate.length > 70) return;
    if (S.lastNow) rate.push((now - S.lastNow) * 1000);
    S.lastNow = now;
    if (rate.length === 70) {
      rate.sort((a, b) => a - b);
      const ms = rate[Math.floor(rate.length * 0.2)];
      S.pace = Math.max(1, Math.round(1000 / ms / 72));
      S.paced = true;
    }
  }
  function update(p, on, _dt, raw) {
    S.p = p; S.raw = raw == null ? p : raw;
    if (L.calm) return;
    const g = S.g;
    if (!g || !fx) return;
    const r = stage.getBoundingClientRect();
    if (!on) { lastDraw = 0; S.last = performance.now() / 1000; set(fg, 'visibility', 'hidden'); set(mul, 'visibility', 'hidden'); return; }
    const now = performance.now() / 1000, t = clock();
    sense(now);
    clockStep(p, raw == null ? p : raw, on);
    const film = frameAt(S.sim, g, S.T * S.sim.slow, p, S.film);
    // the words wait for the camera's dive, then follow the scroll (a rate limit so they are never a pop)
    const target = film.c >= 0.999 ? p : Math.min(p, TL.words[0] - 0.001);
    if (ENV.test) S.pw = target;
    else { const step = 0.4 * S.dt; S.pw += Math.max(-step, Math.min(step, target - S.pw)); }
    // idle droplet: every 3 to 4 seconds, from the top edge into the gap, while the first screen is still
    if (motion && !S.armed && p < TL.idle && S.arr.line > 0.95 && !document.hidden && t > S.nextDrop && S.started) {
      const x = g.cx + (Math.random() * 2 - 1) * (g.gapHalf - 28);
      fx.addDrop(t, x);
      S.nextDrop = t + 3 + Math.random();
    }
    if ((S.armed || p >= TL.idle) && fx.live) fx.ev.length = 0;      // once the drop is let go the first screen's idle events are over
    // the 3D bottle, once it is ready (and while it lasts); until then, and after a lost context, the packshot
    const use3d = L.gl && S.gl && !!S.sc;
    if (S.warmed < WARM.length && S.started && !ENV.test && !S.armed && S.arr.cue >= 1 && use3d === fx.gl3d) warm(g, t);
    if (use3d !== fx.gl3d) {
      fx.gl3d = use3d;
      fx.w = 0;
      fx.resize(g.w, g.h, dprOf(RUNGS[S.hq]));
      fx.setGeometry(g, S.fam);
    }
    // FRAME PACING (21 Oct 2026, JJ: not smooth enough): on a fast screen (144 Hz) the film's frames cost 7 to 40 ms, so the frames arrive unevenly
    // (a 83 fps average that does not look smooth); drawn on every second screen frame they arrive evenly, at 72 a second. While the film
    // moves, the bottle and the water are drawn together on every S.pace-th frame (the bottle posed first: the water drawn over it
    // needs its outline for this very frame); the other frames only keep the canvases' places and the words.
    const moving = S.T !== S.Tdrawn;
    let draw = true;
    if (S.pace > 1 && moving && !ENV.test) { draw = (S.frameNo++ % S.pace) === 0; if (draw) S.Tdrawn = S.T; } else S.Tdrawn = S.T;
    if (!draw) { dom(p); trail(r); return; }
    // the WebGL bottle is posed first: the water drawn over it needs its outline on screen for this very frame
    if (use3d && !pose3d(film, t, g)) { lastDraw = 0; return; }
    watch(now, fx.render(film, t, S.arr));
    const F = fx.F;
    const b = F.b;

    trail(r);
    dom(p);

    // the bottle (in 3D it was posed above)
    if (!use3d) {
      // the canvas draws the packshot (dry above the water, seen through it below); the <img> stands in until it can
      set(pk, 'visibility', fx.dryOK ? 'hidden' : 'visible');
      if (!fx.dryOK) set(pk, 'transform', `translate3d(0,${(b.y - g.line).toFixed(2)}px,0) rotate(${(-b.tilt).toFixed(4)}rad)`);
      set(pkwrap, 'clipPath', 'none');
    }
  }

  // The WebGL bottle's pose, from the same numbers the 2D layer uses (hero-film.js: the path, the sway), and its outline on
  // the screen: its profile carried through the bottle's own transform (not its turn: it is round) and projected by the
  // 3D camera, with the front edges of its base and of its cap's top (seen from above and from below). false: off screen.
  function pose3d(film, t, g) {
    const G = S.G, sc = S.sc;
    set(pk, 'visibility', 'hidden');
    if (!G.measure(sc)) return false;
    const b = film.b, sw = swayAt(t, g, ss(TL.hold[0], TL.hold[1], film.c));
    const baseY = b.y + sw.dy, A = b.tilt + sw.rot;
    const f = G.fit(sc, sc.w / 2, g.line - g.rim, g.capTop);       // the base centre (the visible bottom is a little lower)
    const u = G.upp(sc);
    G.pose(sc, f, b.ry + sw.yaw, { dy: -(baseY - g.line) * u });
    const bt = sc.bottle;
    // the tilt and the roll turn it about its middle, so it falls along one vertical and floats about its centre
    const m = 0.5 * 2.72 * f.s;
    bt.root.rotation.z = A;
    bt.root.position.x += m * Math.sin(A) + sw.dx * u;
    bt.root.position.y += m * (1 - Math.cos(A));
    bt.setSkins('01', null);
    bt.root.visible = b.y > -8;
    G.planeOff(bt.planes.cut);                       // the water is drawn over it: never a clip
    sc.hemi.groundColor.lerpColors(S.cK, S.cS, ss(0.02, 1, film.c));    // the red world lights it from below
    G.changed(sc, film.q.toFixed(5) + '|' + film.cam.toFixed(2), baseY.toFixed(2), A.toFixed(5), sw.yaw.toFixed(5), sw.dx.toFixed(2), sc.w, sc.h);
    // its outline
    bt.root.updateMatrixWorld(true);
    const M = bt.root.matrixWorld, v = S.v3 || (S.v3 = new G.T.Vector3()), q = { x: 0, y: 0 }, out = [];
    const put = (x, y, z) => { v.set(x, y, z).applyMatrix4(M); G.project(sc, v, q); out.push(q.x, q.y); };
    // the base's front edge: the lower of its two rings (the corner and the foot) on each ray, so no steel rim shows under it
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1 - i / 10);
      put(0.372 * Math.cos(a), 0.014, 0.372 * Math.sin(a)); const y1 = out.pop(), x1 = out.pop();
      put(0.33 * Math.cos(a), 0, 0.33 * Math.sin(a)); const y2 = out.pop(), x2 = out.pop();
      if (y1 >= y2) out.push(x1, y1); else out.push(x2, y2);
    }
    for (const [r, y] of PROFILE) put(r, y, 0);
    for (let i = 0; i <= 8; i++) { const a = (Math.PI * i) / 8; put(0.243 * Math.cos(a), 2.71, 0.243 * Math.sin(a)); }
    for (let i = PROFILE.length - 1; i >= 0; i--) put(-PROFILE[i][0], PROFILE[i][1], 0);
    fx.sil = out;
    return true;
  }

  // the header takes Kajal while the screen is dark and Sindoor once the red covers it
  const tok = () => ((fx && fx.tokCam ? S.film.cam >= fx.tokCam : S.p >= 0.7) ? SINDOOR : KAJAL);

    // tests: wait until the caustic footage has arrived (it is the only thing the film loads)
  const ready = async () => { if (fx) { await fx.caustic.load({ fast: true }); fx.sig = ''; } return fx ? fx.caustic.n : 0; };
  // tests: setT(seconds) puts the film at a given time (film seconds since the release; under ?test only), setT(null) gives the clock back to p
  const setT = (sec) => { S.Tset = sec == null ? null : sec; if (fx) fx.sig = ''; };
  window.__jal = Object.assign(window.__jal || {}, { hero: { S, fx, ink: fx ? fx.caustic : null, caustic: fx ? fx.caustic : null, ready, rungs: RUNGS, setT } });

  return {
    id: 'intro', el: sec, stage, update, play, lineIn, attach, layout, tok, smooth: 0.3, maxV: 0.1,
    setGL(on) { S.gl = on; },
    settled: ready,
  };
}
