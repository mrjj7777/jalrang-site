// One renderer, one fixed transparent canvas above the frames (SPEC B6, z 30). Each 3D scene is a
// "view": the stage's view covers the whole screen; a view may instead be tied to a DOM element
// (the parity page), in which case it is drawn only inside that element's rectangle (scissor).
// The light the steel reflects is a small photographic studio (studioEnv, SPEC B8.3): a warm
// grey room, a tall softbox on the left, a narrow one behind on the right, a panel above.
//
// Render on demand (SPEC B8.9): the page's one ordered tick (main.js) calls tickGL() and, last,
// frame(). frame() draws only when invalidate() was called in the last 300 ms, so a still page
// costs the GPU nothing. GL.idle (no bottle on screen) clears the canvas once and stops drawing;
// GL.frozen (a dialog covers the page) keeps the last picture and stops drawing.
import {
  WebGLRenderer, PMREMGenerator, SRGBColorSpace, NeutralToneMapping, Texture,
  LinearMipmapLinearFilter, LinearFilter, Vector2, Scene, Mesh, BoxGeometry, PlaneGeometry,
  MeshBasicMaterial, BackSide, DoubleSide, Color,
} from 'three';
import { store } from '../core/env.js';

export const GL = {
  renderer: null, env: null, views: [], time: 0, dt: 0,
  pointer: new Vector2(0, 0),      // -1..1, smoothed
  pointerRaw: new Vector2(0, 0),
  maxAniso: 1,
  tier: 'full',                    // 'full' (physical materials) or 'safe' (standard materials, no shader edits)
  quality: 3,                      // 3 down to 0: steps down by itself on a slow GPU (pixel ratio only)
  fps: 60,
  errors: [],                      // what went wrong, shown by #debug
  gpu: '',
  dpr: 1,                          // the pixel ratio in use
  frames: 0,                       // frames actually drawn (render on demand: flat while still)
  idle: false,                     // nothing of ours on screen: clear once, then draw nothing
  frozen: false,                   // a dialog covers the page: keep the last picture, draw nothing
  always: false,                   // draw every tick (the parity page)
  lastInvalid: -1e9,
  pending: false,
};
// something on the stage changed: draw for the next 300 ms (SPEC B8.9)
export function invalidate() { GL.lastInvalid = performance.now(); GL.pending = true; }
GL.invalidate = invalidate;
export const glLog = (msg) => { GL.errors.push(String(msg).slice(0, 600)); window.dispatchEvent(new CustomEvent('jal:glerror')); };

// The layout width. Windows classic scrollbars make innerWidth 17 px wider than the DOM
// layout, which would put the bottle 8 px off its plinth (SPEC B8.1).
export const VW = () => document.documentElement.clientWidth || innerWidth;

const Q = new URLSearchParams(location.search);
// Pixel ratio (SPEC B8.9): at most 1.5, at most 1.25 on Intel graphics; ?test forces 0.75; &dpr= overrides both.
export function startDPR(gpu = GL.gpu) {
  if (Q.has('dpr')) { const d = parseFloat(Q.get('dpr')); if (d > 0) return Math.min(d, 3); }
  if (Q.has('test')) return 0.75;
  return Math.min(window.devicePixelRatio || 1, /Intel|UHD|Iris/i.test(gpu || '') ? 1.25 : 1.5);
}
const FIXED_DPR = Q.has('dpr') || Q.has('test'); // tests keep one pixel ratio: no automatic step-down

