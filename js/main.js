// JALRANG — the shop (shop.html), Edition One. Start-up: the mode, the eases, the WebGL stage
// (mode-3d), smooth scroll, the worlds, the UI, then one ordered tick (B8.8):
//   lenis.raf → worlds.update() → chapters → stage.update() or stage2d.update() → GL.frame()
// The page (ARCH section 2, 16 Oct 2026): a calm first screen on Chuna (#top), then the ten colour
// worlds w01 → w10 from one template with one motion (the cut and repaint on arrival, one turn
// during the hold), then All ten, the Specification and the shared footer. The story chapters live
// on the landing (index.html); every "View details" goes to product.html?n=NN.
import { ENV, TEST, store, setMode, isNarrow, restartIf } from './core/env.js';
import { initDebug, counters } from './core/debug.js';
import { initWorlds, update as updateWorlds, updateChapters, targetY, state as WS, measure, onWhere, byId } from './core/worlds.js';
import { initJump, jumpTo, setJumpHook } from './core/jump.js';
import { initNav } from './core/nav.js';
import { sound } from './core/sound.js';
import { initStage2d, update as updateStage2d, lineOwner as lineOwner2d, setJumping as setJumping2d, fitPackshots, shape } from './stage/stage2d.js';
import { buildRun, initRun, layoutIntro } from './scenes/run.js';
import { buildTen, initTen } from './scenes/ten.js';
import { baselineOf, inkOf } from './core/ui.js';
import { initChrome } from './shop/chrome.js';

gsap.registerPlugin(ScrollTrigger, CustomEase);
// the eases (B11); `fall` is retired
CustomEase.create('flow', 'M0,0 C0.16,1 0.3,1 1,1');
CustomEase.create('tide', 'M0,0 C0.65,0 0.35,1 1,1');
CustomEase.create('settle', 'M0,0 C0.33,1 0.68,1 1,1');
gsap.defaults({ ease: 'flow', duration: 0.56 });
ScrollTrigger.config({ ignoreMobileResize: true });
const root = document.documentElement;

// the shared header, menu, toast and footer (js/shop/chrome.js), first, so the header paints at once
// and the footer is in the page before the worlds engine measures it. The worlds engine sets the
// header's ink and band from whatever lies under it.
const chrome = initChrome({
  page: 'shop', band: 'managed', menuWide: true,
  onSelf: () => jumpTo('top', 0),
  onMenu: () => sound.play('pour'),
});

// ---- mode-3d: the renderer and the stage (B1). three.js is loaded only in this mode. ----
// The renderer must start here; the bottle's shader build (the probe) runs while the first
// screen (no bottle) is shown. Either failing drops the page to '2d' for the rest of this visit.
let GLm = null, stage = null;
if (ENV.mode === '3d') {
  try {
    GLm = await import('./gl/core.js');
    GLm.GL.tier = ENV.tier;
    if (!GLm.initGL({ tick: false })) throw new Error('WebGL 2 would not start');
    stage = await import('./stage/stage.js');
    stage.initStage();
  } catch (e) {
    if (GLm) GLm.glLog('start: ' + (e && e.message));
    stage = null;
    store.session('gl', 'off');
    ENV.glOff = true; ENV.lite = 'failed';
    ENV.mode = '2d';
  }
}
setMode(ENV.mode);
const PARITY = stage ? stage.RUN_PARITY : '2d';
root.classList.toggle('parity-hybrid', PARITY === 'hybrid');
// the 2D stage serves mode-2d, and the rests and cuts of PARITY 'hybrid' (B9)
let use2d = ENV.mode === '2d' || PARITY === 'hybrid';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

initDebug();
// The page decides its mode once, at start. A window that becomes narrow, or stops being narrow
// (the four clauses of env.js NARROW: under 900 px wide, a portrait screen under 1100 px, under 520 px high,
// under 1180 × 640), starts again in the right mode:
// otherwise a wide screen would be left in the phone layout, or the reverse. So does a device that
// switches its wish for less motion while the page is open (unless the visitor has chosen for themselves).
// Never while a text field has focus (env.js restartIf): it waits for focus to leave.
(function rearm() {
  let t = null;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => restartIf(() => isNarrow() !== ENV.phone), 400);
  });
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const again = () => restartIf(() => !ENV.motionChoice && rm.matches !== ENV.systemReduce);
  if (rm.addEventListener) rm.addEventListener('change', again); else rm.addListener(again);
})();

