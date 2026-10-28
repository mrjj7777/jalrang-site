// The chrome every page shares: the header (logo, Story · Shop · Account · Bag (n), the menu
// button), the menu, the toast and the footer. Pages never fork this; they call initChrome() once,
// first thing in their module entry, before anything measures the page.
//
//   import { initChrome, markReady } from '../shop/chrome.js';
//   const chrome = initChrome({ page: 'bag' });
//   …build the page…
//   markReady(somePromise);                       // html[data-ready="1"] for the tests
//
// HTML each page provides: <header id="siteHeader"></header> and <footer id="siteFooter"></footer>
// (chrome.js fills both and appends the menu and the toast to <body>).
import { ENV, NARROW } from '../core/env.js';
import { inkOf } from '../core/ui.js';
import { current } from '../core/state.js';
import { bag, account, fmt } from './store.js';

const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
// the same pattern as the commerce pages' (js/pages/commerce.js), copied so the footer needs nothing from them
const EMAIL = /^[^\s@<>(),;:\\"[\]]+@[^\s@<>(),;:\\"[\].]+(?:\.[^\s@<>(),;:\\"[\].]+)*\.[^\s@<>(),;:\\"[\].]{2,}$/;

// the four pages of the header, in order. product.html is part of the Shop; checkout.html of the Bag.
export const PAGES = [
  { key: 'story', href: 'index.html', text: 'Story' },
  { key: 'shop', href: 'shop.html', text: 'Shop' },
  { key: 'account', href: 'account.html', text: 'Account' },
  { key: 'bag', href: 'bag.html', text: 'Bag' },
];
// a product is in the Shop; the checkout is its own step, so no header link is marked there
const SECTION_OF = { product: 'shop' };
const currentAttr = (key, page) => (key === page ? ' aria-current="page"' : key === SECTION_OF[page] ? ' aria-current="true"' : '');

const LOCKUP = (cls, label) => `<a class="${cls}" href="index.html" aria-label="${label}"><span class="wordmark wordmark--nav" aria-hidden="true">JALRANG</span><span class="deva nav__deva" lang="hi" aria-hidden="true">जलरंग</span></a>`;
const BAG_TEXT = 'Bag (<span class="nav__count"><span data-bag-count>0</span></span>)';

const C = { opts: null, lenis: null, menu: null, footerFit: Promise.resolve() };

// the cursor (js/shop/cursor.js): import { cursor } from '../shop/chrome.js'; cursor.refresh() after changing a label while the pointer is still
let cursorMod = null;
export const cursor = {
  get enabled() { return !!cursorMod && cursorMod.cursor.enabled; },
  get label() { return cursorMod ? cursorMod.cursor.label : ''; },
  get stats() { return cursorMod ? cursorMod.cursor.stats : null; },
  refresh() { if (cursorMod) cursorMod.cursor.refresh(); },
  destroy() { if (cursorMod) cursorMod.cursor.destroy(); },
};

// ---- the eases (the same three on every page), registered once GSAP is on the page ----
function eases() {
  if (!window.gsap || !window.CustomEase) return;
  gsap.registerPlugin(CustomEase);
  if (!CustomEase.get('flow')) CustomEase.create('flow', 'M0,0 C0.16,1 0.3,1 1,1');
  if (!CustomEase.get('tide')) CustomEase.create('tide', 'M0,0 C0.65,0 0.35,1 1,1');
  if (!CustomEase.get('settle')) CustomEase.create('settle', 'M0,0 C0.33,1 0.68,1 1,1');
}
const ease = (name) => (window.CustomEase && CustomEase.get(name) ? name : 'power2.inOut');
const animate = () => !!window.gsap && !ENV.reduce;

// ---- the header ----
function buildHeader() {
  const el = $('#siteHeader');
  if (!el) return null;
  const { page, chapter } = C.opts;
  el.classList.add('nav');
  el.innerHTML = `
  <div class="nav__left">
    ${LOCKUP('nav__lockup', 'JALRANG, the story')}
    ${chapter ? '<p class="t-label nav__chapter" id="chapterLabel"></p>' : ''}
  </div>
  <nav class="nav__right" aria-label="Main">
    ${PAGES.map((p) => p.key === 'bag'
      ? `<a class="t-nav nav__link nav__bag" href="${p.href}"${currentAttr(p.key, page)}>${BAG_TEXT}</a>`
      : `<a class="t-nav nav__link nav__wide" href="${p.href}"${currentAttr(p.key, page)}>${p.text}</a>`).join('\n    ')}
    <button class="nav__menu" id="menuOpen" type="button" aria-expanded="false" aria-controls="siteMenu"><span class="sr-only">Menu</span><i aria-hidden="true"></i></button>
  </nav>`;
  return el;
}

// ---- dialogs: open with the cut (a line rising from the bottom, 700 ms) and close by their bottom
// edge rising (560 ms); focus stays inside; Escape closes the top one. While one is open the page
// does not scroll (Lenis is stopped when the page has one: setLenis) and html.has-dialog is set. ----
const DIALOGS = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function dialog(el, { opener, onOpen, onClose, first } = {}) {
  const d = { el, isOpen: false, returnTo: null };
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !d.isOpen) return;
    const f = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  });
  d.open = (from) => {
    if (d.isOpen) return;
    d.isOpen = true;
    hold(true);
    d.returnTo = from || document.activeElement;
    el.hidden = false;
    if (opener) opener.setAttribute('aria-expanded', 'true');
    if (C.lenis) C.lenis.stop();
    root.classList.add('has-dialog');
    if (onOpen) onOpen();
    if (window.gsap) gsap.killTweensOf(el);
    if (!animate()) el.style.clipPath = 'none';
    else gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: ease('tide'), onComplete: () => cursor.refresh() });   // a still pointer: what lies under it is the panel now
    const t = (first && first()) || el.querySelector(FOCUSABLE);
    if (t) t.focus({ preventScroll: true });
  };
  // close; `then` runs once the page is visible again (before the panel has fully left)
  d.close = ({ returnFocus = true, then } = {}) => {
    if (!d.isOpen) return;
    d.isOpen = false;
    if (opener) opener.setAttribute('aria-expanded', 'false');
    const last = !DIALOGS.some((x) => x.isOpen);
    if (last) { root.classList.remove('has-dialog'); hold(false); }
    const done = () => {
      el.hidden = true; el.style.clipPath = '';
      if (last && !DIALOGS.some((x) => x.isOpen) && C.lenis) C.lenis.start();
      if (onClose) onClose();
    };
    if (then) then();
    if (returnFocus && d.returnTo && d.returnTo.isConnected) d.returnTo.focus({ preventScroll: true });
    if (window.gsap) gsap.killTweensOf(el);
    if (!animate()) done();
    else gsap.fromTo(el, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.56, ease: ease('tide'), onComplete: done });
  };
  DIALOGS.push(d);
  return d;
}
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = DIALOGS.filter((d) => d.isOpen).pop();
  if (open) { e.preventDefault(); open.close(); }
});
// While a dialog is open the page behind it does not scroll. Hiding the page's scrollbar would move the whole page by its width
// (and scrollbar-gutter does not hold that room on the root), so the scroll is stopped where it starts: wheel and touch reach
// only the dialog, which scrolls itself when it is taller than the screen (overscroll-behavior stops the chain at its ends), and
// a scroll key does something only where the dialog itself can still scroll that way, or a control uses it.
const SCROLL_KEYS = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '];
function holdPage(e) {
  const open = DIALOGS.filter((d) => d.isOpen).pop();
  if (!open || e.ctrlKey || (e.touches && e.touches.length > 1)) return;   // ctrl + wheel and a pinch are the browser's zoom
  const el = open.el, tall = el.scrollHeight > el.clientHeight + 1;
  if (e.type !== 'keydown') { if (!tall) e.preventDefault(); return; }
  const t = e.target;
  if (!SCROLL_KEYS.includes(e.key) || e.defaultPrevented || e.altKey || e.metaKey || (t.closest && t.closest('input, textarea, select, [contenteditable="true"]'))) return;
  if (e.key === ' ' && t.closest && t.closest('button, summary, [role="button"]')) return;   // Space presses a button
  const down = e.key === ' ' ? !e.shiftKey : e.key === 'PageDown' || e.key === 'End' || e.key === 'ArrowDown';
  const inside = el.contains(t) || t === document.body || t === document.documentElement;   // focus nowhere: after a click on the panel's blank part
  if (!(tall && inside && (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0))) e.preventDefault();
}
// the listeners exist only while a dialog is open: a scroll-blocking touch or wheel listener on the page all the time would
// make the browser wait for this script before every scroll step
let held = false;
function hold(on) {
  if (on === held) return;
  held = on;
  const f = on ? 'addEventListener' : 'removeEventListener';
  document[f]('wheel', holdPage, { passive: false, capture: true });
  document[f]('touchmove', holdPage, { passive: false, capture: true });
  document[f]('keydown', holdPage, true);
}
// a page with smooth scroll hands it over, so dialogs can stop and start it
export function setLenis(lenis) { C.lenis = lenis || null; }

