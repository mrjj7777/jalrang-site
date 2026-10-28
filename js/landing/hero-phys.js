// L1 "Jal meets Rang": the bottle's real physics. The fall, the entry and the sinking are integrated here, once, from
// equations of motion in SI units (a 0.27 m bottle, g = 9.81 m/s^2) and played back on a clock of real time, so the
// opening is no longer a function of the scroll: the first scroll lets the bottle go, and from then on it falls, hits,
// slows and sinks by itself, with weight, whether the visitor scrolls or not.
//
//   air     free fall from rest just above the top edge, a little air drag, a seeded lean and spin (constant: nothing
//           turns a body in the air);
//   water   the entry is a momentum balance with ADDED MASS that grows as the body goes under (the water has to be
//           moved out of the way: slamming), then buoyancy (the displaced volume grows with the depth, to the whole
//           bottle), quadratic form drag, and a righting torque (the air in the cap sits above the centre of mass) with
//           damping, so the lean dies away; the spin is taken up by the water. The bottle is a little denser than water
//           (1.05): it keeps sinking, slowly, to a terminal speed.
//   camera  a critically damped spring on the bottle's depth, so it lags (the bottle is seen to plunge past its
//           resting place on the screen) and settles; the lag is then blended away so the bottle ends on its mark.
//
// Everything is sampled into a table (250 Hz), because the equations do not depend on the visitor: the picture at a
// time is a lookup, so a jump or a test frame at a given time is exact, and the playback is the same on a 60 Hz
// and a 120 Hz screen. Only the clock is live. SLOW is the cinematic factor: real seconds per film second (the clock
// runs 1/SLOW times slower than reality; g is untouched, so the arcs keep their real shape).
//
// The splash (hero-splash.js) keeps its own ballistic formulas in "p units"; KQ maps real seconds to those units
// (its gravity of 270 bottle heights per p squared is exactly 9.81 m/s^2 for a 0.27 m bottle at KQ = 0.3668 p per
// second). The impact speed from the table scales the crown, the drops and the cavity.
import { TL, TAU, clamp, lerp, ss } from './hero-film.js';

export const PHYS = {
  g: 9.81,
  L: 0.27,            // the bottle's height (m); its radius is 0.38 / 2.72 of it (js/gl/bottle.js)
  rhoW: 1000, rhoA: 1.2,
  rhoB: 1.05,         // a little denser than water: it keeps sinking
  CdA: 0.9,           // air drag
  CdW: 0.85,          // water drag on the flat base and the body
  CdSlam: 6,          // slamming: a flat base meeting water drags far harder than a body gliding through it; it dies away as the cavity opens (over one body length)
  Ca: 0.6,            // added mass of a flat-ended cylinder going under (share of the displaced water's mass, at full immersion)
  lean0: 0.17, leanW: -0.55,   // radians, and the rate it was let go with (rad/s): it comes in a few degrees off upright
  kRight: 70, cRight: 12,      // the righting spring (1/s^2) and its damping (1/s) in the water
  cSpin: 14,                   // the water takes up the spin (1/s)
  turns: 1,                    // one turn about its axis in all (the painting is seen all the way round, it ends facing front)
  slow: 0.3,                   // real seconds per film second
  dead: 0.35,                   // share of the room below the waterline the bottle may plunge into before the camera moves
  camTau: 0.12,                 // the camera's lag, film seconds (critically damped)
  lock: [0.3, 1.6],            // film seconds after the seal over which the camera's lag is blended away
  tail: 1.5,                   // real seconds after the seal the film runs on (bubbles, the jet), then it stands
};
export const KQ = 0.3668;       // p units of the splash's clock per real second (see above)

