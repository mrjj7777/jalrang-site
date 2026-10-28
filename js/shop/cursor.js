// JALRANG: the cursor (js/shop/cursor.js, 19 October 2026). It came back after the redesign took it out.
//
//   A DROP, 14 x 18 px, the water of the brand, follows the pointer (lerp 0.18) and stretches up to 1.4x
//   along its direction of travel, its point trailing. Over a button, a link or a bottle a PILL pops up
//   beside it with a label (Mukta 600, 12 px, capitals, +0.1em): scale 0.6 to 1 and a 6 px rise into
//   place, 280 ms, the 'flow' ease, no bounce. Over a bottle the pill carries the colour's name and a
//   22 px round painting chip (the coin; a missing file leaves a disc in the edition's colour). A click
//   leaves two thin rings. Its colours come from the page. In the header the pill sits under the pointer
//   (it would cover the next link); near the right edge it flips to the pointer's left; between two
//   bottles it waits 90 ms, so it never blinks; going from one label to the next only the words change.
//
// API (initChrome() in js/shop/chrome.js loads this module with import() and calls initCursor(), on every page
//   that uses the shared chrome; a page without this file still works, with the system cursor)
//   import { cursor } from '../shop/chrome.js';   // a stub that forwards to this module's `cursor` once it has loaded
//   cursor.refresh()   look again at what lies under the pointer, for code that changes a label (a
//                      data attribute, or what a rule below reads) while the pointer is still. A change
//                      to data-cursor*, aria-pressed, disabled or hidden, a scroll, a resize, new
//                      elements, a click and a video's play or pause are noticed without it.
//   cursor.enabled     true once started on this page      cursor.label  the label showing now ('' if none)
//   cursor.destroy()   take it away and give the system cursor back
//   cursor.stats       { frames, hits, resolves, ms }: counters for tests (hits <= frames: one hit test a frame
//                      at most, and none while the pointer and the page stand still; ms = time spent in the loop)
//   window.__jal.cursor is this module's own object, for tests.
//
// DATA ATTRIBUTES (on the element or an ancestor; the nearest labelled one wins; an attribute beats the rules)
//   data-cursor="LABEL"         the pill's label; any text, shown in capitals; "off" = no pill, the plain drop
//   data-cursor-coin="NN"       a painting chip before the label: assets/img/coin-NN.webp, NN = 01 to 10
//   data-cursor-ink="#C3361D"   the drop's and the pill's colour, where the page cannot tell (see COLOURS)
//   data-cursor-ground="#F7F2E8" the ground behind it (the pill's label and its ring)
//   .bhit                       a transparent hit-proxy over something drawn in WebGL (the L1 hero, the L3
//                               bottle). It needs nothing but a box, pointer-events and the attributes above:
//                               <i class="bhit" data-cursor="SINDOOR" data-cursor-coin="01"></i>. Its colours
//                               are found from what is painted under it; change its attributes from JS freely.
//
// DEFAULT LABELS (RULES below; nearest ancestor first, then in this order; override with data-cursor)
//   MENU      the menu button                 CLOSE     close buttons             TOP    the page's own link
//   OPEN      header, menu and footer links   JUMP      in-page links             UNWRAP "Unwrap it"
//   SINDOOR + coin  (the colour's name)       a bottle in the L6 row and the shop's All ten, the index
//                                             swatches, the catalogue, the menu's ten, More editions
//   ADD + coin  Add to bag                    VIEW + coin  View details and links to a product page
//   SHOP      links to the shop               BAG       links to the bag
//   PREV NEXT the product pager               PAUSE / PLAY  the clip window, the clips button, a film
//   Everything else you can press (links, buttons, tabs, steppers) swells the drop; nothing labels it.
//
// COLOURS (no blend mode): ink = the computed text colour of the element under the pointer (the stages
//   set color: var(--text)); ground = the topmost painted background at that point (a hit-proxy over a
//   sibling's colour field finds it; the header: --nav-ground); the
//   pill is ink with a 1.5 px ring in the ground, its label the ground. Where ink and ground are alike
//   (a filled button on hover) the ground becomes the region's other token, so it reads on all ten
//   grounds, Chuna paper and Kajal. Cached per element (one getComputedStyle per element per 120 ms).
//
// STARTS ONLY WHEN IT SHOULD: not on touch or coarse pointers, not when motion is reduced or the page is
//   calm (ENV.reduce, html.is-calm, html.lm-calm), not in forced-colours mode. The system cursor is
//   hidden (html.has-cursor) only at the first real pointer move, never before, and stays over text
//   fields, selects, text areas and videos with controls (the drop steps aside there, over the page's
//   scrollbar, and while the keyboard has taken over: Tab, or typing, until the pointer moves). If
//   anything throws, the system cursor returns. Ship this file and assets/img/coin-01 to 10 with the site (a page
//   still works without them, only without the cursor, or with a plain disc for a coin).
//
// THE LOOP: one gsap.ticker callback (a requestAnimationFrame loop without gsap). One elementFromPoint a
//   frame at most, only when the pointer moved or the page changed under it (scroll, resize, a data
//   attribute, new elements, a click, a video's play or pause; for those, at most every 48 ms), once
//   more when the pointer stops; a still pointer on a still page costs nothing. States on .cursor: is-on is-label is-hot is-down is-flip
//   is-low is-snap is-native is-typing is-bar (css/site.css, section 13).
import { ENV } from '../core/env.js';
import { EDITIONS } from '../editions.js';

