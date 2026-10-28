// The JALRANG bottle, built from its parts at real proportions (DESIGN-SYSTEM.md 9.1):
// 272 mm tall, 76 mm across. 1 unit = 100 mm. Steel base, printed band (the painting,
// join at the back), painted shoulder, steel neck, brass cap (a knurled grip band under a
// smooth crown, as in the studio photographs) with a steel inner.
//
// One bottle carries two skins (A and B) so a new colour can rise up it at a dead-straight
// line (SPEC B8.6-B8.7). Every material keeps the same number of clipping planes for its
// whole life, so nothing is ever recompiled after the first build:
//   steel, brass, inner wall, rim  [cut]
//   band + shoulder, skin A        [lineA, cut]
//   band + shoulder, skin B        [lineB, cut]
// The stage (stage.js) owns the three planes and moves them every frame; a plane that is
// "off" keeps everything: normal (0, 1, 0), constant 1e4.
//
// UV and seam conventions that unwrap.js relies on: the band is an open cylinder whose u runs
// from the back (u = 0, the join, theta = PI) round to the back again (u = 1), so the middle of
// the painting (u = 0.5) faces the camera; v runs from the band's bottom (DIM.bandBottom) to its top.
import {
  Group, Mesh, CylinderGeometry, LatheGeometry, RingGeometry, Vector2, Vector3, Plane,
  MeshPhysicalMaterial, MeshStandardMaterial, DataTexture, RepeatWrapping, RGBAFormat,
  LinearFilter, LinearMipmapLinearFilter,
} from 'three';
import { tex, texReady, peekTex, GL, glLog } from './core.js';
import { byN } from '../editions.js';

export const DIM = { r: 0.38, bandBottom: 0.22, bandH: 1.8, bandTop: 2.02, height: 2.72 };
DIM.W = Math.PI * 2 * DIM.r; // 2.388: the painting's width when flat (4:3 with its height)

// The cap, 0.31 tall from the neck top (2.40): a knurled grip band below, then smooth brass,
// then a 0.07 chamfer to radius 0.243 at the top (2.71). The split follows the studio stills
// (still-01/03/07/08), where the knurl is the lower ~37% of the cap.
export const CAP = { y: 2.40, r: 0.25, knurlTop: 2.515, chamferAt: 2.64, top: 2.71, rTop: 0.243 };

// SPEC B8.5 materials (full tier), as tuned at the parity gate (E1). The safe tier drops
// clearcoat and anisotropy. Two changes from B8.5, both measured against still-01/03/07/08:
// - steel and inner wall anisotropy 0.6 / 0.3 -> 0. In three r186 the anisotropic reflection on
//   these lathes either samples one direction for the whole cylinder (flat grey, no bands) or,
//   turned along the axis, smears the key light into a white ring on the neck.
// - brass F0 #B48A3C -> #BFA172 (knurl roughness 0.32 -> 0.34, crown 0.28 -> 0.30). As a metal's
//   reflectance #B48A3C renders as saturated gold; the stills show a pale brushed brass.
// `env` is each material's environment strength (1 = the studio as built). Metals see only the
// environment while the painted parts also take the key light, so the metals carry more of it.
// Result at the gate (3D / photo, mean relative luminance, editions 01 / 03 / 07 / 08):
//   band 0.91 / 0.95 / 1.09 / 0.98 · base 1.07 / 0.92 / 0.89 / 0.98 · knurl 1.17 / 0.97 / 0.92 / 0.94
export const LOOK = {
  steel: { color: '#C8CCD0', metalness: 1, roughness: 0.22, anisotropy: 0, env: 1.35 },
  brass: { color: '#BFA172', metalness: 1, roughness: 0.34, normalScale: 0.55, env: 1.5 },
  crown: { color: '#BFA172', metalness: 1, roughness: 0.30, env: 2.4 },
  shoulder: { metalness: 0, roughness: 0.45, clearcoat: 0.1, clearcoatRoughness: 0.4, env: 0.95 },
  band: { metalness: 0, roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.4, env: 0.88 },
  inner: { color: '#8E949A', metalness: 1, roughness: 0.45, anisotropy: 0, env: 1.35 },
};

export const wrapURL = (n, small) => `assets/img/wrap-${n}${small ? '-sm' : ''}.webp`;

// The bottle's outline, in bottle units (x across, y up from the base): the right half, base
// to cap top. Used for the hero mark's gap and anything else that must clear the silhouette.
export function profile() {
  const r = DIM.r, pts = [[0.33, 0], [0.372, 0.014], [r, 0.05], [r, DIM.bandTop]];
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pts.push([0.21 + 0.17 * Math.cos(a), DIM.bandTop + 0.3 * Math.sin(a)]); }
  pts.push([0.212, 2.33], [0.212, 2.395], [CAP.r, CAP.y + 0.002], [CAP.r, CAP.chamferAt], [CAP.rTop, CAP.top]);
  return pts;
}

