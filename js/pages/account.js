// account.html — Sign in / Create account (ARCH section 5). Chuna paper.
// Left: the Warli painter's hands (the brand's first chapter, "A painting first."); right: the panel.
// From checkout (?next=checkout.html) the panel also offers "Continue as guest". Signed in: "Signed
// in as <name>" and "Sign out". Only the first name is kept, in sessionStorage (store.js); the email
// and the password are checked on the page and then forgotten. Nothing is sent.
import { initChrome, markReady } from '../shop/chrome.js';
import { account, bag, cleanName } from '../shop/store.js';
import { $, esc, field, check, liveCheck, wireToggles, reveal, swapped, RULES, items } from './commerce.js';

initChrome({ page: 'account' });

const Q = new URLSearchParams(location.search);
// where to go after signing in: only our own checkout (never an address from the query)
const next = Q.get('next') === 'checkout.html' ? 'checkout.html' : null;
let mode = Q.get('mode') === 'create' ? 'create' : 'signin';
const GUEST = 'jalrang.checkout.guest';

const main = $('#main');
main.innerHTML = `
<div class="acct">
  <figure class="acct__pic"><img src="assets/img/hands-brush.webp" alt="Hands drawing small white Warli figures with a bamboo stick on a red-ochre panel." width="1086" height="1448" decoding="async"></figure>
  <div class="acct__panel" id="panel"></div>
</div>`;
const panel = $('#panel');

const RULE = {
  // the greeting comes from the email, so an address with nothing visible before the @ is not one
  signin: { email: (v) => RULES.email(v) || (cleanName(fromEmail(v)) ? '' : 'Check this: that email address looks incomplete.'), password: (v) => (v ? '' : 'Check this: add your password.') },
  create: {
    name: (v) => (cleanName(v) ? '' : 'Check this: add your name.'), email: RULES.email,
    password: (v) => (!v ? 'Check this: choose a password.' : v.length < 8 ? 'Check this: a password needs at least 8 characters.' : ''),
  },
};
// a first name for the greeting when signing in: the email's first word ("asha.patel@…" → "Asha")
const fromEmail = (v) => { const local = v.split('@')[0]; const w = local.split(/[._\-+\d]/).filter(Boolean)[0] || local; return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); };

function formView(focusTitle) {
  const create = mode === 'create';
  panel.innerHTML = `
    ${next ? '<p class="t-label acct__pre">Before checkout</p>' : ''}
    <h1 class="t-h2" id="acctH" tabindex="-1">Account.</h1>
    <div class="seg" role="tablist" aria-label="Sign in or create an account">
      <button class="t-button seg__b" type="button" role="tab" id="tabIn" aria-selected="${!create}" aria-controls="acctPanel" tabindex="${create ? -1 : 0}">Sign in</button>
      <button class="t-button seg__b" type="button" role="tab" id="tabNew" aria-selected="${create}" aria-controls="acctPanel" tabindex="${create ? 0 : -1}">Create account</button>
    </div>
    <div role="tabpanel" id="acctPanel" aria-labelledby="${create ? 'tabNew' : 'tabIn'}">
    <form class="form" id="acctForm" novalidate>
      <p class="t-small form__status" id="acctStatus" role="status" aria-live="polite"></p>
      ${create ? field({ id: 'name', label: 'Name', autocomplete: 'name', enter: 'next', cap: 'words', maxlength: 80 }) : ''}
      ${field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email', enter: 'next', maxlength: 254, spell: false })}
      ${field({ id: 'password', label: 'Password', autocomplete: create ? 'new-password' : 'current-password', enter: 'go', maxlength: 128, toggle: true, hint: create ? 'At least 8 characters.' : '' })}
      <button class="btn btn--kajal btn--wide" type="submit"><span>${create ? 'Create account' : 'Sign in'}</span></button>
    </form></div>
    <p class="t-small acct__note">A concept: nothing you type here is sent, and only your first name is kept, for this visit, on this device.</p>
    ${next ? `<div class="guest">
      <p class="t-label">Or</p>
      <p class="t-body">Check out without an account.</p>
      <a class="btn btn--line btn--wide" href="checkout.html" id="asGuest"><span>Continue as guest</span></a>
    </div>` : ''}`;
  const form = $('#acctForm');
  const rules = RULE[mode];
  wireToggles(form);
  liveCheck(form, rules);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!check(form, rules, $('#acctStatus'))) return;
    const name = mode === 'create' ? form.elements.name.value : fromEmail(form.elements.email.value.trim());
    form.reset();   // the email and the password go no further than this page
    account.signIn(name);
    if (next && account.persistent) { location.href = next; return; }   // a browser that keeps nothing would only ask again
    signedView(true);
  });
  const tabs = [$('#tabIn'), $('#tabNew')];
  const pick = (m) => { if (m === mode) return; mode = m; formView(false); $(m === 'create' ? '#tabNew' : '#tabIn').focus(); };
  tabs[0].addEventListener('click', () => pick('signin'));
  tabs[1].addEventListener('click', () => pick('create'));
  panel.querySelector('.seg').addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    pick(ev.key === 'ArrowLeft' || ev.key === 'Home' ? 'signin' : 'create');
  });
  const g = $('#asGuest');
  if (g) g.addEventListener('click', () => { try { sessionStorage.setItem(GUEST, '1'); } catch (e) { /* blocked: checkout asks again */ } });
  swapped();
  if (focusTitle) $('#acctH').focus({ preventScroll: true });
}

function signedView(animate) {
  const a = account.get();
  if (!a) { formView(false); return; }
  const k = bag.count();
  panel.innerHTML = `
    <div class="signed">
      <h1 class="t-h2" id="acctH" tabindex="-1">Signed in.</h1>
      <p class="t-lead">Signed in as <bdi>${esc(a.name)}</bdi>.</p>
      <p class="t-small">Your bag: ${items(k)}.</p>
      <div class="signed__actions">
        ${k ? '<a class="btn btn--kajal" href="checkout.html"><span>Checkout</span></a><a class="btn btn--line" href="bag.html"><span>View bag</span></a>'
            : '<a class="btn btn--kajal" href="shop.html"><span>Shop Edition One</span></a><a class="btn btn--line" href="index.html"><span>Back to the story</span></a>'}
      </div>
      <button class="link t-button hit signed__out" type="button" id="signOut">Sign out</button>
      <p class="t-small acct__note">A concept: only your first name is kept, for this visit, on this device.</p>
      ${account.persistent ? '' : '<p class="t-small acct__note">Your browser is not keeping it, so you stay signed in on this page only.</p>'}
    </div>`;
  swapped();
  $('#signOut').addEventListener('click', () => { account.signOut(); mode = 'signin'; formView(true); reveal(panel); });
  if (animate) { reveal(panel); $('#acctH').focus({ preventScroll: true }); scrollTo({ top: 0, behavior: 'auto' }); }
}

// already signed in and on the way to checkout: straight on
if (account.get() && next) location.replace(next);
else if (account.get()) signedView(false); else formView(false);
reveal(main.querySelector('.acct__panel'));
// back/forward cache: the page can come back as it was left after the visit signed in or out on another page
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  const signed = !!account.get();
  if (signed && next) location.replace(next);
  else if (signed !== !!$('#signOut')) { if (signed) signedView(false); else formView(false); }
});
window.__jal = Object.assign(window.__jal || {}, { mode: () => mode });
const im = main.querySelector('.acct__pic img');
markReady(im.decode ? im.decode().catch(() => {}) : null);
