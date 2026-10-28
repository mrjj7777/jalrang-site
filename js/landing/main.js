// JALRANG — the landing (index.html): the brand story, before the shop.
//   L1 the opening · L2 A painting first · L3 the ten designs (the heart) · L4 Twenty-four hours ·
//   L5 Out in the world · L6 the shop part (the one way into shop.html) · L7 the shared footer.
// No prices, no add-to-bag and no "View details" here: the set line in L6 is information only.
//
// Every chapter but L6 is a sticky stage over a scroll track (its data-hold, in vh): the stage stays
// on screen while the track scrolls, and the chapter's one motion is driven by the track's progress
// p (0..1). One ordered tick: Lenis → the 3D clock → each chapter's update(p) → the header's ink and
// band → GL.frame(). Modes (state.js): '3d', '2d' (phone, or no WebGL) and 'calm' (reduced motion).
import { ENV, TEST, store, isNarrow, restartIf } from '../core/env.js';
import { EDITIONS } from '../editions.js';
import { initChrome, markReady, setLenis } from '../shop/chrome.js';
import { setInk } from '../core/ui.js';
import { L } from './state.js';
import { initIntro } from './intro.js';
import { initCraft } from './craft.js';
import { initTen } from './ten.js';
import { initHours } from './hours.js';
import { initWorld } from './world.js';
import { initRow } from './row.js';

const root = document.documentElement;
initChrome({ page: 'story', band: 'managed', onSelf: toTop });
if (window.gsap) { gsap.registerPlugin(ScrollTrigger); gsap.defaults({ ease: 'flow', duration: 0.56 }); }
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// the scroll tracks: each sticky chapter is its stage (100vh) plus its hold
// (data-hold-narrow: a phone or an upright tablet scrolls L3's 2D version, which shows only the part of
// each step a flat packshot shows, so its track is shorter; index.html)
document.querySelectorAll('.lx[data-hold]').forEach((el) => {
  if (!L.calm) el.style.setProperty('--hold', ENV.phone && el.dataset.holdNarrow ? el.dataset.holdNarrow : el.dataset.hold);
});

const intro = initIntro();
const craft = initCraft();
const ten = initTen();
const hours = initHours();
const world = initWorld();
const row = initRow();
const chapters = [intro, craft, ten, hours, world];

// ---- the 3D layer (mode 3d only). three.js is loaded only here. ----
let G = null;
async function startGL() {
  if (!L.gl) return false;
  try {
    G = await import('./gl.js');
    if (!G.start(ENV.tier)) throw new Error('WebGL 2 would not start');
    intro.attach(G); ten.attach(G); await hours.attach(G);
    const ok = await G.compileAll();
    if (!ok) throw new Error('the bottle did not compile: ' + G.GL.errors.slice(-2).join(' | '));
    intro.setGL(true);
    // A lost WebGL context (a GPU reset, memory pressure) is not given back to the bottles: the shared renderer
    // (js/gl/core.js) stops drawing for good, which would leave a hole where each bottle stood. From then on the
    // packshots take over, as after a failed start.
    document.getElementById('gl').addEventListener('webglcontextlost', toTwoD);
    return true;
  } catch (e) {
    if (G && G.glLog) G.glLog('landing: ' + (e && e.message));
    toTwoD();
    return false;
  }
}
// the 3D stops for this visit: the packshots take over everything
function toTwoD() {
  store.session('gl', 'off');
  L.gl = false; L.mode = '2d';
  root.classList.remove('lm-3d'); root.classList.add('lm-2d');
  if (G && G.GL && G.GL.views) G.GL.views.forEach((v) => { v.enabled = false; });
  if (G && G.GL && G.GL.renderer) { G.GL.idle = true; }
}
const glReady = startGL();