const root = document.documentElement;

// ---- the numbers (DESIGN-SYSTEM.md, section 7) ----
const LERP = 0.18;           // the share of the way to the pointer the drop covers each frame, at 60 fps
const STRETCH = 0.4;         // up to 1 + STRETCH along its direction of travel
const SPEED_FULL = 28;       // px per frame (60 fps) at which the stretch is full
const GAP = 20;              // from the pointer to the pill
const EXIT = 90;             // ms the pill waits before it goes, so a gap between two bottles never blinks it
const TTL = 120;             // ms a painted background is trusted
const FLOW = 'cubic-bezier(0.16, 1, 0.3, 1)';
const SETTLE = 'cubic-bezier(0.33, 1, 0.68, 1)';
const coinURL = (n) => new URL(`../../assets/img/coin-${n}.webp`, import.meta.url).href;   // from the module, so the page may live anywhere
// a coin is a disc in the edition's colour that takes its painting once the picture has loaded; a missing file leaves the disc.
// The ten are fetched once, at idle, after the first move, No. 01 first: if that one is missing (a publish without the coins) the
// other nine are not asked for, so the console shows one 404, not ten.
const coins = new Map();   // '03' -> { state: 'loading' | 'ready' | 'failed', done: Promise<boolean> }
function coinLoad(n) {
  if (coins.has(n)) return coins.get(n).done;
  const c = { state: 'loading', done: null };
  c.done = new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { c.state = 'ready'; if (S.coin === n && coinEl) coinEl.style.backgroundImage = `url("${coinURL(n)}")`; res(true); };
    im.onerror = () => { c.state = 'failed'; res(false); };
    im.src = coinURL(n);
  });
  coins.set(n, c);
  return c.done;
}
const coinReady = (n) => !!coins.get(n) && coins.get(n).state === 'ready';
function coinsAtIdle() {
  coinLoad(EDITIONS[0].n).then((ok) => {
    if (ok) EDITIONS.slice(1).forEach((e) => coinLoad(e.n));
    else EDITIONS.slice(1).forEach((e) => { if (!coins.has(e.n)) coins.set(e.n, { state: 'failed', done: Promise.resolve(false) }); });
  });
}