// The explode's part windows for k 0..1 (SPEC C4), each smoothstepped inside its own window so it
// reads as a drawing being taken apart, not one slide. Shared by Bottle.explode() and by the Hours
// chapter, which needs them before the stage applies the pose (its scale and its labels).
const win = (k, a, b) => { const t = Math.max(0, Math.min(1, (k - a) / (b - a))); return t * t * (3 - 2 * t); };
export const EXPLODE = { cap: [0.08, 0.45], inner: [0.20, 0.65], sleeve: [0.35, 0.80], capLift: 0.75, innerLift: 0.6, sleeveLift: 0.08, sleeveScale: 0.2 };
export function explodeParts(k) {
  k = Math.max(0, Math.min(1, k));
  const E = EXPLODE;
  const cap = win(k, ...E.cap), inner = win(k, ...E.inner), sleeve = win(k, ...E.sleeve);
  // the cap unscrews one and a half turns while rising 0.06 (the thread), then lifts to 0.75 in all
  const turn = Math.min(1, cap / 0.6);
  const capY = cap < 0.6 ? 0.06 * turn : 0.06 + ((cap - 0.6) / 0.4) * (E.capLift - 0.06);
  return { k, cap, inner, sleeve, turn, capY, innerY: inner * E.innerLift, sleeveY: sleeve * E.sleeveLift };
}
// Hours scales the bottle 1 -> 0.8 about its root. Tied to the cap's window (1 - 0.2 * cap), the
// stack stays inside y 112-788 all the way (at 1505 x 916: 116.6-783.2 from k 0.45 on). A scale
// linear in k would leave the lifted cap at y ~35 at k 0.5.
export const hoursScaleAt = (k) => 1 - 0.2 * explodeParts(k).cap;

// A plane that keeps everything (SPEC B8.6)
export const planeOff = (p) => { p.normal.set(0, 1, 0); p.constant = 1e4; return p; };

// ---- shared geometry ----
const lathe = (pts, seg = 96) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);
const G = {};
function geometry() {
  if (G.band) return G;
  const base = [[0, 0], [0.33, 0], [0.358, 0.004], [0.372, 0.014], [0.379, 0.03], [0.38, 0.05], [0.38, DIM.bandBottom]];
  G.base = lathe(base);
  // the painting: an open cylinder, the join at the back (see the header for the UV convention)
  G.band = new CylinderGeometry(DIM.r + 0.0015, DIM.r + 0.0015, DIM.bandH, 160, 1, true, Math.PI, Math.PI * 2);
  G.band.translate(0, DIM.bandBottom + DIM.bandH / 2, 0);
  // the bare outer wall under the painting, seen only while the sleeve is off
  G.bare = new CylinderGeometry(DIM.r - 0.002, DIM.r - 0.002, DIM.bandH, 96, 1, true);
  G.bare.translate(0, DIM.bandBottom + DIM.bandH / 2, 0);
  const sh = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI / 2;
    sh.push([0.21 + 0.17 * Math.cos(a), DIM.bandTop + 0.30 * Math.sin(a)]);
  }
  G.shoulder = lathe(sh, 128);
  // straight to the top: the cap covers the lip, and a rounded corner here would tip the whole
  // neck's normals up into the top light (a white ring)
  G.neck = lathe([[0.21, 2.32], [0.212, 2.33], [0.212, CAP.y]], 64);
  // the cap: the knurled grip (open; its underside is a separate brass ring so a lifted cap reads solid)
  const kh = CAP.knurlTop - CAP.y;
  G.knurl = new CylinderGeometry(CAP.r, CAP.r, kh, 120, 1, true);
  G.knurl.translate(0, CAP.y + kh / 2, 0);
  G.capUnder = lathe([[0.18, CAP.y], [CAP.r, CAP.y]], 64);
  // the crown: a fine groove, smooth brass, then the chamfer to the top, and the top itself
  const ch = [[CAP.r - 0.006, CAP.knurlTop], [CAP.r, CAP.knurlTop + 0.007], [CAP.r, CAP.chamferAt]];
  for (let i = 1; i <= 6; i++) { const t = i / 6; ch.push([CAP.r - (CAP.r - CAP.rTop) * Math.pow(t, 1.6), CAP.chamferAt + (CAP.top - CAP.chamferAt) * t]); }
  ch.push([CAP.rTop - 0.012, CAP.top], [0, CAP.top]);
  G.crown = lathe(ch, 120);
  // the steel inner of the cap: the plug that screws into the neck
  G.capInner = new CylinderGeometry(0.18, 0.18, 0.2, 64, 1, false);
  G.capInner.translate(0, CAP.y - 0.04 + 0.1, 0);
  // the inner wall of the double-walled body, seen only when the bottle comes apart
  G.inner = lathe([[0, 0.12], [0.31, 0.12], [0.33, 0.14], [0.335, 0.2], [0.335, 2.02], [0.31, 2.16], [0.24, 2.26], [0.196, 2.3], [0.196, 2.43], [0.186, 2.44]], 96);
  // the rim where the two walls meet at the neck (SPEC B8.5): flat, steel
  G.rim = new RingGeometry(0.196, 0.212, 64);
  G.rim.rotateX(-Math.PI / 2);
  G.rim.translate(0, CAP.y + 0.001, 0);
  return G;
}

