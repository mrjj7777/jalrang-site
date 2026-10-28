// product.html?n=NN — one edition's page, the same template for all ten (ARCH section 3).
//   1 Buy      the edition's ground; the colour's name huge behind; words left, the bottle centre
//              (3D where it can run, the packshot otherwise), the buy panel right: ₹4,800, 750 ml,
//              engraving, quantity, "Add to bag — ₹4,800"
//   2 Gallery  Studio / Found in India / The painting (+ Edition film for No. 01 only)
//   3 Unwrap it.  scroll-driven over a pinned frame (js/pages/product-unwrap.js); 2D, phone and
//              calm: the flat painting with its three numbered details
//   4 Specification, with the footnote and a second "Add to bag"
//   5 More editions (Chuna): Previous / Next edition and the other nine
// The shared header, menu, toast and footer come from js/shop/chrome.js; the bag from store.js.
import { ENV, TEST, store, setMode, isNarrow, restartIf, clip } from '../core/env.js';
import { EDITIONS, byN } from '../editions.js';
import { initChrome, markReady, setLenis } from '../shop/chrome.js';
import { bag, PRICE, fmt, MAX_QTY, cleanEngraving } from '../shop/store.js';
import { setOnScreen } from '../core/state.js';
import { setInk } from '../core/ui.js';
import { sorted } from './product-unwrap.js';

const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const Q = new URLSearchParams(location.search);
const ARROW_L = '<svg class="arrow" viewBox="0 0 18 10" aria-hidden="true"><path d="M17 5H1.5M5.5 1 1.5 5l4 4"/></svg>';
const ARROW_R = '<svg class="arrow" viewBox="0 0 18 10" aria-hidden="true"><path d="M1 5h15.5M12.5 1l4 4-4 4"/></svg>';
const MINUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10"/></svg>';
const PLUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10M6 1v10"/></svg>';

// ---- which edition ----
let n = Q.get('n') || '';
if (/^\d$/.test(n)) n = '0' + n;
// A link to an edition that does not exist says so, on Chuna, and offers the ten; it never shows a
// different edition in its place. The rest of this module then waits for ever (nothing to build).
if (!EDITIONS.some((x) => x.n === n)) {
  const raw = (Q.get('n') || '').slice(0, 12);
  initChrome({ page: 'product' });
  document.title = 'No such edition — JALRANG';
  $('meta[name="description"]').setAttribute('content', 'Edition One is ten bottles, No. 01 to No. 10. A concept shop by J&J Co.; nothing is sold.');
  $('meta[property="og:title"]').setAttribute('content', document.title);
  const m = $('#main');
  m.classList.add('paper', 'missing');
  m.dataset.ground = 'chuna';
  m.innerHTML = `<section class="cpage" aria-labelledby="missH">
    <p class="t-label">Edition One</p>
    <h1 class="t-h2 missing__h" id="missH">${/^\d{1,3}$/.test(raw) ? `There is no edition No. ${esc(raw.padStart(2, '0'))}.` : 'There is no such edition.'}</h1>
    <p class="t-lead missing__lead">Edition One is ten bottles, No. 01 to No. 10.</p>
    <a class="btn btn--kajal missing__btn" href="shop.html"><span>Shop Edition One</span></a>
    <ol class="tenline" aria-label="The ten editions">${EDITIONS.map((x) => `<li><a class="tenline__item" href="product.html?n=${x.n}"><span class="tenline__well" aria-hidden="true"><img src="assets/img/bottle-${x.n}-sm.webp" alt="" width="320" height="430" loading="lazy"></span><i class="chip" style="--chip:${x.ground}" aria-hidden="true"></i><span class="t-label tenline__n">No. ${x.n}</span><span class="t-small tenline__art">${esc(x.art)}</span></a></li>`).join('')}</ol>
  </section>`;
  markReady();
  await new Promise(() => {});
}
const e = byN(n);
const idx = EDITIONS.indexOf(e);
const prevE = EDITIONS[(idx + 9) % 10], nextE = EDITIONS[(idx + 1) % 10];