// ---- the ten ----
const BY = Object.fromEntries(EDITIONS.map((e) => [e.n, e]));
const pad = (v) => { const s = String(v == null ? '' : v).trim(); const n = /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : ''; return BY[n] ? n : ''; };
// the edition an element stands for: data-n or data-add, a #wNN or ?n=NN in its link, or the nearest [data-n] / [data-edition]
function editionOf(el) {
  let n = pad(el.dataset && (el.dataset.n || el.dataset.add));
  if (!n) { const h = el.getAttribute('href'); const m = h && /[#?&](?:w|n=)(\d{1,2})\b/.exec(h); if (m) n = pad(m[1]); }
  if (!n) { const up = el.closest('[data-n], [data-edition]'); if (up) n = pad(up.dataset.n || up.dataset.edition); }
  return n;
}

// ---- what gets a label (the nearest ancestor first; at one element, in this order) ----
const bottle = (el) => { const n = editionOf(el); return n ? { label: BY[n].colour, coin: n } : null; };
const playing = (el) => [...el.querySelectorAll('video')].some((v) => v.getAttribute('src') && !v.paused && !v.ended);
const RULES = [
  ['.nav__menu', 'MENU'],
  ['.menu__close, [data-close], [aria-label="Close"]', 'CLOSE'],
  ['.nav a[aria-current="page"], .menu a[aria-current="page"], .footer__nav a[aria-current="page"]', 'TOP'],
  ['.nav__lockup, .nav__link, .menu__lockup, .menu__link, .footer__nav a', 'OPEN'],
  ['.menu__ten a, .swatch, .cat__chip, .row__link, .tenrow__pic, .tenrow__col, .pm__item, .tenline__item', bottle],
  ['.menu__sub a, a[data-p]', 'JUMP'],
  ['[data-add], .buy__add, .ps__add, #addTen', (el) => ({ label: 'ADD', coin: editionOf(el) })],
  ['[data-go="unwrap"]', 'UNWRAP'],
  ['.pm__step[rel="prev"]', 'PREV'],
  ['.pm__step[rel="next"]', 'NEXT'],
  ['.clipwin', (el) => ({ label: playing(el) ? 'PAUSE' : 'PLAY' })],
  ['.poster__btn', (el) => ({ label: el.getAttribute('aria-pressed') === 'true' ? 'PAUSE' : 'PLAY' })],
  ['video.pg__media', (el) => ({ label: el.paused ? 'PLAY' : 'PAUSE' })],
  ['.plate__more, a[href^="product.html"]', (el) => ({ label: 'VIEW', coin: editionOf(el) })],
  ['.toast__view, a[href="bag.html"]', 'BAG'],
  ['a[href="shop.html"], a[href^="shop.html#"], a[href^="shop.html?"]', 'SHOP'],
];
const ANY = ['[data-cursor]', ...RULES.map((r) => r[0])].join(', ');
// pressable but not labelled: the drop swells
const HOT = 'a[href], button:not(:disabled):not([aria-disabled="true"]), [role="button"], [role="tab"], summary, label.check, input[type="checkbox"], input[type="radio"], input[type="range"], input[type="button"], input[type="submit"]';
// where the system cursor stays (the same list is in css/site.css, section 13)
const NATIVE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="color"]):not([type="file"]), textarea, select, [contenteditable=""], [contenteditable="true"], video[controls]';

function resolve(el) {
  if (el.closest(NATIVE)) return { native: true };
  for (let a = el.closest(ANY); a; a = a.parentElement && a.parentElement.closest(ANY)) {
    if (a.hasAttribute('data-cursor')) {
      const v = a.getAttribute('data-cursor').trim();
      if (/^off$/i.test(v)) return {};
      if (v) return { label: v.slice(0, 28), coin: pad(a.getAttribute('data-cursor-coin')) };
    }
    for (const [sel, get] of RULES) {
      if (!a.matches(sel)) continue;
      const r = typeof get === 'function' ? get(a) : { label: get };
      if (r && r.label) return r;
    }
  }
  return el.closest(HOT) ? { hot: true } : {};
}

