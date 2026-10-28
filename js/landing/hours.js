// L4. Twenty-four hours, on Kajal with No. 07 Lippan (white relief on sky blue, polished-steel mirrors:
// it reads cold, and it holds the dark; 19 Oct 2026, because the ten designs end on pink and this
// chapter used to be pink too). Why the water stays cold: the bottle comes apart and
// goes back together over the hold, 150vh (360svh on a phone, where a swipe is short and main.js lets
// p move at 0.14 a second at the most, so the stage must stay pinned while p catches up with the finger;
// the shop's explode, gl/bottle.js explodeParts):
//   p 0 → 0.45 apart · 0.45 → 0.60 held · 0.60 → 0.85 back together · 0.85 → 1 held.
// The five part labels stand in one column on the right, each level with its part; a label's tick
// draws with its part, and its text is revealed by a 200 ms clip once the part is half way out. The
// readout (28°C / 9°C) and the footnote never move.
//
// Three versions, one story:
//   3D    the real bottle on the shared renderer (js/gl/bottle.js), taken apart by explodeParts()
//   2D    (20 Oct 2026, JJ: "on the phone the bottle does not come apart") the same bottle as pictures: the parts of
//         the real bottle, drawn once by tools/sprites/render-hours-parts.js in this scene's own camera, lighting and
//         materials (assets/img/hours-*.webp, 63 KB), moved with the numbers of explodeParts() and hoursScaleAt()
//         (copied below, as cloth.js copies DIM: three.js is never loaded on a phone). A phone, an upright tablet and
//         a wide window without WebGL get this one, the same timeline, labels and leaders as the 3D one.
//   still reduced motion (calm), and the 2D one if its pictures do not arrive: the packshot as a labelled drawing
//         (diagram() below), nothing moves.
import { L } from './state.js';
import { ENV } from '../core/env.js';

const sm = (k, a, b) => { const t = Math.max(0, Math.min(1, (k - a) / (b - a))); return t * t * (3 - 2 * t); };
const ED = '07', GROUND = '#1A1612';   // the edition shown, and Kajal, the ground the 3D light bounces from
export const explodeAt = (p) => (p <= 0 ? 0 : p < 0.45 ? p / 0.45 : p < 0.6 ? 1 : p < 0.85 ? 1 - (p - 0.6) / 0.25 : 0);