// ---- shared textures ----
let knurl = null;
export function knurlMap() {
  if (knurl) return knurl;
  const w = 32, data = new Uint8Array(w * 4);
  for (let x = 0; x < w; x++) {
    const s = Math.cos((x / w) * Math.PI * 2) * 0.75;
    const n = new Vector3(s, 0, 1).normalize();
    data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], x * 4);
  }
  knurl = new DataTexture(data, w, 1, RGBAFormat);
  knurl.wrapS = knurl.wrapT = RepeatWrapping;
  knurl.magFilter = LinearFilter; knurl.minFilter = LinearMipmapLinearFilter; knurl.generateMipmaps = true;
  knurl.repeat.set(72, 1);
  knurl.needsUpdate = true;
  return knurl;
}

const ed = (e) => (e == null ? null : typeof e === 'string' ? byN(e) : e);
// the wrap for an edition: the size asked for if its picture has decoded, else the other size
// if that one is already here, so the band never draws black while a file is still arriving
function wrapFor(n, small) {
  const want = tex(wrapURL(n, small));
  if (texReady(want)) return want;
  const other = peekTex(wrapURL(n, !small));
  return texReady(other) ? other : want;
}

export class Bottle {
  // Build it after initGL(): every material takes the studio map (GL.env) at construction.
  // opts.small: start on the 720 px wraps
  constructor(edition, opts = {}) {
    if (!GL.env) glLog('bottle built before the studio environment: metals will read dark');
    const g = geometry();
    this.opts = opts;
    const safe = GL.tier === 'safe';
    const M = (p) => {
      if (!safe) return new MeshPhysicalMaterial(p);
      const { anisotropy, anisotropyRotation, clearcoat, clearcoatRoughness, ...rest } = p;
      return new MeshStandardMaterial(rest);
    };
    // the three planes, mutated in place by the stage; all off to start
    this.planes = { lineA: planeOff(new Plane()), lineB: planeOff(new Plane()), cut: planeOff(new Plane()) };
    const { lineA, lineB, cut } = this.planes;

    this.root = new Group();     // position in the scene
    this.spin = new Group();     // turns the art
    this.root.add(this.spin);

    const L = LOOK;
    // each material carries the studio map itself, so its environment strength (`env`) applies
    // (three ignores envMapIntensity on materials that only inherit scene.environment)
    const env = (x) => ({ envMap: GL.env, envMapIntensity: x.env });
    this.steel = M({ color: L.steel.color, metalness: 1, roughness: L.steel.roughness, anisotropy: L.steel.anisotropy, ...env(L.steel), clippingPlanes: [cut] });
    this.brass = M({ color: L.brass.color, metalness: 1, roughness: L.brass.roughness, normalMap: knurlMap(), normalScale: new Vector2(L.brass.normalScale, L.brass.normalScale), ...env(L.brass), clippingPlanes: [cut] });
    this.crown = M({ color: L.crown.color, metalness: 1, roughness: L.crown.roughness, ...env(L.crown), clippingPlanes: [cut] });
    this.innerMat = M({ color: L.inner.color, metalness: 1, roughness: L.inner.roughness, anisotropy: L.inner.anisotropy, ...env(L.inner), clippingPlanes: [cut] });
    const strip = ({ env: _, ...p }) => p;
    const band = (line) => M({ ...strip(L.band), ...env(L.band), clippingPlanes: [line, cut] });
    const shoulder = (line) => M({ ...strip(L.shoulder), ...env(L.shoulder), clippingPlanes: [line, cut] });
    this.band = band(lineA); this.shoulder = shoulder(lineA);
    this.bandB = band(lineB); this.shoulderB = shoulder(lineB);

    this.meshBase = new Mesh(g.base, this.steel);
    this.meshBand = new Mesh(g.band, this.band);
    this.meshBandB = new Mesh(g.band, this.bandB);
    this.meshBare = new Mesh(g.bare, this.steel); this.meshBare.visible = false;
    this.meshShoulder = new Mesh(g.shoulder, this.shoulder);
    this.meshShoulderB = new Mesh(g.shoulder, this.shoulderB);
    this.meshNeck = new Mesh(g.neck, this.steel);
    this.meshRim = new Mesh(g.rim, this.steel); this.meshRim.visible = false;
    this.meshInner = new Mesh(g.inner, this.innerMat); this.meshInner.visible = false;
    this.capGroup = new Group();
    this.meshCap = new Mesh(g.knurl, this.brass);
    this.meshCrown = new Mesh(g.crown, this.crown);
    this.meshCapUnder = new Mesh(g.capUnder, this.crown);
    this.meshCapInner = new Mesh(g.capInner, this.innerMat);
    this.capGroup.add(this.meshCap, this.meshCrown, this.meshCapUnder, this.meshCapInner);
    this.spin.add(this.meshBase, this.meshBand, this.meshBandB, this.meshBare, this.meshShoulder, this.meshShoulderB,
      this.meshNeck, this.meshRim, this.meshInner, this.capGroup);
    // the painted parts draw after the steel they sit on (the sleeve is a hair outside the bare wall)
    this.meshBandB.renderOrder = this.meshShoulderB.renderOrder = 1;

    this.skin = { A: null, B: null };
    this.setSkins(edition, null, { small: !!opts.small });
    this.explode(0);
  }