// ---- the menu: the four pages in Jaini, then whatever the page adds (menu.extra, menu.foot) ----
function buildMenu() {
  const { page } = C.opts;
  const el = document.createElement('div');
  el.className = 'menu paper';
  el.id = 'siteMenu';
  Object.assign(el.dataset, { ground: 'chuna', lenisPrevent: '' });
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Menu');
  el.hidden = true;
  el.innerHTML = `
  <div class="menu__top">${LOCKUP('menu__lockup', 'JALRANG, the story')}<button class="link t-button menu__close" type="button">Close</button></div>
  <div class="menu__body">
    <nav class="menu__nav" aria-label="Pages"><ol class="menu__list">
      ${PAGES.map((p) => `<li><a class="t-h2 menu__link" href="${p.href}"${currentAttr(p.key, page)}><span>${p.key === 'bag' ? BAG_TEXT : p.text}</span></a></li>`).join('')}
    </ol></nav>
    <div class="menu__extra"></div>
  </div>
  <div class="menu__foot"></div>`;
  document.body.appendChild(el);
  const btn = $('#menuOpen');
  const lines = [...el.querySelectorAll('.menu__link > span')];
  const rise = () => {
    if (!animate()) return;
    gsap.killTweensOf(lines);
    gsap.fromTo(lines, { yPercent: 105 }, { yPercent: 0, duration: 0.56, ease: ease('flow'), stagger: 0.07, delay: 0.14 });
  };
  const d = dialog(el, { opener: btn, onOpen: () => { rise(); if (C.opts.onMenu) C.opts.onMenu(); } });
  if (btn) btn.addEventListener('click', () => d.open(btn));
  $('.menu__close', el).addEventListener('click', () => d.close());
  // the page you are on: close the menu and go to its top instead of loading it again
  el.addEventListener('click', (e) => {
    const a = e.target.closest('a[aria-current="page"]');
    if (!a || !el.contains(a)) return;
    e.preventDefault();
    if (C.lenis) C.lenis.start();   // stopped by the open menu: its start() after the close would cancel the glide to the top
    d.close({ returnFocus: false, then: () => toTop() });
  });
  d.extra = $('.menu__extra', el);
  d.foot = $('.menu__foot', el);
  return d;
}
function toTop() {
  if (C.opts.onSelf) C.opts.onSelf();
  else if (C.lenis) C.lenis.scrollTo(0, { immediate: ENV.reduce });
  else scrollTo({ top: 0, behavior: ENV.reduce ? 'auto' : 'smooth' });
}

