// product.html: "Unwrap it." for the edition of this page. Copied from the shop's original unwrap (the
// signature, 15 Oct 2026) and adapted to a standalone product scene (16 Oct 2026): it is the same for
// all ten editions, driven by scroll only, over a pinned section (#unwrap, a sticky 100vh frame).
// mode-3d, over the hold (p 0 → 1):
//   0 → 0.08     the bottle turns to its join (ry 0 → π), the join glints (uSeam)
//   0.08 → 0.24  the painting peels off and opens out, growing a little, into the upper part of
//                the frame (54% of its height, never more than half its width): the bottle and the
//                painting's edge stay in view the whole way; the bottle's shadow fades as it opens
//   0.24 → 0.66  flat: the three details are marked on it and named one at a time in the list on
//                the right (0.26–0.38, 0.40–0.52, 0.54–0.66); the pointer moves the raking light
//   0.66 → 0.78  it wraps back on; 0.78 → 0.86 the bottle turns to the front
// "Unwrap it." and its line stay on screen throughout (16 Oct 2026 fix: no dead, text-less frame).
// The shop's Previous / Next local cut is not here: on product.html each edition is its own page
// (Previous / Next edition links sit under "More editions").
// mode-2d and mode-flow: a 2D unwrap of the flat painting with the scroll (product.js, pu-roll).
import { ENV } from '../core/env.js';
import { byN } from '../editions.js';
import { clamp, lerp, range } from '../core/ui.js';

const VERT = /* glsl */`
#include <clipping_planes_pars_vertex>
uniform float uS, uR, uW, uH, uBase, uLift;
varying vec2 vUv; varying vec3 vN; varying float vCurl;
void main() {
  vUv = uv;
  float a = (uv.x - 0.5) * uW;
  float y = uBase + uv.y * uH;
  float sg = a < 0.0 ? -1.0 : 1.0;
  float d = abs(a) - uS;
  vec3 p; vec3 n;
  if (d <= 0.0) { p = vec3(a, y, uR + uLift); n = vec3(0.0, 0.0, 1.0); vCurl = 0.0; }
  else { float ph = d / uR; p = vec3(sg * (uS + uR * sin(ph)), y, uR * cos(ph) + uLift * cos(min(ph, 1.5707))); n = vec3(sg * sin(ph), 0.0, cos(ph)); vCurl = ph; }
  vN = normalize(normalMatrix * n);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const FRAG = /* glsl */`
