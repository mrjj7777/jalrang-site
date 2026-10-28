// L1: the splash and the bubbles, as pure functions of the splash's clock q (p units, TL.hit at the impact; hero-phys.js maps real
// seconds to it), built once from a seed, so every film shows the same splash. The impact speed from the bottle's physics
// (hero-phys.js) sets its size: the crown's launch speed goes with it, so its height with the square and its peak time with the speed,
// and the drops, the jet and the cavity with it. Real high-speed photographs of milk and red-wine splashes are the reference: a thin sheet rises round
// the bottle, never even (higher on one side, lower on another), its rim thickens into a lumpy tube that breaks into
// fingers of every length with a bead on each tip; the beads pinch off and fly on true ballistic arcs; a fast, low
// spray of fine droplets leaves first; mist hangs; the sheet thins, tears open in holes and is gone; when the cap goes
// under, the surface closes over it and a Worthington jet (one thin column with a bead on top) shoots up; the air that
// went down with the bottle streams up past it as bubbles.
//
// Space: WORLD px of the stage (hero-film.js), the axis through the impact point (g.cx, g.line). A piece of the splash
// is (r, th, z): its distance from the axis, its angle round it (0 faces the camera) and its height above the
// surface. The camera looks down at the water at a small angle (sin el = F.se, cos = F.ce, hero-fx.js), so the near
// side of a ring sits lower on the screen than its far side; the near half is drawn in front of the bottle, the far
// half behind it. Sizes are shares of the bottle's height hB; times are units of p. Nothing is flat: the sheet is two
// gradients (thick and dark at its foot, thin and bright where the light comes through; denser where it is seen
// edge-on) with streaks of light and a rim, every drop and bubble a shaded sprite (hero-sprites.js).
import { TL, TAU, clamp, lerp, ss, rng } from './hero-film.js';

export const SPL = {
  G: 270,              // gravity, hB per p^2 (a slow-motion fall)
  tp: 0.052,           // the crown's rim is at its highest this long after the hit
  H: 0.34,             // ... at this height (on average round the rim)
  fade: 0.042,         // the sheet has gone this long after its peak
  shutter: 0.0011,     // a drop is drawn stretched along its velocity by this much p of travel (motion blur, crisp)
  vRef: 2.9,           // the impact speed (m/s) these sizes were tuned for; a faster arrival makes a bigger splash
};

const NH = 24;         // samples round half the ring

export class Splash {
  constructor(drops, bubbles) {
    this.D = drops; this.B = bubbles;      // sprite atlases
    this.g = null;
  }

