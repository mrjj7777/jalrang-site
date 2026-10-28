// The worlds engine (B7). Every chapter is a fixed full-screen frame in its own colour. While the
// visitor scrolls 60 vh, the incoming frame is revealed under a dead-straight line that rises from
// the bottom of the screen to the top. Nothing in either frame moves; only the line does.
// In mode-flow there is no controller: sections sit in normal page flow and this module only
// reports which section is where (for the nav ink, the chapter label and the index).
import { ENV } from './env.js';
import { setOnScreen } from './state.js';
import { byN } from '../editions.js';
import { clamp, setInk } from './ui.js';

const W = [];                 // the worlds, in page order
const F = [];                 // in-flow sections after them (#spec, the footer)
const chapters = [];          // { w, def, last } chapter scenes that follow their world's progress
const whereFns = [];
const root = document.documentElement;
let VH = innerHeight, maxY = 0, measured = false, tenEndY = 0;

// read by stage2d.js, stage.js and every chapter: the line, who owns the bottle, hold progress
export const state = { edge: null, owner: null, p: 0, k: 1, cur: null, prev: null, s: 0, i: 0, where: null };
export const worlds = W;
export const byId = (id) => W.find((w) => w.id === id) || null;
export const worldOf = (el) => W.find((w) => w.el.contains(el)) || null;

const INK = {
  chuna: { ink: '#1A1612', ground: '#F7F2E8' },
  kajal: { ink: '#F7F2E8', ground: '#1A1612' },
};
const inkOf = (thing) => {
  if (!thing) return INK.chuna;
  const n = thing.n ? thing.n() : null;
  if (n) { const e = byN(n); return { ink: e.text, ground: e.ground }; }
  return INK[thing.ground] || INK.chuna;
};

class World {
  constructor(el, i) {
    this.el = el; this.i = i; this.id = el.id;
    this.frame = el.querySelector(':scope > .frame');
    this.over = el.querySelector(':scope > .over');
    this.isTen = el.id === 'ten';
    this.ground = el.dataset.ground || null;
    this.chapter = el.dataset.chapter || '';
    this.clip = null; this.pose = null;
    this.a = 0; this.b = 0; this.e = 0;
    this.media = [...el.querySelectorAll('img[data-src]:not(.packshot), video[data-poster]')];
    this.packshots = [...el.querySelectorAll('img.packshot[data-src]')];
    if (!ENV.flow) {
      if (this.frame) this.frame.style.zIndex = String(10 + i);
      if (this.over) this.over.style.zIndex = String(40 + i);
    }
  }
  // the edition this world shows (null for #ten); the unwrap's changes with its local cut
  n() { return this.isTen ? null : this.el.dataset.edition || null; }
}
class Flow {
  constructor(el) {
    this.el = el; this.id = el.id; this.ground = el.dataset.ground || 'chuna';
    this.chapter = el.dataset.chapter || ''; this.top = 0; this.bottom = 0; this.flow = true;
  }
  n() { return null; }
}

export function initWorlds() {
  document.querySelectorAll('main section.world').forEach((el, i) => W.push(new World(el, i)));
  document.querySelectorAll('[data-flow-section]').forEach((el) => F.push(new Flow(el)));
  if (ENV.flow) {
    // no cuts: every image is an ordinary lazy image, and each section shows its own packshot
    W.forEach((w) => [...w.media, ...w.packshots].forEach(load));
  }
  measure();
  let t = 0;
  const later = () => { clearTimeout(t); t = setTimeout(measure, 150); };
  addEventListener('resize', later);
  if (window.ResizeObserver) new ResizeObserver(later).observe(document.body);
  if (document.fonts) document.fonts.ready.then(measure);
  addEventListener('load', measure);
}

// track positions, in document px. a: the cut starts; b: the cut ends and the hold starts; e: the hold ends
export function measure() {
  VH = innerHeight;
  const s = scrollY;
  W.forEach((w) => {
    const cs = getComputedStyle(w.el);
    const cut = ENV.flow ? 0 : parseFloat(cs.getPropertyValue('--cut')) || 0;
    const hold = ENV.flow ? 0 : parseFloat(cs.getPropertyValue('--hold')) || 0;
    const r = w.el.getBoundingClientRect();
    w.a = r.top + s; w.b = w.a + cut * VH / 100; w.e = w.b + hold * VH / 100;
    w.top = w.a; w.bottom = r.bottom + s;
    if (w.isTen) tenEndY = w.bottom;
  });
  F.forEach((f) => { const r = f.el.getBoundingClientRect(); f.top = r.top + s; f.bottom = r.bottom + s; });
  maxY = Math.max(0, root.scrollHeight - VH);
  measured = true;
  update(true);
}

// where a jump to (id, p) lands, in document px (B10.11, F1)
//   world: p < 0 is progress of the cut into it (-1 start, -0.5 mid), 0..1 is hold progress
//   in-flow section: p is the share of the section scrolled
export function targetY(id, p = 0) {
  if (!measured) measure();
  const w = byId(id);
  let y;
  if (w) {
    if (ENV.flow) y = w.a;
    else if (p < 0) y = w.a + (1 + p) * (w.b - w.a);
    else y = Math.ceil(w.b + p * (w.e - w.b));
  } else {
    const f = F.find((x) => x.id === id);
    const el = f ? f.el : document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    y = r.top + scrollY + (f ? p * r.height : 0);
  }
  return clamp(y, 0, maxY);
}