// the pointer and the clock are shared by every scene, with or without WebGL
addEventListener('pointermove', (e) => {
  GL.pointerRaw.set(e.clientX / VW() * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
}, { passive: true });

const cache = new Map();
// Uploads to the GPU ahead of the draw that will need them: one at a time, each in an idle moment with time to spare, so that no
// frame (and no scroll) waits for a run of them. A draw that needs a texture sooner uploads it itself, and this finds it done.
let lane = Promise.resolve();
const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1000 }) : setTimeout(() => f({ didTimeout: true }), 100));
function ahead(t) {
  lane = lane.then(() => new Promise((res) => {
    const go = (d) => {
      if (!d.didTimeout && d.timeRemaining() < 6) { idle(go); return; }
      try { if (GL.renderer && !GL.lost && texReady(t)) GL.renderer.initTexture(t); } catch (e) { /* drawn on first use instead */ }
      res();
    };
    idle(go);
  }));
}
// A picture handed to WebGL as an <img> is converted for the upload on the main thread: 14 ms for a 720 px painting and 55 to 70 ms for a 1448 px
// one (measured, and a long task). The same picture as an ImageBitmap made flipped and with straight alpha, the way the texture wants it, is
// converted off the main thread and uploads in 1 to 4 ms. The large paintings go up that way; the small ones, which are on the start-up path
// and convert in 14 ms, do not (a bitmap is a second decode, and it delayed the start by 200 ms where the CPU is busy with the page's own
// software GL). Not every browser honours the two options, so a 1 x 2 picture is asked, once, which way up it comes back (on canvases that
// live in memory: a read of a canvas that lives on the GPU waits for the GPU, and that was about a second at start-up); where it is not
// the right way up, or there is no createImageBitmap, the <img> goes up as it always did.
const BIG = 1e6;   // pixels: the 1448 x 1086 paintings (1.57 M) and not the 720 x 540 ones (0.39 M)
let bitmaps = null;
const bitmapsOK = () => bitmaps || (bitmaps = (async () => {
  try {
    if (!window.createImageBitmap) return false;
    const a = document.createElement('canvas'); a.width = 1; a.height = 2;
    const x = a.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillRect(0, 1, 1, 1);
    const b = await createImageBitmap(a, { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
    const c = document.createElement('canvas'); c.width = 1; c.height = 2;
    const y = c.getContext('2d', { willReadFrequently: true }); y.drawImage(b, 0, 0);
    const d = y.getImageData(0, 0, 1, 2).data;
    b.close();
    return d[0] < 128 && d[4] > 128;   // flipped: the black row is on top
  } catch (e) { return false; }
})());
export function tex(url) {
  if (cache.has(url)) return cache.get(url);
  // The texture is given its picture once the picture has been decoded (img.decode(), off the main thread): three uploads a texture
  // in the frame that first draws it, and a 1448 px painting that was still undecoded then held that frame back for the decode too
  // (60 ms and more). Until it has its picture the texture is not ready (texReady) and callers use the small painting, as for any
  // picture still on its way. A picture that arrives is drawn once; one that cannot arrive is marked, so texAsync does not wait out its
  // whole timeout for it.
  const t = new Texture();
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  img.decode().then(() => (img.naturalWidth * img.naturalHeight >= BIG && bitmapsOK())).then((ok) => (ok ? createImageBitmap(img, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }).catch(() => null) : null)).then((bm) => {
    if (bm) {
      // Up as the bitmap; once it is up the <img> stands in for it again (a context that is given back is filled from `image`, and a bitmap
      // kept would be 6 MB of memory for each painting for the whole visit).
      t.flipY = false; t.image = bm;
      t.onUpdate = () => { t.onUpdate = null; t.image = img; t.flipY = true; bm.close(); };
    } else t.image = img;
    t.needsUpdate = true; invalidate(); ahead(t);
  }, () => { t.userData.failed = true; invalidate(); });
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = GL.maxAniso;
  t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter;
  cache.set(url, t);
  return t;
}
// the cached texture for a URL, or null; never starts a download
export const peekTex = (url) => cache.get(url) || null;
// Resolves with the texture once its picture is here, as soon as its download has failed, or after `timeout` ms with whatever it has
// (callers ask texReady), so a picture that never arrives cannot hold a page's start-up for ever.
export function texAsync(url, timeout = 10000) {
  const t = tex(url);
  if (t.image && (t.image.complete || t.image.width)) return Promise.resolve(t);
  return new Promise((res) => {
    const t0 = performance.now();
    const chk = () => (t.image && t.image.width) || t.userData.failed || performance.now() - t0 > timeout ? res(t) : setTimeout(chk, 50);
    chk();
  });
}
// a texture is usable once its picture has decoded (until then it would draw black)
export const texReady = (t) => !!(t && t.image && (t.image.naturalWidth || t.image.width));

// The studio the metal reflects (SPEC B8.3). Built once through PMREM; the numbers are the
// emitted strengths of the three panels, in multiples of white, and of the room (a multiple of
// its colour). Parity gate (E1, test/parity.html): at the spec's room strength (1) polished steel
// reflects an almost black room and reads as black glass; at 15 (with the per-material strengths
// in bottle.js LOOK) it matches still-01/03/07/08. `o` exists only for tuning.
export const STUDIO = { room: '#2A2622', roomK: 15, left: 8, right: 4.8, top: 1.5 };
export function studioEnv(o = {}, renderer = GL.renderer) {
  const k = { ...STUDIO, ...o };
  const scene = new Scene();
  const parts = [];
  const add = (geo, mat, setup) => { const m = new Mesh(geo, mat); setup(m); scene.add(m); parts.push(m); return m; };
  const white = (s) => new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(s), side: DoubleSide, toneMapped: false });
  add(new BoxGeometry(10, 6, 10), new MeshBasicMaterial({ color: new Color(k.room).multiplyScalar(k.roomK), side: BackSide, toneMapped: false }), () => {});
  add(new PlaneGeometry(1.2, 5), white(k.left), (m) => { m.position.set(-4, 0.5, 1.5); m.rotation.y = Math.PI / 2; });   // faces +x
  add(new PlaneGeometry(0.7, 4), white(k.right), (m) => { m.position.set(4, 0.5, -1); m.rotation.y = -Math.PI / 2; });  // faces -x
  add(new PlaneGeometry(2, 2), white(k.top), (m) => { m.position.set(0, 2.9, 0); m.rotation.x = Math.PI / 2; });        // faces down
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  parts.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  return rt.texture;
}

