// L6. The shop part (Chuna paper): a calm, separate section. "Edition One", the title, the set line
// (information only) and the one way into the shop, "Shop Edition One" → shop.html. Under them the
// ten packshots stand on one 1.5 px Kajal line, in spectrum order, each named under the line. The
// one motion: as the row comes up the screen, the ten rise through the line one after another, once.
// Each bottle and its caption is a way into its own world in the shop (shop.html#wNN). The bottle under the
// pointer, or in keyboard focus, lifts and the others dim (css/landing.css section 7), and the cursor's pill
// names its colour with its painting chip (js/shop/cursor.js reads data-n). Calm: standing.
import { EDITIONS } from '../editions.js';
import { L } from './state.js';
import { ENV } from '../core/env.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initRow() {
  const sec = document.getElementById('shopPart');
  const row = document.getElementById('shopRow');
  row.innerHTML = EDITIONS.map((e, i) => `
    <li class="row__item" style="--i:${i}">
      <a class="row__link" data-n="${e.n}" href="shop.html#w${e.n}" aria-label="No. ${e.n} ${esc(e.art)}, ${esc(e.colour)}: see it in the shop">
        <span class="row__well"><img class="row__pk" src="assets/img/bottle-${e.n}-sm.webp" alt="" width="320" height="431" loading="lazy"></span>
        <span class="t-label row__n">No. ${e.n}</span>
        <span class="t-small row__art">${esc(e.art)}</span>
        <span class="t-small row__colour"><i class="chip" style="--chip:${e.ground}" aria-hidden="true"></i>${esc(e.colour)}</span>
      </a>
    </li>`).join('');
  // Narrow screens: the row is a swipe track that snaps card by card, and the snap pulls a focused card that was only
  // part way in view back to where it was (the third card stays half cut off). A focused card is brought to the start.
  row.addEventListener('focusin', (e) => {
    const li = e.target.closest('.row__item');
    if (li && row.scrollWidth > row.clientWidth + 1) row.scrollLeft = li.offsetLeft;
  });
  const first = row.querySelector('.row__well');
  // The rise plays once, in time (0.9 s, 60 ms apart), as the line comes a little way up the
  // screen, so the row is always whole while it is being read. Tests and calm: standing at once.
  if (ENV.test || L.calm) row.classList.add('is-up', 'is-now');
  function update() {
    if (row.classList.contains('is-up')) return;
    const lineY = row.getBoundingClientRect().top + (first ? first.offsetHeight : 0);
    if (lineY < innerHeight * 0.94) row.classList.add('is-up');
  }
  return { id: 'shopPart', el: sec, update, free: true };
}
