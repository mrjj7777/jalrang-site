// checkout.html — the checkout (ARCH section 6). Chuna paper. No payment step and no card fields (C4).
//   empty bag          → "Your bag is empty." and "Shop Edition One"
//   not signed in      → the choice: Sign in (account.html?next=checkout.html) or Continue as guest
//   1 Contact          email and mobile (signed in: the name, and the mobile)
//   2 Delivery         name, address, city, state, PIN code
//   3 Review           contact, delivery address, the lines and the total; "Place order"
//   then               "This is a concept shop. No order was placed and nothing was charged." and the
//                      bag is cleared
// Every step has a step indicator and a Back link; the browser's Back walks the steps too. What is
// typed stays in this page's memory only and is gone when the page closes. Nothing is sent.
import { initChrome, markReady } from '../shop/chrome.js';
import { bag, account, fmt, plain } from '../shop/store.js';
import { EDITIONS } from '../editions.js';
import { $, $$, esc, field, check, liveCheck, reveal, swapped, unsaved, RULES, STATES, items, miniLines, ARROW_L } from './commerce.js';

initChrome({ page: 'checkout' });

const GUEST = 'jalrang.checkout.guest';
const guestChosen = () => { try { return sessionStorage.getItem(GUEST) === '1'; } catch (e) { return memGuest; } };
let memGuest = false;
const D = { email: '', phone: '', name: '', line1: '', line2: '', city: '', state: '', pin: '' };   // memory only
const STEPS = ['Contact', 'Delivery', 'Review'];
let step = 0;        // 0 = choice or empty, 1..3 the steps, 4 done
let pos = 0;         // how many step entries this visit has pushed over the first one (Back walks them)
let unwinding = false;

const main = $('#main');
main.innerHTML = `
<div class="cpage">
  <div class="cpage__head"><h1 class="t-display" id="coBig">Checkout.</h1></div>
  <div class="co" id="co">
    <div class="co__main" id="coMain"></div>
    <aside class="summary" id="coSum"></aside>
  </div>
</div>`;
const coMain = $('#coMain'), coSum = $('#coSum');

function summary() {
  const lines = bag.lines();
  coSum.setAttribute('aria-labelledby', 'sumH');
  coSum.innerHTML = `
    <h2 class="t-label" id="sumH">Your bag · ${items(bag.count())}</h2>
    ${miniLines(lines)}
    <div class="sumrow"><p class="t-body">Subtotal</p><p class="t-body">${fmt(bag.total())}</p></div>
    <div class="sumrow sumrow--total"><p class="t-body"><strong>Total</strong></p><p class="t-price">${fmt(bag.total())}</p></div>
    <a class="link t-button hit summary__back" href="bag.html">Edit bag</a>
    <p class="t-small summary__note">A concept shop. Nothing is sold or charged here.</p>`;
}

function stepsHTML(k) {
  return `<nav aria-label="Checkout steps"><ol class="steps">${STEPS.map((s, i) => {
    const n = i + 1, cls = n < k ? 'is-done' : n === k ? 'is-now' : '';
    const inner = `<span class="steps__n" aria-hidden="true">${n}</span><span class="steps__t">${s}</span>`;
    if (n < k) return `<li class="${cls}"><button class="steps__i t-button" type="button" data-step="${n}"><span class="sr-only">Step ${n}, done: </span>${inner}</button></li>`;
    return `<li class="${cls}"><span class="steps__i t-button"${n === k ? ' aria-current="step"' : ''}><span class="sr-only">Step ${n}${n === k ? ', current' : ''}: </span>${inner}</span></li>`;
  }).join('')}</ol></nav>`;
}

const formRules = {
  1: () => (account.get() ? { phone: RULES.phone } : { email: RULES.email, phone: RULES.phone }),
  2: () => ({ name: RULES.need('the name to deliver to'), line1: RULES.need('the first line of the address'), city: RULES.need('the town or city'), state: RULES.need('the state'), pin: RULES.pin }),
};
const keep = (form) => { Object.keys(D).forEach((k) => { if (form.elements[k]) D[k] = plain(form.elements[k].value); }); };