// the page takes the edition's colours: the header's ink and band, the browser bar, the title
setInk('#siteHeader', '--nav-ink', e.text);
setInk('#siteHeader', '--nav-ground', e.ground);
document.title = `No. ${e.n} ${e.art}, ${e.colour} — JALRANG`;
$('meta[name="theme-color"]').setAttribute('content', e.ground);
$('meta[name="description"]').setAttribute('content', `JALRANG Edition One, No. ${e.n}: ${e.art}, ${e.region}, in ${e.colour}. A concept shop by J&J Co.; nothing is sold. ${e.line}`);
$('meta[property="og:title"]').setAttribute('content', document.title);
$('meta[property="og:description"]').setAttribute('content', `${e.art}, ${e.region}, in ${e.colour}. A concept by J&J Co.`);
$('meta[property="og:image"]').setAttribute('content', `assets/img/still-${e.n}.webp`);
// the picture's own size and alt text go with it (the page's static tags describe the 1200 x 630 share card)
$('meta[property="og:image:width"]').setAttribute('content', '1086');
$('meta[property="og:image:height"]').setAttribute('content', '1448');
$('meta[property="og:image:alt"]').setAttribute('content', `The ${e.art} bottle in ${e.colour}, with a knurled brass cap.`);

initChrome({ page: 'product', own: true });
setOnScreen(n);   // the Passport's message names this colour

// ---- the page ----
const main = $('#main');
main.dataset.edition = e.n;
const pts = sorted(e);
const TABS = [
  { name: 'Studio', img: `assets/img/still-${e.n}.webp`, alt: `The ${e.art} bottle in ${e.colour}, with a knurled brass cap.`, cap: [`The ${e.art} bottle in ${e.colour}, with a knurled brass cap.`] },
  { name: 'Found in India', img: `assets/img/place-${e.n}.webp`, alt: `${e.colour}, found in India: ${e.place}`, cap: [e.place], label: `${e.colour}, found in India`, place: true },
  { name: 'The painting', img: `assets/img/wrap-${e.n}.webp`, alt: `The ${e.art} painting laid flat: ${e.line}`, cap: [`The ${e.art} painting, laid flat.`], wide: true },
  ...(e.n === '01' ? [{ name: 'Edition film', film: 'e-01', poster: 'assets/video/e-01.webp', cap: ['Pattachitra, in Sindoor.', 'Film made with AI for this concept'], label: 'Edition film · No. 01' }] : []),
];
const SPEC = [
  ['Capacity', '750 ml'], ['Cold', 'Cold up to 24 hours'], ['Hot', 'Hot up to 12 hours'],
  ['Body', '18/8 (304) stainless steel, double wall, vacuum insulated'], ['Cap', 'Brass cap, steel inner'],
  ['Size', '272 mm tall, 76 mm across'], ['Weight', 'About 420 g'], ['Painting', '180 mm tall, all the way round'],
  ['Engraving', 'A name, up to 12 letters, on the base'], ['Price', '₹4,800 · All ten, in a sheesham case — ₹46,000'],
  ['Return', 'Worn one out? Send it back. We recycle the steel'],
];
const others = EDITIONS.filter((x) => x.n !== e.n);

