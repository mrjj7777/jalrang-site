// What this visitor's device can do, and which of the three render modes the page uses (B1).
// Decided once, at start. A window that crosses into or out of NARROW later reloads (main.js, rearm()).
//   '3d'   wide, motion allowed, WebGL 2: fixed frames, scroll cuts, the WebGL bottle
//   '2d'   wide, motion allowed, no usable WebGL: fixed frames, scroll cuts, packshot bottles
//   'flow' narrow (a phone, a tablet held upright, or a window the fixed frames do not fit: NARROW below), or
//          reduced motion: ordinary sections in normal page flow
const mm = (q) => window.matchMedia(q).matches;
// Narrow: a window the fixed frames do not fit takes the phone's stacked layout (html.is-narrow in main.css). Four clauses, each
// the point where the frames stop fitting. The gaps are measured (19 Oct 2026): px between a giant colour word's ink and the label
// under it (the rule is 72 px and the word never goes under 52 px, so a minus means it is printed over the label).
//   under 900 px wide: the zone beside the bottle is only about 140 to 200 px (the product's button label, "Add 9 to bag —
//     ₹43,200", needs 157) and the frames need more height the narrower the window (768 wide: -11 at 720 px high; 800: -1
//     at 680; 860: -1 at 640; 900: -11 at 600)
//   a portrait window under 1100 px wide (a tablet held upright: 768 × 1024, 820 × 1180, 1024 × 1366): the 74vh bottle would
//     cover the proof and the index would sit on the plinth caption
//   under 520 px high (a phone held sideways: 844 × 390; a 1366 × 768 laptop at 125 % zoom with its browser bars: about
//     1093 × 500): the first screen, a world's title and its edition line, and the landing's Twenty-four hours overprint
//     each other (measured at 1280 × 470, 1100 × 512, 1100 × 470, 960 × 480)
//   under 1180 px wide and under 640 px high: the words block is taller than the room under the giant word (1100 wide: -11
//     at 520, +4 at 540, +19 at 560; 1024: +3 at 580, +18 at 600; 960: -7 at 600, +8 at 620, +23 at 640; 900: +19 at 640).
//     From 1180 px wide 520 px of height is enough (+8 to +33 at 520).
// js/scenes/run.js (the proof picture's `sizes`) repeats these four.
export const NARROW = '(max-width: 899px), (orientation: portrait) and (max-width: 1099px), (max-height: 519px), (max-width: 1179px) and (max-height: 639px)';
export const isNarrow = () => mm(NARROW);
// A page whose mode is out of date starts again (a window that crossed the narrow line, a device that changed its wish for less
// motion, a lost GPU context), but never under someone typing: a soft keyboard can shrink a tablet's window below the line while a
// field has focus, and the reload would lose what was typed. It waits for focus to leave and goes ahead then if the state still
// differs (`differs` says so).
const typing = () => {
  const a = document.activeElement;
  return !!a && (a.isContentEditable || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' ||
    (a.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|file|image|color)$/.test(a.type)));
};
const pending = [];
export function restartIf(differs) {
  if (!differs()) return;
  if (!typing()) { location.reload(); return; }
  pending.push(differs);
  if (pending.length > 1) return;             // one focusout is already being waited for; it checks every waiting condition
  // 600 ms: a soft keyboard that goes away resizes the window a little after the field has lost focus, and the click that
  // moved focus (Add to bag, Issue my passport) must not be eaten by a reload for a state that is about to come back
  addEventListener('focusout', () => setTimeout(() => pending.splice(0).forEach((d) => restartIf(d)), 600), { once: true });
}
const conn = navigator.connection || {};
const Q = new URLSearchParams(location.search);
function hasWebGL2() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
}
// remembered choices: localStorage for the visitor's motion choice, sessionStorage for this
// visit's automatic step-downs (safe materials, or no WebGL) after a failed start
const read = (area, k) => { try { return window[area].getItem('jalrang:' + k); } catch (e) { return null; } };
// Where storage is blocked the choice rides on the page's own history entry instead: it survives the reload that a choice
// causes (so "Make it calm" still switches the page) and goes no further, so nothing is remembered.
const carried = (k) => { try { const v = history.state && history.state['jalrang:' + k]; return v == null ? null : String(v); } catch (e) { return null; } };
const carry = (k, v) => { try { const s = Object.assign({}, history.state); if (v == null) delete s['jalrang:' + k]; else s['jalrang:' + k] = v; history.replaceState(s, ''); } catch (e) { /* nothing to carry it on */ } };
export const store = {
  get(k) { const v = read('localStorage', k); return v == null ? carried(k) : v; },
  set(k, v) { try { if (v == null) localStorage.removeItem('jalrang:' + k); else localStorage.setItem('jalrang:' + k, v); } catch (e) { carry(k, v); } },
  session(k, v) { if (v === undefined) return read('sessionStorage', k); try { if (v == null) sessionStorage.removeItem('jalrang:' + k); else sessionStorage.setItem('jalrang:' + k, v); } catch (e) { /* blocked */ } return v; },
};
const motionChoice = store.get('motion'); // 'full', 'calm' or nothing (follow the device)