function panel(k) {
  const a = account.get();
  if (k === 1) {
    return `${stepsHTML(1)}<div class="co__panel">
      <h2 class="t-h3 co__h" id="coH" tabindex="-1">Contact.</h2>
      ${a ? `<div class="co__hi"><p class="t-body">Signed in as <strong><bdi>${esc(a.name)}</bdi></strong>.</p><button class="link t-button hit" type="button" id="coOut">Not you? Sign out</button></div>` : ''}
      <form id="coForm" novalidate><div class="co__grid">
        <p class="t-small form__status" id="coStatus" role="status" aria-live="polite"></p>
        ${a ? '' : field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email', enter: 'next', maxlength: 254, spell: false, value: D.email, cls: 'f-half' })}
        ${field({ id: 'phone', label: 'Mobile number', type: 'tel', autocomplete: 'tel', inputmode: 'tel', enter: 'go', maxlength: 20, value: D.phone, hint: 'Ten figures.', cls: 'f-half' })}
      </div>
      <div class="co__actions">
        <button class="btn btn--kajal" type="submit"><span>Continue to delivery</span></button>
        <a class="arrow-link t-button" href="bag.html">${ARROW_L}<span>Back to bag</span></a>
      </div></form></div>`;
  }
  if (k === 2) {
    return `${stepsHTML(2)}<div class="co__panel">
      <h2 class="t-h3 co__h" id="coH" tabindex="-1">Delivery.</h2>
      <form id="coForm" novalidate><div class="co__grid">
        <p class="t-small form__status" id="coStatus" role="status" aria-live="polite"></p>
        ${field({ id: 'name', label: 'Full name', autocomplete: 'shipping name', enter: 'next', cap: 'words', maxlength: 80, value: D.name || (a ? a.name : '') })}
        ${field({ id: 'line1', label: 'Address', autocomplete: 'shipping address-line1', enter: 'next', cap: 'words', maxlength: 120, value: D.line1, hint: 'House, building, street.' })}
        ${field({ id: 'line2', label: 'Area or landmark', autocomplete: 'shipping address-line2', enter: 'next', cap: 'words', maxlength: 120, value: D.line2, optional: true })}
        ${field({ id: 'city', label: 'Town or city', autocomplete: 'shipping address-level2', enter: 'next', cap: 'words', maxlength: 60, value: D.city, cls: 'f-third' })}
        ${field({ id: 'state', label: 'State', autocomplete: 'shipping address-level1', options: STATES, value: D.state, cls: 'f-third' })}
        ${field({ id: 'pin', label: 'PIN code', autocomplete: 'shipping postal-code', inputmode: 'numeric', enter: 'go', maxlength: 7, value: D.pin, cls: 'f-third f-pin' })}
      </div>
      <div class="co__actions">
        <button class="btn btn--kajal" type="submit"><span>Continue to review</span></button>
        <button class="arrow-link t-button" type="button" data-step="1">${ARROW_L}<span>Back to contact</span></button>
      </div></form></div>`;
  }
  // 3: review
  const who = a ? `<bdi>${esc(a.name)}</bdi> (signed in)<br>${esc(D.phone)}` : `${esc(D.email)}<br>${esc(D.phone)}`;
  return `${stepsHTML(3)}<div class="co__panel">
    <h2 class="t-h3 co__h" id="coH" tabindex="-1">Review.</h2>
    <p class="t-body co__lead">Check the details, then place the order. There is no payment step: this shop is a concept.</p>
    <div class="rv">
      <div class="rv__b"><p class="t-label">Contact</p><p class="t-body">${who}</p><button class="link t-button rv__change" type="button" data-step="1" aria-label="Change contact">Change</button></div>
      <div class="rv__b"><p class="t-label">Deliver to</p><address class="t-body">${esc(D.name)}<br>${esc(D.line1)}${D.line2 ? '<br>' + esc(D.line2) : ''}<br>${esc(D.city)}, ${esc(D.state)} ${esc(D.pin)}</address><button class="link t-button rv__change" type="button" data-step="2" aria-label="Change delivery address">Change</button></div>
      <div class="rv__b"><p class="t-label">Total</p><p class="t-body">${items(bag.count())} · ${fmt(bag.total())}</p><a class="link t-button rv__change" href="bag.html" aria-label="Change the bag">Change</a></div>
    </div>
    <div class="co__actions">
      <button class="btn btn--kajal" type="button" id="place"><span>Place order — ${fmt(bag.total())}</span></button>
      <button class="arrow-link t-button" type="button" data-step="2">${ARROW_L}<span>Back to delivery</span></button>
    </div></div>`;
}