main.innerHTML = `
<section class="ph" id="buy" aria-labelledby="pName">
  <p class="giant ph__giant" aria-hidden="true" inert><span>${esc(e.colour)}</span></p>
  <div class="ph__stage" aria-hidden="true">
    <div class="plinth"><i class="plinth__shadow"></i></div>
    <div class="ph__slot" id="pSlot"></div>
    <a class="bhit" href="#unwrap" data-go="unwrap" tabindex="-1" aria-hidden="true" data-cursor="UNWRAP" data-cursor-coin="${e.n}"></a>
    <img class="ph__pk" src="assets/img/bottle-${e.n}.webp" alt="" width="720" height="971" decoding="async">
  </div>
  <div class="ph__words">
    <nav class="crumbs" aria-label="Breadcrumb"><ol class="t-label">
      <li><a class="hit" href="shop.html#w${e.n}">Shop</a></li><li><span aria-current="page">Edition One · No. ${e.n}</span></li>
    </ol></nav>
    <h1 class="t-h2 ph__name" id="pName">${esc(e.art)}</h1>
    <p class="t-small ph__meta">${esc(e.region)}&nbsp;·&nbsp;${esc(e.colour)}</p>
    <p class="t-body ph__line">${esc(e.line)}</p>
    <a class="link t-button hit ph__jump" href="#unwrap" data-go="unwrap">Unwrap it</a>
  </div>
  <form class="buy" id="buyForm" novalidate aria-label="Buy No. ${e.n} ${esc(e.art)}">
    <div class="buy__head"><p class="t-price">${fmt(PRICE.one)}</p><p class="t-label">750 ml</p></div>
    <div class="field buy__engrave">
      <label class="t-label" for="engrave">Engrave a name (up to 12 letters)</label>
      <input id="engrave" name="engraving" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="engraveHint">
      <p class="field__hint" id="engraveHint"><span aria-live="polite">Engraved on the base.</span><span class="buy__count" id="engraveCount">0 / 12</span></p>
    </div>
    <div class="qty" role="group" aria-labelledby="qtyLabel">
      <span class="t-label qty__label" id="qtyLabel">Quantity</span>
      <button class="qty__b" type="button" id="qtyLess" aria-label="One fewer">${MINUS}</button>
      <output class="t-body qty__n" id="qtyN" aria-live="polite">1</output>
      <button class="qty__b" type="button" id="qtyMore" aria-label="One more">${PLUS}</button>
    </div>
    <button class="btn btn--wide buy__add" type="submit" id="addBtn"><span>Add to bag — ${fmt(PRICE.one)}</span></button>
    <p class="t-small buy__note">A concept shop. Nothing is sold or charged here.</p>
  </form>
</section>

<section class="pg" id="gallery" aria-labelledby="galH">
  <div class="pg__side">
    <h2 class="t-label" id="galH">Gallery</h2>
    <div class="pg__tabs" role="tablist" aria-labelledby="galH">
      ${TABS.map((t, i) => `<button class="pg__tab" type="button" role="tab" id="pgTab${i}" aria-controls="pgView" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="t-label pg__n">${String(i + 1).padStart(2, '0')}</span><span class="t-lead">${t.name}</span></button>`).join('')}
    </div>
  </div>
  <div class="pg__view" id="pgView" role="tabpanel" aria-labelledby="pgTab0" tabindex="0"></div>
  <div class="pg__cap" id="pgCap"></div>
</section>

<section class="pu" id="unwrap" aria-labelledby="unwrapH">
  <div class="pu__frame">
    <div class="plinth"><i class="plinth__shadow"></i></div>
    <div class="pu__text">
      <h2 class="t-h2" id="unwrapH">Unwrap it.</h2>
      <p class="t-lead">The painting goes all the way round. Here it is, all the way out.</p>
    </div>
    <figure class="pu__flat" id="unwrapFlat">
      <span class="pu__sheet"><img src="assets/img/wrap-${e.n}.webp" alt="The ${esc(e.art)} painting of No. ${e.n}, laid flat." width="1448" height="1086" decoding="async" loading="lazy"><i class="pu__shade" aria-hidden="true"></i></span>
      ${pts.map((q, k) => `<span class="pu__mark t-label" style="left:${(q.x * 100).toFixed(1)}%;top:${(q.y * 100).toFixed(1)}%" aria-hidden="true">0${k + 1}</span>`).join('')}
    </figure>
    <div class="pu__details">
      <p class="t-label">Three details</p>
      <ol class="pu__list" id="unwrapCaps">${pts.map((q, k) => `<li><span class="t-label pu__k">0${k + 1}</span><span class="t-small">${esc(q.cap)}</span></li>`).join('')}</ol>
    </div>
    <p class="sr-only" id="unwrapState" aria-live="polite"></p>
  </div>
</section>
<div class="hotspots" id="hotspots" data-edition="${e.n}"></div>

<section class="ps" id="spec" aria-labelledby="specH">
  <div class="ps__side">
    <h2 class="t-label" id="specH">Specification</h2>
    <p class="t-h3 ps__name">No. ${e.n} ${esc(e.art)}</p>
    <p class="t-small">${esc(e.region)}&nbsp;·&nbsp;${esc(e.colour)}</p>
    <button class="btn btn--line ps__add" type="button" id="addAgain"><span>Add to bag — ${fmt(PRICE.one)}</span></button>
  </div>
  <div class="ps__body">
    <table class="ps__table"><tbody>
      ${SPEC.map(([k, v]) => `<tr><th scope="row" class="t-label">${k}</th><td class="t-body">${esc(v)}</td></tr>`).join('')}
    </tbody></table>
    <p class="t-small ps__note">Hours measured with iced or boiling water, lid closed, at a room temperature of 25°C.</p>
  </div>
</section>

<section class="pm paper" id="more" data-ground="chuna" aria-labelledby="moreH">
  <div class="pm__head">
    <h2 class="t-h2" id="moreH">More editions.</h2>
    <nav class="pm__pager" aria-label="Previous and next edition">
      <a class="pm__step pm__step--prev" href="product.html?n=${prevE.n}" rel="prev"><span class="t-label">${ARROW_L}Previous edition</span><span class="t-h3">No. ${prevE.n} ${esc(prevE.art)}</span></a>
      <a class="pm__step pm__step--next" href="product.html?n=${nextE.n}" rel="next"><span class="t-label">Next edition${ARROW_R}</span><span class="t-h3">No. ${nextE.n} ${esc(nextE.art)}</span></a>
    </nav>
  </div>
  <ol class="pm__list">
    ${others.map((x) => `<li><a class="pm__item" href="product.html?n=${x.n}"><i class="chip pm__chip" style="--chip:${x.ground}" aria-hidden="true"></i><span class="t-label pm__no">No. ${x.n}</span><span class="t-body pm__art">${esc(x.art)}</span><span class="t-small pm__colour">${esc(x.colour)} · ${fmt(PRICE.one)}</span></a></li>`).join('')}
  </ol>
</section>`;