// the first screen says why the page is calm or flat, and offers the full version (B12)
function explain() {
  const NOTE = {
    reduce: ['Your device asks for less motion, so this page is calm and still.', 'Show it with full motion', () => store.set('motion', 'full')],
    full: ['Full motion is on, although your device asks for less.', 'Make it calm', () => store.set('motion', null)],
    failed: ['The 3D could not start on this device, so the bottles are shown as photographs.', 'Try the 3D again', () => { store.session('gl', null); store.session('tier', null); }],
    webgl: ['This browser cannot draw 3D (WebGL 2), so the bottles are shown as photographs.'],
    data: ['Data Saver is on, so the page leaves out the 3D.'],
  };
  // a calm page the visitor asked for ("Make it calm") needs no note: it would say the device asked
  const key = ENV.systemReduce && ENV.motionChoice === 'full' ? 'full' : ENV.lite === 'reduce' && !ENV.systemReduce ? '' : ENV.lite;
  const n = NOTE[key];
  const box = document.getElementById('motionNote');
  if (!n || !box || TEST.mode || !box.hidden) return;
  box.querySelector('.note__text').textContent = n[0];
  const btn = box.querySelector('button');
  if (n[1]) { btn.textContent = n[1]; btn.addEventListener('click', () => { n[2](); location.reload(); }); } else btn.remove();
  box.hidden = false;
  root.classList.add('has-note');
}
explain();

// The 3D stops for the rest of this visit: the bottle becomes the two packshots. On the first
// screen this is invisible (it shows no bottle); the hold lengths change with the mode, so the
// tracks are measured again.
function fallTo2d(why) {
  if (!stage) return;
  GLm.glLog('step down to photographs: ' + why);
  store.session('gl', 'off');
  ENV.glOff = true; ENV.lite = 'failed';
  stage = null;
  GLm.GL.idle = true; GLm.frame();
  setMode('2d');
  root.classList.remove('parity-hybrid');
  use2d = true;
  initStage2d();
  fitGiant();
  measure();
  explain();
  window.__jal.mode = '2d'; window.__jal.PARITY = '2d'; window.__jal.lineOwner = lineOwner2d;
}
// a context that is lost and not given back within 2.5 s: the safe materials, then the photographs
if (stage) {
  const canvas = GLm.GL.renderer.domElement;
  let restored = false;
  canvas.addEventListener('webglcontextrestored', () => { restored = true; GLm.glLog('context restored'); GLm.invalidate(); });
  canvas.addEventListener('webglcontextlost', () => {
    restored = false;
    setTimeout(() => {
      if (restored) return;
      if (GLm.GL.tier === 'full') { store.session('tier', 'safe'); restartIf(() => !restored); } else fallTo2d('context lost');
    }, 2500);
  });
}