function choiceHTML() {
  return `<div class="co__panel co__panel--first">
    <h2 class="sr-only" id="coH" tabindex="-1">Sign in, or continue as a guest</h2>
    <div class="choice">
      <div class="choice__card">
        <h2 class="t-h3">Sign in</h2>
        <p class="t-small">Or create an account. Only your first name is kept, for this visit.</p>
        <a class="btn btn--kajal" href="account.html?next=checkout.html"><span>Sign in</span></a>
      </div>
      <div class="choice__card">
        <h2 class="t-h3">Continue as guest</h2>
        <p class="t-small">No account. Your email and address are asked in the next steps.</p>
        <button class="btn btn--line" type="button" id="guestGo"><span>Continue as guest</span></button>
      </div>
    </div></div>`;
}

function emptyHTML() {
  return `<div class="co__panel co__panel--first">
    <h2 class="t-h3 co__h" id="coH" tabindex="-1">Your bag is empty.</h2>
    <p class="t-body co__lead">There is nothing to check out yet.</p>
    <p class="t-small co__note">A concept shop. Nothing is sold or charged here.</p>
    ${unsaved('co__note')}
    <div class="co__actions"><a class="btn btn--kajal" href="shop.html"><span>Shop Edition One</span></a></div>
    <ol class="tenline" aria-label="The ten editions">${EDITIONS.map((x) => `<li><a class="tenline__item" href="product.html?n=${x.n}"><span class="tenline__well" aria-hidden="true"><img src="assets/img/bottle-${x.n}-sm.webp" alt="" width="320" height="430" loading="lazy"></span><i class="chip" style="--chip:${x.ground}" aria-hidden="true"></i><span class="t-label tenline__n">No. ${x.n}</span><span class="t-small tenline__art">${esc(x.art)}</span></a></li>`).join('')}</ol></div>`;
}

function doneHTML(lines, total, count) {
  return `<div class="done">
    <h1 class="t-h2" id="coH" tabindex="-1">This is a concept shop.</h1>
    <p class="t-lead done__lead">No order was placed and nothing was charged.</p>
    <div class="done__what">
      <p class="t-label">What you chose · ${items(count)}</p>
      ${miniLines(lines)}
      <div class="sumrow sumrow--total"><p class="t-body"><strong>Total</strong></p><p class="t-price">${fmt(total)}</p></div>
    </div>
    <div class="done__actions">
      <a class="btn btn--kajal" href="index.html"><span>Back to the story</span></a>
      <a class="btn btn--line" href="shop.html"><span>Shop again</span></a>
    </div>
  </div>`;
}

