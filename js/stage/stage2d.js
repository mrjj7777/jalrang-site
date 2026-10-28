// The 2D stage (B9): the bottle as two stacked packshots, A and B, in one fixed layer (z 30).
// It serves mode-2d (and later PARITY = 'hybrid'). Each packshot sits in a full-screen layer, and
// the layers are clipped in screen pixels, the same way the frames are, so the bottle splits on
// exactly the frame line.
//   repaint: A shows the world above the line, B the world below, clipped to below the line
//   cut-away (into #ten): A only, clipped to above the line
//   opening: B only, revealed below the line
// The ten photographs were made separately, so their bottles differ in size and position inside
// the image. Each one is measured from its own alpha and placed so its bottle fills the same box:
// cap top at 14vh, visible base edge at 86vh, centred, one body width. One steel bottle, ten skins.
import { state as WS } from '../core/worlds.js';
import { EDITIONS } from '../editions.js';
import { ENV } from '../core/env.js';
import { baselineOf, inkOf, alphaBox } from '../core/ui.js';

export const packshotURL = (n) => `assets/img/bottle-${n}.webp`;
const BOX = { top: 0.14, bottom: 0.86, aspect: 0.306 }; // aspect: body width over bottle height

// ---- the shape of each packshot ----
// The silhouette of each of the ten files: [width, height, left, right, top, bottom] in the file's own pixels, the box of the pixels
// whose alpha is above 96 (right and bottom are one past the last pixel). Read once from assets/img/bottle-NN.webp and kept here, so
// no page has to download, decode and scan ten pictures to place one of them (a phone fetched 1.2 MB for it and spent 0.4 s on it).
// A file that is not in this table is read from its pixels (scanShape); __jal.shapes.scan(n) does the same for a file that is, to check
// the table after a picture is replaced.
const SHAPES = {
  '01': [720, 971, 208, 514, 3, 967],
  '02': [720, 959, 215, 524, 2, 954],
  '03': [720, 973, 219, 507, 17, 962],
  '04': [720, 1023, 198, 492, 3, 1006],
  '05': [720, 967, 232, 515, 2, 965],
  '06': [720, 989, 217, 524, 2, 986],
  '07': [720, 980, 218, 542, 7, 978],
  '08': [720, 1024, 199, 493, 5, 1018],
  '09': [720, 973, 217, 512, 5, 962],
  '10': [720, 972, 219, 509, 7, 965],
};
const shapes = new Map();
export function scanShape(n) {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      const w = im.naturalWidth, h = im.naturalHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      let box;
      try { box = alphaBox(x.getImageData(0, 0, w, h).data, w, h); } catch (e) { res(null); return; }
      res(box ? { n, w, h, x0: box.left, x1: box.right + 1, y0: box.top, y1: box.bottom + 1 } : null);
    };
    im.onerror = () => res(null);
    im.src = packshotURL(n);
  });
}
export function shape(n) {
  if (shapes.has(n)) return shapes.get(n);
  const k = SHAPES[n];
  const p = k ? Promise.resolve({ n, w: k[0], h: k[1], x0: k[2], x1: k[3], y0: k[4], y1: k[5] }) : scanShape(n);
  shapes.set(n, p);
  return p;
}
window.__jal = Object.assign(window.__jal || {}, { shapes: { table: SHAPES, scan: scanShape } });
// a packshot fetched and decoded ahead of its first use, so swapping a layer to it never shows a blank frame
const warm = (n) => { const im = new Image(); im.decoding = 'async'; im.src = packshotURL(n); return im.decode ? im.decode().catch(() => {}) : null; };
// where the <img> goes so its bottle fills the box (screen px), and its scale on each axis
export function place(s, vh = innerHeight, cw = document.documentElement.clientWidth) {
  const H = (BOX.bottom - BOX.top) * vh, W = H * BOX.aspect;
  const sx = W / (s.x1 - s.x0), sy = H / (s.y1 - s.y0);
  return { sx, sy, width: s.w * sx, height: s.h * sy, left: cw / 2 - ((s.x0 + s.x1) / 2) * sx, top: BOX.top * vh - s.y0 * sy };
}

let el = null, A = null, B = null, VH = innerHeight;
const L = { a: { n: null, clip: null, on: null }, b: { n: null, clip: null, on: null } };

function fit(layer, n) {
  const img = layer.firstElementChild;
  shape(n).then((s) => {
    if (!s || layer.dataset.n !== n) return;
    const r = place(s);
    // whole-pixel position, so A and B rasterise the same image identically
    Object.assign(img.style, { left: Math.round(r.left) + 'px', top: Math.round(r.top) + 'px', width: r.width.toFixed(2) + 'px', height: r.height.toFixed(2) + 'px', transform: 'none' });
  });
}

