// S1. The shop: Edition One, all ten worlds (W01 Sindoor to W10 Rani) from ONE template, with ONE
// motion each (16 Oct 2026, ARCH section 2). Every world is a fixed frame: the giant colour word,
// the bottle standing on the ground over its soft shadow, the
// plate in the words zone and "Found in India" in the proof zone. The world arrives by the
// straight-line cut (the bottle is repainted at the line) and, during its hold, the bottle turns
// once all the way round (3D; the 2D and flow modes show the still packshot). Nothing else moves.
// "View details" goes to that edition's product page; "Add" uses the shared bag (store.js).
// Also builds the catalogue on the shop's first screen: the ten, each a way into its world.
import { EDITIONS } from '../editions.js';
import { addToBag } from '../core/nav.js';
import { jumpTo } from '../core/jump.js';
import { chapter } from '../core/worlds.js';
import { ENV } from '../core/env.js';
import { baselineOf, inkOf } from '../core/ui.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const productURL = (n) => `product.html?n=${n}`;

const world = (e) => `
<section class="world world--ed" id="w${e.n}" data-edition="${e.n}" data-chapter="Edition One" aria-labelledby="w${e.n}-h">
  <div class="frame" data-edition="${e.n}">
    <div class="ground" aria-hidden="true" inert>
      <p class="giant">${esc(e.colour)}</p>
      <div class="plinth"><i class="plinth__shadow"></i></div>
    </div>
    <a class="bhit" href="${productURL(e.n)}" tabindex="-1" aria-hidden="true" data-cursor-coin="${e.n}"></a>
    <div class="words plate">
      <p class="t-label">Edition One · No. ${e.n}</p>
      <h2 class="t-h2 plate__art" id="w${e.n}-h">${esc(e.art)}</h2>
      <p class="t-small plate__meta">${esc(e.region)}&nbsp;·&nbsp;${esc(e.colour)}</p>
      <p class="t-body plate__line">${esc(e.line)}</p>
      <p class="t-price plate__price">₹4,800</p>
      <div class="plate__actions">
        <button class="btn plate__add" type="button" data-add="${e.n}"><span>Add ${esc(e.art)} to bag</span></button>
        <a class="link t-button hit plate__more" href="${productURL(e.n)}" aria-label="View details: No. ${e.n} ${esc(e.art)}">View details</a>
      </div>
    </div>
    <figure class="proof proof--place">
      <p class="t-label proof__label">Found in India</p>
      <div class="proof__frame"><img data-src="assets/img/place-${e.n}-sm.webp" data-srcset="assets/img/place-${e.n}-sm.webp 540w, assets/img/place-${e.n}.webp 1086w" sizes="(max-width: 899px) calc(100vw - 48px), (orientation: portrait) and (max-width: 1099px) calc(100vw - 48px), (max-height: 519px) calc(100vw - 48px), (max-width: 1179px) and (max-height: 639px) calc(100vw - 48px), 31vh" alt="${esc(e.colour)}, found in India: ${esc(e.place)}" width="540" height="720"></div>
      <figcaption class="t-small proof__cap">${esc(e.place)}</figcaption>
    </figure>
    <img class="packshot" data-src="assets/img/bottle-${e.n}.webp" alt="" aria-hidden="true" width="720" height="971">
  </div>
</section>`;

// the first screen's way into the ten: one line of ten colour chips, each a way into its world
const item = (e) => `<li><a class="cat__chip" href="#w${e.n}" style="--chip:${e.ground}" aria-label="No. ${e.n} ${esc(e.art)}, ${esc(e.colour)}">
  <i class="cat__sw" aria-hidden="true"></i><span class="t-label cat__n" aria-hidden="true">${e.n}</span></a></li>`;

export function buildRun() {
  const box = document.getElementById('editions');
  if (box && !box.querySelector('.world')) box.insertAdjacentHTML('beforeend', EDITIONS.map(world).join(''));
  const cat = document.getElementById('shopCat');
  if (cat && !cat.children.length) cat.innerHTML = EDITIONS.map(item).join('');
}

// the one motion (3D): the bottle turns once, all the way round, by 85% of the hold; it starts
// and ends facing front, so the cuts on either side always meet the same pose
export const turnPose = (p, base) => ({ ...base, ry: 2 * Math.PI * Math.min(1, p / 0.85) });

export function initRun() {
  const box = document.getElementById('editions');
  if (!box) return;
  EDITIONS.forEach((e) => chapter('w' + e.n, { pose: turnPose }));
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-add]');
    if (b) addToBag(b.dataset.add);
  });
  // ← / → while focus is inside a world: the previous or next world (Lenis, 0.9 s)
  box.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const sec = ev.target.closest('section.world--ed');
    if (!sec) return;
    const i = EDITIONS.findIndex((e) => 'w' + e.n === sec.id) + (ev.key === 'ArrowRight' ? 1 : -1);
    if (i < 0 || i >= EDITIONS.length) return;
    ev.preventDefault();
    const id = 'w' + EDITIONS[i].n;
    jumpTo(id, 0, { focus: false, done: () => {
      const t = document.querySelector(`#${id} .plate__add`);
      if (t) t.focus({ preventScroll: true });
    } });
  });
}

// The first screen's title, "Edition One": its ink exactly margin to margin (the footer lockup's
// rule), and its cap ink topping out where every giant colour word's does (12.2vh; on a phone 40 px
// under the header), so the eye meets the same line on every screen. The size never passes 36vh of
// ink height on a wide screen (short windows) and keeps 24 px clear of the words under it; it is
// measured from the real glyphs.
export async function layoutIntro() {
  const top = document.getElementById('top'), word = top && top.querySelector('.intro__word');
  if (!word) return;
  const frame = top.querySelector('.frame');
  const ink = await inkOf(word.textContent, word);
  if (!ink) return;
  const cs = getComputedStyle(frame);
  const margin = parseFloat(cs.getPropertyValue('--margin')) || 72;
  const navH = parseFloat(cs.getPropertyValue('--nav-h')) || 72;
  const R = 100;
  top.style.setProperty('--intro-size', R + 'px');
  const base = baselineOf(word) / R;
  const room = frame.clientWidth - 2 * margin;
  let F = room / (ink.right - ink.left);
  const inkTop = ENV.phone ? navH + 40 : 0.122 * innerHeight, inkH = ink.ascent + Math.max(0, ink.descent);
  if (!ENV.phone) {
    F = Math.min(F, (0.36 * innerHeight) / inkH);
    // ...and 24 px clear of the words under it: in a window about 520 to 600 px high, or one under about 1200 px wide where the
    // paragraph takes a third line, the foot rises into the title (printed over "Ten bottles", 30 px at 1100 x 520)
    const fr = frame.getBoundingClientRect();
    const tops = [...top.querySelectorAll('.intro__lead, .intro__body, .intro__set .t-small, .intro__cat .t-label')].map((e) => e.getBoundingClientRect().top - fr.top).filter((t) => t > 0);
    if (tops.length) F = Math.max(52, Math.min(F, (Math.min(...tops) - 24 - inkTop) / inkH));   // Jaini never under 52 px, as the giant words
  }
  top.style.setProperty('--intro-size', F.toFixed(2) + 'px');
  top.style.setProperty('--intro-x', (margin - ink.left * F).toFixed(2) + 'px');
  top.style.setProperty('--intro-top', (inkTop - (base - ink.ascent) * F).toFixed(2) + 'px');
  top.style.setProperty('--intro-ink-bottom', (inkTop + (ink.ascent + Math.max(0, ink.descent)) * F).toFixed(2) + 'px');
}