// show step k (0: decided here, 1..3, 4: done). push: a new history entry, so Back walks the steps
function go(k, { push = true, focus = true } = {}) {
  const has = bag.count() > 0;
  if (k !== 4 && !has) { step = 0; main.classList.add('is-bare'); coSum.hidden = true; coMain.innerHTML = emptyHTML(); swapped(); after(focus); return; }
  if (k >= 1 && k <= 3 && !account.get() && !guestChosen()) k = 0;
  // a step needs the ones before it
  if (k >= 2 && !(D.phone && (account.get() || D.email))) k = 1;
  if (k >= 3 && !(D.name && D.line1 && D.city && D.state && D.pin)) k = 2;
  step = k;
  coSum.hidden = k === 4;
  $('#coBig').hidden = k === 4;
  main.classList.remove('is-bare');
  main.classList.toggle('is-done', k === 4);
  if (k === 0) coMain.innerHTML = choiceHTML();
  else if (k <= 3) coMain.innerHTML = panel(k);
  if (k !== 4) summary();
  swapped();
  if (push) {
    const h = k >= 1 && k <= 3 ? `#${STEPS[k - 1].toLowerCase()}` : '';
    try { history.pushState({ k, pos: ++pos }, '', location.pathname + location.search + h); } catch (e) { /* file:// */ }
  }
  wire(k);
  after(focus);
}
function after(focus) {
  reveal(coMain);
  if (focus) { const h = $('#coH'); if (h) h.focus({ preventScroll: true }); scrollTo({ top: 0, behavior: 'auto' }); }
}
function wire(k) {
  const form = $('#coForm');
  if (form && formRules[k]) {
    const rules = formRules[k]();
    liveCheck(form, rules);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      keep(form);
      if (!check(form, rules, $('#coStatus'))) return;
      go(k + 1);
    });
    form.addEventListener('input', () => keep(form));
  }
  const g = $('#guestGo');
  if (g) g.addEventListener('click', () => { try { sessionStorage.setItem(GUEST, '1'); } catch (e) { memGuest = true; } go(1); });
  const out = $('#coOut');
  if (out) out.addEventListener('click', () => { account.signOut(); go(0); });
  const place = $('#place');
  if (place) place.addEventListener('click', () => {
    const lines = bag.lines(), total = bag.total(), count = bag.count();
    if (!count) { go(k, { push: false, focus: false }); return; }   // the bag was emptied elsewhere: say so, no order of nothing
    step = 4;
    coSum.hidden = true; $('#coBig').hidden = true;
    main.classList.add('is-done');
    coMain.innerHTML = doneHTML(lines, total, count);
    swapped();
    Object.keys(D).forEach((x) => { D[x] = ''; });   // forget what was typed
    bag.clear();
    try { sessionStorage.removeItem(GUEST); } catch (e) { /* blocked */ }
    // the steps' history entries are walked back to the first one, which becomes the confirmation,
    // so Back from here leaves the checkout instead of landing on an empty step
    if (pos > 0) { unwinding = true; history.go(-pos); }
    else { try { history.replaceState({ k: 4, pos: 0 }, '', location.pathname + location.search); } catch (e) { /* file:// */ } }
    after(true);
  });
}
coMain.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-step]');
  if (!b) return;
  const f = $('#coForm');
  if (f) keep(f);
  go(+b.dataset.step);
});
addEventListener('popstate', (ev) => {
  if (unwinding) {
    unwinding = false; pos = 0;
    try { history.replaceState({ k: 4, pos: 0 }, '', location.pathname + location.search); } catch (e) { /* file:// */ }
    return;
  }
  // only the entries the steps pushed carry a state; a link to a #fragment (Skip to content) or a hash typed in the address bar has none
  if (!ev.state || ev.state.k == null) return;
  if (step === 4) { history.back(); return; }
  pos = ev.state.pos != null ? ev.state.pos : 0;
  go(ev.state.k, { push: false });
});
// the bag changed in another tab, or this page came back from the back/forward cache
bag.onChange((ev) => {
  if (step === 4 || (ev.reason !== 'sync' && ev.reason !== 'clear')) return;
  // a form keeps what is being typed (and the cursor) while the summary follows; the other panels are rebuilt
  if (bag.count() > 0 && (step === 1 || step === 2)) { summary(); return; }
  go(step || 1, { push: false, focus: false });
});

// start: the guest flag may come from account.html ("Continue as guest")
const first = account.get() || guestChosen() ? 1 : 0;
go(first, { push: false, focus: false });
try { history.replaceState({ k: step, pos: 0 }, '', location.pathname + location.search + (step >= 1 && step <= 3 ? `#${STEPS[step - 1].toLowerCase()}` : '')); } catch (e) { /* file:// */ }
window.__jal = Object.assign(window.__jal || {}, { step: () => step, D });
markReady(...$$('img', main).map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