export function initGL(opts = {}) {
  const canvas = document.getElementById('gl');
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: true });
  } catch (e) { return false; }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  GL.renderer = renderer;
  GL.maxAniso = renderer.capabilities.getMaxAnisotropy();
  cache.forEach((t) => { t.anisotropy = GL.maxAniso; }); // made before the renderer knew its limit
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    GL.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) { /* not exposed */ }
  // The ratios the 3D steps down through (the top one is the display's own, capped by startDPR). A step-down made earlier in this
  // visit holds (sessionStorage): a slow machine is not asked to find that out again on every page.
  const RATIOS = [0.75, 1, 1.25, startDPR(GL.gpu)];
  const saved = FIXED_DPR ? NaN : parseInt(store.session('quality'), 10);
  if (saved >= 0 && saved < 3) GL.quality = saved;
  GL.dpr = Math.min(RATIOS[3], RATIOS[GL.quality]);
  renderer.setPixelRatio(GL.dpr);
  renderer.setSize(VW(), innerHeight, false);
  // a shader that fails on this GPU must never take the page down with it
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join(' | ');
    glLog('shader: ' + (log || 'link failed'));
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLog('context lost'); GL.lost = true; }, false);
  // The context came back: three has set its own state up again (its listener was added first), but the studio map was GPU
  // memory and is gone, so it is built once more and handed to everything that held the old one. Then drawing starts again.
  canvas.addEventListener('webglcontextrestored', () => {
    glLog('context restored');
    const old = GL.env;
    try {
      GL.env = studioEnv();
      for (const v of GL.views) {
        if (!v.scene) continue;
        if (v.scene.environment === old) v.scene.environment = GL.env;
        v.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.envMap === old) m.envMap = GL.env; });
      }
    } catch (err) { glLog('restore: ' + (err && err.message)); }
    GL.lost = false;
    invalidate();
  }, false);

  GL.env = studioEnv();

  // quality steps down by itself when frames are slow, so a laptop GPU stays smooth;
  // every step changes only the pixel ratio
  // The display's own ratio can change under a running page (a browser zoom, a window moved to another screen). The 3D then takes
  // the new ratio, but never above the cap of the quality it has stepped down to (RATIOS[GL.quality]): only a change of the
  // display's ratio counts, so an ordinary resize leaves the ratio alone and a step-down is never undone. The top cap is the
  // display's ratio itself. GL.dpr stays the ratio in use.
  let seen = RATIOS[3];
  const follow = () => {
    const d = FIXED_DPR ? seen : startDPR(GL.gpu);
    if (d === seen) return;
    seen = RATIOS[3] = d;
    const r = Math.min(d, RATIOS[GL.quality]);
    if (r !== renderer.getPixelRatio()) { renderer.setPixelRatio(r); GL.dpr = r; }
  };
  addEventListener('resize', () => { follow(); renderer.setSize(VW(), innerHeight, false); invalidate(); });
  // a window moved to a screen of another density can keep its size, so no resize: the ratio's own media query says so (it fires
  // once, when the ratio stops matching, and is armed again for the new one)
  if (!FIXED_DPR && window.matchMedia && matchMedia('all').addEventListener) {
    const arm = () => matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
      follow(); renderer.setSize(VW(), innerHeight, false); invalidate(); arm();
    }, { once: true });
    arm();
  }
  let avg = 16.7, calm = 0, since = 0;
  const watch = (deltaMS, any) => {
    if (FIXED_DPR || !any || document.hidden || deltaMS > 250) return; // shader builds and hidden tabs say nothing
    avg += (deltaMS - avg) * 0.05; GL.fps = Math.round(1000 / avg);
    since += deltaMS; calm += deltaMS;
    if (calm < 4000 || since < 2500) return;              // let the page settle first, and each change take effect
    if (avg > 30 && GL.quality > 0) {
      since = 0;
      // a rung that is not below the ratio in use changes nothing (on a screen of ratio 1 the first two): go on to the next
      do { GL.quality--; } while (GL.quality > 0 && Math.min(RATIOS[GL.quality], GL.dpr) >= renderer.getPixelRatio());
      const r = Math.min(RATIOS[GL.quality], GL.dpr);
      if (r < renderer.getPixelRatio()) { renderer.setPixelRatio(r); GL.dpr = r; }   // (setPixelRatio sets the size again itself: a second setSize reallocates the canvas twice)
      store.session('quality', String(GL.quality));
      glLog(`quality ${GL.quality} (${Math.round(avg)} ms a frame)`);
    }
  };

  GL.watch = watch;
  GL.frame = frame;
  // the parity page (and anything else without the site's ordered tick) draws every tick by itself
  if (opts.tick !== false) {
    GL.always = true;
    gsap.ticker.add((time, deltaMS) => { tickGL(time, deltaMS); frame(deltaMS); });
  }
  return true;
}

