// L3's one motion, as numbers: how the painting of edition k leaves the bottle to the LEFT as a flat
// cloth while the painting of edition k + 1 comes in from the RIGHT and wraps on. The same numbers
// drive the 3D cloths (gl.js, through clothMaterial below) and the 2D cloths (ten.js, two images),
// so every version tells the story the same way, for all ten editions.
//
// FIX2 (16 Oct 2026): the cloths now leave and arrive at the bottle's SILHOUETTES, not at its front,
// so the front of the bottle always wears a painting and reads as a bottle, never as a framed picture.
// The bottle is a roller turning one way (its front moves to the left), and each painting runs
// through it like cloth:
//   - the path: flat on the RIGHT (in the plane of the bottle's axis) → onto the bottle at its right
//     edge → across the front → off at its left edge → flat on the LEFT; a cloth that stays wound
//     goes on round the back instead.
//   - the painting is a strip CW long (all the way round); along it `a` runs 0 → CW from its left
//     edge. Wound, a point a sits at the angle ψ = (a − k)/R + phi (from the front towards +x, the
//     right); flat, at x = (a − k) ∓ (R + slide) (left: −, right: +), lifted a little towards the
//     viewer as it leaves the bottle.
//   - the outgoing cloth (in = 0): the part a < k has left at the left edge, flat;
//     the incoming cloth (in = 1): the part a > k has still to come on at the right edge, flat.
//
// SLOW (19 Oct 2026, JJ: "the design change is speedy; make it real, premium, slow"): the whole sequence
// is now 1700 vh long (ten.js data-hold) and one swap takes SPAN = 0.68 of a tenth of it: 115.6 vh of
// scroll for one edition to leave and the next to arrive. The conveyor (the surface of the bottle and
// the flat cloths with it) runs 6πR = 7.24 bottle units, about 1640 px at 1505 × 916, so it travels
// 1.55 px of cloth per px of scroll on average and 2.1 at the most (the two ends of a step ease in
// and out over RAMP); before it was 3.2 on average and 4.1 at the most, and the colour line and the
// flat cloth edges, which also carry the slide below, reached 6. Nothing that is on screen now moves
// faster than 2.1 px per px of scroll at 16:10 (1505 × 916, 1280 × 800) and 2.3 at 16:9 (1920 × 1080),
// measured by importing this file in Node and again in the browser (a 2 px scroll moves the colour line
// 4.2 px at the most). The flat cloths no longer slide in from far beyond the screen: xfar (below) is now
// the screen's edge plus a few px, so at 16:10 the slide is nil (the cloth starts D1 away, which is
// the screen).
//
// One step, as distance d run by the bottle's surface, 0 → D = 6πR (three turns), eased in and out:
//   0 → 1.5πR      the join (the two edges of the painting) comes round to the left edge, while the
//                  next painting slides in, flat, from the right of the screen
//   1.5πR →        the old painting leaves at the left edge, its left edge first
//   2.5πR          the new painting's left edge reaches the right edge just as the old one's right
//                  edge does: from here the two follow each other across the front, edge to edge
//   3.5πR          the old painting has left; the new one covers the front
//   → 4.5πR        the new one winds on all the way round; the old one slides off the left of the screen
//   → 6πR          the bottle turns on until the new join is at the back and its middle faces you
// The colour line (the ground, the words, the shoulder) follows the meeting point of the two
// paintings: the new one's leading edge while it is flat, the seam while it crosses the front, the
// old one's trailing edge once it has left. Left of it is the old edition; right of it, the new one.
// the bottle's numbers (js/gl/bottle.js DIM), copied so this file never pulls three.js into the 2D
// version (a phone loads no 3D at all)
const DIM = { r: 0.38, bandBottom: 0.22, bandH: 1.8 };

export const CR = DIM.r + 0.004;          // the cloth's radius: a hair outside the bare steel
export const CW = Math.PI * 2 * CR;        // its length: exactly once round
export const CH = DIM.bandH, CBASE = DIM.bandBottom;
export const LIFT = 0.14;                  // how far a flat cloth comes towards the viewer (bottle units)
const PR = Math.PI * CR;                   // half way round
const D0 = 1.5 * PR, D1 = 2.5 * PR, D2 = 3.5 * PR, DEND = 6 * PR;

const clamp = (v) => Math.max(0, Math.min(1, v));
const sm = (e0, e1, v) => { const k = clamp((v - e0) / (e1 - e0)); return k * k * (3 - 2 * k); };