  // ---- everything, from the geometry and a seed ----
  build(g, R0, sim) {
    this.g = g;
    const hB = g.hB, R = R0, G = SPL.G * hB;
    this.R = R; this.hB = hB; this.Gp = G;
    const rnd = rng(20261020);
    // the impact speed sets the size: the rim leaves at vs times the reference speed, so it peaks vs times later and vs squared higher
    const vs = this.vs = clamp(sim.vImp / SPL.vRef, 0.6, 1.5), n2 = (n) => Math.round(n * vs * vs);
    this.tp = SPL.tp * vs; this.fade = SPL.fade * vs;
    this.Vc = vs * 2 * SPL.H * hB / SPL.tp;          // the rim's launch speed (it peaks at H after tp)
    const Vc = this.Vc;
    // the rim is never even: its height and flare change round it (a few low harmonics with their own phases)
    this.harm = [[2, 0.13], [3, 0.09], [5, 0.06], [7, 0.035]].map(([k, a]) => [k, a * (0.7 + 0.6 * rnd()), rnd() * TAU]);
    this.flr = [[2, 0.05, rnd() * TAU], [3, 0.035, rnd() * TAU]];
    this.lump = rnd() * TAU;
    // holes that open in the thinning sheet: where, how large, when
    this.holes = Array.from({ length: 7 }, () => ({ th: (rnd() - 0.5) * 2.6, s: 0.35 + 0.45 * rnd(), w: 0.05 + 0.07 * rnd(), t0: this.tp - 0.008 + 0.02 * rnd() }));
    // light streaking down the sheet: crisp specular lines where the curved liquid reflects the key light (upper left),
    // many and uneven, some long, some short, a few on the far side seen through the near
    this.streaks = Array.from({ length: 11 }, (_, i) => {
      const th = -1.35 + 2.7 * ((i + rnd() * 0.8) / 11), lit = 0.55 + 0.45 * Math.cos(th + 0.75);
      const s0 = 0.08 + 0.4 * Math.pow(rnd(), 1.5);
      return { th, a: lit * (0.45 + 0.55 * rnd()), s0, s1: Math.min(0.97, s0 + 0.2 + 0.6 * rnd()), w: 0.6 + 0.9 * rnd() };
    });
    // the fingers: round the rim, irregular in place, length, direction and thickness; some places have none
    this.fingers = [];
    const NF = 34;
    for (let i = 0; i < NF; i++) {
      if (rnd() < 0.22) continue;
      const th = ((i + 0.5 + 0.8 * (rnd() - 0.5)) / NF) * TAU;
      const long = rnd() < 0.3;
      const t0 = 0.012 + 0.02 * rnd();
      const w = hB * (0.007 + 0.007 * rnd());
      this.fingers.push({
        th, t0,
        L: hB * (long ? 0.06 + 0.09 * rnd() : 0.016 + 0.035 * rnd()),
        w,
        rb: w * (0.6 + 0.8 * Math.pow(rnd(), 1.5)),         // the bead: about one and a half times the finger across, some much more
        tilt: 0.05 + 0.45 * rnd() + (long ? 0.15 : 0),     // how much further out than the sheet the finger points (rad)
        bend: (rnd() - 0.5) * 0.5,
        td: t0 + 0.024 + 0.04 * rnd(),                     // its bead leaves
      });
    }
    // ---- the droplets: { th, r0, z0, vr, vz, p0, rad, tl (time of flight), gg (gravity), mist } ----
    const drops = [];
    const add = (o) => {
      const gg = G * (o.gs || 1);
      o.tl = (o.vz + Math.sqrt(o.vz * o.vz + 2 * gg * Math.max(0, o.z0))) / gg;    // up and back to the surface
      o.gg = gg;
      drops.push(o);
    };
    // 1. the fingers' beads: each leaves its finger's tip with the tip's velocity, and a smaller one follows
    for (const f of this.fingers) {
      // a long finger breaks into two or three, each smaller than the one before; a short one gives its one bead
      const n = f.L < hB * 0.04 ? 1 : f.L < hB * 0.1 ? 2 : 3;
      for (let k = 0; k < n; k++) {
        const td = f.td + k * (0.014 + 0.012 * rnd());
        const c = this.rim(td, f.th);
        const a = c.phi + f.tilt + (rnd() - 0.5) * 0.25 * k;   // the finger's direction from vertical
        const L = f.L * (1 - 0.4 * k) * ss(f.t0, f.t0 + 0.045, td);
        const grow = (0.8 - 0.25 * k) * f.L / 0.045;
        add({ th: f.th, r0: c.rr + L * Math.sin(a), z0: c.H + L * Math.cos(a), vr: c.vr + grow * Math.sin(a), vz: c.vz + grow * Math.cos(a),
          p0: TL.hit + td, rad: f.rb * (k ? 0.45 + 0.3 * rnd() : 1), el: k && rnd() < 0.4 ? 1.4 + 0.6 * rnd() : 0, ea: a });
      }
    }
    // 2. the rim throws drops all the way round while it rises: mostly small, a few large; about one in five is still a
    // stretched fragment of a ligament, wobbling as it flies
    for (let i = 0, n = n2(84); i < n; i++) {
      const tau = 0.008 + 0.05 * Math.pow(rnd(), 0.8), th = rnd() * TAU, c = this.rim(tau, th), q = 0.7 + 0.6 * rnd();
      add({ th, r0: c.rr, z0: c.H, vr: c.vr * q + hB * (rnd() - 0.3) * 1.2, vz: c.vz * (0.65 + 0.55 * rnd()) + hB * (rnd() - 0.4) * 2.4,
        p0: TL.hit + tau, rad: hB * (0.0018 + 0.011 * Math.pow(rnd(), 2.6)), el: rnd() < 0.22 ? 1.5 + 1.1 * rnd() : 0, ea: rnd() * Math.PI });
    }
    // 3. the fast, low spray that leaves first, from the foot of the crown: fine and many
    for (let i = 0, n = n2(130); i < n; i++) {
      const a = (8 + 32 * Math.pow(rnd(), 1.2)) * Math.PI / 180, s = Vc * (0.7 + 1.0 * rnd());
      add({ th: rnd() * TAU, r0: R * (1.02 + 0.2 * rnd()), z0: hB * 0.004, vr: s * Math.cos(a), vz: s * Math.sin(a),
        p0: TL.hit + 0.001 + 0.012 * Math.pow(rnd(), 1.5), rad: hB * (0.0014 + 0.004 * Math.pow(rnd(), 2)) });
    }
    // 4. a few large blobs thrown high from the rim
    for (let i = 0, n = n2(6); i < n; i++) {
      const tau = 0.028 + 0.026 * rnd(), th = rnd() * TAU, c = this.rim(tau, th);
      add({ th, r0: c.rr, z0: c.H, vr: c.vr * (0.5 + 0.6 * rnd()), vz: c.vz + Vc * (0.3 + 0.35 * rnd()),
        p0: TL.hit + tau, rad: hB * (0.013 + 0.011 * rnd()) });
    }
    // 5. mist: tiny drops off the rim, slowed by the air (a share of gravity), fading as they go
    for (let i = 0, n = n2(140); i < n; i++) {
      const tau = 0.012 + 0.06 * rnd(), th = rnd() * TAU, c = this.rim(tau, th);
      add({ th, r0: c.rr * (0.9 + 0.25 * rnd()), z0: c.H * (0.4 + 0.65 * rnd()), vr: c.vr * 0.5 + hB * 1.6 * (rnd() - 0.3), vz: c.vz * 0.35 + hB * 2.2 * (rnd() - 0.2),
        p0: TL.hit + tau, rad: hB * (0.0011 + 0.0016 * rnd()), gs: 0.3, mist: true });
    }
    // ---- the seal and the jet: the moment the cap goes under the surface (on screen: the rising surface passes it) ----
    this.ps = sim.q(sim.tSeal);                       // the bottle's physics says when its cap goes under
    const Vj = (2 * 0.4 * hB / 0.056) * Math.sqrt(vs);
    this.jet = { Vj, td: 0.04, rb: hB * 0.019, rt: hB * 0.012, bead: hB * 0.018, ph: rnd() * TAU };
    const jt = (tau) => Vj * tau - 0.5 * G * tau * tau;
    for (let k = 0; k < 3; k++) {
      const tau = this.jet.td + k * 0.008;
      add({ th: 0, r0: 0, z0: jt(tau) - k * hB * 0.03, vr: 0, vz: (Vj - G * tau) * (1 - 0.18 * k),
        p0: this.ps + tau, rad: this.jet.bead * (1 - 0.22 * k), jet: true });
    }
    this.drops = drops;
    // the stretch of p in which any of them is in the air (drawDrops has nothing to do outside it)
    this.dropsIn = [Math.min(...drops.map((d) => d.p0)), Math.max(...drops.map((d) => d.p0 + d.tl))];
    // the 24 largest make a ripple where they come down
    this.lands = drops.filter((d) => !d.mist && !d.jet).sort((a, b) => b.rad - a.rad).slice(0, 24).map((d) => {
      const r = d.r0 + d.vr * d.tl;
      return { x: g.cx + r * Math.sin(d.th), p0: d.p0 + d.tl, A: 0.5 * d.rad };
    });

    // ---- the bubbles. While it goes in, the air pocket round the bottle sheds a stream from its foot; at the seal the
    // pocket breaks up all along the bottle and over the cap; the wake streams up behind it for a while after ----
    const bub = [];
    const pos = (q) => g.line + sim.dAtQ(q);                              // the bottle's visible bottom, world y
    // the bottle's half-width at a height share v (0 the cap top, 1 the base): neck and cap narrower
    const half = (v) => (v < 0.12 ? 0.62 : v < 0.24 ? lerp(0.62, 1, (v - 0.12) / 0.12) : 1) * R;
    const size = (lo, hi, pw) => hB * (lo + (hi - lo) * Math.pow(rnd(), pw));
    const bubble = (o) => { o.vb = hB * (2.2 + 58 * (o.rad / hB)); o.front = rnd() < 0.5; o.wob = rnd(); bub.push(o); };
    for (let i = 0; i < 84; i++) {                                         // the foot of the pocket, while it goes in
      const pb = TL.hit + 0.02 + (this.ps - TL.hit - 0.02) * rnd(), side = rnd() < 0.5 ? -1 : 1;
      bubble({ pb, x: g.cx + side * R * (0.8 + 0.3 * rnd()), y: pos(pb) - hB * 0.02 * rnd(), rad: size(0.0035, 0.016, 2.2), out: side * hB * (0.15 + 0.8 * rnd()) });
    }
    for (let i = 0; i < 112; i++) {                                        // the pocket breaks from the top down
      const v = 0.04 + 0.92 * rnd(), side = rnd() < 0.5 ? -1 : 1;
      const pb = this.ps - 0.012 + 0.045 * v + 0.01 * rnd();
      bubble({ pb, x: g.cx + side * (half(v) + hB * (0.004 + 0.03 * Math.pow(rnd(), 1.5))), y: pos(pb) - hB * (1 - v), rad: size(0.0035, 0.02, 2.2), out: side * hB * (0.2 + 1.1 * rnd()) });
    }
    for (let i = 0; i < 40; i++) {                                         // the cap: the pocket's last air, all at once
      const pb = this.ps - 0.006 + 0.016 * rnd();
      bubble({ pb, x: g.cx + (rnd() - 0.5) * R * 1.3, y: pos(pb) - hB * (1.0 + 0.05 * rnd()), rad: size(0.004, 0.022, 1.8), out: (rnd() - 0.5) * hB * 1.4 });
    }
    for (let i = 0; i < 72; i++) {                                         // the wake: a stream over the next stretch of the dive
      const pb = this.ps + 0.15 * Math.pow(rnd(), 0.9);
      bubble({ pb, x: g.cx + (rnd() - 0.5) * R * 1.0, y: pos(pb) - hB * (1.0 + 0.03 * rnd()), rad: size(0.003, 0.013, 2), out: (rnd() - 0.5) * hB * 0.9 });
    }
    for (let i = 0; i < 10; i++) {                                         // a few large ones that wobble as they rise
      const v = 0.1 + 0.8 * rnd(), side = rnd() < 0.5 ? -1 : 1, pb = this.ps - 0.004 + 0.035 * rnd();
      bubble({ pb, x: g.cx + side * (half(v) + hB * 0.02), y: pos(pb) - hB * (1 - v), rad: size(0.02, 0.034, 1), out: side * hB * (0.3 + 0.6 * rnd()), big: true });
    }
    for (const o of bub) { o.w = TAU / (0.018 + 0.03 * o.wob); o.ph = o.wob * 9.1; }
    this.bubbles = bub;
    this.bubFrom = Math.min(...bub.map((o) => o.pb));             // none is out before this p
  }

