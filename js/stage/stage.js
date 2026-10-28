// The WebGL stage (SPEC B8, mode-3d). One camera that never moves, one bottle that stands on
// its CSS plinth at one fixed anchor in every world, drawn on a transparent canvas above the
// frames. It changes colour only at the line: when a world boundary (or the opening, or the
// unwrap's local cut) crosses it, skin A keeps the world above the line and skin B takes the
// world below, each clipped by a plane through the camera and that screen row, so the bottle
// splits on exactly the frame's line (B8.6-B8.7).
//
// Poses are deterministic (B8.8): the world that owns the screen gives pose(p, ANCHOR_POSE), or
// the bottle stands at ANCHOR_POSE. No blending, no easing, no spin of its own: Lenis already
// smooths the scroll. The pointer adds a small yaw (±6°) and moves the key light.
//
// Parity gate (B8.11, step E1, 15 Oct 2026): PASSED. Evidence: build/e1/parity-01/03/07/08.png and
// parity-numbers.txt (band luminance 3D / photo 0.91 / 0.95 / 1.09 / 0.98). 'hybrid' would rest on
// the packshots (#stage2d) and show the canvas only inside the hero turn, the craft turn, the
// hours explode and the unwrap, with a 160 ms crossfade at each switch (test hook ?parity=hybrid).
export const PARITY = '3d';

import {
  PerspectiveCamera, DirectionalLight, HemisphereLight, Group, Scene, Color, Vector3, Box3,
} from 'three';
import { GL, VW, addView, compileScene, probe, gpuDone, texAsync, tex, texReady, glLog, invalidate } from '../gl/core.js';
import { Bottle, DIM, CAP, wrapURL, planeOff } from '../gl/bottle.js';
import { byN, EDITIONS } from '../editions.js';
import { state as WS, worlds } from '../core/worlds.js';
import { TEST, store } from '../core/env.js';

export const RUN_PARITY = TEST.parity || PARITY;

const FOV = 30;
export const DIST = 10;
const VIS_H = 2 * DIST * Math.tan((FOV * Math.PI) / 360);

export const S = {
  cam: null, scene: null, cast: null, hero: null, key: null, rim: null, hemi: null,
  lineOwner: null,        // null | 'scroll' | 'opening' | 'local' | 'jump' (B10.12)
  opening: null,          // the opening's edge, while it runs
  local: null,            // the unwrap's local edge, while its cut runs
  jumping: false,         // a covered jump is under way
  edge: null, span: { top: 0, bottom: 0 }, skins: { A: null, B: null, small: true },
  lastCross: -1e9, glOn: true,
};

// screen pixels (on the layout width, B8.1) to the world plane z = 0
export const upp = () => VIS_H / innerHeight;
export function toWorld(px, py, out = new Vector3()) {
  const k = upp();
  return out.set((px - VW() / 2) * k, (innerHeight / 2 - py) * k, 0);
}
// a pose that stands the bottle in part of a DOM rect: fx/fy = where its base sits (0..1), h = its height as a share of the rect
export function slot(rect, { fx = 0.5, fy = 0.9, h = 0.7, hpx = null } = {}) {
  const k = upp();
  const base = toWorld(rect.left + rect.width * fx, rect.top + rect.height * fy);
  return { x: base.x, y: base.y, z: 0, s: ((hpx ?? rect.height * h) * k) / DIM.height };
}

// The anchor (B8.1): the root (centre of the base) at x 50% of the layout width, y 84.2vh; the cap
// top at 14vh. slot() measures the height on the z = 0 plane, but the cap's front rim is nearer
// the camera and would land 9 px high (E1), so the scale is solved on the projected rim.
export const ANCHOR = { fx: 0.5, fy: 0.842, h: 0.702, capTop: 0.14 };
export const ANCHOR_POSE = { x: 0, y: 0, z: 0, s: 1, ry: 0 };

const V = new Vector3(), P0 = new Vector3(), P1 = new Vector3(), P2 = new Vector3(), BOX = new Box3();
const projY = (x, y, z) => (-V.set(x, y, z).project(S.cam).y * 0.5 + 0.5) * innerHeight;