// The unwrap's pinned layout (320vh) is decided now, for the mode the page is about to try, not after the 3D has started:
// the browser restores a reloaded or returned-to scroll position while the page is still being built, and a layout that
// grows afterwards would carry the visitor somewhere else. If the 3D then fails the class is taken off again (below).
if (ENV.mode === '3d') root.classList.add('pu-pinned');

// Arrival: the page waits under a straight line and its ground rises when it is ready: fitted, and the 3D bottle drawn (700 ms).
// The start state is set at once, so the page is never seen and then hidden again; one that is slow to start (fonts, the 3D,
// a picture that does not arrive) rises after 4 s anyway, and its controls work all that time.
const arrival = !ENV.reduce && !ENV.test && window.gsap ? [main, $('#gl')].filter(Boolean) : null;
if (arrival) gsap.set(arrival, { clipPath: 'inset(100% 0% 0% 0%)' });
let risen = false;
function rise() {
  if (risen) return;
  risen = true;
  if (arrival) gsap.fromTo(arrival, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'tide', delay: 0.05, onComplete: () => arrival.forEach((x) => { x.style.clipPath = ''; }) });
}
setTimeout(rise, 4000);

// ---- the mode: 3D bottle and unwrap where they can run ----
let stage = null, unwrap = null, GLm = null, glLive = false;   // glLive: the 3D has started and drawn, so the tick may draw
async function startGL() {
  if (ENV.mode !== '3d') return false;
  try {
    GLm = await import('./product-gl.js');
    GLm.GL.tier = ENV.tier;
    stage = GLm.initStage(n);
    if (!stage) throw new Error('WebGL 2 would not start');
    const U = await import('./product-unwrap.js');
    unwrap = await U.initUnwrap({ sec: $('#unwrap'), n, ST: GLm });
    if (!(await GLm.prepare())) throw new Error('programs failed');
    return true;
  } catch (err) {
    if (GLm && GLm.GL) { try { GLm.GL.idle = true; GLm.frame(); } catch (x) { /* gone */ } }
    stage = null; unwrap = null;
    ENV.mode = '2d';
    return false;
  }
}
// The 3D starts in the background: the buy panel, the gallery and the scroll work from the first frame, and the packshot stands
// in until the bottle has drawn. Everything that needs to know how it went waits for `glStart` below.
const glStart = startGL();