// ---- colours ----
const KAJAL = [26, 22, 18, 1], CHUNA = [247, 242, 232, 1];
const memo = new Map();
let canvasCtx = null;
function parse(str) {
  str = (str || '').trim();
  if (!str) return null;
  if (memo.has(str)) return memo.get(str);
  let c = null, m;
  if ((m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(str))) {
    c = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  } else if ((m = /^color\(\s*srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(str))) {
    c = [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  } else {
    try {   // any other CSS colour: let a 1 px canvas say what it is in sRGB
      canvasCtx = canvasCtx || Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      canvasCtx.clearRect(0, 0, 1, 1); canvasCtx.fillStyle = '#000'; canvasCtx.fillStyle = str; canvasCtx.fillRect(0, 0, 1, 1);
      const d = canvasCtx.getImageData(0, 0, 1, 1).data;
      c = [d[0], d[1], d[2], d[3] / 255];
    } catch (e) { c = null; }
  }
  memo.set(str, c);
  return c;
}
const over = (c, g) => (c[3] >= 1 ? c : [c[0] * c[3] + g[0] * (1 - c[3]), c[1] * c[3] + g[1] * (1 - c[3]), c[2] * c[3] + g[2] * (1 - c[3]), 1]);
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (c) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

// The ground under the pointer: the topmost element in the stack at that point that paints a background
// (so a ground painted by a sibling, behind a transparent hit-proxy, is found too), cached per element for
// 120 ms. The header paints its band in a pseudo-element, so there it is --nav-ground.
const paint = new WeakMap();
function paints(a, now) {
  let hit = paint.get(a);
  if (!hit || now - hit.t > TTL) {
    const c = parse(getComputedStyle(a).backgroundColor);
    hit = { t: now, c: c && c[3] >= 0.5 ? over(c, CHUNA) : null };
    paint.set(a, hit);
  }
  return hit.c;
}
function groundOf(el, x, y, now) {
  for (let a = el; a && a !== root; a = a.parentElement) {
    if (a.classList.contains('nav')) { const g = parse(getComputedStyle(a).getPropertyValue('--nav-ground')); if (g) return { c: over(g, CHUNA), from: a }; break; }
  }
  for (const a of document.elementsFromPoint ? document.elementsFromPoint(x, y) : []) { const c = paints(a, now); if (c) return { c, from: a }; }
  for (let a = el; a && a !== root; a = a.parentElement) { const c = paints(a, now); if (c) return { c, from: a }; }
  return { c: CHUNA, from: null };
}
function coloursOf(el, x, y, now) {
  const cs = getComputedStyle(el);
  const o = el.closest('[data-cursor-ink], [data-cursor-ground]');
  const forced = (k) => (o && o.dataset[k] ? parse(o.dataset[k]) : null);
  const g = groundOf(el, x, y, now);
  let ground = forced('cursorGround') || g.c;
  // the text colour of the element; where it sits over a ground that is not its own (a hit-proxy over a
  // sibling's colour field) the colour of the element that paints that ground
  const own = !g.from || g.from.contains(el) ? cs : getComputedStyle(g.from);
  let ink = over(forced('cursorInk') || parse(own.color) || KAJAL, ground);
  if (contrast(ink, ground) < 3) {
    // the element sits on a fill of its own colour (a filled button on hover): take the ground from the region's other token
    const pool = [own.getPropertyValue('--text'), own.getPropertyValue('--ground')].map(parse).filter(Boolean).concat([KAJAL, CHUNA]);
    ground = pool.find((c) => contrast(ink, c) >= 3) || (lum(ink) > 0.4 ? KAJAL : CHUNA);
  }
  let label = ground;
  if (contrast(ink, label) < 4.5) label = contrast(ink, KAJAL) >= contrast(ink, CHUNA) ? KAJAL : CHUNA;
  return { ink: rgb(ink), ground: rgb(ground), label: rgb(label) };
}

// ---- state ----
const S = {
  inited: false, started: false, on: false, el: null,
  tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, ang: 0, sx: 1, sy: 1,
  moved: false, dirty: false, tail: false, rest: false, at: 0, lookedAt: 0,
  label: '', coin: '', hot: false, native: false, flip: false, pillOn: false, pillW: 0, hideT: 0,
  col: { ink: '', ground: '', label: '' }, typing: false, bar: false, low: false,
};
const stats = { frames: 0, hits: 0, resolves: 0, ms: 0 };
export const cursor = {
  enabled: false,
  refresh() { S.dirty = true; },
  get label() { return S.pillOn ? S.label : ''; },
  destroy() { destroy(); },
  stats,
};
let node = null, stretchEl = null, pill = null, coinEl = null, textEl = null, rings = null;
let off = [], mo = null, tickFn = null, raf = 0;

// ---- build ----
function build() {
  node = document.createElement('div');
  node.className = 'cursor';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `<div class="cursor__stretch"><svg class="cursor__drop" viewBox="0 0 14 18" width="14" height="18" focusable="false"><path d="M7 0C9.2 3.2 14 6.4 14 11A7 7 0 1 1 0 11C0 6.4 4.8 3.2 7 0Z"/></svg></div><div class="cursor__pill"><span class="cursor__coin" hidden></span><span class="cursor__label"></span></div>`;
  stretchEl = node.firstElementChild;
  pill = node.lastElementChild;
  coinEl = pill.firstElementChild;
  textEl = pill.lastElementChild;
  rings = document.createElement('div');
  rings.className = 'cursor-rings';
  rings.setAttribute('aria-hidden', 'true');
  document.body.append(rings, node);
}

// ---- what lies under the pointer, once a frame at most, and only when something changed ----
function hit(now, last) {
  S.moved = false;
  S.lookedAt = now;
  stats.hits++;
  const el = document.elementFromPoint(S.tx, S.ty);
  if (!el) return;
  // the same element a moment ago: leave it, but look once more when the pointer has stopped (the ground under a hit-proxy may have changed)
  if (!last && el === S.el && !S.dirty && now - S.at < 100) { S.tail = true; return; }
  S.tail = false; S.dirty = false; S.el = el; S.at = now;
  stats.resolves++;
  const spec = resolve(el);
  if (spec.native !== S.native) { S.native = !!spec.native; node.classList.toggle('is-native', S.native); }
  if (!spec.native) {
    const col = coloursOf(el, S.tx, S.ty, now);
    // a pill that is about to pop up takes its colours at once; one that is up changes them with a 180 ms fade
    const snap = !S.pillOn && !S.hideT && (col.ink !== S.col.ink || col.ground !== S.col.ground || col.label !== S.col.label);
    if (snap) { node.classList.add('is-snap'); requestAnimationFrame(() => node && node.classList.remove('is-snap')); }
    for (const k of ['ink', 'ground', 'label']) if (col[k] !== S.col[k]) { S.col[k] = col[k]; node.style.setProperty('--cur-' + k, col[k]); }
  }
  if (!!spec.hot !== S.hot) { S.hot = !!spec.hot; node.classList.toggle('is-hot', S.hot); }
  // in the header the pill sits under the pointer, so it never covers the next link
  const low = !!el.closest('.nav');
  if (low !== S.low) { S.low = low; node.classList.toggle('is-low', low); }
  setLabel(spec.native ? {} : spec);
}

function setLabel(spec) {
  const label = (spec.label || '').toLocaleUpperCase('en'), coin = spec.coin || '';
  if (!label) {
    if (S.pillOn && !S.hideT) S.hideT = setTimeout(() => { S.hideT = 0; S.pillOn = false; node.classList.remove('is-label'); }, EXIT);
    return;
  }
  clearTimeout(S.hideT); S.hideT = 0;
  if (label === S.label && coin === S.coin && S.pillOn) return;
  const swap = S.pillOn && S.label && (label !== S.label || coin !== S.coin);
  S.label = label; S.coin = coin;
  textEl.textContent = label;
  pill.classList.toggle('has-coin', !!coin);
  coinEl.hidden = !coin;
  if (coin) {
    coinEl.style.setProperty('--coin-bg', BY[coin].ground);
    coinEl.style.backgroundImage = coinReady(coin) ? `url("${coinURL(coin)}")` : 'none';
    coinLoad(coin);
  }
  S.pillW = pill.offsetWidth;
  S.rest = false;   // one more pass, so the pill can keep off the edge
  if (!S.pillOn) { S.pillOn = true; node.classList.add('is-label'); }
  else if (swap && pill.animate) {   // already up: the new words slide in, the pill stays
    textEl.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: FLOW });
    if (coin) coinEl.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: FLOW });
  }
}