const load = (m) => {
  if (m.dataset.src && !m.getAttribute('src')) { if (ENV.flow) m.loading = 'lazy'; if (m.dataset.srcset) m.srcset = m.dataset.srcset; m.src = m.dataset.src; }
  if (m.dataset.poster && !m.getAttribute('poster')) m.poster = m.dataset.poster;
};
const setClip = (w, v) => {
  if (w.clip === v) return;
  w.clip = v;
  if (w.frame) w.frame.style.clipPath = v;
  if (w.over) w.over.style.clipPath = v;
};
const HIDDEN = 'inset(100% 0px 0px 0px)';
const show = (w, top, bottom) => setClip(w, `inset(${top}px 0px ${VH - bottom}px 0px)`);
let lastFlowing = null, lastNear = -1;

// once per tick, after lenis.raf and before the stage (B8.8)
export function update(force = false) {
  if (!measured || !W.length) return;
  const s = scrollY;
  if (!force && s === state.s && !state.dirty) return;
  state.s = s; state.dirty = false;
  if (ENV.flow) { where(s); return; }
  let i = 0;
  for (let j = 0; j < W.length; j++) if (W[j].a <= s + 0.01) i = j;
  const cur = W[i], prev = W[i - 1] || null;
  let k = cur.b > cur.a && prev ? clamp((s - cur.a) / (cur.b - cur.a)) : 1;
  // the line is drawn on whole pixels; a line at row 0 means the cut is over
  const line = Math.round(VH * (1 - k));
  if (line <= 0) k = 1;
  let edge = null, owner, p;
  if (k < 1) {
    show(prev, 0, line); show(cur, line, VH);
    edge = { y: line, above: prev.n(), below: cur.n() };
    owner = prev; p = 1;
  } else {
    owner = cur; p = cur.e > cur.b ? clamp((s - cur.b) / (cur.e - cur.b)) : 1;
    if (cur.isTen) setClip(cur, 'none'); else show(cur, 0, VH);
  }
  W.forEach((w) => { if (w !== cur && (w !== prev || k >= 1)) setClip(w, HIDDEN); });
  // #ten scrolls away in normal flow once its cut is done
  const flowing = cur.isTen && k >= 1;
  if (flowing !== lastFlowing) { lastFlowing = flowing; const t = byId('ten'); if (t) t.el.classList.toggle('is-flowing', flowing); }
  Object.assign(state, { edge, owner, p, k, cur, prev, i });
  // images in frames load within two worlds of the current one (fixed elements ignore lazy)
  if (i !== lastNear) {
    lastNear = i;
    W.forEach((w) => { if (Math.abs(w.i - i) <= 2) w.media.forEach(load); });
  }
  where(s);
}
// a fixed-mode change made by a chapter (the unwrap's local edition) asks for a fresh pass
export function invalidate() { state.dirty = true; }

// what covers screen row y: an in-flow section, the flowing #ten, or the worlds at the line
function thingAt(y, s) {
  for (const f of F) if (f.top - s <= y && f.bottom - s > y) return f;
  if (ENV.flow) {
    for (const w of W) if (w.top - s <= y && w.bottom - s > y) return w;
    return null;
  }
  const st = state;
  if (st.cur && st.cur.isTen && st.k >= 1) {
    const frameTop = Math.min(0, tenEndY - VH - s);
    return y >= frameTop && y < frameTop + VH ? st.cur : null;
  }
  if (st.edge) return y < st.edge.y ? st.prev : st.cur;
  return st.cur;
}

let lastKey = '';
const inks = { nav: '', ground: '', index: '' };
function where(s) {
  const top = thingAt(36, s), mid = thingAt(VH / 2, s), bottom = thingAt(VH - 40, s);
  const a = inkOf(top), b = inkOf(bottom);
  if (a.ink !== inks.nav) { inks.nav = a.ink; setInk('#siteHeader', '--nav-ink', a.ink); }
  if (a.ground !== inks.ground) { inks.ground = a.ground; setInk('#siteHeader', '--nav-ground', a.ground); }
  if (b.ink !== inks.index) { inks.index = b.ink; setInk('.index', '--index-ink', b.ink); }
  const band = ENV.flow || !!(top && (top.flow || (top.isTen && state.k >= 1 && state.cur === top)));
  root.classList.toggle('nav-band', band);
  const n = mid && mid.n ? mid.n() : null;
  if (n) setOnScreen(n);
  // the index (the ten swatches) belongs to the colour worlds: hidden over the shop's first screen
  // (a world with no edition) and over the in-flow sections
  const plain = (t) => !!t && !t.flow && !t.isTen && !t.n();
  const w = { mid, top, bottom, n, chapter: mid ? mid.chapter : '', id: mid ? mid.id : '', indexHidden: !!(bottom && (bottom.flow || plain(bottom))) };
  state.where = w;
  const key = `${w.id}|${n}|${w.chapter}|${w.indexHidden}`;
  if (key !== lastKey) { lastKey = key; whereFns.forEach((fn) => fn(w)); }
}
export function onWhere(fn) { whereFns.push(fn); if (state.where) fn(state.where); }

// chapter scenes: def.update(p, state) runs when its world's progress changes.
// Worlds above the current one are finished (1), worlds below have not started (0).
// A chapter may also give a pose(p, base) for the bottle; the stage reads it as owner.pose.
export function chapter(id, def) {
  const w = byId(id);
  if (!w) return;
  if (def.pose) w.pose = def.pose;
  chapters.push({ w, def, last: null });
}
export function updateChapters() {
  if (ENV.flow) return;
  const st = state;
  for (const c of chapters) {
    const j = c.w.i;
    const p = j < st.i ? 1 : j > st.i ? 0 : st.k < 1 ? 0 : st.p;
    if (p !== c.last) { c.last = p; if (c.def.update) c.def.update(p, st); }
  }
}