// ---- the toast: "No. 03 Madhubani, Haldi, is in your bag. View bag" (4 s) ----
let toastTimer = 0;
function buildToast() {
  const t = document.createElement('div');
  t.className = 'toast';
  t.id = 'toast';
  t.setAttribute('role', 'region');
  t.setAttribute('aria-label', 'Notice');
  t.hidden = true;
  const view = C.opts.page === 'bag' ? '' : ' <a class="link toast__view" href="bag.html">View bag</a>';
  t.innerHTML = `<p class="t-small"><span id="toastText"></span>${view}</p>`;
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.id = 'toastLive';
  live.setAttribute('aria-live', 'polite');
  document.body.append(t, live);
}
export function toast(text) {
  const t = $('#toast');
  if (!t) return;
  $('#toastText').textContent = text;
  const live = $('#toastLive');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 60); }   // emptied first: the same words twice in a row are heard twice
  clearTimeout(toastTimer);
  if (window.gsap) gsap.killTweensOf(t);
  t.hidden = false;
  if (!animate()) t.style.clipPath = 'none';
  else gsap.fromTo(t, { clipPath: t.classList.contains('is-on') ? 'inset(0% 0% 0% 0%)' : 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.28, ease: ease('tide') });
  t.classList.add('is-on');
  toastTimer = setTimeout(() => hideToast(), 4000);
}
export function hideToast(now) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  if (!t || !t.classList.contains('is-on')) return;
  t.classList.remove('is-on');
  const done = () => { t.hidden = true; };
  if (window.gsap) gsap.killTweensOf(t);
  if (!animate() || now) done();
  else gsap.to(t, { clipPath: 'inset(100% 0% 0% 0%)', duration: 0.28, ease: ease('tide'), onComplete: done });
}
// what the toast says for an add
export function addedText(line, qty = 1) {
  if (line.set) return qty > 1 ? `${qty} × all ten, in their sheesham case, are in your bag.` : 'All ten, in their sheesham case, are in your bag.';
  return qty > 1 ? `${qty} × ${line.name} are in your bag.` : `${line.name}, is in your bag.`;
}