// ---- the frame: the drop follows, stretches along its travel, and the pill keeps off the edge ----
function frame(time, dtMS) {
  if (!S.started) return;
  try {
    stats.frames++;
    const now = performance.now();
    // The pointer moving is looked at in the frame it moved. A page that only moves under a still pointer (scrolling, a resize, a
    // label changed) is looked at every 48 ms, three frames: the pill's words follow within them, and the last look comes when it stops.
    if (S.on) { if (S.moved || (S.dirty && now - S.lookedAt >= 48)) hit(now); else if (S.tail) hit(now, true); }
    if (!S.on || (S.rest && S.tx === S.x && S.ty === S.y)) return;   // hidden, or standing still: nothing moves
    const t0 = now;
    const dt = Math.min(Math.max(dtMS || 16.7, 4), 50) / 16.667;   // in frames at 60 fps
    const k = 1 - Math.pow(1 - LERP, dt);
    const dx = (S.tx - S.x) * k, dy = (S.ty - S.y) * k;
    S.x += dx; S.y += dy;
    // the drop's speed in px per 60 fps frame, smoothed, then its stretch and its turn
    const f = 1 - Math.pow(0.65, dt);
    S.vx += (dx / dt - S.vx) * f; S.vy += (dy / dt - S.vy) * f;
    const speed = Math.hypot(S.vx, S.vy);
    const e = Math.min(1, speed / SPEED_FULL);
    const s = 1 + STRETCH * (e * e * (3 - 2 * e));
    const want = speed > 0.9 ? (Math.atan2(S.vy, S.vx) * 180) / Math.PI - 90 : 0;   // the round end leads, the point trails
    let d = ((want - S.ang + 540) % 360) - 180;
    S.ang += d * (1 - Math.pow(0.78, dt));
    const sy = s, sx = 1 - (s - 1) * 0.3;
    // arrived and upright: write the exact position once, then leave it alone until the pointer moves
    if (Math.abs(S.tx - S.x) < 0.02 && Math.abs(S.ty - S.y) < 0.02 && speed < 0.03 && Math.abs(d) < 0.05) {
      S.x = S.tx; S.y = S.ty; S.vx = S.vy = 0; S.ang = 0; S.sx = S.sy = 1; S.rest = true;
      stretchEl.style.transform = '';
    } else {
      S.rest = false;
      if (Math.abs(sy - S.sy) > 0.002 || Math.abs(d) > 0.05 || speed > 0.05) {
        S.sy = sy; S.sx = sx;
        stretchEl.style.transform = s > 1.004 || Math.abs(S.ang) > 0.3 ? `rotate(${S.ang.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})` : '';
      }
    }
    node.style.transform = `translate3d(${S.x.toFixed(2)}px, ${S.y.toFixed(2)}px, 0)`;
    if (S.pillOn) {
      const room = innerWidth - (S.x + GAP + S.pillW + 16);
      if (!S.flip && room < 0) { S.flip = true; node.classList.add('is-flip'); }
      else if (S.flip && room > 56) { S.flip = false; node.classList.remove('is-flip'); }
    }
    stats.ms += performance.now() - t0;
  } catch (err) {
    destroy();
  }
}