// the depth of a flat cloth at x (bottle units): from the bottle's edge it comes a little towards
// the viewer, with a slow ripple that stays put in space while the cloth runs through it (so it
// reads as cloth, not a card)
export function liftAt(x) {
  const d = Math.max(0, Math.abs(x) - CR);
  return LIFT * sm(0, 1.2, d) + 0.03 * Math.sin(x * 3.6) * sm(0.2, 0.9, d);
}

// the share of the step's distance run at t (0 → 1): a steady conveyor, eased in and out over the first and last 22%
// (smoothstep ramps: the speed and its slope both start and end at zero). A softer ramp would make
// the middle faster for the same scroll (the middle runs at 1 / (1 − RAMP) times the average: 1.28),
// so it stays at 0.22; the softness of starts and stops comes from the smoothed progress in main.js.
const RAMP = 0.22;
function run(t) {
  t = clamp(t);
  const ramp = (u) => RAMP * (u * u * u - 0.5 * u * u * u * u);
  let g;
  if (t < RAMP) g = ramp(t / RAMP);
  else if (t > 1 - RAMP) g = (1 - RAMP) - ramp((1 - t) / RAMP);
  else g = 0.5 * RAMP + (t - RAMP);
  return g / (1 - RAMP);
}

// The state of both cloths at t (0..1) of a step. xfar: how far from the bottle's axis (bottle units)
// a flat cloth's edge must stand to be just off screen (the stage's half width plus a few px; the
// lifted cloth's perspective adds another 2%). Returns { out, in, line, lz }:
//   out / in: { k, phi, slide } for the outgoing and incoming cloth
//   line, lz: the x and the depth (bottle units) of the colour line
export function stepAt(t, xfar, win) {
  // win: [from, to] in d, for the 2D versions (visibleRange below); the 3D bottle runs the whole 0 → DEND
  const d = win ? win[0] + (win[1] - win[0]) * run(t) : DEND * run(t);
  // the incoming cloth starts off screen and slows onto the conveyor as its edge reaches the bottle
  const E1 = Math.max(0, xfar - (CR + D1));
  const sIn = d < D1 ? E1 * (1 - d / D1) * (1 - d / D1) : 0;
  // the outgoing cloth, once it has left, speeds up off the screen
  const E2 = Math.max(0, xfar - (CR + (DEND - D2)));
  const u = d > D2 ? (d - D2) / (DEND - D2) : 0;
  const sOut = E2 * u * u;
  const e = Math.max(0, d - D0), f = d - D1;
  const out = { k: e, phi: (e - CW / 2 - d) / CR, slide: sOut };
  const inn = { k: f, phi: Math.PI / 2, slide: sIn };
  let line, lz;
  if (d < D1) { line = CR + (D1 - d) + sIn; lz = liftAt(line); }
  else if (d <= D2) { const ps = Math.PI / 2 - (d - D1) / CR; line = CR * Math.sin(ps); lz = CR * Math.cos(ps); }
  else { line = -CR - (d - D2) - sOut; lz = liftAt(line); }
  return { out, in: inn, line, lz };
}
export const REST = { k: 0, phi: -Math.PI, slide: 0 };

// The part of a step that a 2D screen shows, as [from, to] in d (19 Oct 2026). The packshot does not
// turn, so the turns the 3D bottle makes before the first cloth reaches the screen and after the line has
// left it are nothing to see; on a phone (a screen 1.4 units from its axis to its edge) that was more
// than half of every step, scrolled through for nothing. The window starts where the old painting begins
// to leave (D0), or where the new one's edge reaches the screen, if that is sooner; it ends where the
// line has left the screen and the new painting is wound all the way on (D1 + CW). On a wide screen it
// is the whole step but a hair at each end.
export function visibleRange(xfar) {
  const from = Math.min(D0, Math.max(0, CR + D1 - xfar));
  const to = Math.min(DEND, Math.max(D2 + xfar - CR, D1 + CW));
  return [from, to];
}

// the flat parts of a cloth state, as [x0, x1] in bottle units (null: none). incoming: which side.
export function flatSpan(s, incoming) {
  if (!incoming) { const a1 = Math.min(s.k, CW); return a1 > 0 ? [-s.k - CR - s.slide, a1 - s.k - CR - s.slide] : null; }
  const a0 = Math.max(0, s.k); return a0 < CW ? [a0 - s.k + CR + s.slide, CW - s.k + CR + s.slide] : null;
}