// ---- smooth scroll (wide screens with motion); the phone scrolls natively ----
// SCROLL FEEL (19 Oct 2026, JJ: "the design change is SPEEDY; make it real, premium, SLOW, so the scroll
// is very smooth"). Two soft layers, one clock, nothing else between the wheel and the picture:
//  1. Lenis, the wheel. lerp 0.075 (it was 0.1): Lenis closes a share lerp x 60 of the gap to its
//     target every second (exponential, whatever the frame rate), a time constant of 1 / (0.075 x 60) =
//     222 ms (it was 167 ms), so a wheel notch glides in. wheelMultiplier 0.88: a notch of 100 px asks
//     for 88 px, a little less than the page's own pace, a little more weight. Touch stays native
//     (syncTouch off, the default): a finger and the phone's own momentum are already smooth, and the
//     phone does not load Lenis here at all. The shop (js/main.js) uses the same two numbers.
//  2. smooth(), below: every chapter is given a progress that follows the track's real progress with a
//     critically damped spring (no overshoot, no jump in speed at the start or the end), mean lag
//     tau = c.smooth ?? 0.4 s, from the real frame time. It is the GSAP scrub: 1 feel, but exact in time:
//     the sticky stage stays where the browser puts it, only what the stage shows trails the wheel a
//     little, so a notch is eased in and eased out and a stage never moves by more than a few px a
//     frame. L3 asks for 0.45 s, L1 for 0.6 s. ?test and calm take tau = 0 (every screenshot is exact).
//  Together (computed at 60 fps): one wheel notch (88 px) takes the picture 10 % of the way after 0.25 s,
//  half way after 0.6 s and 90 % after 1.2 s (tau 0.45; 0.55 s and 1.1 s at the default 0.4); before, Lenis
//  alone took 0.12 s for half and 0.4 s for 90 %. At a steady scroll the picture trails the page by about
//  tau + 0.22 s, 0.65 s. Lenis and the springs run on ONE clock, `clock`, that advances by the frame's
//  real time but never by more than 50 ms, so a slow frame (a hitch, a hidden tab coming back) is
//  absorbed by both layers alike and nothing jumps; the two do not fight, because Lenis only moves the
//  scroll and the springs only read it, and both integrate exactly in the time they are given.
//  A rate limiter was considered and not added: the springs already keep the picture slower than the
//  wheel, a hard flick of 20 notches in 0.4 s moves the cloth at 4000 px/s at the most (it was 25000),
//  and the cloth's speed per px of scroll is bounded by its own numbers (cloth.js).
const LENIS_LERP = 0.12, LENIS_WHEEL = 1;     // 27 Oct 2026 (JJ: "scroll lag maar raha hai"): was 0.075 and 0.88, too floaty with the springs below
let lenis = null;
if (!L.calm && !ENV.phone && window.Lenis) {
  lenis = new Lenis({ lerp: ENV.test ? 1 : LENIS_LERP, wheelMultiplier: LENIS_WHEEL, autoRaf: false });
  if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
  setLenis(lenis);
}
window.scrollTo(0, 0);

// "Story" (the header, the menu, the footer) on this page goes back to the top. From far away it is one jump, not a
// glide: a glide of thirty screens would run the ten designs and their ten grounds past in a tenth of a second.
function toTop() {
  if (scrollY < innerHeight * 3 && !L.calm) { if (lenis) lenis.scrollTo(0, { force: true }); else scrollTo({ top: 0, behavior: 'smooth' }); return; }
  snapNext = true;
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true }); else scrollTo(0, 0);
}

// ---- progress of each chapter ----
function progress(c) {
  const r = c.el.getBoundingClientRect();
  const stageH = c.stage ? c.stage.offsetHeight : innerHeight;
  const span = r.height - stageH;
  const p = span > 0 ? Math.max(0, Math.min(1, -r.top / span)) : 0;
  return { p, on: r.bottom > 0 && r.top < innerHeight, r };
}