// a window that crosses the narrow line starts again in the right mode, and so does a device that switches its wish for
// less motion while the page is open (unless the visitor has chosen for themselves, on the shop's menu); never while the
// engraving (or any text field) has focus: env.js restartIf waits for focus to leave
if (!TEST.mode) {
  const phone = ENV.phone;
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => restartIf(() => isNarrow() !== phone), 400); });
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const again = () => restartIf(() => !ENV.motionChoice && rm.matches !== ENV.systemReduce);
  if (rm.addEventListener) rm.addEventListener('change', again); else rm.addListener(again);
}

// ---- smooth scroll (not on a phone or a calm page) ----
let lenis = null;
if (!ENV.flow && window.Lenis) {
  lenis = new Lenis({ autoRaf: false, lerp: 0.075, wheelMultiplier: 0.88 });   // the same wheel feel as the landing and the shop
  setLenis(lenis);
}
function goTo(id, p = 0, immediate = false) {
  const el = document.getElementById(id);
  if (!el) return;
  let y = el.getBoundingClientRect().top + scrollY;
  if (id === 'unwrap' && unwrap) y += clamp(p) * (el.offsetHeight - innerHeight);
  else y -= id === 'buy' ? y : 0;
  const now = immediate || ENV.reduce;
  if (lenis) lenis.scrollTo(y, { immediate: now, force: true, duration: 1.2 });
  else scrollTo({ top: y, behavior: now ? 'auto' : 'smooth' });
}
main.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-go]');
  if (!a) return;
  ev.preventDefault();
  goTo(a.dataset.go, a.dataset.go === 'unwrap' && unwrap ? 0.26 : 0);
});

// ---- buy: engraving, quantity, add ----
const form = $('#buyForm'), input = $('#engrave'), count = $('#engraveCount'), hint = $('#engraveHint').firstElementChild;
const HINT = hint.textContent;
let qty = 1;
function setQty(q) {
  qty = clamp(q, 1, MAX_QTY);
  $('#qtyN').textContent = qty;
  $('#qtyLess').disabled = qty <= 1;
  $('#qtyMore').disabled = qty >= MAX_QTY;
  $('#addBtn').firstElementChild.textContent = qty > 1 ? `Add ${qty} to bag — ${fmt(PRICE.one * qty)}` : `Add to bag — ${fmt(PRICE.one)}`;
}
setQty(1);
// Capitals, figures and . ' - only, 12 at most. A character that is left out is said so in the hint; the count is what
// will be engraved (spaces trimmed). Not while an on-screen keyboard is still composing a word: changing the value then
// garbles it; compositionend catches up.
function engrave() {
  const raw = input.value, kept = raw.toUpperCase().replace(/[^A-Z0-9 .'-]/g, ''), v = kept.slice(0, 12);
  if (v !== raw) { const at = Math.max(0, input.selectionStart - (raw.length - v.length)); input.value = v; try { input.setSelectionRange(at, at); } catch (x) { /* type */ } }
  count.textContent = `${cleanEngraving(v).length} / 12`;
  const say = kept.length < raw.length ? "Letters A to Z, figures and . ' - only." : HINT;
  if (hint.textContent !== say) hint.textContent = say;   // (a live region: rewriting the same words would be read again)
}
input.addEventListener('input', (ev) => { if (!ev.isComposing) engrave(); });
input.addEventListener('compositionend', engrave);
$('#qtyLess').addEventListener('click', () => setQty(qty - 1));
$('#qtyMore').addEventListener('click', () => setQty(qty + 1));
function add(q) {
  const line = bag.add(n, { qty: q, engraving: cleanEngraving(input.value) });   // chrome.js shows the toast and rolls Bag (n)
  if (line && glLive && !ENV.reduce) stage.hero.twistCap();
  return !!line;                                  // false: the bag is full, chrome.js says so and the page keeps what was typed
}
// after an add the engraving starts again (and so does the quantity, after the form's own add), so no engraved name is
// carried silently into the next add (the toast, with its "View bag", says what went in)
const clearEngraving = () => { input.value = ''; count.textContent = '0 / 12'; if (hint.textContent !== HINT) hint.textContent = HINT; };
form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!add(qty)) return;
  setQty(1);
  clearEngraving();
});
$('#addAgain').addEventListener('click', () => { if (add(1)) clearEngraving(); });