// Integrate one drop for a stage of geometry g ({ h, line, hB }) and return the table and its landmarks.
export function simulate(g, over = {}) {
  const P = { ...PHYS, ...over };
  const s = g.hB / P.L;                                   // px per metre
  const R = (0.38 / 2.72) * P.L, A = Math.PI * R * R, V = A * P.L, m = P.rhoB * P.rhoW * V;
  const rhoW = P.rhoW, ga = P.g;
  const yStart = -0.03 * g.h;                             // the visible bottom, just above the top edge
  const d0 = (yStart - g.line) / s;                       // its depth (m): negative above the surface
  const DT = 1 / 2000, EVERY = 8, T_MAX = 7;
  const n = Math.floor(T_MAX / (DT * EVERY)) + 1;
  const dP = new Float32Array(n), vP = new Float32Array(n), thT = new Float32Array(n), ryT = new Float32Array(n), camT = new Float32Array(n);
  // the water's part of a state: the submerged length of the body, its added mass and the drag ramp
  const ls = (d) => Math.min(Math.max(d, 0), P.L);
  const M = (d) => m + P.Ca * rhoW * A * ls(d);
  const wet = (d) => ss(0, 0.5 * R, d);                   // the form drag comes in over the first half radius
  function run(spin0) {
    let d = d0, mom = 0, th = P.lean0, w = P.leanW, ry = 0;      // momentum = M(d) v
    let tHit = -1, vImp = 0, tSeal = -1;
    // the camera follower works in px: its target is the bottle's depth (px) once it is under the surface
    let cx = 0, cv = 0;
    const wc = 2 / (P.camTau * P.slow);                   // its natural frequency (1/s, real time)
    let spin = spin0;
    const dead = P.dead * (g.h - g.line);                 // the camera lets the bottle plunge this far past its mark before it moves
    for (let i = 0; i < n * EVERY; i++) {
      const t = i * DT;
      const v = mom / M(d);
      if (i % EVERY === 0) {
        const k = i / EVERY;
        dP[k] = d * s; vP[k] = v; thT[k] = th; ryT[k] = ry; camT[k] = cx;
      }
      if (tHit < 0 && d >= 0) { tHit = t; vImp = v; }
      if (tSeal < 0 && d * s >= 1.01 * g.hB) tSeal = t;
      // forces (N, down positive)
      let F = m * ga;
      if (d < 0) F -= 0.5 * P.rhoA * P.CdA * A * v * Math.abs(v);
      else F += -rhoW * ga * A * ls(d) - 0.5 * rhoW * (P.CdW + P.CdSlam * (1 - ss(0, P.L, d))) * A * v * Math.abs(v) * wet(d);
      mom += F * DT;
      d += (mom / M(d)) * DT;
      // the lean: constant in the air, righted and damped in the water (the more of it is under, the more)
      const q = ss(0, 0.6 * P.L, d);
      w += (-P.kRight * th - P.cRight * w) * q * DT;
      th += w * DT;
      // the spin: constant in the air, taken up by the water
      spin += -P.cSpin * q * spin * DT;
      ry += spin * DT;
      // the camera: it follows once the bottle is under (before that it stands)
      const X = Math.max(0, d * s - dead);
      cv += (-wc * wc * (cx - X) - 2 * wc * cv) * DT;
      cx += cv * DT;
    }
    return { tHit, vImp, tSeal, ryEnd: ry };
  }
  // the spin is linear in its start: scale it once so that the bottle turns exactly `turns` times in all
  const probe = run(1);
  const spin0 = (TAU * P.turns) / probe.ryEnd;
  const out = run(spin0);
  if (out.tSeal < 0) out.tSeal = out.tHit + 0.5;
  const tEnd = Math.min(T_MAX - 0.05, out.tSeal + P.tail);
  const dt = DT * EVERY;
  // the camera's lag is blended away after the seal, so the bottle stands on its mark when the film stands
  const t1 = out.tSeal + P.lock[0] * P.slow, t2 = out.tSeal + P.lock[1] * P.slow;
  for (let k = 0; k < n; k++) camT[k] = lerp(camT[k], Math.max(0, dP[k]), ss(t1, t2, k * dt));
  // the real time at which the camera has gone all the way down (its end: the surface has left the screen)
  const endCam = g.line + TL.camOver * g.h;
  let tC1 = tEnd;
  for (let k = 0; k < n; k++) if (camT[k] >= endCam) { tC1 = k * dt; break; }
  const sim = {
    s, n, dt, tC1, tHit: out.tHit, tSeal: out.tSeal, tEnd, vImp: out.vImp, spin0, slow: P.slow,
    dPx: dP, vPx: vP, th: thT, ry: ryT, cam: camT,
    // the state at real time tau (seconds since release), by linear interpolation (the table stands at its end)
    at(tau, o = {}) {
      const x = clamp(tau, 0, tEnd) / dt, k = Math.min(n - 2, Math.floor(x)), f = x - k;
      o.d = lerp(dP[k], dP[k + 1], f); o.v = lerp(vP[k], vP[k + 1], f); o.th = lerp(thT[k], thT[k + 1], f);
      o.ry = lerp(ryT[k], ryT[k + 1], f); o.cam = lerp(camT[k], camT[k + 1], f);
      return o;
    },
    // the splash's clock (p units, TL.hit at the impact) at real time tau, and back
    q: (tau) => TL.hit + (tau - out.tHit) * KQ,
    tauOfQ: (q) => out.tHit + (q - TL.hit) / KQ,
    // the bottle's depth below the surface (px) at splash time q: the splash's bubbles are born along it
    dAtQ(q) { return this.at(out.tHit + (q - TL.hit) / KQ).d; },
  };
  return sim;
}

// The film's state at real time tau, with the scroll's say in the camera (option B of HANDOFF 2): the camera follows the sinking bottle
// by itself (a spring, so it lags a little and then settles), and the scroll can only close that lag, never go past the bottle:
// the more the visitor has scrolled (TL.dive), the nearer the camera is to the bottle. Returns the (reused) object `out`:
//   q     the splash's clock (p units)       cam   how far the camera has gone down (px)
//   c     the dive's progress, cam over its end (the surface has left the screen at 1)
//   b     the bottle: y (its visible bottom on the screen, px), d (its depth below the surface, px), tilt, ry (rad), v
export function frameAt(sim, g, tau, p, out = { b: {} }) {
  const o = sim._o || (sim._o = {});
  sim.at(tau, o);
  const end = g.line + TL.camOver * g.h;                  // the camera's end: the surface (and its bright underside) has left the top
  const down = Math.max(0, o.d);
  const cam = o.cam + Math.max(0, down - o.cam) * ss(TL.dive[0], TL.dive[1], p);
  out.tau = tau;
  out.q = sim.q(tau);
  out.cam = cam; out.end = end; out.c = cam / end;
  const b = out.b;
  b.d = o.d; b.v = o.v; b.y = g.line + o.d - cam; b.tilt = o.th; b.ry = o.ry;
  return out;
}