// ---- the chapters' progress, smoothed (SCROLL FEEL above) ----
const SMOOTH = 0.22;       // s: a chapter's default mean lag behind the track (c.smooth overrides it)
const JUMP = 0.35;         // a track progress that moves by more than this of a chapter in one frame is a jump
const SM = new Map();      // chapter → { x, v, raw, on }: the spring's position and speed, the last raw progress, was it on screen
let snapNext = true;       // the next tick takes every raw progress as it is (the first frame, go(), a resize)
function smooth(c, raw, on, dt) {
  let s = SM.get(c);
  if (!s) SM.set(c, s = { x: raw, v: 0, raw, on });
  const tau = L.calm || ENV.test ? 0 : (c.smooth ?? SMOOTH);
  const jumped = Math.abs(raw - s.raw) > JUMP, was = s.on;
  s.raw = raw; s.on = on;
  // no smoothing: tests and calm (tau 0); a chapter off screen (it is never seen catching up, so it is
  // always where the track is) and the first frame it is on screen again (a link, a restored scroll or
  // the scrollbar may have taken the page anywhere in it); a jump of more than 0.35 of the chapter in one
  // frame (End, the scrollbar); and a go()
  if (tau <= 0 || !on || !was || jumped || snapNext) { s.x = raw; s.v = 0; return raw; }
  // PHONE (20 Oct 2026, JJ: the design change is still speedy on his phone): a finger and the phone's own momentum can take
  // the page through a whole chapter in a second, and the spring above follows that at full speed. A chapter that
  // sets `maxV` (progress per second) gets, on a narrow screen, the same spring with a speed limit: a flick is eased
  // down to the chapter's own pace, a slow drag is followed as before.
  if (ENV.phone && c.maxV) return follow(s, raw, tau, dt, c.maxV);
  // critically damped spring, exact for any dt: u'' + 2w u' + w² u = 0 with w = 2 / tau (mean lag tau)
  const w = 2 / tau, e = Math.exp(-w * dt), u = s.x - raw, j = s.v + w * u;
  s.x = raw + (u + j * dt) * e;
  s.v = (s.v - w * j * dt) * e;
  if (Math.abs(s.x - raw) < 4e-6 && Math.abs(s.v) < 4e-5) { s.x = raw; s.v = 0; }   // settled: stop drawing
  return (s.x = Math.min(1, Math.max(0, s.x)));
}

// The speed-limited follower (SmoothDamp, after Game Programming Gems 4): a critically damped spring whose reach is
// capped at maxV x tau, so it settles into a steady glide at about maxV and eases in and out of it with no kink.
function follow(s, raw, tau, dt, maxV) {
  const w = 2 / tau, k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const reach = maxV * tau;
  const change = Math.max(-reach, Math.min(reach, s.x - raw));
  const tmp = (s.v + w * change) * dt;
  s.v = (s.v - w * tmp) * e;
  let out = s.x - change + (change + tmp) * e;
  if ((raw - s.x > 0) === (out > raw)) { out = raw; s.v = 0; }     // never past the target
  if (Math.abs(out - raw) < 4e-6 && Math.abs(s.v) < 4e-5) { out = raw; s.v = 0; }   // settled: stop drawing
  return (s.x = Math.min(1, Math.max(0, out)));
}

// ---- the header: its ink and band follow whatever lies under it ----
const TOK = {
  kajal: { text: '#F7F2E8', ground: '#1A1612' },
  chuna: { text: '#1A1612', ground: '#F7F2E8' },
};
const ed = (e) => ({ text: e.text, ground: e.ground });
const byId = Object.fromEntries(EDITIONS.map((e) => [e.n, e]));
const footer = document.getElementById('siteFooter');
let navSig = '';
// The logo and the links each take the ink of the ground under them: in the ten designs the colour
// line crosses the header, so the logo keeps the old edition's ink until the line has passed it.
const logoX = () => { const a = document.querySelector('.nav__lockup'); return a ? a.getBoundingClientRect().right : 220; };
// ... and each link on the right takes the ink of the ground under its own middle, so a link the line has not reached keeps
// the old ink and one it has passed takes the new (a dark word never stays on the next edition's dark ground)
let navLinks = null;
function header() {
  const y = 36;
  let tok = TOK.chuna, left = null, pinned = false, grain = false, links = null;
  const list = [
    [intro.el, () => (intro.tok ? intro.tok() : TOK.kajal), intro.stage],
    [craft.el, () => TOK.chuna, craft.stage, true],
    [ten.el, () => {
      if (L.calm) return ed(ten.inkAt());
      left = ed(ten.inkAt(logoX() + 8));
      if (!navLinks) navLinks = [...document.querySelectorAll('#siteHeader .nav__right > *')];
      links = navLinks.map((a) => { const r = a.getBoundingClientRect(); return ten.inkAt((r.left + r.right) / 2).text; });
      return ed(ten.inkAt(innerWidth - 220));
    }, ten.stage],
    [hours.el, () => TOK.kajal, hours.stage],
    [world.el, () => ed(byId['09']), world.stage],
    [row.el, () => TOK.chuna, null, true],
    [footer, () => TOK.kajal, null],
  ];
  for (const [el, get, stage, paper] of list) {
    const r = el.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) {
      tok = get();
      grain = !!paper;
      if (stage && !L.calm) { const s = stage.getBoundingClientRect(); pinned = Math.abs(s.top) < 1.5; }
      break;
    }
  }
  left = left || tok;
  const sig = `${tok.text}|${left.text}|${tok.ground}|${pinned}|${grain}|${links ? links.join() : ''}`;
  if (sig === navSig) return;
  navSig = sig;
  if (navLinks) navLinks.forEach((a, i) => { a.style.color = links ? links[i] : ''; });
  setInk('#siteHeader, .navband', '--nav-ink', tok.text);
  setInk('#siteHeader, .navband', '--nav-ink-l', left.text);
  setInk('#siteHeader, .navband', '--nav-ground', tok.ground);
  root.classList.toggle('nav-band', !pinned);
  root.classList.toggle('nav-grain', !pinned && grain);
}