  // the rim at time tau after the hit, at angle th round the axis: height H, radius rr, the sheet's foot rb, its flare
  // phi (from vertical) and its velocity
  rim(tau, th = 0) {
    const hB = this.hB, G = this.Gp, R = this.R, Vc = this.Vc;
    const t = Math.max(0, tau);
    let k = 1;
    for (const [n, a, ph] of this.harm) k += a * Math.sin(n * th + ph);
    let fl = 0;
    for (const [n, a, ph] of this.flr) fl += a * Math.sin(n * th + ph);
    const H = Math.max(0, Vc * t - 0.5 * G * t * t) * k;
    // the first thing out is a low skirt shot out nearly flat (60 degrees from vertical); it turns up into the crown's
    // wall (22 degrees) as it rises, and opens a little again as it falls
    const phi = 1.06 - 0.7 * ss(0, 0.03, t) + 0.12 * ss(0.03, 0.08, t) + fl;
    const rb = R * 1.02 + hB * 0.012 * ss(0, 0.03, t);
    const rr = rb + H * Math.tan(phi) + hB * 0.035 * ss(0.03, 0.1, t);
    return { H, rr, rb, phi, vr: Vc * k * Math.tan(phi) * 0.9, vz: (Vc - G * t) * k };
  }

  // ---- per frame: the crown's state. F (hero-fx.js): p, cx, Ys (the surface's middle line on screen at the axis), se, ce ----
  prep(F) {
    const tau = F.q - TL.hit;
    this.tau = tau;
    this.on = tau > 0 && tau < this.tp + this.fade + 0.01;
    // the sheet: whole until its peak, then it thins, tears and draws back to the surface while its rim flies on
    this.top = 1 - ss(this.tp - 0.002, this.tp + this.fade, tau);
    this.alpha = ss(0, 0.005, tau) * (0.3 + 0.7 * Math.pow(this.top, 0.7));
    this.fing = tau > 0.008 && tau < this.tp + 0.024;
  }
  // screen position of (r, th, z)
  P(F, r, th, z) { return [F.cx + r * Math.sin(th), F.Ys - z * F.ce + r * Math.cos(th) * F.se]; }
  // a point of the sheet at (th, s): s 0 its foot, 1 its rim; the flare grows towards the top (a bell, not a cone)
  S(F, tau, th, s) {
    const c = this.rim(tau, th), q = Math.pow(s, 2.1);
    return this.P(F, c.rb + (c.rr - c.rb) * q, th, c.H * s);
  }
  // how far up the sheet still reaches at th (it draws back unevenly, never in spikes)
  topAt(th) {
    if (this.top >= 0.999) return 1;
    const n = 0.16 * Math.sin(3 * th + 1.3) + 0.1 * Math.sin(5 * th + this.lump) + 0.06 * Math.sin(9 * th + 0.4);
    return clamp(this.top * (1 + n) - 0.04 * (1 - this.top), 0, 1);
  }