  // Skin A shows `eA`, skin B shows `eB` (null hides skin B). Editions may be objects or 'NN'.
  // A material changes only when its edition or wrap size changes; colour and map swaps are
  // uniforms, never a recompile. Called every frame by the stage: it is cheap when nothing changes.
  setSkins(eA, eB = null, { small = false } = {}) {
    eA = ed(eA); eB = ed(eB);
    if (eA) { this.e = eA; this.paint(this.band, this.shoulder, 'A', eA, small); }
    this.eB = eB;
    if (eB) this.paint(this.bandB, this.shoulderB, 'B', eB, small);
    this.meshBandB.visible = !!eB && this.meshBand.visible;
    this.meshShoulderB.visible = !!eB && this.meshShoulder.visible;
  }
  paint(band, shoulder, k, e, small) {
    const t = wrapFor(e.n, small);
    if (band.map !== t) band.map = t;
    const s = this.skin[k];
    if (!s || s.n !== e.n) { shoulder.color.set(e.ground); this.skin[k] = { n: e.n }; }
  }
  // one skin, no line (kept for scenes that just want an edition shown)
  setEdition(e) { this.setSkins(e, null); }

  // Exploded view, k 0..1 (SPEC C4): the windows and amounts are explodeParts(). The base never moves.
  hoursScale() { return 1 - 0.2 * this.parts.cap; }
  explode(k) {
    const P = explodeParts(k);
    const { cap, inner, sleeve } = P;
    this.exploded = P.k;
    this.parts = P;
    this.capGroup.position.y = P.capY;
    this.capGroup.rotation.y = P.turn * Math.PI * 3;
    this.meshCapInner.visible = cap > 0.001;
    // the rim of the double wall shows once the cap is well clear
    this.meshRim.visible = cap > 0.3;
    // the inner wall slides out of the outer like a drawer; the gap between them is the vacuum
    this.meshInner.visible = inner > 0.001;
    this.meshInner.position.y = P.innerY;
    // the painting floats off as a sleeve (1.2 times as wide, lifted 0.08), showing the bare wall
    // (the unwrap also shows the bare wall, so it is only hidden here if the explode showed it)
    if (sleeve > 0.001) { this.meshBare.visible = true; this.bareByExplode = true; }
    else if (this.bareByExplode) { this.meshBare.visible = false; this.bareByExplode = false; }
    const sl = 1 + sleeve * EXPLODE.sleeveScale;
    for (const m of [this.meshBand, this.meshBandB]) { m.scale.set(sl, 1, sl); m.position.y = P.sleeveY; }
  }

  // The cap gives one short twist when this edition goes into the bag (SPEC B10.5), 220 ms.
  twistCap() {
    const inv = () => GL.invalidate && GL.invalidate();
    const rot = [this.meshCap.rotation, this.meshCrown.rotation], pos = [this.meshCap.position, this.meshCrown.position];
    gsap.killTweensOf(rot); gsap.killTweensOf(pos);
    pos.forEach((p) => { p.y = 0; });
    return gsap.timeline({ onUpdate: inv, onComplete: inv })
      .to(rot, { y: '+=0.9', duration: 0.22, ease: 'settle' }, 0)
      .to(pos, { y: 0.03, duration: 0.11, ease: 'settle' }, 0)
      .to(pos, { y: 0, duration: 0.11, ease: 'tide' }, 0.11);
  }
  dispose() { /* shared geometry stays; materials go with the page */ }
}