// The giant words share one baseline; their cap ink tops out at 12.2vh. Where the line box sits
// for that is a property of the font, so it is measured, never assumed (B3). With the display face at
// line-height 1.1 the line box starts just above its capitals (r is measured, below).
let giantAsc = 0.813;
async function measureGiant() {
  const g = document.querySelector('.giant');
  if (!g) return;
  const ink = await inkOf('Hdlk', g);
  const size = parseFloat(getComputedStyle(g).fontSize);
  if (!ink || !size) return;
  giantAsc = ink.ascent;
  const r = baselineOf(g) / size - ink.ascent;
  if (r > -0.2 && r < 0.5) root.style.setProperty('--giant-r', r.toFixed(4));
}
// One size for every giant word (B10.6): the largest, up to the CSS ceiling (min(33cqw, 40vh)), at
// which every word's ink, its hook or tail included, stays 72 px clear of each text block, proof
// frame or label that shares its x range. Each frame is measured where it is laid out; the
// smallest answer wins, so the words keep one size and one baseline from world to world.
const CLEAR = '.words, .proof__label, .proof__frame, .proof__cap, .clipwin, .honesty, .part, .unwrap__flat, .unwrap__caps';
let fitRun = 0;
async function fitGiant() {
  const run = ++fitRun;   // a resize that comes while this is still measuring starts a newer fit, and the older one stops
  const gs = ENV.phone ? [] : [...document.querySelectorAll('.frame .giant')].filter((g) => g.textContent.trim() && g.offsetParent !== null);
  if (!gs.length) { root.style.removeProperty('--t-giant'); return; }   // phone: the word stands alone above the stacked layout (CSS)
  // The ceiling is what the CSS gives with no fit. It is read with the fitted sizes taken off and put straight back (nothing is
  // painted in between, and the old fit stands until the new one is ready): a resize used to read the first word's own fitted size
  // as the ceiling, and left every other word at the CSS size, printed over its label (352 px at 1100 x 880 after the window grew
  // from 768 px high).
  const was = [root, ...gs].map((el) => el.style.getPropertyValue('--t-giant'));
  [root, ...gs].forEach((el) => el.style.removeProperty('--t-giant'));
  const ceiling = parseFloat(getComputedStyle(gs[0]).fontSize);
  [root, ...gs].forEach((el, i) => { if (was[i]) el.style.setProperty('--t-giant', was[i]); });
  const inkTop = 0.122 * innerHeight;
  let F = ceiling;
  for (const g of gs) {
    const frame = g.closest('.frame'), ink = await inkOf(g.textContent, g);
    if (run !== fitRun) return;
    if (!ink) continue;
    const fr = frame.getBoundingClientRect(), x0 = g.getBoundingClientRect().left - fr.left;
    const down = giantAsc + Math.max(0, ink.descent);
    const blocks = [...frame.querySelectorAll(CLEAR)].map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ top: r.top - fr.top, left: r.left - fr.left, right: r.right - fr.left }));
    for (let i = 0; i < 3; i++) {
      for (const b of blocks) {
        if (b.left >= x0 + ink.right * F || b.right <= x0 + ink.left * F) continue;
        const f = (b.top - 72 - inkTop) / down;
        if (f < F) { F = f; root.dataset.giantBy = frame.parentElement.id; }
      }
    }
  }
  if (F < ceiling - 0.5) root.style.setProperty('--t-giant', Math.max(52, F).toFixed(2) + 'px');   // Jaini never under 52 px
  else root.style.removeProperty('--t-giant');
  root.dataset.giant = Math.round(Math.min(F, ceiling));
  // Each word is then set to the column left of the bottle: its ink ends 24 px before the bottle's
  // body (half of it is 9.83vh either side of the middle), so no letter or dot ever peeks out on
  // the other side. Short words keep the common size; long ones step down to fit their column.
  // (the packshot that stands in for the 3D bottle in 2D and calm is a little wider: 10.85vh of half-width, its shadow included)
  const edge = document.documentElement.clientWidth / 2 - (ENV.gl ? 0.0983 : 0.1085) * innerHeight - 24;
  for (const g of gs) {
    const ink = await inkOf(g.textContent, g);
    if (run !== fitRun) return;
    if (!ink || !(ink.right > 0)) { g.style.removeProperty('--t-giant'); continue; }
    const x0 = g.getBoundingClientRect().left - g.closest('.frame').getBoundingClientRect().left;
    const fw = (edge - x0) / ink.right;
    if (fw < Math.min(F, ceiling) - 0.5) g.style.setProperty('--t-giant', Math.max(52, fw).toFixed(2) + 'px');
    else g.style.removeProperty('--t-giant');
  }
}
{ let t = 0; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { fitGiant(); layoutIntro(); }, 160); }); }