// ---- pictures for later chapters load when their chapter is a screen or so away ----
const later = [...document.querySelectorAll('#landing img[data-src]')];
function near() {
  for (let i = later.length - 1; i >= 0; i--) {
    const im = later[i], sec = im.closest('.lx') || im;
    if (sec.getBoundingClientRect().top < innerHeight * 1.25) { im.src = im.dataset.src; later.splice(i, 1); }
  }
}
// The header's band is its own layer under the 3D canvas (z 25 < 30 < the header's 50), so a bottle
// scrolling up past the header is never sliced by the band; the header's words stay on top.
const band = document.createElement('div');
band.className = 'navband';
band.setAttribute('aria-hidden', 'true');
document.body.appendChild(band);

// ---- the one ordered tick ----
let waiters = [];
let warmedBig = 0;
let clock = 0;             // s: advances by the frame's real time, at most 50 ms a frame (Lenis and the springs share it)
// A step of the frame that throws is logged once, by name, and skipped on that frame; the other chapters, the header and
// the draw carry on, so one fault never freezes the page (or floods the console sixty times a second).
const faults = new Set();
const fault = (name, e) => { if (!faults.has(name)) { faults.add(name); console.error('JALRANG: ' + name + ' failed, the page carries on without it.', e); } };
function tick(t, deltaMS) {
  const dt = Math.min((deltaMS || 0) / 1000, 0.05);
  clock += dt;
  if (lenis) lenis.raf(clock * 1000);
  try { if (L.gl && G) G.tickGL(t, deltaMS); if (later.length) near(); } catch (e) { fault('clock', e); }
  for (const c of chapters) {
    try { const { p, on } = progress(c); c.raw = p; c.p = smooth(c, p, on, dt); c.update(c.p, on, dt, c.raw); } catch (e) { fault(c.id, e); }
  }
  snapNext = false;
  try { row.update(); } catch (e) { fault('row', e); }
  try { header(); } catch (e) { fault('header', e); }
  if (L.gl && G) {
    try {
      if (t - warmedBig > 0.5) { warmedBig = t; const r = ten.el.getBoundingClientRect(); if (r.top < innerHeight * 2 && r.bottom > -innerHeight) ten.warmBig(); }
      G.frame(deltaMS);
    } catch (e) { fault('draw', e); }
  }
  if (waiters.length) waiters = waiters.filter((w) => (--w.n > 0 ? true : (w.res(), false)));
}
// tickGL/frame live in core.js; gl.js re-exports what this file needs
if (window.gsap) { gsap.ticker.add(tick); gsap.ticker.lagSmoothing(0); }
const frames = (n = 3) => new Promise((res) => waiters.push({ n, res }));

// The page decides its mode once, at start (js/core/env.js). A window that becomes narrow, or stops being narrow (NARROW in
// env.js: a tablet turned on its side, a window made short), starts again in the right mode, as the shop does (js/main.js):
// otherwise the layout and the 3D would disagree (the bottle over the words of Twenty-four hours, a track of the wrong length).
// Never while a text field has focus (env.js restartIf waits for focus to leave): a soft keyboard can shrink a tablet's window
// while the Passport is being filled in, and the reload would lose what was typed.
{ let tm = 0; addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => restartIf(() => isNarrow() !== ENV.phone), 400); }); }
{
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const again = () => restartIf(() => !ENV.motionChoice && rm.matches !== ENV.systemReduce);   // only when the visitor has made no choice
  if (rm.addEventListener) rm.addEventListener('change', again); else rm.addListener(again);
}

