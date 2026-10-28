// The shop's own part of the persistent UI (B10): the index at the bottom left and what the shop adds
// to the shared menu (its chapters, sound and motion). The header, the menu, the dialogs, the toast and the bag count are shared:
// js/shop/chrome.js; the bag itself is js/shop/store.js. Ink and band come from the worlds controller.
import { EDITIONS, byN } from '../editions.js';
import { sound } from './sound.js';
import { ENV, store } from './env.js';
import { swap } from './ui.js';
import { onWhere } from './worlds.js';
import { jumpTo } from './jump.js';
import { dialog, setLenis } from '../shop/chrome.js';
import { bag } from '../shop/store.js';

export { dialog };
const $ = (s, r = document) => r.querySelector(s);
let lenis = null, chrome = null;

// every colour has its own world on the shop, w01 to w10, all the same (ARCH section 2)
const worldOf = (n) => 'w' + n;

// c: the object initChrome() returned (main.js)
export function initNav(l, c) {
  lenis = l;
  chrome = c;
  setLenis(l);
  initIndex();
  initMenu();
}

// ---- the index (B10.2): ten swatches and the colour of the world on screen ----
function initIndex() {
  const nav = $('#index'), list = $('#indexSwatches'), label = $('#indexLabel');
  if (!nav || !list) return;
  list.innerHTML = EDITIONS.map((e, i) => `<button class="swatch" type="button" data-n="${e.n}" tabindex="${i ? -1 : 0}" aria-label="No. ${e.n} ${e.art}, ${e.colour}" style="--sw:${e.ground}"><i></i></button>`).join('');
  const btns = [...list.children];
  if (ENV.phone) nav.setAttribute('aria-hidden', 'true');
  let here = '01', shown = '', preview = null;
  const text = (n, more) => { const e = byN(n); return `${n} / 10 · ${e.colour}${more ? ' · ' + e.art : ''}`; };
  // The label keeps 16 px clear of the plinth (37.3vh wide, centred), whose caption sits on its face.
  // Where the full text does not fit (1024-1366 px wide windows), it says less: the preview drops
  // the tradition, then the colour ("07 / 10"); with no room at all it is left empty (the current
  // swatch still marks the colour). Measured with a hidden copy of the label, in the real font.
  const ruler = label.cloneNode();
  ruler.removeAttribute('id'); ruler.setAttribute('aria-hidden', 'true');
  ruler.style.cssText = 'position:absolute;left:0;top:0;margin:0;visibility:hidden;white-space:nowrap;pointer-events:none';
  nav.appendChild(ruler);
  const fit = (...tries) => {
    const room = document.documentElement.clientWidth / 2 - 0.1865 * innerHeight - 16 - label.getBoundingClientRect().left;
    for (const t of tries) { ruler.textContent = t; if (ruler.getBoundingClientRect().width <= room) return t; }
    return '';
  };
  const paint = () => {
    const t = preview ? fit(text(preview, true), text(preview), `${preview} / 10`) : here ? fit(text(here), `${here} / 10`) : 'All ten';
    if (t !== shown) { shown = t; swap(label, t); }
  };
  onWhere((w) => {
    const ten = w.mid && w.mid.isTen;
    here = ten ? null : w.n || here;
    btns.forEach((b) => b.classList.toggle('is-current', !ten && b.dataset.n === here));
    // roving tabindex follows the colour on screen unless focus is in the strip
    if (!list.contains(document.activeElement)) btns.forEach((b) => { b.tabIndex = b.dataset.n === (here || '01') ? 0 : -1; });
    nav.classList.toggle('is-hidden', w.indexHidden);
    nav.inert = ENV.phone || !!w.indexHidden; // on a phone it is a 4 px strip: shown, never interactive
    paint();
  });
  addEventListener('resize', () => paint());
  const on = (b) => { preview = b.dataset.n; paint(); };
  const off = () => { preview = null; paint(); };
  btns.forEach((b) => {
    b.addEventListener('pointerenter', () => on(b));
    b.addEventListener('pointerleave', () => { if (document.activeElement !== b) off(); });
    b.addEventListener('focus', () => on(b));
    b.addEventListener('blur', off);
    b.addEventListener('click', () => jumpTo(worldOf(b.dataset.n), 0));
  });
  list.addEventListener('keydown', (e) => {
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = Math.min(9, i + 1);
    if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = 9;
    if (j === null) return;
    e.preventDefault();
    btns.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    btns[j].focus();
  });
}

// ---- the menu (B10.3): the shared menu, plus this page's chapters and its sound and motion ----
const MENU = [['Edition One', 'top', 0], ['All ten', 'ten', 1], ['Specification', 'spec', 0]];
function initMenu() {
  const d = chrome && chrome.menu;
  if (!d) return;
  d.extra.innerHTML = `<p class="t-label" id="menuOnPage">On this page</p><nav aria-labelledby="menuOnPage"><ol class="menu__sub">${
    MENU.map(([t, id, p]) => `<li><a class="t-lead" href="#${id}" data-p="${p}">${t}</a></li>`).join('')}</ol></nav>
    <p class="t-label menu__tenlabel" id="menuTen">The ten</p><nav aria-label="The ten editions"><ol class="menu__ten">${
    EDITIONS.map((e) => `<li><a class="t-small" href="#${worldOf(e.n)}" data-p="0"><i class="chip" style="--chip:${e.ground}" aria-hidden="true"></i><span class="t-label">${e.n}</span>${e.art}</a></li>`).join('')}</ol></nav>`;
  d.foot.innerHTML = '<button class="link t-small" id="soundToggle" type="button" aria-pressed="false">Sound off</button><button class="link t-small" id="motionToggle" type="button">Make it calm</button>';
  // a chapter: an instant jump under the open menu, then the menu leaves by its bottom edge,
  // revealing the target from below; focus goes to the target's heading
  d.extra.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    const id = a.getAttribute('href').slice(1), p = parseFloat(a.dataset.p) || 0;
    if (lenis) lenis.start();
    d.close({ returnFocus: false, then: () => jumpTo(id, p, { instant: true }) });
  });
  // sound
  const snd = $('#soundToggle');
  snd.addEventListener('click', () => sound.set(!sound.on));
  sound.set(sound.on);
  // the motion choice: both reload the page into the other mode
  const mot = $('#motionToggle');
  mot.textContent = ENV.reduce ? 'Show it with full motion' : 'Make it calm';
  mot.addEventListener('click', () => {
    if (ENV.reduce) store.set('motion', ENV.systemReduce ? 'full' : null);
    else store.set('motion', ENV.systemReduce ? null : 'calm');
    location.reload();
  });
}

// ---- add to bag: the shared bag (store.js) takes it; chrome.js shows the toast and rolls the count.
// jal:added lets the 3D bottle twist its cap when the edition just added is the one on screen.
//   kind 'one' (n, engraving, qty) or 'ten' (all ten, in a sheesham case)
export function addToBag(n, engraving = '', kind = 'one', qty = 1) {
  const line = kind === 'ten' ? bag.add(null, { set: true, qty }) : bag.add(n, { engraving, qty });
  if (!line) return;
  sound.play('twist');
  dispatchEvent(new CustomEvent('jal:added', { detail: { n: kind === 'ten' ? null : n, kind } }));
}
