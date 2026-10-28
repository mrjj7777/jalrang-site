// C7. #ten: All ten (Chuna). The ten stand side by side on one waterline, each with its number,
// name, colour, price and its own "Add"; each picture opens that edition's product page. The one motion: during the 40 vh hold the ten stand up
// through the waterline, one after another, linear to scroll; scrolling up sinks them again.
// buildRow() is shared with the opening (C0), where the same row sinks under the first cut.
import { EDITIONS } from '../editions.js';
import { addToBag } from '../core/nav.js';
import { current } from '../core/state.js';
import { chapter } from '../core/worlds.js';
import { clamp } from '../core/ui.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One column per edition: the picture stands in a clip box whose bottom edge is the waterline.
//   captions: true  — #ten: the picture links to the edition's product page; captions and "Add" below
//   captions: false — the opening: pictures only, nothing focusable (it is aria-hidden)
//   eager: true sets src at once; otherwise data-src, which the worlds engine loads when near
export function buildRow(el, { captions = true, eager = !captions } = {}) {
  if (!el) return [];
  const src = (n) => `${eager ? 'src' : 'data-src'}="assets/img/bottle-${n}-sm.webp"`;
  el.classList.add('tenrow');
  el.innerHTML = EDITIONS.map((e) => {
    const pic = `<img class="tenrow__img" ${src(e.n)} alt="" width="320" height="432" draggable="false">`;
    if (!captions) return `<div class="tenrow__col"><div class="tenrow__pic">${pic}</div></div>`;
    return `<div class="tenrow__col" data-n="${e.n}">
  <a class="tenrow__pic ten__pic" href="product.html?n=${e.n}" aria-label="View details: No. ${e.n} ${esc(e.art)}, ${esc(e.colour)}">${pic}</a>
  <p class="tenrow__cap"><span class="t-label">No. ${e.n}</span><span class="t-small">${esc(e.art)}</span><span class="t-small">${esc(e.colour)}</span><span class="t-small">₹4,800</span></p>
  <button class="link t-small tenrow__add" type="button" data-add="${e.n}" aria-label="Add No. ${e.n} ${esc(e.art)} to bag">Add</button>
</div>`;
  }).join('');
  return [...el.querySelectorAll('.tenrow__img')];
}

// before the worlds engine starts, so it finds the pictures and loads them near #ten
export function buildTen() {
  const row = document.getElementById('tenRow');
  if (row && !row.querySelector('.tenrow__col')) buildRow(row, { captions: true });
}

export function initTen() {
  const sec = document.getElementById('ten');
  if (!sec) return;
  const imgs = [...sec.querySelectorAll('.tenrow__img')];
  sec.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-add]');
    if (a) addToBag(a.dataset.add);
  });
  const all = document.getElementById('addTen');
  if (all) all.addEventListener('click', () => addToBag(current().n, '', 'ten'));
  // bottle i rises translateY(100%) → 0 over p 0.07i → 0.07i + 0.22; all ten stand by 0.85
  // (mode-flow has no chapters: the ten simply stand, the CSS default)
  const last = imgs.map(() => -1);
  chapter('ten', {
    update(p) {
      imgs.forEach((im, i) => {
        const y = Math.round((1 - clamp((p - 0.07 * i) / 0.22)) * 1000) / 10;
        if (y === last[i]) return;
        last[i] = y;
        im.style.transform = y > 0 ? `translateY(${y}%)` : '';
      });
    },
  });
}