// test hooks (F1): ?test ?at=<id>:<p> ?mode=3d|2d|flow ?tier=safe ?giant=0 ?debugskins ?dpr=
// plus ?opening=<t> (play the opening, frozen at t of its cut: 0 = before it starts) and
// ?parity=hybrid (run the stage as if the parity gate had failed)
const at = (Q.get('at') || '').split(':');
export const TEST = {
  on: Q.has('test'),
  at: at[0] ? { id: at[0], p: Math.max(-1, Math.min(1, parseFloat(at[1]) || 0)) } : null,
  mode: /^(3d|2d|flow)$/.test(Q.get('mode') || '') ? Q.get('mode') : null,
  tier: Q.get('tier') === 'safe' ? 'safe' : null,
  giant: Q.get('giant') !== '0',
  debugskins: Q.has('debugskins'),
  dpr: Q.has('dpr') ? parseFloat(Q.get('dpr')) || null : null,
  opening: Q.has('opening') ? Math.max(0, Math.min(1, parseFloat(Q.get('opening')) || 0)) : null,
  parity: Q.get('parity') === 'hybrid' ? 'hybrid' : null,
};

export const ENV = {
  phone: isNarrow(),   // narrow: the phone layout (a tablet held upright included)
  touch: mm('(hover: none), (pointer: coarse)'),
  systemReduce: mm('(prefers-reduced-motion: reduce)'),
  saveData: !!conn.saveData,
  webgl: hasWebGL2(),
  motionChoice,
  test: TEST.on || !!TEST.at,
};
// the device's wish for less motion is followed unless the visitor chose full motion on the
// first screen (Windows turns this on whenever "Animation effects" is off)
ENV.reduce = motionChoice === 'calm' || (ENV.systemReduce && motionChoice !== 'full');
ENV.mp4 = !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"');
export const clip = (name) => `assets/video/${name}.${ENV.mp4 ? 'mp4' : 'webm'}`;
ENV.glOff = store.session('gl') === 'off';
// the material tier: 'safe' on request, or after the full materials failed earlier in this visit
ENV.tier = TEST.tier || (store.session('tier') === 'safe' ? 'safe' : 'full');

// the mode: a narrow screen or less motion is 'flow'; otherwise '3d' when WebGL 2 can be used,
// else '2d'. main.js drops '3d' to '2d' when the renderer cannot start or the bottle does not
// compile in either material tier (the shader probe, B1); that choice holds for the visit.
ENV.mode = ENV.phone || ENV.reduce ? 'flow' : (ENV.webgl && !ENV.saveData && !ENV.glOff ? '3d' : '2d');
if (TEST.mode) {
  ENV.mode = TEST.mode;
  if (TEST.mode !== 'flow') ENV.reduce = false; // a forced fixed mode keeps its motion
}
ENV.flow = ENV.mode === 'flow';
ENV.gl = ENV.mode === '3d';
// why there is no 3D, in words the first screen can show (B12, the motion note)
ENV.lite = ENV.gl ? '' : !ENV.webgl ? 'webgl' : ENV.glOff ? 'failed' : ENV.reduce ? 'reduce' : ENV.saveData ? 'data' : ENV.phone && !ENV.touch ? 'narrow' : '';
ENV.motion = !ENV.reduce;

// root classes: mode-3d, mode-2d or mode-flow, plus is-narrow on a narrow screen, is-calm when
// reduced, no-giant on request. is-narrow is set as soon as this module runs, before any layout.
document.documentElement.classList.toggle('is-narrow', ENV.phone);
export function setMode(mode) {
  const root = document.documentElement;
  root.classList.toggle('is-narrow', ENV.phone);
  root.classList.remove('mode-3d', 'mode-2d', 'mode-flow');
  ENV.mode = mode; ENV.flow = mode === 'flow'; ENV.gl = mode === '3d';
  root.classList.add('mode-' + mode);
  root.classList.toggle('is-calm', ENV.reduce);
  root.classList.toggle('no-giant', !TEST.giant);
}