// ---- gallery: one picture, text tabs; a change rises in place under a straight line ----
const view = $('#pgView'), capBox = $('#pgCap'), tabs = [...document.querySelectorAll('.pg__tab')];
let tab = -1, tw = null;
function media(t) {
  if (t.film) {
    const v = document.createElement('video');
    v.className = 'pg__media';
    Object.assign(v, { muted: true, loop: true, playsInline: true, poster: t.poster });
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.setAttribute('aria-label', 'Edition film, No. 01: Pattachitra, in Sindoor. Select to play or pause.');
    v.src = clip(t.film);
    if (ENV.saveData) v.preload = 'none';   // Data Saver: the poster until it is pressed
    else if (!ENV.reduce && !ENV.test) { const r = v.play(); if (r && r.catch) r.catch(() => {}); }
    return v;
  }
  const im = new Image();
  im.className = 'pg__media' + (t.place ? ' pg__media--place' : '') + (t.wide ? ' pg__media--wide' : '');
  im.alt = t.alt; im.src = t.img; im.decoding = 'async';
  return im;
}
const stopV = (m) => { if (m && m.tagName === 'VIDEO') { m.pause(); m.removeAttribute('src'); m.load(); } };
function show(i, animate) {
  if (i === tab) return;
  const t = TABS[i];
  tab = i;
  tabs.forEach((b, k) => { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
  view.setAttribute('aria-labelledby', tabs[i].id);
  capBox.innerHTML = `${t.label ? `<p class="t-label">${esc(t.label)}</p>` : ''}${t.cap.map((l) => `<p class="t-small">${esc(l)}</p>`).join('')}`;
  if (tw) tw.progress(1);
  const old = [...view.children], m = media(t);
  view.appendChild(m);
  const drop = () => old.forEach((o) => { stopV(o); o.remove(); });
  if (!animate || ENV.reduce || !old.length || !window.gsap) { drop(); return m.decode ? m.decode().catch(() => {}) : Promise.resolve(); }
  const go = () => {
    m.style.clipPath = 'inset(100% 0% 0% 0%)';
    tw = gsap.to(m, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.56, ease: 'tide', onComplete: () => { tw = null; m.style.clipPath = ''; drop(); } });
  };
  if (m.decode) m.decode().catch(() => {}).then(go); else go();
  return Promise.resolve();
}
const firstPic = show(Q.has('tab') ? clamp(parseInt(Q.get('tab'), 10) || 0, 0, TABS.length - 1) : 0, false);
$('.pg__tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('[role="tab"]');
  if (b) show(tabs.indexOf(b), true);
});
$('.pg__tabs').addEventListener('keydown', (ev) => {
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  const j = { ArrowDown: (i + 1) % tabs.length, ArrowRight: (i + 1) % tabs.length, ArrowUp: (i + tabs.length - 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[ev.key];
  if (j === undefined) return;
  ev.preventDefault();
  show(j, true);
  tabs[j].focus();
});
function toggleFilm() {
  const v = view.querySelector('video');
  if (!v) return;
  if (v.paused) { const r = v.play(); if (r && r.catch) r.catch(() => {}); } else v.pause();
}
view.addEventListener('click', toggleFilm);
// the picture is a tab panel with a tab stop: Enter or Space plays and pauses the film from there, as a click does
view.addEventListener('keydown', (ev) => {
  if ((ev.key !== 'Enter' && ev.key !== ' ') || ev.target !== view || !view.querySelector('video')) return;
  ev.preventDefault();
  toggleFilm();
});

// ---- the giant colour word: as large as it can be without reaching the buy panel ----
const giant = $('.ph__giant'), giantWord = giant.firstElementChild;
function fitGiant() {
  giant.style.removeProperty('--g');
  const narrow = root.classList.contains('is-narrow');
  // wide: the word ends 24 px before the bottle's body (9.83vh either side of the middle; the packshot of mode-2d is a
  // little wider: 10.85vh, its shadow included), so no letter is ever cut by the bottle; narrow: it stands alone above the bottle, margin to margin
  const room = narrow ? hero.clientWidth - 2 * (parseFloat(getComputedStyle(hero).paddingLeft) || 24)
    : Math.min($('.buy').getBoundingClientRect().left - 48, hero.clientWidth / 2 - (ENV.gl ? 0.0983 : 0.1085) * innerHeight - 24) - giant.getBoundingClientRect().left;
  const w = giantWord.getBoundingClientRect().width;
  if (w > room) giant.style.setProperty('--g', (room / w).toFixed(4));
}

// ---- the tick: smooth scroll, then the bottle's pose, then the frame ----
const hero = $('#buy'), slot = $('#pSlot'), pu = $('#unwrap'), puFrame = $('.pu__frame', pu);
let uDirty = true;
function anchorRect(fr) {   // the shop's anchor: root at 84.2% of the frame, cap top at 14%
  return { left: fr.left, width: fr.width, top: fr.top + fr.height * 0.14, bottom: fr.top + fr.height * 0.842, height: fr.height * 0.702 };
}
function poseNow() {
  const H = innerHeight;
  if (unwrap) {
    const ur = pu.getBoundingClientRect();
    if (ur.top < H && ur.bottom > 0) {
      const A = GLm.slotPose(anchorRect(puFrame.getBoundingClientRect()));
      const p = clamp(-ur.top / Math.max(1, ur.height - H));
      if (uDirty || Math.abs(p - unwrap.p) > 1e-5) { unwrap.update(p, A); uDirty = false; }
      return unwrap.pose(p, A);
    }
    // the hero always shows the wrapped bottle, whatever the unwrap was doing when it left
    if (unwrap.p > 0 && unwrap.p < 1) { unwrap.update(0, null); uDirty = true; }
  }
  const hr = slot.getBoundingClientRect();
  if (hr.bottom > 0 && hr.top < H && hr.height > 0) {
    const P = GLm.slotPose(hr);
    P.ry = Math.PI * 2 * clamp(scrollY / Math.max(1, hero.offsetHeight));   // one turn as the hero leaves
    return P;
  }
  return null;
}
let tickFault = false;
if (window.gsap) {
  gsap.ticker.add((time, dms) => {
    if (lenis) lenis.raf(time * 1000);
    if (!glLive) return;
    // a frame that throws is logged once and skipped; the next one starts again (no console flood, no frozen page)
    try {
      GLm.tickGL(time, dms);
      GLm.update(poseNow(), e.ground);
      GLm.frame(dms);
    } catch (err) { if (!tickFault) { tickFault = true; console.error('JALRANG: a frame failed, the page carries on.', err); } }
  });
}

// ---- the giant word is fitted once the fonts are in; the page rises after that (see the arrival above) ----
const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
const fitted = fonts.then(() => { fitGiant(); });
let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fitGiant, 120); });