// ---- the 2D version's numbers ----
// gl/bottle.js EXPLODE, explodeParts() and hoursScaleAt(), copied: the windows each part moves in (k 0..1), how far it goes
// (bottle units: 1 = 100 mm, the bottle is 2.72 tall), and the scale 1 → 0.8 about the root. tools/tests/hours-parity.js checks them against bottle.js.
const EX = { cap: [0.08, 0.45], inner: [0.20, 0.65], sleeve: [0.35, 0.80], capLift: 0.75, innerLift: 0.6, sleeveLift: 0.08, sleeveScale: 0.2 };
export function partsAt(k) {
  k = Math.max(0, Math.min(1, k));
  const cap = sm(k, ...EX.cap), inner = sm(k, ...EX.inner), sleeve = sm(k, ...EX.sleeve);
  // the cap rises 0.06 over its first 60 % (the thread: in 3D it turns one and a half times, here it lifts), then to 0.75 in all
  const capY = cap < 0.6 ? 0.06 * Math.min(1, cap / 0.6) : 0.06 + ((cap - 0.6) / 0.4) * (EX.capLift - 0.06);
  return { k, cap, inner, sleeve, capY, innerY: inner * EX.innerLift, sleeveY: sleeve * EX.sleeveLift };
}
export const scaleAt = (k) => 1 - 0.2 * partsAt(k).cap;
const CAP = { y: 2.40, r: 0.25, top: 2.71 }, DIM = { r: 0.38, bandBottom: 0.22, bandH: 1.8 };   // gl/bottle.js CAP, DIM (the numbers the labels use)
// The pictures: one frame of 900 x 1425 px in which the 3D scene's camera stands the bottle as it stands on the 3D stage (its base
// centre at 84.2 % of the frame's height, its cap's rim at 14 %, its axis in the middle), each part drawn alone on a transparent
// ground at rest. u: px of the frame per bottle unit in the plane of the axis; base: the frame row of y = 0; rim: the row of the cap's
// rim. Each picture: [x, y, w, h] in the frame (tools/sprites/hours-parts.json, printed by render-hours-parts.js). Stacked back to
// front, at k = 0, they are the assembled bottle (the largest difference to the 3D picture is on the pixels of its edges). The
// steel plug and the brass ring under the cap are one picture that goes behind the outer wall, as in 3D: the neck stands in front of both.
const FR = { w: 900, h: 1425, u: 362.856, ax: 450, base: 1199.85, rim: 199.5 };
const SP = { under: [357, 257, 186, 98], body: [310, 315, 280, 911], inner: [326, 302, 248, 319], sleeve: [309, 451, 282, 694], cap: [357, 197, 186, 133] };
const ORDER = ['under', 'body', 'inner', 'sleeve', 'cap'];
export const MIRROR = { EX, CAP, DIM, FR, SP };   // for tools/tests/hours-parity.js: the copies, held against gl/bottle.js and the rendered files
// The inner wall is in front of the outer one from this height up (its radius is the larger there: the two profiles of bottle.js
// crossed), and behind it below. It rises, so the height falls: [how far the inner wall has risen, the height], read between the points.
const YX = [[0, 2.402], [0.03, 2.402], [0.06, 2.315], [0.1, 2.277], [0.12, 2.257], [0.16, 2.245], [0.2, 2.227], [0.22, 2.225]];
function frontFrom(lift) {
  if (lift >= YX[YX.length - 1][0]) return YX[YX.length - 1][1];
  let i = 1;
  while (YX[i][0] < lift) i++;
  const a = YX[i - 1], b = YX[i];
  return a[1] + (b[1] - a[1]) * ((lift - a[0]) / (b[0] - a[0]));
}

