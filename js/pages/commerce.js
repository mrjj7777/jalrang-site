// Small pieces the bag, account and checkout pages share: escaping, the line thumbnail, the
// summary, form fields with polite inline errors, and the straight-line reveal of a new panel.
// Nothing here sends or stores anything; the bag and the first name live in js/shop/store.js.
import { ENV } from '../core/env.js';
import { EDITIONS } from '../editions.js';
import { bag, fmt, plain } from '../shop/store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const MINUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10"/></svg>';
export const PLUS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h10M6 1v10"/></svg>';
export const ARROW_L = '<svg class="arrow arrow--l" viewBox="0 0 18 10" aria-hidden="true"><path d="M17 5H1.5M5.5 1 1.5 5l4 4"/></svg>';
export const ARROW_R = '<svg class="arrow arrow--r" viewBox="0 0 18 10" aria-hidden="true"><path d="M1 5h15.5M12.5 1l4 4-4 4"/></svg>';
export const items = (k) => `${k} ${k === 1 ? 'item' : 'items'}`;

// a line's picture: the packshot on its edition's ground; the set: the ten packshots standing in two
// rows of five on Chuna, the way they sit in their case
export function thumb(line, cls = '') {
  if (line.set) {
    return `<span class="thumb thumb--set ${cls}" aria-hidden="true">${EDITIONS.map((x) => `<img src="assets/img/bottle-${x.n}-sm.webp" alt="" width="320" height="431" decoding="async">`).join('')}</span>`;
  }
  return `<a class="thumb ${cls}" href="product.html?n=${line.n}" data-edition="${line.n}" tabindex="-1" aria-hidden="true"><img src="assets/img/bottle-${line.n}-sm.webp" alt="" width="320" height="431" decoding="async"></a>`;
}
// the line's words: "No. 03 · Edition One", the name, region · colour, the engraving
export function lineWords(line, { link = true } = {}) {
  if (line.set) {
    return `<p class="t-label">Edition One · No.&nbsp;01 to No.&nbsp;10</p><p class="t-h3 line__name">All ten, in a sheesham case</p>`;
  }
  const name = link ? `<a href="product.html?n=${line.n}">${esc(line.art)}</a>` : esc(line.art);
  return `<p class="t-label">Edition One · No.&nbsp;${line.n}</p><p class="t-h3 line__name">${name}</p><p class="t-small">${esc(line.region)} · ${esc(line.colour)}</p>${line.engraving ? `<p class="t-small line__eng">Engraving: <span>${esc(line.engraving)}</span></p>` : ''}`;
}
// the lines as a short list (checkout summary, confirmation)
export function miniLines(lines) {
  return `<ul class="mini">${lines.map((l) => `<li class="mini__line">${thumb(l, 'thumb--s')}<div class="mini__words"><p class="t-small mini__name">${l.set ? 'All ten, in a sheesham case' : `No. ${l.n} ${esc(l.art)}, ${esc(l.colour)}`}</p>${l.engraving ? `<p class="t-small">Engraving: ${esc(l.engraving)}</p>` : ''}<p class="t-small">Quantity ${l.qty}</p></div><p class="t-small mini__price">${fmt(l.total)}</p></li>`).join('')}</ul>`;
}