// ---- from here on the 3D has started, or has not ----
const glOK = await glStart;
glLive = glOK;
setMode(ENV.mode);
if (!glOK && ENV.mode === '2d') fitGiant();   // it was fitted with the 3D bottle's half-width while the 3D was still to start
root.classList.toggle('pu-pinned', !!unwrap);

// A lost WebGL context shows the packshot again at once. If it is given back, the bottle draws again (js/gl/core.js builds
// the studio light again); if not within 2.5 s the page starts over without the 3D, as the shop does (full materials, then none).
if (stage) {
  const canvas = GLm.GL.renderer.domElement;
  let back = true;
  canvas.addEventListener('webglcontextlost', () => {
    back = false;
    root.classList.remove('gl-ready');
    setTimeout(() => {
      if (back) return;
      if (GLm.GL.tier === 'full') store.session('tier', 'safe'); else store.session('gl', 'off');
      restartIf(() => !back);
    }, 2500);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    back = true;
    const f0 = GLm.GL.frames;
    const chk = () => (GLm.GL.frames > f0 ? root.classList.add('gl-ready') : setTimeout(chk, 60));
    chk();
  });
}

// the packshot gives way to the 3D bottle once the bottle has drawn with its painting
let glShown = Promise.resolve();
if (stage) {
  glShown = new Promise((res) => {
    const t0 = performance.now();
    const chk = () => {
      if ((GLm.ready() && GLm.GL.frames > 0) || performance.now() - t0 > 8000) { root.classList.add('gl-ready'); res(); }
      else setTimeout(chk, 60);
    };
    chk();
  });
}