// ---- two thin rings on a click ----
function ripple(x, y) {
  if (!rings || !rings.animate) return;
  for (const [size, delay, a] of [[120, 0, 0.9], [70, 80, 0.7]]) {
    const r = document.createElement('i');
    r.className = 'cursor-ring';
    r.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-color:${S.col.ink || 'currentColor'};opacity:0`;
    rings.appendChild(r);
    const an = r.animate([{ transform: 'scale(0.02)', opacity: a }, { transform: 'scale(1)', opacity: 0 }], { duration: 700, delay, easing: SETTLE, fill: 'forwards' });
    an.onfinish = an.oncancel = () => r.remove();
  }
}

// ---- events ----
const mouseLike = (e) => !e.pointerType || e.pointerType === 'mouse' || e.pointerType === 'pen';
function show(x, y) {
  S.x = S.tx = x; S.y = S.ty = y; S.vx = S.vy = 0; S.ang = 0;
  S.on = true; S.moved = true; S.rest = false;
  root.classList.add('has-cursor');   // only now: the system cursor is hidden once ours is there to take over
  node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  node.classList.add('is-on');
  if (!S.preloaded) {
    S.preloaded = true;
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 1200)))(coinsAtIdle, { timeout: 4000 });
  }
}
function hide() {
  S.on = false;
  if (node) node.classList.remove('is-on');
}
function listen(target, type, fn, opts) { target.addEventListener(type, fn, opts); off.push(() => target.removeEventListener(type, fn, opts)); }

function bind() {
  listen(window, 'pointermove', (e) => {
    if (!mouseLike(e)) return;
    S.tx = e.clientX; S.ty = e.clientY; S.moved = true;
    if (S.typing) { S.typing = false; node.classList.remove('is-typing'); }
    if (!S.on) show(e.clientX, e.clientY);
    // over the page's own scrollbar the system cursor shows, so the drop steps aside (and comes back where the pointer is)
    const bar = e.clientX >= root.clientWidth || e.clientY >= root.clientHeight;
    if (bar !== S.bar) { S.bar = bar; node.classList.toggle('is-bar', bar); if (!bar) { S.x = e.clientX; S.y = e.clientY; S.vx = S.vy = 0; S.rest = false; } }
    if (!e.buttons && node.classList.contains('is-down')) node.classList.remove('is-down');   // let go outside the window
  }, { passive: true, capture: true });
  listen(window, 'pointerdown', (e) => {
    if (!mouseLike(e) || e.button !== 0 || !S.on) return;
    node.classList.add('is-down');
    if (!S.native) ripple(e.clientX, e.clientY);
  }, { passive: true, capture: true });
  const up = () => node && node.classList.remove('is-down');
  listen(window, 'pointerup', up, { passive: true, capture: true });
  listen(window, 'pointercancel', up, { passive: true, capture: true });
  listen(root, 'pointerleave', hide);
  listen(document, 'mouseout', (e) => { if (!e.relatedTarget) hide(); });
  listen(window, 'blur', hide);
  const mark = () => { S.dirty = true; };
  listen(window, 'scroll', mark, { passive: true, capture: true });
  listen(window, 'resize', mark, { passive: true });
  listen(document, 'play', mark, true);
  listen(document, 'pause', mark, true);
  listen(document, 'click', () => { S.dirty = true; setTimeout(mark, 140); }, true);
  // the keyboard takes over (Tab, or typing in a field): our drop steps aside until the pointer moves again
  listen(document, 'keydown', (e) => {
    if (!S.on || S.typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement;
    if (e.key === 'Tab' || ((e.key.length === 1 || e.key === 'Backspace') && a && a.matches && a.matches(NATIVE))) { S.typing = true; node.classList.add('is-typing'); }
  }, true);
  // a page that turns calm after the start (html.is-calm / lm-calm): the system cursor comes back
  mo = new MutationObserver((list) => {
    if (root.classList.contains('is-calm') || root.classList.contains('lm-calm')) return destroy();
    for (const m of list) if (m.target !== root && !(node && node.contains(m.target)) && !(rings && rings.contains(m.target))) { S.dirty = true; break; }
  });
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-cursor', 'data-cursor-coin', 'data-cursor-ink', 'data-cursor-ground', 'aria-pressed', 'disabled', 'hidden'] });
  // one loop: the page's gsap ticker when there is one
  if (window.gsap && gsap.ticker) { tickFn = frame; gsap.ticker.add(tickFn); }
  else {
    let last = performance.now();
    const loop = (t) => { frame(t / 1000, t - last); last = t; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
  }
}

function destroy() {
  S.started = false; S.on = false; cursor.enabled = false;
  off.forEach((f) => f()); off = [];
  if (mo) { mo.disconnect(); mo = null; }
  if (tickFn && window.gsap) gsap.ticker.remove(tickFn);
  tickFn = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  clearTimeout(S.hideT);
  root.classList.remove('has-cursor');
  if (node) node.remove();
  if (rings) rings.remove();
  node = rings = null;
}

// ---- start ----
function wanted() {
  if (ENV.touch || ENV.reduce) return false;
  if (root.classList.contains('is-calm') || root.classList.contains('lm-calm')) return false;
  if (!window.PointerEvent || !document.body) return false;
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  return !mq('(forced-colors: active)') && !mq('(hover: none)') && !mq('(pointer: coarse)');
}
export function initCursor() {
  if (S.inited) return cursor;
  S.inited = true;
  window.__jal = Object.assign(window.__jal || {}, { cursor });   // for tests: there is always one, `enabled` says whether it started
  try {
    if (!wanted()) return cursor;
    build();
    bind();
    S.started = true;
    cursor.enabled = true;
  } catch (err) {
    destroy();
  }
  return cursor;
}