// ---- Bag (n): every [data-bag-count] on the page; the digit rolls up on an add (280 ms) ----
function paintCount(roll) {
  const n = String(bag.count());
  document.querySelectorAll('[data-bag-count]').forEach((c) => {
    if (c.textContent === n) return;
    c.textContent = n;
    if (roll && animate()) gsap.fromTo(c, { yPercent: 100 }, { yPercent: 0, duration: 0.28, ease: ease('flow') });
  });
  document.querySelectorAll('.nav__bag, .menu__link[href="bag.html"]').forEach((a) => a.setAttribute('aria-label', `Bag, ${n === '1' ? '1 item' : n + ' items'}`));
}

// ---- the footer ----
function buildFooter() {
  const el = $('#siteFooter');
  if (!el) return null;
  el.classList.add('footer');
  el.dataset.ground = 'kajal';
  const { page, passport: pass } = C.opts;
  el.classList.toggle('footer--lean', !pass);
  el.innerHTML = `
  <p class="footer__mark" aria-hidden="true"><span class="wordmark footer__word">JALRANG</span><span class="deva footer__deva" lang="hi">जलरंग</span></p>
  <div class="footer__cols">
    ${pass ? `<div class="footer__pass" id="passport">
      <h2 class="t-h3">The Passport.</h2>
      <p class="t-small">One stamp for every edition you own. Collect the colours; the book remembers.</p>
      <form class="footer__form" id="passForm" novalidate>
        <label class="field"><span class="t-label">Name <span class="t-small">(optional)</span></span><input name="name" autocomplete="name"></label>
        <label class="field"><span class="t-label">Email</span><input name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" autocapitalize="off" aria-describedby="passMsg" required></label>
        <button class="btn btn--chuna" type="submit"><span>Issue my passport</span></button>
        <p class="t-small footer__msg" id="passMsg" aria-live="polite"></p>
        <p class="t-small footer__note">A concept: nothing you type here is sent or stored.</p>
      </form>
    </div>` : ''}
    <nav class="footer__nav" aria-label="Footer">
      ${PAGES.map((p) => `<a class="t-nav" href="${p.href}"${currentAttr(p.key, page)}>${p.text}</a>`).join('\n      ')}
    </nav>
    <p class="t-small footer__jj">JALRANG is a brand we invented. Every movement on this page is real work, by J&amp;J Co.</p>
  </div>
  <div class="footer__legal">
    <p class="t-small">Concept project — designed by J&amp;J Co. JALRANG is a fictional brand.</p>
    <p class="t-small">The patterns, photographs and films on this page were made with AI for this concept, in the visual language of each tradition. A real edition would be drawn by artists of these communities.</p>
  </div>`;
  // the current page in the footer: go to its top rather than load it again
  el.addEventListener('click', (e) => {
    const a = e.target.closest('.footer__nav a[aria-current="page"]');
    if (a) { e.preventDefault(); toTop(); }
  });
  passport(el);
  footerRise(el);
  C.footerFit = (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => footerFitMark(el));
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => footerFitMark(el), 150); });
  return el;
}