// ---- layout (the real fonts) ----
async function layout() {
  await intro.layout();
  if (lenis) lenis.resize();
  snapNext = true;
}
{
  let tm = 0;
  const again = () => { clearTimeout(tm); tm = setTimeout(layout, 120); };
  addEventListener('resize', again);
  // A browser zoom that keeps the CSS size, or a window moved to a screen of another density, fires no resize, and the hero's
  // canvases take the pixel ratio in layout(): the ratio's own media query says so (it fires once, when the ratio stops
  // matching, and is armed again for the new one).
  if (matchMedia('all').addEventListener) {
    const arm = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { again(); arm(); }, { once: true });
    arm();
  }
}

// ---- test hooks: __jal.go(id, p) and ?at=<id>:<p> ----
const ALIAS = { l1: 'intro', l2: 'craft', l3: 'ten', l4: 'hours', l5: 'world', l6: 'shopPart', l7: 'siteFooter', footer: 'siteFooter', top: 'intro' };
function targetY(id, p) {
  const el = document.getElementById(ALIAS[id] || id);
  if (!el) return null;
  const top = el.getBoundingClientRect().top + scrollY;
  const c = chapters.find((x) => x.el === el);
  if (c && !L.calm) return top + p * (el.offsetHeight - c.stage.offsetHeight);
  return top + p * Math.max(0, el.offsetHeight - innerHeight);
}
async function pictures() {
  const imgs = [...document.querySelectorAll('#landing img')].filter((im) => {
    if (!im.getAttribute('src') || im.offsetParent === null) return false;
    const r = im.getBoundingClientRect();
    return r.bottom > -50 && r.top < innerHeight + 50;
  });
  imgs.forEach((im) => { im.loading = 'eager'; });
  const one = (im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); }))
    .then(() => (im.decode ? im.decode().catch(() => {}) : null));
  await Promise.race([Promise.all(imgs.map(one)), new Promise((r) => setTimeout(r, 6000))]);
}
async function go(id, p = 0) {
  snapNext = true;       // a jump: no spring, the chapters take the track's progress as it is
  const y = targetY(id, p);
  if (y != null) {
    if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: true, force: true }); } else window.scrollTo(0, y);
  }
  await frames(3);
  await pictures();
  if (ten.settled) await ten.settled();
  if (world.settled) await world.settled();
  if (L.gl && G) G.invalidate();
  await frames(4);
}
window.__jal = Object.assign(window.__jal || {}, {
  L, go, lenis, chapters: () => Object.fromEntries(chapters.map((c) => [c.id, +(c.p || 0).toFixed(4)])),
  raw: () => Object.fromEntries(chapters.map((c) => [c.id, +(c.raw || 0).toFixed(5)])),
  GL: () => (G ? G.GL : null),
});

// ---- start ----
const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
const ready = (async () => {
  await fonts;
  try { await layout(); } catch (e) { console.error('JALRANG: the opening could not be laid out.', e); }
  root.classList.remove('is-loading');   // the page is shown even if the measuring failed, never left hidden
  if (ENV.test) { await glReady; ten.warm(); }
  else {
    // the line draws at once; the wordmark, the bottle and the words arrive together when the 3D
    // bottle is ready (at most 2.5 s), so the first bottle seen is the one that turns
    intro.lineIn();
    if (L.gl) await Promise.race([glReady, new Promise((r) => setTimeout(r, 2500))]);
    intro.play();
    const evs = ['scroll', 'wheel', 'keydown', 'touchstart', 'pointerdown'];
    const once = () => { evs.forEach((ev) => removeEventListener(ev, once, true)); ten.warm(); };
    evs.forEach((ev) => addEventListener(ev, once, { capture: true, passive: true }));
  }
  intro.play();
  await frames(2);
  if (TEST.at) await go(TEST.at.id, TEST.at.p);
  else { await pictures(); await frames(3); }
})();
markReady(ready, glReady);
