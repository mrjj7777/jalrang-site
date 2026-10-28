// L1 "Jal meets Rang": the film's shared numbers and helpers. Since 21 October 2026 the opening is no longer a function of
// the scroll: the bottle's fall, its entry and its sinking are real physics on a clock of real time (hero-phys.js), and the
// splash, the water and the camera follow that clock. The scroll lets the bottle go (the first scroll past ARM), may bring
// the camera nearer to the bottle (never past it), and reveals the words once the dive is done. This file keeps the
// timeline TL (the scroll's part and the splash's reference times, in p units), the camera's end, the sway and the maths
// helpers every file of the opening shares. intro.js (the DOM and the 3D bottle), hero-fx.js (the water, the surface, the
// light and the bottle seen through the water) and hero-splash.js (the crown, the droplets, the jet and the bubbles) all
// read it. Idle life (the sway, the drift of the light, the small waves, a droplet now and then) runs on the clock, and the
// clock stands still under ?test.
//
// Two frames of reference, both in stage CSS px: SCREEN (what is drawn) and WORLD (the water's own: the surface at rest is
// at y = g.line). The camera has gone down cam px, so a world y is drawn at y - cam.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };          // smoothstep
export const sss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * t * (t * (6 * t - 15) + 10); }; // smootherstep
export const TAU = Math.PI * 2;

// a small seeded generator: the splash is the same on every scrub
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// a hash of an integer to 0..1 (the idle bubbles and droplets: the same one for the same index, whatever the clock)
export const hash = (n) => { let t = (n * 0x9E3779B1) >>> 0; t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B) >>> 0; t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35) >>> 0; return ((t ^ (t >>> 16)) >>> 0) / 4294967296; };

// The splash's clock is in "p units" (hero-phys.js KQ maps real seconds to them); TL.hit is the instant the base meets the
// surface. The rest is the scroll's: the chapter's smoothed progress p.
export const TL = {
  hit: 0.36,           // the splash's clock at the impact (the splash's own formulas count from here)
  arm: 0.012,          // the first scroll past this (raw progress) lets the bottle go; back at 0 it is armed again
  dive: [0.08, 0.3],   // the scroll may take the camera down, nearer to the bottle (never past it)
  camOver: 0.14,       // the camera's end: the surface has left the top by this share of the stage height (its bright underside leaves with it)
  red: [0.12, 1],      // the exposure follows the camera's progress c: the deep red settles to flat Sindoor
  hold: [0.78, 1],     // c: the sway comes in as the bottle settles
  words: [0.3, 0.5],   // the label, the claim, the body and the caption are revealed (p), once the camera has done its dive
  stand: 0.52,         // from here the cursor's hit box over the bottle is live
  cue: 0.05,           // the "Scroll" cue is gone
  idle: 0.02,          // the idle droplets and the pointer's ripples only run before this
};

// The sway, in seconds of the clock: the bottle floats freely, so it rolls and bobs very slowly and very slightly
// (at most about 2 degrees and 4 px, periods of 5 to 7 s, two incommensurate ones so it never visibly repeats) and,
// in 3D, drifts round its axis. k (0..1) is how much of it is in (TL.hold).
export function swayAt(t, g, k) {
  if (k <= 0) return { rot: 0, dy: 0, dx: 0, yaw: 0 };
  return {
    rot: k * (0.029 * Math.sin((TAU * t) / 6.4 + 0.9) + 0.007 * Math.sin((TAU * t) / 2.9 + 2.3)),
    dy: k * g.h * 0.0047 * Math.sin((TAU * t) / 5.5 + 0.4),
    dx: k * g.h * 0.0016 * Math.sin((TAU * t) / 8.3 + 1.7),
    yaw: k * 0.2 * Math.sin((TAU * t) / 13 + 0.5),
  };
}