  // the sheet's outline as the current path: the foot round the half, up the right edge, the (receding) top back round,
  // down the left edge; with the holes it has torn (returned, for their edges)
  sheetPath(ctx, F, near) {
    const tau = this.tau, c0 = this.rim(tau, 0);
    const sgn = near ? 1 : -1;
    const arc = (i) => -Math.PI / 2 + (sgn * Math.PI * i) / NH;
    ctx.beginPath();
    let q = this.S(F, tau, arc(0), 0);
    ctx.moveTo(q[0], q[1]);
    for (let i = 1; i <= NH; i++) { q = this.S(F, tau, arc(i), 0); ctx.lineTo(q[0], q[1]); }
    const sR = this.topAt(arc(NH)), sL = this.topAt(arc(0));
    for (let k = 1; k <= 6; k++) { q = this.S(F, tau, arc(NH), (sR * k) / 6); ctx.lineTo(q[0], q[1]); }
    for (let i = NH; i >= 0; i--) { q = this.S(F, tau, arc(i), this.topAt(arc(i))); ctx.lineTo(q[0], q[1]); }
    for (let k = 5; k >= 1; k--) { q = this.S(F, tau, arc(0), (sL * k) / 6); ctx.lineTo(q[0], q[1]); }
    ctx.closePath();
    // holes: as the sheet thins it tears open; each hole has a bright thickened edge
    const holes = [];
    if (near && tau > this.tp - 0.01) {
      for (const h of this.holes) {
        const k = ss(h.t0, h.t0 + 0.03, tau);
        if (k <= 0.02 || h.s > this.topAt(h.th) - 0.08) continue;
        const ctr = this.S(F, tau, h.th, h.s), rr = this.rim(tau, h.th).rr;
        const rx = Math.max(1, h.w * k * rr * Math.cos(h.th) * 1.6), ry = Math.max(1, h.w * k * c0.H * 0.9);
        ctx.moveTo(ctr[0] + rx, ctr[1]);
        ctx.ellipse(ctr[0], ctr[1], rx, ry, 0, 0, TAU);
        holes.push([ctr[0], ctr[1], rx, ry]);
      }
    }
    return { holes, sL, sR, arc, c0 };
  }
  // is there a sheet to draw (and to see through)?
  sheetOn() { return this.on && this.alpha >= 0.01 && this.rim(this.tau, 0).H >= 1.5; }