// ---- 2D and phone: the painting unwraps as it comes up the screen (FIX2, 16 Oct 2026) ----
// Where the 3D unwrap cannot run, the flat painting starts as the bottle shows it from the front
// (the middle half of the painting, drawn into the bottle's width, shaded at its curved edges) and
// opens out to flat with the scroll; the three numbered marks arrive once it lies flat. The same for
// all ten editions. Reduced motion: flat from the start.
const flatFig = $('#unwrapFlat');
if (!unwrap && flatFig && !ENV.reduce) {
  root.classList.add('pu-roll');
  const sheet = $('.pu__sheet', flatFig);
  let last = -1;
  const roll = () => {
    const r = flatFig.getBoundingClientRect(), H = innerHeight;
    const p = clamp((H * 0.92 - r.top) / (H * 0.5));
    if (Math.abs(p - last) < 1e-3) return;
    last = p;
    const k = p * p * (3 - 2 * p), cut = 25 * (1 - k), sx = 0.64 + 0.36 * k;
    sheet.style.clipPath = `inset(0% ${cut.toFixed(2)}% 0% ${cut.toFixed(2)}%)`;
    sheet.style.transform = `scaleX(${sx.toFixed(4)})`;
    sheet.style.setProperty('--shade', (1 - k).toFixed(3));
    flatFig.classList.toggle('is-flat', p > 0.97);
  };
  addEventListener('scroll', roll, { passive: true });
  addEventListener('resize', roll);
  roll();
}

// ---- the header's band follows the ground under it: the edition, then Chuna for "More editions" ----
const more = $('#more');
let onChuna = null;
function band() {
  const c = more.getBoundingClientRect().top <= (parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 72) / 2;
  if (c === onChuna) return;
  onChuna = c;
  setInk('#siteHeader', '--nav-ink', c ? '#1A1612' : e.text);
  setInk('#siteHeader', '--nav-ground', c ? '#F7F2E8' : e.ground);
}
addEventListener('scroll', band, { passive: true });
band();

// ---- arrival: the page rises once it is fitted and the bottle has drawn (the start state is set above) ----
Promise.all([fitted, glShown]).then(rise);

// ---- tests: __jal.go('unwrap', 0.4), ?at=unwrap:0.4 | gallery | spec | more ----
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle() {
  if (!stage) return;
  await Promise.race([GLm.bigReady(), wait(6000)]);   // (the 3D bottle's own request for the full painting: asking for the file again is a second download of 800 KB where nothing is cached)
  await wait(80);
  GLm.invalidate();
  const f0 = GLm.GL.frames, t0 = performance.now();
  await new Promise((r) => { const w = () => (GLm.GL.frames > f0 + 1 || GLm.GL.idle || performance.now() - t0 > 3000 ? r() : (GLm.invalidate(), requestAnimationFrame(w))); w(); });
}
window.__jal = Object.assign(window.__jal || {}, {
  n, mode: ENV.mode, lenis, gl: glOK,
  go: async (id, p = 0) => { goTo(id, p, true); await wait(120); uDirty = true; await settle(); },
  tab: (i) => show(i, false),
});
const at = (Q.get('at') || '').split(':');
const arrive = (async () => {
  await fonts;
  if (at[0]) { goTo(at[0], parseFloat(at[1]) || 0, true); await wait(150); }
  await glShown;
  await settle();
})();
markReady(firstPic, arrive);