// ---- build, then start ----
buildRun();   // the ten worlds and the first screen's catalogue
buildTen();
// Lenis after the builds, so its first scroll limit already includes every section
let lenis = null;
if (!ENV.flow && window.Lenis) {   // without it (a script that did not load) the page scrolls natively, as the product page does
  // Scroll feel (19 Oct 2026, the same two numbers as the landing: js/landing/main.js has the reasoning):
  // lerp 0.075 is a time constant of 222 ms (it was 0.09, 185 ms) and wheelMultiplier 0.88 makes a wheel
  // notch 88 px; touch stays native. The shop has no per-chapter springs: its worlds are cut by the
  // scroll position itself (js/core/worlds.js), so Lenis is the only soft layer here.
  lenis = new Lenis({ lerp: TEST.on ? 1 : 0.12, wheelMultiplier: 1, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
}
initWorlds();
initJump(lenis);
// a covered jump holds the line (3D stage and 2D stage alike)
setJumpHook((on) => { if (stage) stage.setJumping(on); setJumping2d(on); });
// B10.5: the cap twists once when the edition just added is the bottle on screen (3D only)
addEventListener('jal:added', (e) => {
  const n = e.detail && e.detail.n, S = stage && stage.S;
  if (n && S && S.hero && S.hero.root.visible && S.skins.A === n && !S.skins.B && !S.edge) S.hero.twistCap();
});
initNav(lenis, chrome);
initRun();
initTen();
if (use2d && !ENV.flow) initStage2d();
else if (ENV.flow) { fitPackshots(); addEventListener('resize', fitPackshots); } // each section's own packshot (B9, B13)
// the first screen stays hidden (is-loading) until "Edition One" and the giant words are fitted with
// the real font (below), so its first paint is already its final size (FIX2, 16 Oct 2026)
sound.set(false);

// GPU prep: the first painting, every shader program (the probe), the ten small paintings
const prepared = stage
  ? stage.prepare().then((ok) => { if (!ok) fallTo2d('the bottle did not compile'); return ok; })
  : Promise.resolve(false);
// the big paintings are warmed at idle, once the visitor first moves
prepared.then((ok) => { if (ok && stage) stage.warm(); });
if (use2d) shape('01');

// ---- the one ordered tick ----
let waiters = [];
let tickFault = false;
function tick(t, deltaMS) {
  if (lenis) lenis.raf(t * 1000);
  // a frame that throws is logged once and skipped; the next one starts again (no console flood, no frozen page)
  try {
    updateWorlds();
    updateChapters();
    if (stage) { GLm.tickGL(t, deltaMS); stage.update(); }
    if (use2d) updateStage2d();
    if (stage) GLm.frame(deltaMS);
    counters.frames++;
  } catch (e) { if (!tickFault) { tickFault = true; console.error('JALRANG: a frame failed, the page carries on.', e); } }
  if (waiters.length) waiters = waiters.filter((w) => (--w.n > 0 ? true : (w.res(), false)));
}
gsap.ticker.add(tick);
gsap.ticker.lagSmoothing(0);
const frames = (n = 3) => new Promise((res) => waiters.push({ n, res }));

// test hooks (F1): __jal.go(id, p) and ?at=<id>:<p>; html[data-ready="1"] when the frame is complete
function go(id, p = 0) {
  measure();
  const y = targetY(id, p);
  if (y != null) {
    if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: true, force: true }); }
    else window.scrollTo(0, y);
  }
  return frames(3);
}
window.__jal = {
  ...window.__jal,   // page, bag, account, fmt, chrome (chrome.js)
  ENV, W: WS, mode: ENV.mode, PARITY, go, jumpTo, lenis,
  lineOwner: stage ? stage.lineOwner : lineOwner2d,
  GL: GLm ? GLm.GL : null, S: stage ? stage.S : null,
};

// tests wait until the pictures in the frames on screen have decoded
function pictures() {
  const sel = [WS.cur, WS.prev].filter(Boolean).map((w) => w.el);
  const imgs = [...document.querySelectorAll('#stage2d img[src]'), ...sel.flatMap((el) => [...el.querySelectorAll('img[src]')])]
    .filter((im) => im.offsetParent !== null || im.closest('#stage2d'));
  const settled = (im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); }));
  const all = Promise.all(imgs.map((im) => settled(im).then(() => (im.decode ? im.decode().catch(() => {}) : null))));
  return Promise.race([all, new Promise((r) => setTimeout(r, 4000))]);
}
// ...and, in 3D, until the bottle wears the paintings it should and that frame has been drawn
async function goTest(id, p) {
  await go(id, p);
  await pictures();
  if (stage) await stage.settled();
  return frames(2);
}
window.__jal.go = goTest;

const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
fonts.then(async () => {
  try { await Promise.all([measureGiant(), layoutIntro()]); await fitGiant(); } finally { root.classList.remove('is-loading'); }
  if (ENV.flow) await fitPackshots(); // the phone places each bottle under its type: the real font's lines
  measure();
  if (ENV.test) await prepared;
  await frames(2);
  // a visit that names a world (shop.html#w06: from the landing, a product page's "Shop" crumb, or
  // Back from a product page) opens on that world, at rest, with no cut
  const want = !TEST.at && /^#(w(0[1-9]|10)|ten|spec)$/.test(location.hash) ? location.hash.slice(1) : null;
  if (TEST.at) await goTest(TEST.at.id, TEST.at.p);
  else if (want && (byId(want) || document.getElementById(want))) await goTest(want, want === 'ten' ? 1 : 0);
  else { await pictures(); if (stage) await stage.settled(); await frames(3); }
  // the address follows the world on screen, so Back from a product page returns to it
  let shown = location.hash;
  onWhere((w) => {
    const id = w.mid && w.mid.id;
    const h = !id || id === 'top' || id === 'siteFooter' ? '' : '#' + id;
    if (h === shown) return;
    shown = h;
    try { history.replaceState(history.state, '', location.pathname + location.search + h); } catch (e) { /* file:// */ }
  });
  root.dataset.ready = '1';
});
