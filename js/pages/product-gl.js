// product.html (mode-3d): a small stage for one edition. The renderer, the studio light and the
// bottle come from js/gl/core.js and js/gl/bottle.js (imported, never forked). One camera that
// never moves (FOV 30 at 10 units, as on the shop), one bottle, drawn on the fixed transparent
// canvas #gl (z 30) under the header. The page tells it each frame where the bottle stands: a DOM
// slot (the hero) or the unwrap's pose over the pinned frame; with neither on screen it draws nothing.
import { PerspectiveCamera, DirectionalLight, HemisphereLight, Scene, Color, Vector3 } from 'three';
import { GL, VW, initGL, addView, compileScene, probe, gpuDone, invalidate, tex, texAsync, texReady, tickGL, frame, glLog } from '../gl/core.js';
import { Bottle, DIM, CAP, wrapURL } from '../gl/bottle.js';
import { byN } from '../editions.js';

const FOV = 30, DIST = 10;
const VIS_H = 2 * DIST * Math.tan((FOV * Math.PI) / 360);
export const S = { cam: null, scene: null, hero: null, key: null, rim: null, hemi: null, n: '01', sig: '' };
export const upp = () => VIS_H / innerHeight;
export function toWorld(px, py, out = new Vector3()) {
  const k = upp();
  return out.set((px - VW() / 2) * k, (innerHeight / 2 - py) * k, 0);
}
const V = new Vector3();
const projY = (x, y, z) => (-V.set(x, y, z).project(S.cam).y * 0.5 + 0.5) * innerHeight;

// The pose that stands the bottle in a screen rect: its root (centre of the base) on the rect's
// bottom centre, its cap's front rim on the rect's top. Solved on the projected rim, as the shop's
// anchor is (the rim is nearer the camera than the z = 0 plane).
export function slotPose(r) {
  const base = toWorld(r.left + r.width / 2, r.bottom);
  let s = (r.height * upp()) / DIM.height;
  for (let i = 0; i < 3; i++) {
    const top = projY(base.x, base.y + s * CAP.top, s * CAP.rTop);
    const want = r.bottom - r.height;
    s *= (r.bottom - want) / Math.max(1, r.bottom - top);
  }
  return { x: base.x, y: base.y, z: 0, s, ry: 0 };
}

export function initStage(n) {
  GL.tier = GL.tier || 'full';
  if (!initGL({ tick: false })) return null;
  const scene = new Scene();
  scene.environment = GL.env;
  const cam = new PerspectiveCamera(FOV, VW() / innerHeight, 0.1, 200);
  cam.position.set(0, 0, DIST);
  const key = new DirectionalLight('#FFF4E4', 2.4); key.position.set(-5, 6, 7);
  const rim = new DirectionalLight('#FFFFFF', 1.2); rim.position.set(6, 3, -5);
  const hemi = new HemisphereLight('#FFFFFF', new Color(byN(n).ground), 0.35);
  scene.add(key, rim, hemi);
  const hero = new Bottle(n, { small: true });
  hero.root.visible = false;
  scene.add(hero.root);
  Object.assign(S, { scene, cam, key, rim, hemi, hero, n });
  S.view = addView({ anchor: null, scene, camera: cam });
  addEventListener('resize', () => { cam.aspect = VW() / innerHeight; cam.updateProjectionMatrix(); S.sig = ''; invalidate(); });
  return S;
}

// every program built off screen, then one tiny draw that reports any failure
export async function prepare() {
  // a painting that does not arrive (a failed request, or none within 10 s) means no 3D bottle: the page keeps its packshot
  if (!texReady(await texAsync(wrapURL(S.n, true)))) { glLog('product: the painting did not load'); return false; }
  const before = GL.errors.length;
  S.hero.root.visible = true;
  if (S.sheet) S.sheet.visible = true;
  S.hero.meshBare.visible = true;
  const ok = (await compileScene(S.scene, S.cam)) && probe(S.scene, S.cam) && GL.errors.length === before;
  if (S.sheet) S.sheet.visible = false;
  S.hero.meshBare.visible = false;
  S.hero.root.visible = false;
  await gpuDone(1000);
  // the full painting next, at idle
  tex(wrapURL(S.n, false));
  if (!ok) glLog('product: programs failed');
  return ok;
}

// once per tick: pose = { x, y, z, s, ry } or null (nothing of ours on screen)
export function update(pose, ground) {
  const b = S.hero;
  if (!b) return;
  if (!pose) { b.root.visible = false; GL.idle = true; return; }
  GL.idle = false;
  GL.frozen = document.documentElement.classList.contains('has-dialog');
  b.root.visible = true;
  b.root.position.set(pose.x, pose.y, pose.z || 0);
  b.root.scale.setScalar(Math.max(1e-4, pose.s));
  b.spin.rotation.y = (pose.ry || 0) + GL.pointer.x * 0.10;   // pointer yaw, ±6°
  b.setSkins(S.n, null, { small: false });                      // the 1448 px wrap once decoded
  S.key.position.set(-5 + GL.pointer.x * 2.5, 6 + GL.pointer.y * 1.5, 7);
  if (ground) S.hemi.groundColor.set(ground);
  const sig = [pose.x, pose.y, pose.s, b.spin.rotation.y, b.band.map && b.band.map.id, S.key.position.x, S.key.position.y].map((v) => (typeof v === 'number' ? v.toFixed(4) : v)).join('|');
  if (sig !== S.sig) { S.sig = sig; invalidate(); }
}
export const ready = () => !!S.hero && texReady(S.hero.band.map);
// resolves once the full (1448 px) painting of this edition has arrived and decoded, or after 10 s
export const bigReady = () => texAsync(wrapURL(S.n, false));
export { GL, tickGL, frame, invalidate };
