// The landing's 3D layer: one renderer (js/gl/core.js, read-only), and one small scene per chapter
// that shows a bottle (L1 the opening, L3 the ten designs, L4 twenty-four hours). Each scene is a
// core "view" tied to its chapter's stage element, so it is drawn only inside that element's
// rectangle and scrolls in and out with it. The bottle is js/gl/bottle.js, built as in the shop.
//
// Each scene has the shop's camera (30°, 10 units away), the shop's three lights (a warm key that
// follows the pointer, a rim from behind, and a hemisphere whose ground is the chapter's colour),
// and the shop's studio reflections (GL.env).
import * as T from 'three';
import { GL, initGL, addView, compileScene, probe, gpuDone, invalidate, glLog, tex, texReady, texAsync, tickGL, frame } from '../gl/core.js';
import { Bottle, CAP, DIM, wrapURL, planeOff } from '../gl/bottle.js';

export { GL, invalidate, tex, texReady, texAsync, wrapURL, DIM, CAP, planeOff, tickGL, frame };
export const FOV = 30, DIST = 10;
const VIS_H = 2 * DIST * Math.tan((FOV * Math.PI) / 360);
export const scenes = [];

export function start(tier) {
  GL.tier = tier;
  return initGL({ tick: false });
}

// a scene drawn inside `anchor` (its stage), with its own bottle
export function makeScene(anchor, { edition = '01', ground = '#1A1612' } = {}) {
  const scene = new T.Scene();
  scene.environment = GL.env;
  const cam = new T.PerspectiveCamera(FOV, 1, 0.1, 200);
  cam.position.set(0, 0, DIST);
  const key = new T.DirectionalLight('#FFF4E4', 2.4); key.position.set(-5, 6, 7);
  const rim = new T.DirectionalLight('#FFFFFF', 1.2); rim.position.set(6, 3, -5);
  const hemi = new T.HemisphereLight('#FFFFFF', new T.Color(ground), 0.35);
  scene.add(key, rim, hemi);
  const bottle = new Bottle(edition, { small: true });
  scene.add(bottle.root);
  const sc = {
    anchor, scene, cam, key, rim, hemi, bottle, w: 1, h: 1, rect: null, pose: null, sig: '',
    view: addView({ anchor, scene, camera: cam, enabled: false }),   // drawn once compiled
  };
  scenes.push(sc);
  return sc;
}

// the scene's rectangle this tick; false when it is off screen
export function measure(sc) {
  const r = sc.anchor.getBoundingClientRect();
  sc.rect = r;
  const on = r.bottom > 0 && r.top < innerHeight && r.width > 0;
  if (r.width && r.height && (sc.w !== r.width || sc.h !== r.height)) {
    sc.w = r.width; sc.h = r.height;
    sc.cam.aspect = r.width / r.height;
    sc.cam.updateProjectionMatrix();
    sc.fit = null;
  }
  sc.cam.updateMatrixWorld();
  return on;
}
// screen px inside the scene's rectangle → the world plane z = 0
export const upp = (sc) => VIS_H / sc.h;
export function toWorld(sc, px, py, out = new T.Vector3()) {
  const k = upp(sc);
  return out.set((px - sc.w / 2) * k, (sc.h / 2 - py) * k, 0);
}
const V = new T.Vector3();
// a world point → px inside the scene's rectangle
export function project(sc, v, out = { x: 0, y: 0 }) {
  V.copy(v).project(sc.cam);
  out.x = (V.x * 0.5 + 0.5) * sc.w; out.y = (-V.y * 0.5 + 0.5) * sc.h;
  return out;
}
// The pose that stands the bottle with its base centre at (cx, baseY) and its cap top at capY (px in
// the rectangle). The cap's front rim is nearer the camera than the z = 0 plane, so the scale is
// solved on the projected rim (as the shop's anchor is).
export function fit(sc, cx, baseY, capY) {
  const key = `${cx}|${baseY}|${capY}|${sc.w}|${sc.h}`;
  if (sc.fit && sc.fit.key === key) return sc.fit;
  const b = toWorld(sc, cx, baseY);
  let s = ((baseY - capY) * upp(sc)) / DIM.height;
  for (let i = 0; i < 4; i++) {
    const top = project(sc, V.set(b.x, b.y + s * CAP.top, s * CAP.rTop)).y;
    s *= (baseY - capY) / (baseY - top);
  }
  sc.fit = { key, x: b.x, y: b.y, s, pxu: s / upp(sc) };
  return sc.fit;
}
// stand the bottle: position, scale, turn (plus the pointer's small yaw), and the key light
export function pose(sc, f, ry = 0, { yaw = true, dy = 0 } = {}) {
  const b = sc.bottle;
  b.root.position.set(f.x, f.y + dy, 0);
  b.root.scale.setScalar(Math.max(1e-4, f.s));
  b.spin.rotation.y = ry + (yaw ? GL.pointer.x * 0.1 : 0);
  sc.key.position.set(-5 + GL.pointer.x * 2.5, 6 + GL.pointer.y * 1.5, 7);
}
// A world plane through the camera and a screen line (px in the rectangle) that keeps one side:
// a vertical line at x ('left' | 'right'), or a horizontal one at y ('above' | 'below').
const P0 = new T.Vector3(), P1 = new T.Vector3(), P2 = new T.Vector3();
export function screenPlane(sc, out, { x = null, y = null, keep }) {
  if (x != null) { toWorld(sc, x, 0, P0); toWorld(sc, x, sc.h, P1); toWorld(sc, keep === 'left' ? x - 50 : x + 50, sc.h / 2, P2); }
  else { toWorld(sc, 0, y, P0); toWorld(sc, sc.w, y, P1); toWorld(sc, sc.w / 2, keep === 'above' ? y - 50 : y + 50, P2); }
  out.setFromCoplanarPoints(sc.cam.position, P0, P1);
  if (out.distanceToPoint(P2) < 0) out.negate();
  return out;
}
// draw again if anything this scene shows has changed
export function changed(sc, ...parts) {
  const sig = parts.join('|') + '|' + GL.pointer.x.toFixed(4) + '|' + GL.pointer.y.toFixed(4);
  if (sig !== sc.sig) { sc.sig = sig; invalidate(); }
}

// every program every scene needs, built before anything is drawn, then one tiny draw that reports
// a failure. Resolves false if a program did not build (the page then shows the photographs).
export async function compileAll() {
  const before = GL.errors.length;
  let ok = true;
  for (const sc of scenes) {
    // the two skins and both cloths visible for the build, so no program is built later
    const b = sc.bottle;
    const vis = sc.scene.children.map((o) => o.visible);
    b.meshBandB.visible = b.meshShoulderB.visible = true;
    b.meshInner.visible = b.meshRim.visible = b.meshBare.visible = b.meshCapInner.visible = true;
    sc.bottle.root.traverse((o) => { if (o.isMesh && o.userData.cloth) o.visible = true; });
    ok = (await compileScene(sc.scene, sc.cam)) && probe(sc.scene, sc.cam) && ok;
    sc.scene.children.forEach((o, i) => { o.visible = vis[i]; });
    b.explode(b.exploded || 0);
  }
  await gpuDone(1500);
  scenes.forEach((sc) => { sc.view.enabled = true; });
  invalidate();
  return ok && GL.errors.length === before;
}
export { glLog, T };