function fitCamera() {
  const cam = S.cam;
  cam.aspect = VW() / innerHeight;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
function solveAnchor() {
  fitCamera();
  const H = innerHeight;
  const b = slot({ left: 0, top: 0, width: VW(), height: H }, ANCHOR);
  let s = b.s;
  for (let i = 0; i < 4; i++) {
    const top = projY(b.x, b.y + s * CAP.top, s * CAP.rTop);
    s *= (ANCHOR.fy - ANCHOR.capTop) * H / (ANCHOR.fy * H - top);
  }
  Object.assign(ANCHOR_POSE, { x: b.x, y: b.y, z: 0, s, ry: 0 });
}

// A world plane through the camera and screen row y (px) that keeps the side 'above' or 'below'
// that row (B8.6). Three keeps the side where distanceToPoint >= 0.
export function screenPlane(out, y, keep) {
  out.setFromCoplanarPoints(S.cam.position, toWorld(0, y, P0), toWorld(VW(), y, P1));
  if (out.distanceToPoint(toWorld(VW() / 2, keep === 'above' ? y - 50 : y + 50, P2)) < 0) out.negate();
  return out;
}

// ---- build ----
export function initStage() {
  const scene = new Scene();
  scene.environment = GL.env;
  scene.environmentIntensity = 1.0;
  const cam = new PerspectiveCamera(FOV, VW() / innerHeight, 0.1, 200);
  cam.position.set(0, 0, DIST);
  // B8.4
  const key = new DirectionalLight('#FFF4E4', 2.4); key.position.set(-5, 6, 7);
  const rim = new DirectionalLight('#FFFFFF', 1.2); rim.position.set(6, 3, -5);
  const hemi = new HemisphereLight('#FFFFFF', new Color(byN('01').ground), 0.35);
  scene.add(key, rim, hemi);
  const cast = new Group(); scene.add(cast);
  Object.assign(S, { scene, cam, key, rim, hemi, cast });
  S.glOn = RUN_PARITY !== 'hybrid';   // hybrid starts on the packshots
  build();
  solveAnchor();
  S.view = addView({ anchor: null, scene, camera: cam });
  addEventListener('resize', () => { solveAnchor(); S.sig = ''; invalidate(); });
  return S;
}
// the bottle carries both skins from the start, so the first compile builds every program it
// will ever need (B8.10); a rebuild happens only when the full tier fails to compile
function build() {
  if (S.hero) S.cast.remove(S.hero.root);
  const hero = new Bottle('01', { small: true });
  hero.setSkins('01', '02', { small: true });
  S.cast.add(hero.root);
  S.hero = hero;
  // the unwrap's painting rides on the bottle (scenes/unwrap.js); a rebuild carries it across
  if (S.sheet) { hero.spin.add(S.sheet); S.sheet.material.clippingPlanes = [hero.planes.cut]; }
  S.skins = { A: null, B: null, small: true };
  S.sig = '';
  if (TEST.debugskins) flatSkins(hero);
}
// ?debugskins: skin A flat red, skin B flat blue, for the line-alignment check (F2 check 1)
function flatSkins(b) {
  [[b.band, b.shoulder, '#FF0000'], [b.bandB, b.shoulderB, '#0000FF']].forEach(([band, sh, c]) => {
    for (const m of [band, sh]) { m.map = null; m.color.set(c); m.emissive.set(c); m.needsUpdate = true; }
  });
}

// ---- GPU prep (B8.10) ----
const uploaded = new Set();
function upload(url) {
  if (uploaded.has(url)) return Promise.resolve();
  uploaded.add(url);
  return texAsync(url).then((t) => { try { if (texReady(t)) GL.renderer.initTexture(t); } catch (e) { /* drawn on first use instead */ } invalidate(); });
}
// every program the stage needs, built off screen, then one tiny draw that reports any failure
async function compileAll() {
  const before = GL.errors.length;
  S.hero.setSkins('01', '02', { small: true });
  S.hero.meshBandB.visible = S.hero.meshShoulderB.visible = true;
  const t0 = performance.now();
  const ok = (await compileScene(S.scene, S.cam)) && probe(S.scene, S.cam) && GL.errors.length === before;
  await gpuDone(1000);                // the driver has really finished building them (or 1 s)
  S.compileMs = Math.round(performance.now() - t0);
  return ok;
}
// Readiness for the opening: the first painting decoded and on the GPU, every program built.
// The full materials step down to the safe ones once if they fail; if those fail too, false
// (main.js then shows the photographs for the rest of this visit).
export async function prepare() {
  // the first three small wraps (worlds 01 to 03); the other seven come
  // with warm(), and each world's own is fetched one screen before its cut in any case (update)
  ['01', '02', '03'].forEach((n) => upload(wrapURL(n, true)));
  await upload(wrapURL('01', true));
  let ok = await compileAll();
  if (!ok && GL.tier === 'full') {
    glLog('full materials failed: safe tier');
    store.session('tier', 'safe');
    GL.tier = 'safe';
    build();
    ok = await compileAll();
  }
  if (!ok) store.session('gl', 'off');
  S.sig = '';
  invalidate();
  return ok;
}
// After the opening, once the visitor first scrolls, presses a key or touches the page: the other
// small wraps, then the ten 1448 px paintings at idle, one every 150 ms (B8.10). Waiting for that
// first move keeps a page that is only looked at under the 4 MB first-load budget (E10).
export async function warm() {
  const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 600 }) : setTimeout(f, 60));
  await new Promise((go) => {
    const evs = ['scroll', 'wheel', 'keydown', 'touchstart', 'pointerdown'];
    const once = () => { evs.forEach((ev) => removeEventListener(ev, once, true)); go(); };
    if (scrollY > 0) go(); else evs.forEach((ev) => addEventListener(ev, once, { capture: true, passive: true }));
  });
  // (the pictures are loaded and decoded here, and sent to the GPU one at a time in idle moments: gl/core.js tex())
  EDITIONS.forEach((e) => tex(wrapURL(e.n, true)));
  for (const e of EDITIONS) {
    await new Promise((r) => idle(r));
    await texAsync(wrapURL(e.n, false));
    await new Promise((r) => setTimeout(r, 150));
  }
}