// mode-flow: each section's own packshot takes the normalised place.
//   wide (reduced motion): the B9 box, as the stage does (frames are one screen tall, from x 0)
//   phone (B13): the bottle stands on its plinth with its cap clear of the type above it: 20 px
//     under the giant word's baseline (the caps' ink ends there), or 24 px under the hero mark's
//     lowest ink (the R's long tail); its visible base edge sits on the plinth's top ellipse, just
//     in front of its centre line, as on desktop (1.8 of the ellipse's 3.4vh half-height)
const setBox = (img, r) => Object.assign(img.style, { left: Math.round(r.left) + 'px', top: Math.round(r.top) + 'px', width: r.width.toFixed(2) + 'px', height: r.height.toFixed(2) + 'px', transform: 'none' });
async function phoneBox(frame, s) {
  const pl = frame.querySelector('.ground .plinth');
  if (!pl) return null;
  const half = 0.016 * innerHeight;   // the old plinth's top ellipse (3.2svh): the base line is unchanged
  const bottom = pl.offsetTop + half * 0.53;
  let top;
  const whole = frame.querySelector('.hero-mark .whole'), giant = frame.querySelector('.ground .giant');
  if (whole && whole.offsetParent) {
    const ink = await inkOf(whole.textContent, whole), size = parseFloat(getComputedStyle(whole).fontSize);
    top = whole.offsetTop + whole.offsetParent.offsetTop + baselineOf(whole) + Math.max(0, ink ? ink.descent : 0.2) * size + 24;
  } else if (giant && giant.offsetParent) {
    top = giant.offsetTop + baselineOf(giant) + 20;
  } else top = 0.15 * innerHeight;
  const H = bottom - top, W = H * BOX.aspect;
  const sx = W / (s.x1 - s.x0), sy = H / (s.y1 - s.y0);
  return { width: s.w * sx, height: s.h * sy, left: frame.clientWidth / 2 - ((s.x0 + s.x1) / 2) * sx, top: top - s.y0 * sy };
}
export function fitPackshots() {
  const jobs = [...document.querySelectorAll('.frame > img.packshot[data-src]')].map((img) => {
    const n = (img.dataset.src.match(/bottle-(\d\d)/) || [])[1];
    if (!n) return null;
    return shape(n).then(async (s) => {
      if (!s) return;
      const r = ENV.phone ? await phoneBox(img.closest('.frame'), s) : place(s);
      if (r) setBox(img, r);
    });
  });
  return Promise.all(jobs);
}

export function initStage2d() {
  el = document.getElementById('stage2d');
  if (!el) return;
  el.hidden = false;
  A = el.querySelector('.pk--a'); B = el.querySelector('.pk--b');
  addEventListener('resize', () => {
    VH = innerHeight;
    [A, B].forEach((layer) => { if (layer.dataset.n) fit(layer, layer.dataset.n); });
  });
  // the first two now, the rest at idle, nearest first
  warm('01'); warm('02');
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  EDITIONS.forEach((e, i) => setTimeout(() => idle(() => warm(e.n)), 300 + i * 120));
}

function set(layer, st, n, clip) {
  const on = !!n;
  if (st.on !== on) { st.on = on; layer.style.visibility = on ? 'visible' : 'hidden'; }
  if (!on) return;
  if (st.n !== n) {
    st.n = n; layer.dataset.n = n;
    layer.firstElementChild.src = packshotURL(n);
    fit(layer, n);
  }
  if (st.clip !== clip) { st.clip = clip; layer.style.clipPath = clip; }
}

// once per tick, after the worlds controller (B8.8)
export function update() {
  if (!A) return;
  const edge = WS.edge || local;
  // both layers always carry a clip (never 'none'), so they rasterise the same way
  const OPEN = 'inset(0px 0px 0px 0px)';
  let a = null, b = null, ac = OPEN, bc = OPEN;
  if (edge) {
    const y = edge.y;
    if (edge.above && edge.below) { a = edge.above; b = edge.below; bc = `inset(${y}px 0px 0px 0px)`; }
    else if (edge.above) { a = edge.above; ac = `inset(0px 0px ${VH - y}px 0px)`; }
    else if (edge.below) { b = edge.below; bc = `inset(${y}px 0px 0px 0px)`; }
  } else if (WS.owner) {
    a = WS.owner.n();
  }
  set(A, L.a, a, ac);
  set(B, L.b, b, bc);
}

// a local cut (the unwrap's Previous / Next, B10.12): refused while the scroll owns the line or
// a covered jump is under way (as the 3D stage's guard); clearing the line is always allowed
let local = null, jumping = false;
export const lineOwner = () => (WS.edge ? 'scroll' : local ? 'local' : jumping ? 'jump' : null);
export function setLocalEdge(edge) {
  if (edge && (WS.edge || jumping)) return false;
  local = edge || null;
  return true;
}
// jump.js's hook (through main.js): a covered jump holds the line while it runs
export function setJumping(on) { jumping = !!on; }