export function initHours() {
  const sec = document.getElementById('hours');
  const stage = document.getElementById('hoursStage');
  const list = document.getElementById('parts');
  const items = [...list.querySelectorAll('.part')];
  const pk = stage.querySelector('.hours__pk');
  const S = { sc: null, G: null, B: null, h: items.map(() => 0) };
  // 2D (a phone, an upright tablet, a window without WebGL) and not calm: the bottle comes apart as pictures
  const pin = !L.gl && !L.calm;
  const R = { rig: null, stack: null, img: {}, ready: false, failed: false, started: false, dirty: true, k: -1, h: items.map(() => 0) };

  const label = (i, on) => items[i].classList.toggle('is-off', !on);
  // the leader of every label starts 8 px off its part's edge: --lead is how far left of the
  // labels' column that is
  const lead = (li, px) => { const v = Math.max(0, Math.round(px)) + 'px'; if (li.style.getPropertyValue('--lead') !== v) li.style.setProperty('--lead', v); };
  const narrow = () => document.documentElement.classList.contains('is-narrow');
  // 2D, calm and phone (FIX2, 16 Oct 2026): the packshot as a labelled drawing. Each label stands
  // level with its part on the packshot and its leader ends 8 px off the silhouette there (measured
  // from the packshot: level in bottle units of 2.72, half-width as a share of the bottle's height).
  // The cap; the steel ring under it (the top of the inner wall); the shoulder (the vacuum lies
  // behind the outer wall all the way down); the painted band; the steel base (the outer wall).
  // The numbers are those of this packshot (assets/img/bottle-07.webp, 720 × 980, measured on its
  // silhouette: the bottle stands from 0.0071 of the file's height and is 0.9908 of it tall, and its
  // axis is at 0.5278 of its width); the half-widths are shares of the bottle's height.
  const LV2 = [2.56, 2.33, 1.98, 1.12, 0.12], RAD2 = [0.1087, 0.0953, 0.1643, 0.1653, 0.1622];
  const PK_TOP = 0.0071, PK_H = 0.9908, PK_CX = 0.5278;
  const H2 = items.map(() => 0);
  function diagram(p) {
    const r = pk.getBoundingClientRect();
    if (!r.height) return;
    const bh = PK_H * r.height, top = r.top + PK_TOP * r.height, cx = r.left + PK_CX * r.width;
    const lr = list.getBoundingClientRect();
    const ys = LV2.map((lv) => top + (1 - lv / 2.72) * bh);
    items.forEach((li, i) => { if (!H2[i]) H2[i] = li.offsetHeight; });
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + (H2[i - 1] + H2[i]) / 2 + 10);
    items.forEach((li, i) => {
      lead(li, lr.left - (cx + RAD2[i] * bh + 8));
      const t = `translateY(${Math.round(ys[i] - lr.top - H2[i] / 2)}px)`;
      if (li.style.transform !== t) li.style.transform = t;
      // the parts name themselves one by one: with the hold (2D), as the drawing comes up the
      // screen (phone), all at once (calm)
      const on = L.calm ? true : narrow() ? ys[i] < innerHeight * 0.9 : p > 0.04 + i * 0.07;
      label(i, on);
    });
  }
  function still() { list.classList.add('parts--live'); }

  // ---- 2D: the parts as pictures ----
  // The pictures (63 KB) come when the chapter is within two and a half screens, so none of them is on the way in: never in 3D or calm.
  // In a test (?test, ?at=) they come at once, so a jump to the chapter finds them.
  function start() {
    if (R.started) return;
    R.started = true;
    for (const n of ORDER) {
      const im = R.img[n] = new Image();
      im.className = 'hr hr--' + n; im.alt = ''; im.decoding = 'async'; im.draggable = false;
      im.src = `assets/img/hours-${n}.webp`;
      // the inner wall rises inside a frame that stays: the outer wall's edge is cut in the frame, not in the picture that moves
      if (n === 'inner') { R.clip = document.createElement('div'); R.clip.className = 'hr-clip'; R.clip.appendChild(im); R.stack.appendChild(R.clip); }
      else R.stack.appendChild(im);
    }
    Promise.all(ORDER.map((n) => R.img[n].decode())).then(() => {
      R.ready = true; R.dirty = true;
      sec.classList.add('has-rig');
      requestAnimationFrame(() => R.rig.classList.add('is-ready'));
    }, () => {
      // a picture that did not arrive: the packshot as a labelled drawing, as before (and the stage as it was in flow on a phone)
      R.failed = true;
      R.rig.remove();
      sec.classList.remove('is-pinned', 'has-rig');
      if (pk && !pk.src && pk.dataset.fallbackSrc) pk.src = pk.dataset.fallbackSrc;
    });
  }
  if (pin) {
    sec.classList.add('is-pinned');
    items.forEach((_, i) => label(i, false));
    // the rig is in the stage from the start (empty, and not seen): on a phone it is the grid cell the bottle stands in, so nothing moves
    // when the pictures come
    R.rig = document.createElement('div');
    R.rig.className = 'hours__rig'; R.rig.setAttribute('aria-hidden', 'true');
    R.stack = document.createElement('div');
    R.stack.className = 'hours__stack';
    R.rig.appendChild(R.stack);
    stage.insertBefore(R.rig, list);
    // the packshot is only the fallback here: it is fetched only if the pictures fail (main.js loads every img[data-src] when its chapter is near)
    if (pk && pk.dataset.src) { pk.dataset.fallbackSrc = pk.dataset.src; delete pk.dataset.src; }
    if (ENV.test || !window.IntersectionObserver) start();
    else {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '250% 0px 250% 0px' });
      io.observe(sec);
    }
    if (window.ResizeObserver) new ResizeObserver(() => { R.dirty = true; }).observe(stage);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { R.dirty = true; });
    addEventListener('resize', () => { R.dirty = true; });
  }

  // Where the bottle stands, in the rig's own pixels and the stage's: on the stage (wide) exactly where the 3D bottle stands (the frame is the
  // stage's height; state.js GEO), in the rig's box (narrow: the pinned stage's grid, landing.css) otherwise. c: px per px of the frame.
  function place() {
    const sr = stage.getBoundingClientRect(), rr = R.rig.getBoundingClientRect();
    let ax, base, bh;
    if (narrow()) { const pad = Math.max(8, Math.round(rr.height * 0.03)); bh = rr.height - 2 * pad; base = rr.height - pad; ax = rr.width / 2; }
    else { const g = L.geo(sr.height, 'hours'); bh = g.base - g.cap; base = g.base - (rr.top - sr.top); ax = sr.width / 2 - (rr.left - sr.left); }
    R.ok = bh > 60;
    R.rig.style.visibility = R.ok ? '' : 'hidden';           // no room (a window of a few pixels, a stage not laid out yet): nothing is drawn
    if (!R.ok) { R.dirty = false; return; }
    const c = bh / (FR.base - FR.rim);
    R.c = c; R.u = FR.u * c; R.ax = ax; R.base = base;
    R.sx = rr.left - sr.left + ax; R.sy = rr.top - sr.top + base;           // the axis and the base line, in the stage's px
    R.lift = EX.innerLift * R.u;                                             // how far the inner wall rises, px: its frame is that much taller
    for (const n of ORDER) {
      const [x, y, w, h] = SP[n], inner = n === 'inner', s = (inner ? R.clip : R.img[n]).style;
      s.left = ((x - FR.ax) * c + ax).toFixed(2) + 'px'; s.top = ((y - FR.base) * c + base - (inner ? R.lift : 0)).toFixed(2) + 'px';
      s.width = (w * c).toFixed(2) + 'px'; s.height = (h * c + (inner ? R.lift : 0)).toFixed(2) + 'px';
      if (inner) { const i = R.img.inner.style; i.left = '0px'; i.top = R.lift.toFixed(2) + 'px'; i.width = (w * c).toFixed(2) + 'px'; i.height = (h * c).toFixed(2) + 'px'; }
    }
    // the sleeve widens about the axis; the inner wall's frame cuts it from below where the outer wall is in front (set each frame)
    R.img.sleeve.style.transformOrigin = ((FR.ax - SP.sleeve[0]) * c).toFixed(2) + 'px 50%';
    R.stack.style.transformOrigin = ax.toFixed(2) + 'px ' + base.toFixed(2) + 'px';
    const lr = list.getBoundingClientRect();
    R.lx = lr.left - sr.left; R.ly = lr.top - sr.top;
    items.forEach((li, i) => { R.h[i] = li.offsetHeight; });
    R.dirty = false; R.k = -1;
  }
  const px = (v) => (Math.round(v * 100) / 100) + 'px';
  function explode2d(p) {
    if (R.dirty) place();
    if (!R.ok) return;
    const k = explodeAt(p);
    if (k === R.k) return;
    R.k = k;
    const P = partsAt(k), hs = scaleAt(k), u = R.u, c = R.c, im = R.img;
    R.stack.style.transform = `scale(${hs.toFixed(4)})`;
    const up = (v) => `translate3d(0, ${px(-v * u)}, 0)`;
    im.cap.style.transform = im.under.style.transform = up(P.capY);
    im.sleeve.style.transform = `${up(P.sleeveY)} scaleX(${(1 + EX.sleeveScale * P.sleeve).toFixed(4)})`;
    im.inner.style.transform = up(P.innerY);
    im.inner.style.visibility = P.inner > 0.001 ? 'visible' : 'hidden';
    // the inner wall is drawn from the first row at which it is in front of the outer wall (frontFrom: a height of the outer wall, which stays)
    const cut = (FR.base - FR.u * frontFrom(P.innerY) - SP.inner[1]) * c + R.lift;
    R.clip.style.clipPath = `inset(0 0 ${px(Math.max(0, SP.inner[3] * c + R.lift - cut))} 0)`;
    // the labels (as the 3D branch of update(): each part's window, its level on the bottle, one column) in the stage's px
    const PART = [P.cap, P.inner, sm(P.k, 0.275, 0.725), P.sleeve, sm(P.k, 0.42, 0.87)];
    const LEVEL = [CAP.y + P.capY + (CAP.top - CAP.y) / 2, 2.38 + P.innerY / 2, 2.2, DIM.bandBottom + DIM.bandH / 2 + P.sleeveY, 0.13];
    const RAD = [CAP.r, 0.34, 0.36, DIM.r * (1 + EX.sleeveScale * P.sleeve) + 0.005, DIM.r];
    const uk = u * hs;
    const ys = LEVEL.map((lv) => R.sy - lv * uk);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + (narrow() ? (R.h[i - 1] + R.h[i]) / 2 + 10 : 48));
    items.forEach((li, i) => {
      label(i, PART[i] > 0.5);
      lead(li, R.lx - (R.sx + RAD[i] * uk + 8));
      const t = `translateY(${Math.round(ys[i] - R.ly - R.h[i] / 2)}px)`;
      if (li.style.transform !== t) li.style.transform = t;
    });
  }

  async function attach(G) {
    S.G = G;
    S.sc = G.makeScene(stage, { edition: ED, ground: GROUND });
    S.B = await import('../gl/bottle.js');
    list.classList.add('parts--live');
  }
  if (!L.gl) still();

  function update(p, on) {
    if (pin && !R.failed) {
      // the pictures have not arrived yet: the labels wait (off), and nothing of the bottle is drawn
      if (R.ready && on) explode2d(p);
      return;
    }
    if (!L.gl || !S.sc || !S.B) {
      if (!narrow()) L.packshot(pk, L.calm ? innerHeight : stage.clientHeight, 'hours');
      if (!list.classList.contains('parts--live')) still();
      if (on) diagram(p);
      return;
    }
    if (!on) return;
    const G = S.G, sc = S.sc, B = S.B;
    G.measure(sc);
    const geo = L.geo(sc.h, 'hours');
    const f = G.fit(sc, sc.w / 2, geo.base, geo.cap);
    const k = explodeAt(p);
    const P = B.explodeParts(k);
    const s = f.s * B.hoursScaleAt(k);
    G.pose(sc, { ...f, s }, 0);
    sc.bottle.setSkins(ED, null);
    G.planeOff(sc.bottle.planes.cut);
    if (sc.bottle.exploded !== k) sc.bottle.explode(k);
    // the labels: each part's window, its point on the bottle, one column, at least 48 px apart
    const PART = [P.cap, P.inner, sm(P.k, 0.275, 0.725), P.sleeve, sm(P.k, 0.42, 0.87)];
    const LEVEL = [B.CAP.y + P.capY + (B.CAP.top - B.CAP.y) / 2, 2.38 + P.innerY / 2, 2.2, B.DIM.bandBottom + B.DIM.bandH / 2 + P.sleeveY, 0.13];
    PART.forEach((v, i) => label(i, v > 0.5));
    const lr = list.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const v3 = new G.T.Vector3(), o = { x: 0, y: 0 };
    const ys = LEVEL.map((lv) => G.project(sc, v3.set(f.x, f.y + s * lv, 0), o).y + sr.top);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 48);
    // each part's right edge (cap, inner wall, vacuum, band, outer wall), in px
    const RAD = [B.CAP.r, 0.34, 0.36, B.DIM.r * (1 + B.EXPLODE.sleeveScale * P.sleeve) + 0.005, B.DIM.r];
    items.forEach((li, i) => {
      const ex = G.project(sc, v3.set(f.x + s * RAD[i], f.y + s * LEVEL[i], 0), o).x + sr.left;
      lead(li, lr.left - (ex + 8));
      if (!S.h[i]) S.h[i] = li.offsetHeight;
      const t = `translateY(${Math.round(ys[i] - lr.top - S.h[i] / 2)}px)`;
      if (li.style.transform !== t) li.style.transform = t;
    });
    G.changed(sc, p.toFixed(5), sc.w, sc.h);
  }
  addEventListener('resize', () => { S.h = items.map(() => 0); H2.fill(0); });
  // the chapter's progress is handled by main.js: smooth and maxV (a phone's speed limit, progress per second) are its inputs
  return { id: 'hours', el: sec, stage, update, attach, smooth: 0.3, maxV: 0.14 };
}
