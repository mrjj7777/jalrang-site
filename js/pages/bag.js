// bag.html — the bag (ARCH section 4). Chuna paper.
//   lines (packshot on its colour, No. NN art · colour, engraving, quantity stepper, Remove, line price)
//   | the summary: subtotal, Checkout → checkout.html, Keep shopping → shop.html, the concept line
// Empty: "Your bag is empty.", "Shop Edition One" and the ten, each a way to its page.
// Changes in another tab (store.js 'sync') redraw the page.
import { initChrome, markReady } from '../shop/chrome.js';
import { bag, fmt, MAX_QTY } from '../shop/store.js';
import { EDITIONS } from '../editions.js';
import { $, $$, esc, thumb, lineWords, items, MINUS, PLUS, collapse, reveal, unsaved } from './commerce.js';

initChrome({ page: 'bag' });

const main = $('#main');
main.classList.add('bagpage');
main.innerHTML = `
<div class="cpage">
  <div class="cpage__head">
    <h1 class="t-display" id="bagH" tabindex="-1">Your bag.</h1>
    <p class="t-small cpage__sub" id="bagSub"></p>
  </div>
  <div id="bagBody"></div>
  <p class="sr-only" id="bagLive" aria-live="polite"></p>
</div>`;
const body = $('#bagBody'), sub = $('#bagSub'), live = $('#bagLive');

// how a line is named to a screen reader: the edition and, when it has one, the engraving (two lines of one edition differ by it alone)
const said = (l) => `${l.name}${l.engraving ? ', engraved ' + l.engraving : ''}`;

function lineHTML(l) {
  return `<li class="line" data-id="${esc(l.id)}">
    ${thumb(l)}
    <div class="line__words">${lineWords(l)}</div>
    <div class="qty qty--bare line__qty" role="group" aria-label="Quantity, ${esc(said(l))}">
      <button class="qty__b" type="button" data-less="${esc(l.id)}" aria-label="One fewer"${l.qty <= 1 ? ' disabled' : ''}>${MINUS}</button>
      <output class="t-body qty__n">${l.qty}</output>
      <button class="qty__b" type="button" data-more="${esc(l.id)}" aria-label="One more"${l.qty >= MAX_QTY ? ' disabled' : ''}>${PLUS}</button>
    </div>
    <button class="link t-button hit line__remove" type="button" data-remove="${esc(l.id)}" aria-label="Remove ${esc(said(l))}">Remove</button>
    <div class="line__price"><p class="t-price">${fmt(l.total)}</p>${l.qty > 1 ? `<p class="t-small">${fmt(l.unit)} each</p>` : ''}</div>
  </li>`;
}

function render(focusKey) {
  const lines = bag.lines(), k = bag.count();
  main.classList.toggle('is-empty', !lines.length);
  if (!lines.length) {
    $('#bagH').textContent = 'Your bag is empty.';
    sub.textContent = '';
    body.innerHTML = `
    <div class="empty">
      <p class="t-lead empty__lead">Edition One is ten insulated steel bottles. Each carries one tradition, from Odisha to Kutch, and each has a colour of its own.</p>
      <p class="t-small empty__note">A concept shop. Nothing is sold or charged here.</p>
      ${unsaved('empty__note')}
      <a class="btn btn--kajal empty__btn" href="shop.html"><span>Shop Edition One</span></a>
      <ol class="tenline" aria-label="The ten editions">${EDITIONS.map((x) => `<li><a class="tenline__item" href="product.html?n=${x.n}"><span class="tenline__well" aria-hidden="true"><img src="assets/img/bottle-${x.n}-sm.webp" alt="" width="320" height="430" loading="lazy"></span><i class="chip" style="--chip:${x.ground}" aria-hidden="true"></i><span class="t-label tenline__n">No. ${x.n}</span><span class="t-small tenline__art">${esc(x.art)}</span></a></li>`).join('')}</ol>
    </div>`;
    return;
  }
  $('#bagH').textContent = 'Your bag.';
  sub.textContent = items(k);
  body.innerHTML = `
  <div class="bag">
    <ol class="bag__lines" aria-labelledby="bagH">${lines.map(lineHTML).join('')}</ol>
    <aside class="summary" aria-labelledby="sumH">
      <h2 class="t-label" id="sumH">Summary</h2>
      <div class="sumrow"><p class="t-body">Subtotal · ${items(k)}</p><p class="t-price" id="bagTotal">${fmt(bag.total())}</p></div>
      <a class="btn btn--kajal btn--wide summary__go" href="checkout.html"><span>Checkout</span></a>
      <a class="link t-button hit summary__back" href="shop.html">Keep shopping</a>
      <p class="t-small summary__note">A concept shop. Nothing is sold or charged here.</p>
      ${bag.persistent ? '' : '<p class="t-small summary__note">Your browser is not saving the bag, so it will be empty again when you leave this page.</p>'}
    </aside>
  </div>`;
  // keep focus on the stepper that was pressed (or its twin, when that one is now disabled)
  if (focusKey) {
    const [sel, id] = focusKey;
    const el = body.querySelector(sel);
    const row = body.querySelector(`.line[data-id="${CSS.escape(id)}"]`);
    const to = el && !el.disabled ? el : row && row.querySelector('.qty__b:not([disabled])');
    if (to) to.focus({ preventScroll: true });
  }
}

body.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.less || b.dataset.more) {
    const id = b.dataset.less || b.dataset.more;
    const l = bag.lines().find((x) => x.id === id);
    if (!l) return;
    const key = [b.dataset.less ? `[data-less="${CSS.escape(id)}"]` : `[data-more="${CSS.escape(id)}"]`, id];
    bag.setQty(id, l.qty + (b.dataset.less ? -1 : 1));
    render(key);
    const now = bag.lines().find((x) => x.id === id);
    if (now) live.textContent = `${said(now)}: quantity ${now.qty}. Subtotal ${fmt(bag.total())}.`;
  } else if (b.dataset.remove) {
    if (ev.detail > 1) return;   // the second click of a double-click would remove the line that has moved up into its place
    const id = b.dataset.remove;
    const row = b.closest('.line');
    const l = bag.lines().find((x) => x.id === id);
    const rows = $$('.line', body), i = rows.indexOf(row);
    await collapse(row);
    bag.remove(id);
    render();
    live.textContent = `${l ? said(l) : 'The line'} was removed. ${bag.count() ? 'Subtotal ' + fmt(bag.total()) + '.' : 'Your bag is empty.'}`;
    const next = $$('.line__remove', body)[Math.min(i, $$('.line__remove', body).length - 1)];
    (next || $('#bagH')).focus({ preventScroll: true });
  }
});
// another tab changed the bag
bag.onChange((ev) => { if (ev.reason === 'sync' || ev.reason === 'add' || ev.reason === 'clear') render(); });

render();
reveal($('.cpage'));
window.__jal = Object.assign(window.__jal || {}, { render });
const pics = $$('img', main).map((im) => (im.decode ? im.decode().catch(() => {}) : null));
markReady(...pics);