// ---- fields ----
// field({ id, label, type, autocomplete, hint, optional, inputmode, enter (enterkeyhint), cap (autocapitalize), maxlength, options, toggle })
export function field(o) {
  const ids = [o.hint ? `${o.id}-hint` : '', `${o.id}-msg`].filter(Boolean).join(' ');
  const attrs = [
    `id="${o.id}"`, `name="${o.name || o.id}"`, o.autocomplete ? `autocomplete="${o.autocomplete}"` : '',
    o.inputmode ? `inputmode="${o.inputmode}"` : '', o.enter ? `enterkeyhint="${o.enter}"` : '', o.maxlength ? `maxlength="${o.maxlength}"` : '',
    o.optional ? '' : 'required aria-required="true"', `aria-describedby="${ids}"`,
    o.spell === false ? 'spellcheck="false" autocapitalize="off"' : o.cap ? `autocapitalize="${o.cap}"` : '', o.value ? `value="${esc(o.value)}"` : '',
  ].filter(Boolean).join(' ');
  const label = `<label class="t-label" for="${o.id}">${esc(o.label)}${o.optional ? '<span class="field__opt">(optional)</span>' : ''}</label>`;
  let control;
  if (o.options) {
    control = `<select ${attrs}><option value="">Choose</option>${o.options.map((v) => `<option${v === o.value ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
  } else if (o.toggle) {
    control = `<div class="field__row"><input type="password" ${attrs}><button class="link t-button field__toggle" type="button" aria-label="Show password" aria-controls="${o.id}">Show</button></div>`;
  } else control = `<input type="${o.type || 'text'}" ${attrs}>`;
  return `<div class="field${o.cls ? ' ' + o.cls : ''}">${label}${control}${o.hint ? `<p class="field__hint" id="${o.id}-hint">${esc(o.hint)}</p>` : ''}<p class="field__msg" id="${o.id}-msg"></p></div>`;
}
// the Show / Hide button of a password field
export function wireToggles(root) {
  $$('.field__toggle', root).forEach((b) => b.addEventListener('click', () => {
    const inp = document.getElementById(b.getAttribute('aria-controls'));
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.textContent = show ? 'Hide' : 'Show';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
}
// the form's status line names each field that needs a check, as a link to it (44 px tall, like every text link)
const LISTS = new WeakMap();
function say(status, list) {
  LISTS.set(status, list);
  status.innerHTML = list.length ? `${list.length === 1 ? 'One field needs a check:' : `${list.length} fields need a check:`} ${list.map(([id, t]) => `<a class="link hit" href="#${id}" data-field="${id}">${esc(t)}</a>`).join(', ')}.` : '';
  if (!status.dataset.wired) {
    status.dataset.wired = '1';
    status.addEventListener('click', (ev) => { const a = ev.target.closest('[data-field]'); if (!a) return; ev.preventDefault(); const f = document.getElementById(a.dataset.field); if (f) f.focus(); });
  }
}
// rules: { fieldName: (value, form) => '' | 'Check this: …' }. Marks every field, focuses the first
// that needs a check and says how many in the form's status line. Returns true when all pass.
export function check(form, rules, status) {
  let first = null;
  const list = [];
  for (const [name, rule] of Object.entries(rules)) {
    const el = form.elements[name];
    if (!el) continue;
    const msg = rule(plain(el.value), form);
    const box = document.getElementById(`${el.id}-msg`);
    if (msg) {
      el.setAttribute('aria-invalid', 'true');
      if (box) box.textContent = msg;
      if (!first) first = el;
      const lab = form.querySelector(`label[for="${el.id}"]`);
      list.push([el.id, lab ? lab.childNodes[0].textContent.trim() : name]);
    } else {
      el.removeAttribute('aria-invalid');
      if (box) box.textContent = '';
    }
  }
  if (status) say(status, list);
  if (first) first.focus();
  return !list.length;
}
// once a field has been marked, it is checked again as the visitor corrects it, and the status line follows
export function liveCheck(form, rules) {
  const status = form.querySelector('.form__status');
  const fn = (ev) => {
    const el = ev.target;
    if (!el.name || !rules[el.name] || el.getAttribute('aria-invalid') !== 'true') return;
    const msg = rules[el.name](plain(el.value), form);
    const box = document.getElementById(`${el.id}-msg`);
    if (!msg) {
      el.removeAttribute('aria-invalid');
      if (box) box.textContent = '';
      if (status && LISTS.has(status)) say(status, LISTS.get(status).filter(([id]) => id !== el.id));
    }
  };
  form.addEventListener('input', fn);
  form.addEventListener('change', fn);
}

// something@something.tld: no spaces, one @, no angle brackets, commas or colons, and no empty part between dots
export const EMAIL = /^[^\s@<>(),;:\\"[\]]+@[^\s@<>(),;:\\"[\].]+(?:\.[^\s@<>(),;:\\"[\].]+)*\.[^\s@<>(),;:\\"[\].]{2,}$/;
export const RULES = {
  email: (v) => (!v ? 'Check this: add your email address.' : !EMAIL.test(v) ? 'Check this: that email address looks incomplete.' : ''),
  // ten figures starting 6 to 9, with or without +91, 91 or 0 in front, and spaces, dots, brackets or hyphens between
  phone: (v) => {
    if (!v) return 'Check this: add a mobile number.';
    const d = v.replace(/[\s().-]/g, '').replace(/^(?:\+91|91(?=\d{10}$)|0)/, '');
    if (/^[6-9]\d{9}$/.test(d)) return '';
    return /^\d{10}$/.test(d) ? 'Check this: a mobile number starts with 6, 7, 8 or 9.' : 'Check this: a mobile number has ten figures.';
  },
  pin: (v) => {
    if (!v) return 'Check this: add the PIN code.';
    const d = v.replace(/\s/g, '');
    if (/^[1-9]\d{5}$/.test(d)) return '';
    return /^0\d{5}$/.test(d) ? 'Check this: a PIN code does not start with 0.' : 'Check this: a PIN code has six figures.';
  },
  need: (what) => (v) => (v ? '' : `Check this: add ${what}.`),
};

// a double-click on a button that swaps the panel (Continue, Place order, Sign in, Sign out) must not land
// its second click on whatever now lies under the pointer, a link of the new panel: call swapped() after each swap
let swappedAt = 0;
export const swapped = () => { swappedAt = performance.now(); };
document.addEventListener('click', (ev) => {
  if (ev.detail > 1 && performance.now() - swappedAt < 700) { ev.preventDefault(); ev.stopPropagation(); }
}, true);

// said calmly where it matters: this browser is not keeping the bag between pages (storage blocked or full)
export const unsaved = (cls) => (bag.persistent ? '' : `<p class="t-small ${cls}">Your browser is not keeping the bag between pages, so bottles added on other pages will not appear here.</p>`);

// a new panel rises in place under one straight line (560 ms, tide); calm: at once
export function reveal(el) {
  if (!el || ENV.reduce || ENV.test || !window.gsap) return Promise.resolve();
  return new Promise((res) => {
    gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.56, ease: 'tide', onComplete: () => { el.style.clipPath = ''; res(); } });
  });
}
// a line leaves by its bottom edge rising (280 ms)
export function collapse(el) {
  if (!el || ENV.reduce || ENV.test || !window.gsap) return Promise.resolve();
  return new Promise((res) => {
    gsap.to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.28, ease: 'tide', onComplete: res });
  });
}

export const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