// The clock and the eased pointer. Called once per tick, before the stage (main.js).
export function tickGL(time, deltaMS) {
  const dt = Math.min(deltaMS / 1000, 1 / 20);
  GL.time = time; GL.dt = dt; GL.rawDt = Math.min(deltaMS / 1000, 0.25);
  GL.pointer.lerp(GL.pointerRaw, 1 - Math.pow(0.001, dt));
  if (GL.pointer.distanceToSquared(GL.pointerRaw) < 1e-8) GL.pointer.copy(GL.pointerRaw);
}

// Draw every view, if anything changed in the last 300 ms. Last in the ordered tick.
let cleared = true, drewLast = false, lastSig = '';
function viewSig() {
  let sg = '';
  for (const v of GL.views) {
    if (!v.anchor || !v.enabled) continue;
    const r = v.anchor.getBoundingClientRect();
    sg += Math.round(r.top) + ',' + Math.round(r.height) + ';';
  }
  return sg;
}
export function frame(deltaMS = 16.7) {
  const renderer = GL.renderer;
  if (!renderer || GL.lost) return false;
  if (GL.frozen) { drewLast = false; return false; }
  if (GL.idle) {
    if (!cleared) { renderer.setScissorTest(false); renderer.clear(); cleared = true; }
    drewLast = false;
    return false;
  }
  // a view tied to an element that has moved (the page scrolled under it) or left the screen is drawn
  // again at once, so a chapter that scrolls away never leaves its last picture on the canvas
  const sig = viewSig();
  if (sig !== lastSig) { lastSig = sig; GL.pending = true; }
  // at least one frame after every invalidate(), however late the tick, then 300 ms more
  if (!GL.always && !GL.pending && performance.now() - GL.lastInvalid > 300) { drewLast = false; return false; }
  GL.pending = false;
  const H = innerHeight, VWp = VW();
  let any = false;
  for (const v of GL.views) {
    if (v.anchor) { const r = v.anchor.getBoundingClientRect(); v.rect = r; v.onScreen = v.enabled && r.bottom > 0 && r.top < H && r.width > 0; }
    else { v.rect = { left: 0, top: 0, right: VWp, bottom: H, width: VWp, height: H }; v.onScreen = v.enabled; }
    if (v.onScreen) any = true;
  }
  // frame times say something about the GPU only between two drawn frames
  if (drewLast && GL.watch) GL.watch(deltaMS, any);
  renderer.setScissorTest(false);
  renderer.clear();
  cleared = !any;
  drewLast = any;
  if (!any) return false;
  renderer.setScissorTest(true);
  for (const v of GL.views) {
    if (!v.onScreen) continue;
    const r = v.rect;
    try {
      v.update && v.update(GL.dt, r);
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, H);
      renderer.setViewport(r.left, H - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, H - bottom, r.width, bottom - top);
      if (v.camera.aspect !== r.width / r.height) { v.camera.aspect = r.width / r.height; v.camera.updateProjectionMatrix(); }
      renderer.render(v.scene, v.camera);
      GL.frames++;
    } catch (err) {
      // one scene failing never stops the others (or the rest of the page's motion)
      v.fails = (v.fails || 0) + 1;
      if (v.fails === 1) glLog(`view ${v.anchor ? v.anchor.id : 'stage'}: ${err && err.message}`);
      if (v.fails > 30) { v.enabled = false; v.onFail && v.onFail(err); }
    }
  }
  return true;
}

