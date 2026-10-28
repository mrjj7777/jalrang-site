// The concept shop's memory: the bag and the signed-in first name. Shared by every page.
// Nothing here is ever sent anywhere. The bag lives in localStorage (key jalrang.bag.v1) so it
// follows the visitor from page to page and tab to tab; where storage is blocked or full it lives in
// memory for this page only (bag.persistent says which). The account keeps the first name alone, in
// sessionStorage (jalrang.account.v1); passwords and everything else typed are never stored.
//
//   import { bag, account, PRICE, fmt, lineName } from './shop/store.js';
//   bag.add('03', { qty: 1, engraving: 'ASHA' });   bag.add(null, { set: true });
//   bag.lines() → [{ id, n, set, engraving, qty, unit, total, name, art, colour, region, img, edition }]
//   bag.count() · bag.total() · bag.setQty(id, q) · bag.remove(id) · bag.clear()
//   bag.onChange((ev) => …)   ev = { reason: 'add'|'qty'|'remove'|'clear'|'sync'|'full', id?, qty?, line? }   ('full': a new line was refused, the bag holds MAX_LINES)
//   account.get() → { name } | null · account.signIn(firstName) · account.signOut() · account.onChange(fn)
import { EDITIONS, byN } from '../editions.js';

// prices from PROMPT.md: ₹4,800 a bottle; all ten, in a sheesham case, ₹46,000
export const PRICE = Object.freeze({ one: 4800, set: 46000 });
export const MAX_QTY = 9;           // the sheet's stepper stops at 9; so does every line
export const MAX_LINES = 50;        // distinct lines (an edition with its own engraving is a line); a stored bag is cut to this
export const fmt = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
export const SET_NAME = 'All ten, in a sheesham case';

const BAG_KEY = 'jalrang.bag.v1';
const ACC_KEY = 'jalrang.account.v1';
const ENGRAVE = /^[A-Z0-9 .'-]{0,12}$/;   // capitals, figures and a few marks, up to 12 (the sheet's rule)
const isN = (n) => EDITIONS.some((e) => e.n === n);

// ---- storage that never throws ----
function area(name) {
  try { const s = window[name]; const k = '__jal'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; }
}
const local = area('localStorage');
const session = area('sessionStorage');
let memBag = [];        // always the last bag written: what the page uses when localStorage is blocked, full or failing
let useMem = !local;    // true: the bag is read from memBag (this page only)
let memAcc = null;
let accMem = !session;

// the engraving as stored: capitals, the allowed marks, 12 at most
export const cleanEngraving = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);

// text as kept: every kind of space a plain space, trimmed, and no control, bidirectional or zero-width characters (a right-to-left
// override would turn "evil" into "live" on screen; a zero-width name would greet nobody)
const HIDDEN = [[0, 0x1F], [0x7F, 0x9F], [0xAD, 0xAD], [0x61C, 0x61C], [0x180E, 0x180E], [0x200B, 0x200B], [0x200E, 0x200F], [0x202A, 0x202E], [0x2060, 0x2064], [0x2066, 0x2069], [0xFEFF, 0xFEFF]];
const hidden = (c) => { const cp = c.codePointAt(0); return HIDDEN.some(([a, z]) => cp >= a && cp <= z); };
export const plain = (v) => Array.from(String(v ?? '').replace(/\s/g, ' ')).filter((c) => !hidden(c)).join('').trim();
// the first word, 40 characters at most; '' when nothing visible is left (a joiner alone is not visible)
export const cleanName = (v) => { const w = Array.from(plain(v).split(' ')[0]); return w.some((c) => c.codePointAt(0) !== 0x200C && c.codePointAt(0) !== 0x200D) ? w.slice(0, 40).join('') : ''; };

function sane(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    try {
      if (!r || typeof r !== 'object') continue;
      const set = r.set === true;
      const n = set ? null : String(r.n || '');
      if (!set && !isN(n)) continue;
      const engraving = set ? '' : cleanEngraving(r.engraving);
      if (!ENGRAVE.test(engraving)) continue;
      const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(+r.qty || 1)));
      const id = idOf(n, engraving, set);
      const same = out.find((x) => x.id === id);
      if (same) same.qty = Math.min(MAX_QTY, same.qty + qty);
      else if (out.length < MAX_LINES) out.push({ id, n, set, engraving, qty });
    } catch (e) { /* a record that cannot be read is left out; the others stay */ }
  }
  return out;
}
function read() {
  if (!useMem) {
    let raw = null;
    try { raw = local.getItem(BAG_KEY); } catch (e) { useMem = true; }
    if (!useMem) { try { return sane(JSON.parse(raw || '[]')); } catch (e) { return []; } }
  }
  return memBag.map((x) => ({ ...x }));
}
// every write is kept in memBag too, so a bag that cannot be stored (full, blocked, failing) is still the bag
function write(items) {
  memBag = items.map((x) => ({ ...x }));
  if (!local) return;
  try { local.setItem(BAG_KEY, JSON.stringify(items.map(({ n, set, engraving, qty }) => ({ n, set, engraving, qty })))); useMem = false; }
  catch (e) { useMem = true; }
}