// The scroll of the whole sequence (p 0..1 over the pinned hold) → the step on screen. Each of the
// ten owns exactly a tenth of the hold (170 vh of the 1700); its step to the next is centred on the
// boundary and takes SPAN of a tenth (115.6 vh), so every edition gets the same time and the same
// treatment, and stands still for the other 54.4 vh between two steps (113 vh at the very start and
// the very end, where the rest is only on one side).
export const SPAN = 0.68;
export function sequenceAt(p, count = 10) {
  const f = Math.max(0, Math.min(count - 1, p * count - 0.5));
  const k = Math.min(count - 2, Math.floor(f));
  const u = f - k;
  const t = clamp((u - (1 - SPAN) / 2) / SPAN);
  if (t <= 0) return { a: k, b: null, t: 0 };
  if (t >= 1) return { a: k + 1, b: null, t: 0 };
  return { a: k, b: k + 1, t };
}
// the p at which edition i rests in the middle of its tenth
export const restP = (i, count = 10) => (i + 0.5) / count;

// ---- the 3D cloth: the band's own lit material, its vertices placed by the numbers above ----
const HEAD = /* glsl */`
uniform float cR, cW, cH, cBase, cK, cPhi, cSlide, cIn, cLift;
float cSm(float e0, float e1, float v) { float k = clamp((v - e0) / (e1 - e0), 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }
varying float vCrease, vEdge;
float cZ(float x) { float d = max(0.0, abs(x) - cR); return cLift * cSm(0.0, 1.2, d) + 0.03 * sin(x * 3.6) * cSm(0.2, 0.9, d); }
vec3 clothAt(float a, float v, out vec3 n) {
  float y = cBase + v * cH;
  bool lies = cIn < 0.5 ? a < cK : a > cK;
  if (lies) {
    float x = (a - cK) + (cIn < 0.5 ? -(cR + cSlide) : (cR + cSlide));
    float dz = (cZ(x + 0.01) - cZ(x - 0.01)) / 0.02;
    n = normalize(vec3(-dz, 0.0, 1.0));
    float dd = max(0.0, abs(x) - cR);
    vCrease = sin(3.14159 * cSm(0.0, 0.9, dd));
    vEdge = 1.0 - cSm(0.0, 0.32, dd);
    return vec3(x, y, cZ(x));
  }
  vCrease = 0.0; vEdge = 0.0;
  float ph = (a - cK) / cR + cPhi;
  n = vec3(sin(ph), 0.0, cos(ph));
  return vec3(cR * sin(ph), y, cR * cos(ph));
}
`;
function compile(shader) {
  Object.assign(shader.uniforms, this.userData.u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + HEAD)
    .replace('#include <beginnormal_vertex>', 'vec3 clothN; vec3 clothP = clothAt(uv.x * cW, uv.y, clothN);\nvec3 objectNormal = clothN;')
    .replace('#include <begin_vertex>', 'vec3 transformed = clothP;');
  // where the cloth bends away from the bottle it turns from the light: a soft crease, darkest a
  // little off the bottle, none on the bottle and none once the cloth lies flat; and where it comes
  // out from behind the bottle's edge it is in the bottle's shade, so the edge always reads
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCrease, vEdge;')
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= (1.0 - 0.18 * vCrease) * (1.0 - 0.24 * vEdge);');
}
// T: the three module; base: the bottle's band material (its class and values are copied)
export function clothMesh(T, base) {
  const p = {
    color: '#FFFFFF', metalness: 0, roughness: base.roughness, map: base.map,
    envMap: base.envMap, envMapIntensity: base.envMapIntensity, side: T.FrontSide,
  };
  if (base.isMeshPhysicalMaterial) Object.assign(p, { clearcoat: base.clearcoat, clearcoatRoughness: base.clearcoatRoughness });
  const m = base.isMeshPhysicalMaterial ? new T.MeshPhysicalMaterial(p) : new T.MeshStandardMaterial(p);
  m.userData.u = {
    cR: { value: CR }, cW: { value: CW }, cH: { value: CH }, cBase: { value: CBASE },
    cK: { value: 0 }, cPhi: { value: -Math.PI }, cSlide: { value: 0 }, cIn: { value: 0 }, cLift: { value: LIFT },
  };
  m.onBeforeCompile = compile;
  m.customProgramCacheKey = () => 'jal-cloth-4';
  const mesh = new T.Mesh(new T.PlaneGeometry(1, 1, 288, 1), m);
  mesh.frustumCulled = false;
  return mesh;
}
// set one cloth from a { k, phi, slide } state
export function setCloth(mesh, s, incoming) {
  const u = mesh.material.userData.u;
  u.cK.value = s.k; u.cPhi.value = s.phi; u.cSlide.value = s.slide; u.cIn.value = incoming ? 1 : 0;
}