// Compile a scene once, off screen, and report whether every program linked on this GPU.
export function probe(scene, camera) {
  const before = GL.errors.length;
  const r = GL.renderer;
  try {
    r.setScissorTest(true); r.setViewport(0, 0, 4, 4); r.setScissor(0, 0, 4, 4);
    r.render(scene, camera);
    r.setScissorTest(false); r.clear();
    for (const p of r.info.programs || []) { if (p.diagnostics && p.diagnostics.runnable === false) { glLog('program not runnable: ' + p.name); } }
  } catch (e) { glLog('probe: ' + (e && e.message)); }
  return GL.errors.length === before;
}

// Build every shader program the scene needs (invisible parts included) without drawing,
// in parallel where the GPU driver allows it (SPEC B8.10). Resolves true when all are ready.
export async function compileScene(scene, cam) {
  const r = GL.renderer;
  if (!r) return false;
  try {
    // without the parallel-compile extension compileAsync only warns and polls: build them in one go
    const parallel = r.compileAsync && r.extensions && r.extensions.has('KHR_parallel_shader_compile');
    if (parallel) await r.compileAsync(scene, cam);
    else r.compile(scene, cam);
    return true;
  } catch (e) { glLog('compile: ' + (e && e.message)); return false; }
}

// Resolves once the GPU has finished everything queued so far (a WebGL 2 fence, polled, never
// blocking). Shader builds and texture uploads are queued work: without the parallel-compile
// extension the driver may still be busy with them when compile() has returned, and that work
// would otherwise land on the first frames of the opening's cut. Resolves false after `timeout`.
export function gpuDone(timeout = 3000) {
  const gl = GL.renderer && GL.renderer.getContext();
  if (!gl || !gl.fenceSync) return Promise.resolve(true);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!sync) return Promise.resolve(true);
  gl.flush();
  const t0 = performance.now();
  return new Promise((res) => {
    const poll = () => {
      const done = gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED;
      if (done || performance.now() - t0 > timeout || gl.isContextLost()) { gl.deleteSync(sync); res(done); }
      else setTimeout(poll, 16);
    };
    poll();
  });
}

// A view is drawn inside `anchor`. `update(dt, rect)` runs every frame while it is on screen.
export function addView(view) {
  view.enabled = view.enabled !== false;
  GL.views.push(view);
  return view;
}