// The lockup "JALRANG जलरंग" fills the content width: JALRANG's ink starts on the left margin and
// जलरंग ends on the right one. Measured from the real glyphs at a reference size, then scaled (the
// lockup is all em, so its width is linear in the size); never taller than half the screen.
async function footerFitMark(foot) {
  const mark = $('.footer__mark', foot), word = $('.footer__word', foot), dv = $('.footer__deva', foot);
  if (!mark || !word || !dv) return;
  const ink = await inkOf(word.textContent, word);
  if (!ink || ink.right <= ink.left) return;
  const pad = parseFloat(getComputedStyle(foot).paddingLeft) || 0;
  const room = foot.clientWidth - 2 * pad, R = 100;
  mark.style.setProperty('--wm', R + 'px');
  mark.style.setProperty('--fw-x', '0px');
  const w = dv.getBoundingClientRect().right - word.getBoundingClientRect().left - ink.left * R;
  if (!(w > 0)) return;
  const F = Math.min(R * room / w, 0.5 * innerHeight);
  mark.style.setProperty('--wm', F.toFixed(2) + 'px');
  mark.style.setProperty('--fw-x', (-ink.left * F).toFixed(2) + 'px');
}
// the lockup rises once by its line masks when the footer's top passes 70% of the screen (720 ms)
function footerRise(foot) {
  const mark = $('.footer__mark', foot);
  if (!mark) return;
  const lines = [...mark.children].map((el) => {
    const m = document.createElement('span');
    m.className = 'footer__mask';
    el.replaceWith(m);
    m.appendChild(el);
    return el;
  });
  if (ENV.reduce || ENV.phone || ENV.test || !window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  gsap.set(lines, { yPercent: 105 });
  ScrollTrigger.create({
    trigger: foot, start: 'top 70%', once: true,
    onEnter: () => gsap.to(lines, { yPercent: 0, duration: 0.72, ease: ease('flow'), stagger: 0.07 }),
  });
}
// the Passport: a concept form that checks what was typed and sends nothing
function passport(foot) {
  const form = $('#passForm', foot), msg = $('#passMsg', foot);
  if (!form || !msg) return;
  const email = form.elements.email;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = email.value.trim();
    email.removeAttribute('aria-invalid');
    if (!v) { msg.textContent = 'Check this: add an email address so we can find your passport.'; email.setAttribute('aria-invalid', 'true'); email.focus(); return; }
    if (!EMAIL.test(v)) { msg.textContent = 'Check this: that email address looks incomplete.'; email.setAttribute('aria-invalid', 'true'); email.focus(); return; }
    msg.textContent = `Issued. Page one is ${current().colour}.`;
  });
  // checked again as it is corrected: the error goes as soon as the address is right
  email.addEventListener('input', () => { if (email.getAttribute('aria-invalid') === 'true' && EMAIL.test(email.value.trim())) { email.removeAttribute('aria-invalid'); msg.textContent = ''; } });
}

