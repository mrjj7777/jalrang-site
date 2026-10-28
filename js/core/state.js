// The edition on screen (B10.9). It means only "which colour world is in front of the visitor";
// it is never chosen, never stored, and the grounds never follow it.
import { byN } from '../editions.js';

const listeners = new Set();
export const state = { n: '01' };

export function current() { return byN(state.n); }
export function onEdition(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// called by the worlds controller (the world covering the middle of the screen) and by the
// unwrap's local cut; listeners hear only real changes
export function setOnScreen(n) {
  if (!n || n === state.n) return;
  state.n = n;
  const e = byN(n);
  listeners.forEach((fn) => fn(e));
}