// one line per edition and engraving (the set is one line of its own)
function idOf(n, engraving, set) { return set ? 'set' : engraving ? `${n}:${engraving}` : n; }

// the name a line is shown under: "No. 03 Madhubani, Haldi" or "All ten, in a sheesham case"
export function lineName(line) {
  if (line.set) return SET_NAME;
  const e = byN(line.n);
  return `No. ${e.n} ${e.art}, ${e.colour}`;
}
function enrich(it) {
  const e = it.set ? null : byN(it.n);
  const unit = it.set ? PRICE.set : PRICE.one;
  return {
    ...it, unit, total: unit * it.qty, name: lineName(it),
    art: e ? e.art : null, colour: e ? e.colour : null, region: e ? e.region : null,
    img: e ? `assets/img/bottle-${e.n}-sm.webp` : null, edition: e,
  };
}

// ---- change events: this tab (direct), other tabs (the storage event) ----
const bagFns = new Set();
function emit(ev) {
  bagFns.forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } });
  dispatchEvent(new CustomEvent('jal:bag', { detail: ev }));
}
addEventListener('storage', (e) => {
  if (e.key === BAG_KEY || e.key === null) emit({ reason: 'sync' });
  if (e.storageArea === session && (e.key === ACC_KEY || e.key === null)) accFns.forEach((fn) => fn(account.get()));
});
// back/forward cache: a page that comes back as it was left has not seen what the other pages did to the bag
addEventListener('pageshow', (e) => { if (e.persisted) emit({ reason: 'sync' }); });

export const bag = {
  // n: '01'…'10'; { qty = 1, engraving = '', set = false }. Returns the line as it now stands
  // (null for an unknown edition, or a new line when the bag already holds MAX_LINES).
  add(n, { qty = 1, engraving = '', set = false } = {}) {
    if (!set && !isN(n)) return null;
    const eng = set ? '' : cleanEngraving(engraving);
    const q = Math.max(1, Math.min(MAX_QTY, Math.floor(+qty || 1)));
    const items = read(), id = idOf(set ? null : n, eng, set);
    let it = items.find((x) => x.id === id);
    const had = it ? it.qty : 0;
    if (it) it.qty = Math.min(MAX_QTY, it.qty + q);
    else if (items.length >= MAX_LINES) { emit({ reason: 'full' }); return null; }
    else { it = { id, n: set ? null : n, set, engraving: eng, qty: q }; items.push(it); }
    write(items);
    const line = enrich(it);
    emit({ reason: 'add', id, qty: it.qty - had, line });   // qty: what was really added (a line stops at MAX_QTY)
    return line;
  },
  setQty(id, qty) {
    const items = read(), it = items.find((x) => x.id === id);
    if (!it) return;
    const q = Math.floor(+qty || 0);
    if (q <= 0) { bag.remove(id); return; }
    it.qty = Math.min(MAX_QTY, q);
    write(items);
    emit({ reason: 'qty', id, qty: it.qty, line: enrich(it) });
  },
  remove(id) {
    const items = read(), i = items.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [gone] = items.splice(i, 1);
    write(items);
    emit({ reason: 'remove', id, line: enrich(gone) });
  },
  clear() { write([]); emit({ reason: 'clear' }); },
  lines() { return read().map(enrich); },
  count() { return read().reduce((s, x) => s + x.qty, 0); },
  total() { return read().reduce((s, x) => s + (x.set ? PRICE.set : PRICE.one) * x.qty, 0); },
  onChange(fn) { bagFns.add(fn); return () => bagFns.delete(fn); },
  // false: the bag lives in this page's memory only (storage blocked or full), so it will not follow the visitor
  get persistent() { return !useMem; },
};

// ---- the account: a first name for this visit, nothing else ----
const accFns = new Set();
export const account = {
  get() {
    try {
      const raw = accMem ? memAcc : session.getItem(ACC_KEY);
      const v = raw ? JSON.parse(raw) : null;
      const name = v && typeof v.name === 'string' ? cleanName(v.name) : '';
      return name ? { name } : null;
    } catch (e) { return null; }
  },
  // keeps the first word of what was typed (cleanName); null when nothing visible is left
  signIn(name) {
    const first = cleanName(name);
    if (!first) return null;
    const raw = JSON.stringify({ name: first });
    memAcc = raw;
    if (session) { try { session.setItem(ACC_KEY, raw); accMem = false; } catch (e) { accMem = true; } }
    accFns.forEach((fn) => fn({ name: first }));
    return { name: first };
  },
  signOut() {
    if (session) { try { session.removeItem(ACC_KEY); } catch (e) { /* blocked */ } }
    memAcc = null;
    accFns.forEach((fn) => fn(null));
  },
  onChange(fn) { accFns.add(fn); return () => accFns.delete(fn); },
  // false: the first name lives in this page's memory only (storage blocked), so it is lost on the next page
  get persistent() { return !accMem; },
};

export default bag;
