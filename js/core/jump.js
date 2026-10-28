// All in-page navigation goes through jumpTo(target, p) (B10.11): anchors, the nav, the index,
// the menu, the footer nav, the first screen's catalogue and "See all ten".
//   two screens or less: Lenis, 0.9 s, tide
//   further: the covered jump. The target's flat ground rises over the page (330 ms), the page
//     jumps instantly underneath, then the target is revealed under a rising line (330 ms), so
//     ten colours never flash past
//   reduced motion or mode-flow: always instant
// Focus then moves to the target's heading, so the keyboard goes with the eye.
import { ENV } from './env.js';
import { targetY, worldOf, byId, state as WS } from './worlds.js';
import { byN } from '../editions.js';

let lenis = null, guard = false, busy = false;
// the stage's hook (stage.setJumping): while a covered jump runs, no local cut may take the line
let jumping = () => {};
export function setJumpHook(fn) { jumping = typeof fn === 'function' ? fn : () => {}; }
const tide = () => (window.CustomEase && CustomEase.get('tide')) || ((t) => t);

// anchors may carry where they land in the hold: <a href="#ten" data-p="1">
const idOf = (target) => (typeof target === 'string' ? target.replace(/^#/, '') : target && target.id);
const ALIAS = { editions: 'w01', main: 'top' };
const CHUNA = '#F7F2E8', KAJAL = '#1A1612';

// the flat ground the cover takes: the target world's colour, Chuna for All ten and the spec,
// Kajal for the footer (and anything inside it, such as the Passport)
function groundOf(id) {
  const w = byId(id);
  if (w) { const n = w.n(); return n ? byN(n).ground : CHUNA; }
  const el = document.getElementById(id);
  if (el && el.closest('#siteFooter')) return KAJAL;
  return CHUNA;
}

export function initJump(l) {
  lenis = l;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href') === '#') return;
    const id = a.getAttribute('href').slice(1);
    if (!document.getElementById(id)) return;
    e.preventDefault();
    jumpTo(id, parseFloat(a.dataset.p) || 0);
  });
  if (!ENV.flow) document.addEventListener('focusin', onFocusIn);
}

// the target's heading takes focus (tabindex -1, no scroll)
function focusTarget(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const h = el.matches('h1, h2, h3') ? el : el.querySelector('h1, h2, h3') || el;
  if (!h.hasAttribute('tabindex') && !h.matches('a[href], button, input')) h.setAttribute('tabindex', '-1');
  guard = true;
  h.focus({ preventScroll: true });
  guard = false;
}

const instantTo = (y) => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y); };

export function jumpTo(target, p = 0, { instant = false, focus = true, done } = {}) {
  if (busy) return;
  let id = idOf(target);
  id = ALIAS[id] || id;
  const y = targetY(id, p);
  if (y == null) return;
  const finish = () => { if (focus) focusTarget(id); if (done) done(); };
  const dist = Math.abs(y - scrollY);
  if (!lenis || ENV.flow || ENV.reduce || instant) { instantTo(y); finish(); return; }
  if (dist > 2 * innerHeight) { covered(id, y, finish); return; }
  lenis.scrollTo(y, { duration: 0.9, easing: tide(), force: true, onComplete: finish });
}

// the covered jump: rise (330 ms) → stop, jump, two ticks → reveal (330 ms) → start
function covered(id, y, finish) {
  const cover = document.getElementById('cover');
  if (!cover || !window.gsap) { instantTo(y); finish(); return; }
  busy = true;
  jumping(true);
  cover.style.setProperty('--cover-ground', groundOf(id));
  gsap.killTweensOf(cover);
  gsap.fromTo(cover, { clipPath: 'inset(100% 0% 0% 0%)' }, {
    clipPath: 'inset(0% 0% 0% 0%)', duration: 0.33, ease: 'tide',
    onComplete: () => {
      lenis.stop();
      lenis.scrollTo(y, { immediate: true, force: true });
      let n = 0;
      const wait = () => {
        if (++n < 2) return;
        gsap.ticker.remove(wait);
        gsap.fromTo(cover, { clipPath: 'inset(0% 0% 0% 0%)' }, {
          clipPath: 'inset(0% 0% 100% 0%)', duration: 0.33, ease: 'tide',
          onComplete: () => {
            cover.style.clipPath = '';
            busy = false;
            jumping(false);
            if (!document.documentElement.classList.contains('has-dialog')) lenis.start();
            finish();
          },
        });
      };
      gsap.ticker.add(wait);
    },
  });
}

// Keyboard path (fixed modes): focus that enters a world whose hold is not on screen brings the
// world in with an instant jump (never covered). Fully clipped frames stay focusable and in the
// a11y tree; this makes them visible.
//   #ten: to p = 1 · any other world: to p = 0
function onFocusIn(e) {
  if (guard || busy) return;
  const el = e.target;
  if (!el || !el.matches || !el.matches(':focus-visible')) return; // keyboard focus only
  const w = worldOf(el);
  if (!w) return;
  let p = 0;
  if (w.isTen) p = 1;
  const s = scrollY;
  const onScreen = WS.cur === w && WS.k >= 1 && (w.isTen ? WS.p >= 0.86 && s <= w.e + 2 : true) ;
  if (onScreen) return;
  const y = targetY(w.id, p);
  if (y == null || Math.abs(y - s) < 1) return;
  instantTo(y);
}

export { byId };