#include <clipping_planes_pars_fragment>
uniform sampler2D uMap;
uniform float uSeam, uRake;
uniform vec2 uLight, uTexel;
uniform vec3 uPaper;
varying vec2 vUv; varying vec3 vN; varying float vCurl;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  #include <clipping_planes_fragment>
  vec3 col = texture2D(uMap, vUv).rgb;
  if (!gl_FrontFacing) {
    // the back of the print: plain paper, shaded by its curl
    col = uPaper * (0.82 + 0.18 * abs(vN.z));
  } else {
    // raking light: the matt print surface shows under a low light that follows the pointer
    float l0 = lum(col);
    float lx = lum(texture2D(uMap, vUv + vec2(uTexel.x, 0.0)).rgb) - l0;
    float ly = lum(texture2D(uMap, vUv + vec2(0.0, uTexel.y)).rgb) - l0;
    vec3 pn = normalize(vec3(-lx * 6.0, -ly * 6.0, 1.0));
    vec2 dl = (uLight - vUv) * vec2(1.333, 1.0);
    vec3 L = normalize(vec3(dl, 0.28));
    float fall = exp(-dot(dl, dl) * 6.0);
    col *= 1.0 + uRake * (dot(pn, L) - 0.93) * 1.2 * fall;
    col += uRake * 0.05 * fall;
    // curvature shadow as the paper rolls away
    col *= mix(1.0, 0.5, smoothstep(0.0, 2.2, vCurl));
    col *= 0.86 + 0.14 * clamp(vN.z, 0.0, 1.0);
    // the join glints when it faces the light
    float seam = smoothstep(0.012, 0.0, min(vUv.x, 1.0 - vUv.x));
    col += seam * uSeam * 0.55;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// the choreography, as shares of the hold (unchanged from the shop)
export const JOIN = 0.08, FLAT = 0.24, BACK = [0.66, 0.78], FRONT = 0.86;
export const WIN = [[0.26, 0.38], [0.40, 0.52], [0.54, 0.66]];
const sm = (t) => t * t * (3 - 2 * t);
const soft = (t) => 0.5 * t + 0.5 * sm(t);   // near linear to scroll, without a hard start
const openOf = (p) => soft(range(p, JOIN, FLAT)) * (1 - soft(range(p, BACK[0], BACK[1])));
const ryOf = (p, o) => (p < JOIN ? Math.PI * range(p, 0, JOIN) : p < BACK[1] ? Math.PI * (1 + o) : Math.PI * (1 + range(p, BACK[1], FRONT)));

// the details in the order the camera visits them: left to right across the painting
export const sorted = (e) => e.hotspots.map((p, i) => ({ x: p[0], y: p[1], cap: e.captions[i] })).sort((a, b) => a.x - b.x);

// sec: the #unwrap section; n: this page's edition; ST: the product stage (js/pages/product-gl.js)
// Returns { pose(p, base), update(p) } for the product tick, or null outside mode-3d.
export async function initUnwrap({ sec, n, ST }) {
  if (!sec || !ST || ENV.mode !== '3d') return null;
  const frame = sec.querySelector('.pu__frame');
  const plinth = frame.querySelector('.plinth');
  const live = document.getElementById('unwrapState');
  const rows = [...frame.querySelectorAll('.pu__list li')];
  const e = byN(n), pts = sorted(e);

  // three details: focusable buttons; focus holds a caption open
  const hs = document.getElementById('hotspots');
  hs.innerHTML = pts.map((q, i) => `<button class="hotspot" type="button" data-i="${i}" tabindex="-1"><i class="hotspot__dot t-label" aria-hidden="true">0${i + 1}</i><i class="hotspot__line" aria-hidden="true"></i><span class="hotspot__cap t-small"><span class="sr-only">Detail ${i + 1} of 3: </span><span class="hotspot__text"></span></span></button>`).join('');
  const spots = [...hs.children];
  spots.forEach((s, k) => { s.querySelector('.hotspot__text').textContent = pts[k].cap; });
  const capH = [0, 0, 0];
  requestAnimationFrame(() => spots.forEach((s, k) => { capH[k] = s.lastElementChild.offsetHeight; }));
  let P = 0, held = null;

  // ---- the 3D painting ----
  const [T, C, B] = await Promise.all([import('three'), import('../gl/core.js'), import('../gl/bottle.js')]);
  const { DIM, wrapURL } = B, S = ST.S;
  const ready = (t) => !!(t && t.image && (t.image.naturalWidth || t.image.width));
  // the full painting once it has decoded, the small one until then: the sheet is never blank
  const best = () => { const big = C.tex(wrapURL(n)); return ready(big) ? big : C.tex(wrapURL(n, true)); };
  const u = {
    uS: { value: 0 }, uR: { value: DIM.r + 0.004 }, uW: { value: DIM.W }, uH: { value: DIM.bandH }, uBase: { value: DIM.bandBottom }, uLift: { value: 0 },
    uMap: { value: best() }, uSeam: { value: 0 }, uRake: { value: 0 },
    uLight: { value: new T.Vector2(0.5, 0.5) }, uTexel: { value: new T.Vector2(1 / 1448, 1 / 1086) }, uPaper: { value: new T.Color('#EFE7D6') },
  };
  const mat = new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: u, side: T.DoubleSide, clipping: true, clippingPlanes: [S.hero.planes.cut] });
  const geo = new T.PlaneGeometry(1, 1, 256, 8);
  geo.boundingBox = new T.Box3(new T.Vector3(-DIM.r, DIM.bandBottom, -DIM.r), new T.Vector3(DIM.r, DIM.bandTop, DIM.r));
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.visible = false;
  S.sheet = mesh;
  S.hero.spin.add(mesh);
  const band = DIM.bandBottom + DIM.bandH / 2;
  // the open painting's place (FIX2, 16 Oct 2026): it fits the free box of the frame and never runs
  // over the words. Two boxes are measured from the live layout, 32 px clear of everything:
  //   wide: centred across, above both the heading and the list of three details;
  //   left: the column left of the list, above the heading, its left edge on the margin like the heading.
  // The larger one wins (on laptops it is the left column; the list is read beside the painting).
  // The painting is never taller than 54% of the frame nor wider than 0.62 of it.
  const textEl = frame.querySelector('.pu__text'), listEl = frame.querySelector('.pu__details');
  let box = null, boxKey = '';
  const freeBox = () => {
    const H = innerHeight, W = C.VW(), key = W + 'x' + H;
    if (box && boxKey === key) return box;
    const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72;
    const m = parseFloat(getComputedStyle(frame).getPropertyValue('--margin')) || 72;
    const top = nav + Math.max(24, 0.03 * H), gap = 32, ar = DIM.W > 0 ? DIM.bandH / DIM.W : 0.75;
    const tTop = textEl.offsetTop, lTop = listEl.offsetTop, lLeft = listEl.offsetLeft;
    const cap = (w, h) => { const hh = Math.min(h, w * ar, 0.54 * H, 0.62 * W * ar); return hh; };
    const hw = cap(W - 2 * m, Math.min(tTop, lTop) - gap - top);
    const hl = cap(lLeft - gap - m, tTop - gap - top);
    box = hl >= hw ? { h: hl, cx: m + hl / ar / 2, top } : { h: hw, cx: W / 2, top };
    boxKey = key;
    return box;
  };
  const flatAt = () => {
    const H = innerHeight, W = C.VW(), upp = ST.upp(), b = freeBox();
    const hPx = b.h;
    const cy = b.top + hPx / 2;
    const so = (hPx * upp) / DIM.bandH;
    return { so, x: (b.cx - W / 2) * upp, y: (H / 2 - cy) * upp - band * so };
  };
  const pose = (p, base) => {
    const o = openOf(p), ry = ryOf(p, o);
    if (o <= 0) return { ...base, ry };
    const t = flatAt();
    return { x: lerp(base.x, t.x, o), y: lerp(base.y, t.y, o), z: lerp(0, -(DIM.r + 0.124) * t.so, o), s: lerp(base.s, t.so, o), ry };
  };
  // the plinth follows the projected root while the view zooms
  const V = new T.Vector3();
  const scr = (x, y, z) => { V.set(x, y, z).project(S.cam); return { x: (V.x * 0.5 + 0.5) * C.VW(), y: (-V.y * 0.5 + 0.5) * innerHeight }; };
  let followed = false;
  const follow = (p, o, A) => {
    if (o <= 0 || !A) {
      if (followed) { followed = false; plinth.style.transform = ''; plinth.style.opacity = ''; }
      return;
    }
    followed = true;
    plinth.style.opacity = (1 - o).toFixed(3);
    const b = pose(p, A);
    const a0 = scr(A.x, A.y, 0), a1 = scr(A.x + A.s * DIM.r, A.y, 0);
    const b0 = scr(b.x, b.y, b.z), b1 = scr(b.x + b.s * DIM.r, b.y, b.z);
    const k = (b1.x - b0.x) / (a1.x - a0.x), dx = b0.x - a0.x, dy = b0.y - a0.y;
    plinth.style.transform = `translateX(-50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k.toFixed(4)})`;
  };
  // the hotspots sit on their painted motifs: projected from the sheet every drawn frame
  const Q = new T.Vector3();
  mesh.onBeforeRender = () => {
    u.uLight.value.set(0.5 + C.GL.pointer.x * 0.45, 0.5 + C.GL.pointer.y * 0.4);
    if (!sec.classList.contains('has-spot')) return;
    const W = C.VW(), H = innerHeight;
    spots.forEach((s, i) => {
      const q = pts[i];
      Q.set((q.x - 0.5) * DIM.W, DIM.bandBottom + (1 - q.y) * DIM.bandH, u.uR.value + u.uLift.value);
      mesh.localToWorld(Q).project(S.cam);
      const x = (Q.x * 0.5 + 0.5) * W, y = (-Q.y * 0.5 + 0.5) * H;
      s.style.transform = `translate3d(${(x - 22).toFixed(1)}px, ${(y - 22).toFixed(1)}px, 0)`;
      s.classList.toggle('hotspot--left', x > W / 2);
      const h = capH[i] || 80;
      s.style.setProperty('--cap-dy', (clamp(y - h / 2, 96, H - 72 - h) - y).toFixed(1) + 'px');
    });
  };
  // everything on the GPU side, from the hold progress; A: the anchor pose of the pinned frame
  function apply(p, A) {
    const hero = S.hero, o = openOf(p), ry = ryOf(p, o);
    const motion = p > 0.002 && p < FRONT;
    const on = motion && ready(u.uMap.value);
    if (mesh.parent !== hero.spin) hero.spin.add(mesh);
    mesh.visible = on;
    hero.meshBand.visible = !on; hero.meshBare.visible = on;
    const hide = on && o > 0.999;   // fully flat: the steel behind the painting is never seen
    [hero.meshBase, hero.meshShoulder, hero.meshNeck, hero.capGroup].forEach((m) => { m.visible = !hide; });
    u.uS.value = o * DIM.W / 2; u.uLift.value = o * 0.12; u.uRake.value = range(o, 0.85, 1);
    u.uSeam.value = (1 - o) * Math.max(0, -Math.cos(ry));
    const t = best(); if (u.uMap.value !== t) u.uMap.value = t;
    const img = u.uMap.value.image;
    if (img && img.width) u.uTexel.value.set(1 / img.width, 1 / img.height);
    follow(p, o, A);
    C.invalidate();
  }

  // one caption at a time: the one whose window holds p, or the one that has focus
  function showCaps() {
    const i = held != null ? held : WIN.findIndex(([a, b]) => P >= a && P < b);
    spots.forEach((s, k) => { s.classList.toggle('is-on', P >= FLAT && P < BACK[0]); s.classList.toggle('is-cur', k === i); s.tabIndex = P >= FLAT && P < BACK[0] ? 0 : -1; });
    rows.forEach((r, k) => r.classList.toggle('is-on', k === i));
    sec.classList.toggle('has-spot', P >= FLAT && P < BACK[0]);
    C.invalidate();
  }
  spots.forEach((s, i) => {
    s.addEventListener('focus', () => { held = i; showCaps(); });
    s.addEventListener('blur', () => { if (held === i) { held = null; showCaps(); } });
  });

  let flatSaid = null;
  function update(p, A) {
    P = p;
    sec.classList.toggle('is-open', p >= JOIN && p < FRONT);
    const isFlat = p >= FLAT && p < BACK[0];
    if (isFlat !== flatSaid && (flatSaid !== null || isFlat)) live.textContent = isFlat ? 'The painting is laid flat.' : 'The painting is wrapped.';
    flatSaid = isFlat;
    showCaps();
    apply(p, A);
  }
  return { pose, update, get p() { return P; } };
}