// ---- the line's owner (B10.12) ----
export const lineOwner = () => S.lineOwner;
// the opening's edge { y, above: null, below: '01' }, or null when it is over
export function setOpeningEdge(edge) { S.opening = edge; invalidate(); }
// the unwrap's Previous / Next: refused while anything else holds the line
export function setLocalEdge(edge) {
  if (edge && (WS.edge || S.opening || S.jumping)) return false;
  S.local = edge || null;
  invalidate();
  return true;
}
export function setJumping(on) { S.jumping = !!on; }

// hybrid only (B8.11): where the canvas, not the packshots, shows the bottle: inside each world's turn
const HYBRID_3D = (w, p) => !!(w && w.n && w.n() && !w.isTen) && p > 0.02 && p < 0.86;

// ---- the tick ----
// the bottle's screen span (cap top - 4 px to base front edge + 4 px), from its bounding box
function measureSpan() {
  S.hero.root.updateMatrixWorld(true);
  BOX.setFromObject(S.hero.root);
  let top = Infinity, bottom = -Infinity;
  for (let i = 0; i < 8; i++) {
    const y = projY(i & 1 ? BOX.max.x : BOX.min.x, i & 2 ? BOX.max.y : BOX.min.y, i & 4 ? BOX.max.z : BOX.min.z);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  S.span.top = top - 4; S.span.bottom = bottom + 4;
}

function applyPose(p) {
  const b = S.hero;
  b.root.position.set(p.x, p.y, p.z || 0);
  b.root.scale.setScalar(Math.max(1e-4, p.s));
  b.spin.rotation.y = (p.ry || 0) + GL.pointer.x * 0.10;  // pointer yaw, ±6°; never pitch or roll
  const ex = p.explode || 0;
  if (ex !== b.exploded) b.explode(ex);
}

const groundOf = (n) => (n ? byN(n).ground : '#F7F2E8');
const C1 = new Color(), C2 = new Color();

// once per tick, after the worlds controller and the chapters, before GL.frame() (B8.8)
export function update() {
  const b = S.hero;
  if (!b) return;
  const now = performance.now();
  const owner = WS.owner;
  const p = WS.p;

  // who holds the line
  let edge = null;
  if (S.opening) { edge = S.opening; S.lineOwner = 'opening'; }
  else if (WS.edge) { edge = WS.edge; S.lineOwner = 'scroll'; S.local = null; }
  else if (S.local) { edge = S.local; S.lineOwner = 'local'; }
  else S.lineOwner = S.jumping ? 'jump' : null;
  S.edge = edge;

  // the pose: the owner's, or the anchor
  const pose = owner && owner.pose ? owner.pose(p, ANCHOR_POSE) : ANCHOR_POSE;
  applyPose(pose);
  const spanKey = `${pose.x}|${pose.y}|${pose.s}|${b.exploded}|${innerHeight}`;
  if (spanKey !== S.spanKey) { S.spanKey = spanKey; measureSpan(); }

  // skins and planes (B8.7)
  const sp = S.span, pl = b.planes;
  let A = null, B = null, line = false, cut = null;
  if (!edge) A = owner ? owner.n() : null;
  else {
    const y = edge.y, inside = y > sp.top && y < sp.bottom;
    if (inside) S.lastCross = now;
    if (edge.above && edge.below) {
      if (inside) { A = edge.above; B = edge.below; line = true; } else A = y >= sp.bottom ? edge.above : edge.below;
    } else if (edge.above) {          // into #ten: the bottle is cut away under the rising Chuna
      if (inside) { A = edge.above; cut = 'above'; } else A = y >= sp.bottom ? edge.above : null;
    } else if (edge.below) {          // the opening: revealed from its base up
      if (inside) { A = edge.below; cut = 'below'; } else A = y <= sp.top ? edge.below : null;
    }
  }
  if (line) { screenPlane(pl.lineA, edge.y, 'above'); screenPlane(pl.lineB, edge.y, 'below'); }
  else { planeOff(pl.lineA); planeOff(pl.lineB); }
  if (cut) screenPlane(pl.cut, edge.y, cut); else planeOff(pl.cut);

  // small wraps while an edge crosses the bottle, the 1448 px ones after 300 ms at rest
  const small = now - S.lastCross < 300;
  if (TEST.debugskins) {
    b.meshBandB.visible = b.meshShoulderB.visible = !!B;
  } else if (A) {
    b.setSkins(A, B, { small });
    // keep the next world's painting on the GPU before its cut starts
    if (!small) upload(wrapURL(A, false));
  } else b.meshBandB.visible = b.meshShoulderB.visible = false;
  S.skins.A = A; S.skins.B = B; S.skins.small = small;
  b.root.visible = !!A;
  const next = worlds[WS.i + 1];
  if (next && next.n() && next.a - WS.s < innerHeight) upload(wrapURL(next.n(), true));

  // the light: the key follows the pointer; the hemisphere's ground is the world behind
  S.key.position.set(-5 + GL.pointer.x * 2.5, 6 + GL.pointer.y * 1.5, 7);
  if (edge) {
    C1.set(groundOf(edge.above)); C2.set(groundOf(edge.below));
    S.hemi.groundColor.copy(C1).lerp(C2, 1 - edge.y / innerHeight);
  } else S.hemi.groundColor.set(groundOf(A));

  // hybrid: the packshots carry the rests and every cut; the canvas only the four motions
  if (RUN_PARITY === 'hybrid') {
    const want = !edge && HYBRID_3D(owner, p);
    if (want !== S.glOn) { S.glOn = want; S.glSwitch = now; document.documentElement.classList.toggle('gl-on', want); }
  }

  // GPU idle (B8.9): nothing of ours on screen, or a dialog over the page
  const anything = S.cast.children.some((c) => c.visible) && (S.glOn || now - (S.glSwitch || 0) < 200);
  GL.idle = !anything;
  GL.frozen = document.documentElement.classList.contains('has-dialog');

  // render on demand: draw only when something we draw has changed
  const sig = [b.root.position.x, b.root.position.y, b.root.scale.x, b.spin.rotation.y, b.exploded, edge ? edge.y : -1,
    A, B, line, cut, b.band.map && b.band.map.id, b.bandB.map && b.bandB.map.id, S.key.position.x, S.key.position.y,
    S.hemi.groundColor.getHex(), b.root.visible, S.glOn].join('|');
  if (sig !== S.sig) { S.sig = sig; invalidate(); }
}

// Tests: resolves once the bottle shows the paintings it wants (the 1448 px wrap at rest, after
// its 300 ms) and the frame with them has been drawn
export function settled(timeout = 8000) {
  const t0 = performance.now();
  return new Promise((res) => {
    const check = () => {
      const b = S.hero, k = S.skins;
      const want = (n) => tex(wrapURL(n, k.small));
      const ok = TEST.debugskins || !k.A || (texReady(want(k.A)) && b.band.map === want(k.A) && (!k.B || (texReady(want(k.B)) && b.bandB.map === want(k.B))));
      const rested = performance.now() - S.lastCross >= 320 || !!(S.edge && S.edge.y > S.span.top && S.edge.y < S.span.bottom);
      if ((ok && rested) || performance.now() - t0 > timeout) {
        // one more drawn frame; asked for again on every poll, since a slow tick may let one
        // invalidation's 300 ms run out before anything was drawn
        const f0 = GL.frames;
        const wait = () => { if (GL.frames > f0 || GL.idle || GL.frozen || performance.now() - t0 > timeout + 4000) res(); else { invalidate(); requestAnimationFrame(wait); } };
        wait();
      }
      else setTimeout(check, 50);
    };
    check();
  });
}