  // ---- the crown sheet: the near half (front) or the far half (back). light(ctx): the caustic pattern, placed for
  // the sheet (the light running up through the moving liquid), or null ----
  drawSheet(ctx, F, near, light) {
    if (!this.sheetOn()) return;
    const tau = this.tau, hB = this.hB;
    const { holes, sL, arc, c0 } = this.sheetPath(ctx, F, near);
    const yb = F.Ys, yt = F.Ys - c0.H * F.ce;
    const gr = ctx.createLinearGradient(0, yb, 0, Math.min(yt, yb - 1));
    // its foot is the surface itself rising (the surface's own dark red), then thick liquid (deep red), thinning towards
    // the rim (bright translucent orange-red: the light comes through it)
    if (near) {
      gr.addColorStop(0, 'rgba(90, 22, 12, 0.72)'); gr.addColorStop(0.08, 'rgba(132, 26, 13, 0.86)'); gr.addColorStop(0.32, 'rgba(170, 39, 20, 0.76)');
      gr.addColorStop(0.7, 'rgba(218, 80, 50, 0.6)'); gr.addColorStop(1, 'rgba(244, 128, 94, 0.62)');
    } else {
      gr.addColorStop(0, 'rgba(70, 16, 9, 0.8)'); gr.addColorStop(0.1, 'rgba(100, 19, 9, 0.9)'); gr.addColorStop(0.35, 'rgba(142, 31, 16, 0.78)');
      gr.addColorStop(0.72, 'rgba(198, 64, 38, 0.6)'); gr.addColorStop(1, 'rgba(226, 104, 74, 0.62)');
    }
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = gr;
    ctx.fill('evenodd');
    // light running up through the liquid: the caustic footage, stretched along the flow, added inside the sheet
    if (light) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.alpha * (near ? 0.5 : 0.32);
      ctx.fillStyle = light;
      ctx.fill('evenodd');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = this.alpha;
    }
    // denser where the sheet is seen edge-on: towards both silhouette edges, the left one lit
    const xl = F.cx - c0.rr, xr = F.cx + c0.rr;
    const ge = ctx.createLinearGradient(xl, 0, xr, 0);
    ge.addColorStop(0, near ? 'rgba(150, 30, 15, 0.62)' : 'rgba(120, 24, 12, 0.5)'); ge.addColorStop(0.13, 'rgba(150, 30, 15, 0.16)');
    ge.addColorStop(0.3, 'rgba(150, 30, 15, 0)'); ge.addColorStop(0.7, 'rgba(150, 30, 15, 0)');
    ge.addColorStop(0.87, 'rgba(120, 22, 11, 0.2)'); ge.addColorStop(1, near ? 'rgba(110, 20, 10, 0.7)' : 'rgba(100, 18, 9, 0.55)');
    ctx.fillStyle = ge;
    ctx.fill('evenodd');
    const lw = Math.max(0.8, hB * 0.0026);
    if (near) {
      // streaks of light down the sheet, crisp, where it faces the key light; and the lit left edge
      ctx.lineCap = 'round';
      // smooth, following the sheet, brightest in their middle and gone at both ends
      const streak = (th, s0, s1, a, w) => {
        const A = this.S(F, tau, th, s0), Z = this.S(F, tau, th, s1);
        const sg = ctx.createLinearGradient(A[0], A[1], Z[0], Z[1]);
        sg.addColorStop(0, 'rgba(255, 230, 218, 0)'); sg.addColorStop(0.45, `rgba(255, 232, 220, ${a.toFixed(3)})`); sg.addColorStop(1, 'rgba(255, 230, 218, 0)');
        ctx.strokeStyle = sg; ctx.lineWidth = w;
        ctx.beginPath();
        for (let j = 0; j <= 6; j++) { const p = this.S(F, tau, th, lerp(s0, s1, j / 6)); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
        ctx.stroke();
      };
      for (const st of this.streaks) {
        const s1 = Math.min(st.s1, this.topAt(st.th) - 0.05);
        if (s1 > st.s0 + 0.1) streak(st.th, st.s0, s1, 0.7 * st.a, lw * st.w);
      }
      // the lit left edge
      streak(-Math.PI / 2 + 0.06, 0.2, sL * 0.9, 0.45, lw);
      // the holes' edges: liquid gathers where the film draws back
      ctx.strokeStyle = 'rgba(232, 104, 74, 0.8)'; ctx.lineWidth = lw * 1.3;
      for (const [x, y, rx, ry] of holes) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
    // the rim: a lumpy tube along the top while it is whole, its top edge catching the light in broken glints
    if (this.top > 0.55) this.drawRim(ctx, F, near, arc, ss(0.55, 0.9, this.top));
    ctx.globalAlpha = 1;
  }
  drawRim(ctx, F, near, arc, a) {
    const tau = this.tau, hB = this.hB;
    const w0 = hB * 0.015;
    const wAt = (th) => w0 * (0.75 + 0.35 * Math.sin(11 * th + this.lump) + 0.2 * Math.sin(17 * th + 1.1));
    const up = [], dn = [];
    for (let i = 0; i <= NH; i++) {
      const th = arc(i), s = this.topAt(th), p = this.S(F, tau, th, s), w = wAt(th) * a;
      up.push([p[0], p[1] - w * 0.55]); dn.push([p[0], p[1] + w * 0.45]);
    }
    ctx.globalAlpha = this.alpha * a;
    ctx.fillStyle = near ? 'rgb(180, 46, 25)' : 'rgb(146, 35, 19)';
    ctx.beginPath(); ctx.moveTo(up[0][0], up[0][1]);
    for (let i = 1; i <= NH; i++) ctx.lineTo(up[i][0], up[i][1]);
    for (let i = NH; i >= 0; i--) ctx.lineTo(dn[i][0], dn[i][1]);
    ctx.closePath(); ctx.fill();
    // its upper edge: a few specular glints where the tube faces the light, short and of different strengths
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.7, w0 * 0.26);
    for (let i = 0; i < NH; i++) {
      const th = arc(i), lit = 0.5 + 0.5 * Math.sin(5.3 * th + this.lump * 2) * Math.sin(2.1 * th + 0.6) - (near ? 0.3 * Math.sin(th) : 0.2);
      if (lit < 0.62) continue;
      ctx.strokeStyle = near ? `rgba(255, 240, 232, ${(0.95 * clamp((lit - 0.62) / 0.3)).toFixed(3)})` : 'rgba(255, 206, 190, 0.35)';
      const m = 0.25 + 0.5 * ((i * 7) % 5) / 5;
      ctx.beginPath();
      ctx.moveTo(lerp(up[i][0], up[i + 1][0], m * 0.5), lerp(up[i][1], up[i + 1][1], m * 0.5) + w0 * 0.14);
      ctx.lineTo(lerp(up[i][0], up[i + 1][0], 0.5 + m * 0.5), lerp(up[i][1], up[i + 1][1], 0.5 + m * 0.5) + w0 * 0.14);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // ---- the fingers on the rim, each with its bead until the bead leaves ----
  drawFingers(ctx, F, near, dpr) {
    if (!this.on || !this.fing) return;
    const tau = this.tau, D = this.D;
    const fade = 1 - ss(this.tp, this.tp + 0.016, tau);              // the rim they grow from is breaking up
    ctx.globalAlpha = fade;
    for (const f of this.fingers) {
      if ((Math.cos(f.th) >= 0) !== near) continue;
      const grow = ss(f.t0, f.t0 + 0.04, tau);
      const k1 = ss(f.td, f.td + 0.02, tau);                               // after its beads have left it draws back into the rim
      if (grow <= 0.02 || k1 >= 0.98) continue;
      const L = f.L * grow * (1 - 0.85 * k1);
      const c = this.rim(tau, f.th);
      const a = c.phi + f.tilt;
      const r0 = c.rr, z0 = c.H;                                            // on the rim, wherever the sheet below it has gone
      const B = this.P(F, r0, f.th, z0);
      const T = this.P(F, r0 + L * Math.sin(a), f.th, z0 + L * Math.cos(a));
      let nx = T[1] - B[1], ny = B[0] - T[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const wb = f.w * (1 - 0.35 * k1), wt = wb * 0.72;
      // it bends a little (the tip lags or leads the rim)
      const bx = (B[0] + T[0]) / 2 + nx * nl * f.bend * 0.25, by = (B[1] + T[1]) / 2 + ny * nl * f.bend * 0.25;
      // a ligament is a thin cylinder of the same liquid: lit through, translucent, never a dark stick
      ctx.globalAlpha = fade * (1 - 0.6 * k1);
      ctx.fillStyle = near ? 'rgba(214, 74, 44, 0.92)' : 'rgba(170, 44, 24, 0.9)';
      ctx.beginPath();
      ctx.moveTo(B[0] + nx * wb / 2, B[1] + ny * wb / 2);
      ctx.quadraticCurveTo(bx + nx * (wb + wt) / 4, by + ny * (wb + wt) / 4, T[0] + nx * wt / 2, T[1] + ny * wt / 2);
      ctx.lineTo(T[0] - nx * wt / 2, T[1] - ny * wt / 2);
      ctx.quadraticCurveTo(bx - nx * (wb + wt) / 4, by - ny * (wb + wt) / 4, B[0] - nx * wb / 2, B[1] - ny * wb / 2);
      ctx.closePath(); ctx.fill();
      if (wb > 1.6) {
        ctx.strokeStyle = 'rgba(255, 200, 180, 0.55)'; ctx.lineWidth = Math.max(0.6, wb * 0.2);
        ctx.beginPath(); ctx.moveTo(B[0] + nx * wb * 0.28, B[1] + ny * wb * 0.28); ctx.quadraticCurveTo(bx + nx * wb * 0.2, by + ny * wb * 0.2, T[0] + nx * wt * 0.3, T[1] + ny * wt * 0.3); ctx.stroke();
      }
      // the bead on the tip, until it leaves (then the flying one in drawDrops takes over)
      if (tau < f.td) this.sprite(ctx, D, T[0], T[1], f.rb * (0.5 + 0.5 * grow), 0, 0, dpr);
      else if (tau < f.td + 0.018) this.sprite(ctx, D, T[0], T[1], f.rb * 0.55 * ss(f.td, f.td + 0.012, tau), 0, 0, dpr);
    }
    ctx.globalAlpha = 1;
  }

  // a sprite of radius rad (css px) at (x, y), stretched along (vx, vy) (px per p) when fast
  sprite(ctx, A, x, y, rad, vx, vy, dpr) {
    const rd = rad * dpr;
    if (rd < 0.35) return;
    const c = A.pick(rd), s = c.s * (rd / c.r) / dpr;      // the cell's box, in css px, scaled to this radius
    const sp = Math.hypot(vx, vy), L = sp * SPL.shutter;
    if (L < rad * 0.5 || sp < 1) { ctx.drawImage(A.cv, c.x, c.y, c.s, c.s, x - s / 2, y - s / 2, s, s); return; }
    const st = Math.min(3.2, 1 + L / (2 * rad)), ux = vx / sp, uy = vy / sp;
    // stretch along the velocity (the motion blur of a fast shutter), the highlight with it
    ctx.setTransform(dpr * ux * st, dpr * uy * st, -dpr * uy, dpr * ux, dpr * x, dpr * y);
    ctx.drawImage(A.cv, c.x, c.y, c.s, c.s, -s / 2, -s / 2, s, s);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- the droplets in flight: the near ones in front, the far ones behind (the jet's on its axis, behind) ----
  drawDrops(ctx, F, near, dpr, fine) {
    const p = F.q, D = this.D;
    if (p < this.dropsIn[0] || p > this.dropsIn[1]) return;
    const mist = [];
    for (const d of this.drops) {
      if ((d.jet ? false : Math.cos(d.th) >= 0) !== near) continue;
      const t = p - d.p0;
      if (t < 0 || t > d.tl) continue;
      if (d.mist && !fine) continue;
      const r = d.r0 + d.vr * t, z = d.z0 + d.vz * t - 0.5 * d.gg * t * t;
      const [x, y] = this.P(F, r, d.th, z);
      if (y < -20 || y > F.h + 20) continue;
      if (d.mist) { mist.push(x, y, d.rad, 1 - ss(0.5 * d.tl, d.tl, t)); continue; }
      const vz = d.vz - d.gg * t;
      let vx = d.vr * Math.sin(d.th), vy = -vz * F.ce + d.vr * Math.cos(d.th) * F.se;
      if (d.el) {
        // a ligament's fragment: stretched along its own axis, oscillating as it pulls itself round
        const st = 1 + (d.el - 1) * (0.6 + 0.4 * Math.sin(t * 170 + d.ea * 5)) * (1 - ss(0.4 * d.tl, d.tl, t));
        const sp = ((st - 1) * 2 * d.rad) / SPL.shutter;
        if (sp > Math.hypot(vx, vy)) { vx = Math.cos(d.ea) * sp; vy = Math.sin(d.ea) * sp; }
      }
      this.sprite(ctx, D, x, y, d.rad, vx, vy, dpr);
    }
    // mist: specks of bright red-orange, each at its own strength
    if (mist.length) {
      ctx.fillStyle = 'rgb(232, 108, 76)';
      const px = 1 / dpr;
      for (let i = 0; i < mist.length; i += 4) {
        const s = Math.max(px, mist[i + 2] * 1.6);
        ctx.globalAlpha = 0.75 * mist[i + 3];
        ctx.fillRect(mist[i] - s / 2, mist[i + 1] - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- the Worthington jet: one thin column up from where the surface closed over the cap, a bead on its top ----
  jetH(tau) { const j = this.jet; return Math.max(0, j.Vj * tau - 0.5 * this.Gp * tau * tau); }
  // its foot on the surface (px, up) at distance d from the axis: the surface rises into it
  jetFoot(p, d) {
    const tau = p - this.ps;
    if (tau <= 0 || tau > 0.12) return 0;
    const a = this.hB * 0.035 * ss(0, 0.012, tau) * (1 - ss(0.05, 0.12, tau));
    const w = this.hB * 0.07;
    return a * Math.exp(-(d * d) / (w * w));
  }
  drawJet(ctx, F, dpr) {
    const tau = F.q - this.ps, j = this.jet;
    if (tau <= 0 || tau > 0.115) return;
    // the column: up to the top bead until it leaves, then it falls back into the surface
    const Ht = tau < j.td ? this.jetH(tau) : this.jetH(j.td) * (1 - ss(j.td, 0.105, tau)) - (tau - j.td) * j.Vj * 0.15;
    if (Ht < 2) return;
    const x0 = F.cx, yb = F.Ys + 1, yt = yb - Ht * F.ce;
    const rb = j.rb * (0.7 + 0.3 * ss(0, 0.02, tau)), rt = j.rt * (tau < j.td ? 1 : 0.8);
    // its width along it: narrowing to the top, and waisted where it is about to break into drops
    const pinch = ss(0.02, j.td + 0.01, tau);
    const rAt = (u) => lerp(rb, rt, Math.pow(u, 0.6)) * (1 - 0.22 * pinch * u * (0.5 + 0.5 * Math.sin(u * 15 + j.ph)));
    const gr = ctx.createLinearGradient(x0 - rb, 0, x0 + rb, 0);
    gr.addColorStop(0, 'rgba(246, 146, 112, 0.95)'); gr.addColorStop(0.16, 'rgb(212, 68, 40)'); gr.addColorStop(0.28, 'rgb(252, 222, 210)');
    gr.addColorStop(0.34, 'rgb(208, 64, 36)'); gr.addColorStop(0.72, 'rgb(148, 33, 17)'); gr.addColorStop(0.92, 'rgb(170, 44, 24)'); gr.addColorStop(1, 'rgba(226, 104, 74, 0.9)');
    ctx.fillStyle = gr;
    const n = 14, foot = Math.min(Ht * 0.25, rb * 4);
    ctx.beginPath();
    ctx.moveTo(x0 - rb * 3.2, yb);
    ctx.bezierCurveTo(x0 - rb * 1.6, yb, x0 - rb * 1.05, yb - foot * 0.4, x0 - rb, yb - foot);
    for (let i = 1; i <= n; i++) { const u = i / n, y = lerp(yb - foot, yt + rt, u); ctx.lineTo(x0 - rAt(u), y); }
    ctx.arc(x0, yt + rt, rt, Math.PI, 0);
    for (let i = n; i >= 1; i--) { const u = i / n, y = lerp(yb - foot, yt + rt, u); ctx.lineTo(x0 + rAt(u), y); }
    ctx.lineTo(x0 + rb, yb - foot);
    ctx.bezierCurveTo(x0 + rb * 1.05, yb - foot * 0.4, x0 + rb * 1.6, yb, x0 + rb * 3.2, yb);
    ctx.closePath();
    ctx.fill();
    // a crisp specular line down its lit side
    ctx.strokeStyle = 'rgba(255, 238, 230, 0.8)'; ctx.lineWidth = Math.max(0.7, rb * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0 - rAt(0.08) * 0.45, yb - foot * 1.1); ctx.lineTo(x0 - rAt(0.85) * 0.45, lerp(yb - foot, yt + rt, 0.85)); ctx.stroke();
    ctx.lineCap = 'butt';
    // the bead it carries, until it leaves (the flying beads are drops: drawDrops)
    if (tau < j.td) this.sprite(ctx, this.D, x0, yt - j.bead * 0.55, j.bead * ss(0, 0.018, tau), 0, -(j.Vj - this.Gp * tau), dpr);
  }

  // ---- the air pocket that follows the bottle down, until the seal: a funnel of air round it under the surface, its wall
  // a shimmering mirror (light turned back at the air), widest at the surface and closing a little way down ----
  drawSleeve(ctx, F) {
    const p = F.q;
    const a = ss(TL.hit + 0.006, TL.hit + 0.02, p) * (1 - ss(this.ps - 0.006, this.ps + 0.012, p));
    if (a < 0.01 || !F.bot) return;
    const { cut, base, half } = F.bot;               // the waterline on the bottle (screen y at its middle), its bottom, its half-width
    const depth = Math.min(base - cut, this.hB * 0.2);
    if (depth < 4) return;
    const hB = this.hB, y1 = cut + depth;
    for (const side of [-1, 1]) {
      const xw = F.bx + side * half;
      // the funnel's wall: wide at the surface, closing fast on the bottle, never straight (it trembles with the scroll)
      const gap = (y) => { const q = 1 - clamp((y - cut) / depth); return hB * 0.026 * Math.pow(q, 2.6) * (1 + 0.22 * Math.sin(y * 0.13 + p * 260 + side)); };
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(xw, y1);
      for (let k = 0; k <= 12; k++) { const y = lerp(y1, cut, k / 12); ctx.lineTo(xw + side * gap(y), y); }
      ctx.lineTo(xw, cut);
      ctx.closePath();
      const gf = ctx.createLinearGradient(0, cut, 0, y1);
      gf.addColorStop(0, 'rgba(250, 140, 106, 0.3)'); gf.addColorStop(1, 'rgba(250, 140, 106, 0)');
      ctx.fillStyle = gf; ctx.fill();
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) { const y = lerp(y1, cut, k / 12); if (k) ctx.lineTo(xw + side * gap(y), y); else ctx.moveTo(xw + side * gap(y), y); }
      const gs = ctx.createLinearGradient(0, cut, 0, y1);
      gs.addColorStop(0, 'rgba(255, 214, 196, 0.5)'); gs.addColorStop(1, 'rgba(255, 214, 196, 0)');
      ctx.strokeStyle = gs; ctx.lineWidth = Math.max(0.7, hB * 0.002); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- the bubbles of the plume: the front ones over the bottle, the back ones behind it ----
  drawBubbles(ctx, F, front, dpr, fine) {
    const p = F.q, hB = this.hB, A = this.B;
    if (p < this.bubFrom) return;
    const top = F.line;                                // the surface, world y (they burst there)
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (b.front !== front) continue;
      if (!fine && (i & 1) && !b.big) continue;
      const t = p - b.pb;
      if (t < 0) continue;
      const yw = b.y - b.vb * t - hB * 0.4 * t * ss(0, 0.05, t);        // they speed up as they leave the turbulence
      if (yw - b.rad < top) continue;
      const y = yw - F.cam;
      if (y < -20 || y > F.h + 20) continue;
      const wob = (b.big ? 1.6 : 0.7) * b.rad * Math.sin(b.w * t + b.ph) * ss(0, 0.01, t);
      const x = b.x + b.out * t * (1 - 0.5 * ss(0, 0.12, t)) + wob;
      const rad = b.rad * (0.4 + 0.6 * ss(0, 0.006, t));                 // a bubble pinches off the pocket: it starts small
      if (b.big) {
        // a large bubble is flattened and its shape wobbles
        const sy = 0.78 + 0.08 * Math.sin(b.w * 2 * t + b.ph), c = A.pick(rad * dpr), s = (c.s * (rad * dpr / c.r)) / dpr;
        ctx.drawImage(A.cv, c.x, c.y, c.s, c.s, x - (s / 2) * 1.08, y - (s / 2) * sy, s * 1.08, s * sy);
      } else this.sprite(ctx, A, x, y, rad, 0, 0, dpr);
    }
  }
}