// ---- start ----
// opts:
//   page      'story' | 'shop' | 'product' | 'bag' | 'account' | 'checkout' — marks the header
//   chapter   true: a chapter label slot (#chapterLabel) beside the logo (the shop)
//   mark      'always' (default) | 'managed': the logo waits for html.nav-mark (the shop's hero)
//   band      'always' (default) | 'managed': the page toggles html.nav-band itself
//   menuWide  true: the menu button stays on wide screens (the shop: chapters, sound, motion)
//   own       true: the page decides its own mode classes and starts again across the narrow line (the product page; the shop
//             always does); otherwise the page follows the window live
//   onSelf    what a click on the current page's own link does (default: back to the top)
//   onMenu    called as the menu opens
//   passport  the Passport sign-up in the footer (default: the landing and the shop only, so the
//             bag, account, checkout and product pages carry one form each at most)
export function initChrome(opts = {}) {
  C.opts = { page: 'story', chapter: false, mark: 'always', band: 'always', menuWide: false, passport: opts.page === 'story' || opts.page === 'shop', ...opts };
  const o = C.opts;
  eases();
  root.dataset.page = o.page;
  root.classList.toggle('mark-managed', o.mark === 'managed');
  root.classList.toggle('menu-wide', !!o.menuWide);
  if (o.band !== 'managed') root.classList.add('nav-band', 'nav-grain');
  // the shop and the product page decide their own mode classes (env.js setMode) and start again across the narrow line (a
  // restart that waits while a field has focus: until then they keep the layout they have); every other page follows the window live
  if (o.page !== 'shop' && !o.own) {
    root.classList.toggle('is-calm', ENV.reduce);
    const mq = matchMedia(NARROW);
    const sync = () => root.classList.toggle('is-narrow', mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', sync); else mq.addListener(sync);
    sync();
  }
  const header = buildHeader();
  buildFooter();
  buildToast();
  C.menu = buildMenu();
  // the current page's own header link: back to its top
  if (header) header.addEventListener('click', (e) => {
    const a = e.target.closest('a[aria-current="page"]');
    if (a) { e.preventDefault(); toTop(); }
  });
  paintCount(false);
  bag.onChange((ev) => {
    paintCount(ev.reason === 'add');
    if (ev.reason === 'add' && ev.line) toast(addedText(ev.line, ev.qty));
    if (ev.reason === 'full') toast('Your bag holds up to 50 different bottles. Remove one to add another.');
  });
  // a concept: no form on any page is ever sent anywhere
  document.addEventListener('submit', (e) => e.preventDefault());
  // the drop, the pill and the rings (js/shop/cursor.js: wide screens with a mouse, motion allowed). It loads on
  // the side, so a page never waits for it and never breaks without it (a file missing from a publish, a failure).
  import('./cursor.js').then((m) => { cursorMod = m; m.initCursor(); }).catch(() => {});
  window.__jal = Object.assign(window.__jal || {}, { page: o.page, bag, account, fmt, chrome: api });
  return api;
}

// html[data-ready="1"] once the fonts, the footer's fitted wordmark, the given promises and two
// frames are done (the shop sets it itself, from main.js)
export async function markReady(...waits) {
  if (document.fonts) await document.fonts.ready;
  // a lazy image below the fold never decodes until it is near, so no single wait may hold this up
  const cap = (p) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
  await Promise.all([C.footerFit, ...waits].map(cap));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  root.dataset.ready = '1';
}

const api = {
  get menu() { return C.menu; },
  get footerFit() { return C.footerFit; },
  dialog, toast, hideToast, setLenis, markReady, cursor,
};
