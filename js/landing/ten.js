// L3. The ten designs: the heart of the landing. A pinned, scroll-driven sequence over all ten
// editions, 01 Sindoor to 10 Rani, in order, every one the same way (cloth.js has the numbers):
// one bottle in the middle; at each step its painting peels off its LEFT edge as a flat cloth while
// the next painting comes in from the RIGHT and winds on at its right edge, at the same speed, like
// cloth through a roller: the front of the bottle always wears a painting (FIX2). The colour line
// runs with the meeting point of the two cloths: right of it the next edition's ground, giant
// colour name, words, list and shoulder; left of it the one leaving.
// Each edition owns a tenth of the hold. No price and no buttons here: the way into the shop is L6.
// SLOW (19 Oct 2026): the hold is 1700 vh and one swap takes 115.6 vh of it (cloth.js), run through the
// smoothed progress of main.js (this chapter asks for a heavier tau, see `smooth` below), so a wheel
// notch moves the cloth by about 1.7 px per px of scroll, softly, never in one whip.
// The cursor: <i class="bhit"> lies over the standing bottle and is the only thing here the pointer
// can hit; it is live only while a step is at rest and carries that edition's data-cursor label
// ("NO. 04 · PATOLA") and data-cursor-coin ("04") for js/shop/cursor.js.
//
// The two frames (a: the edition leaving or at rest, b: the one arriving) are the same composition;
// b is revealed right of the line (clip-path), so every word changes colour exactly at the line and
// swaps its value only when the line has passed (no headline is re-animated).
// 3D: the bottle (gl/bottle.js) with its band replaced by two cloths (cloth.js) on the bare steel.
// 2D: two packshots split at the line, and two flat images for the cloths, moved by the same numbers.
// Calm: the ten as one spectrum of ten columns, still (CSS), with the same words.
import { EDITIONS } from '../editions.js';
import { setOnScreen } from '../core/state.js';
import { L } from './state.js';
import { stepAt, sequenceAt, flatSpan, visibleRange, REST, CW, CH, CBASE, CR, liftAt, clothMesh, setCloth } from './cloth.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cursorLabel = (e) => esc(`NO. ${e.n} · ${e.art.toUpperCase()}`);
const BOTTLE_H = 2.72;

// One frame: the edition's name top left, its region and line top right (both above the painted
// band, so a cloth never passes over words), the soft shadow under the bottle, and a thin strip of
// the ten along the bottom edge that marks where the sequence is. No giant colour word here: that
// is the shop's device; the landing is told by the cloth and the bottle.
function frameHTML() {
  return `
  <div class="tf__head tf__cut">
    <p class="t-label tf__no"></p>
    <p class="t-h2 tf__art"></p>
  </div>
  <div class="tf__about tf__cut">
    <p class="t-small tf__where"></p>
    <p class="t-body tf__line"></p>
  </div>
  <ol class="tf__strip">${EDITIONS.map((e) => `<li class="tf__tick"><span class="t-label tf__n">${e.n}</span><span class="t-small tf__name">${esc(e.art)}</span></li>`).join('')}</ol>
  <i class="lx__shadow"></i>`;
}
function fill(fr, e) {
  if (fr.dataset.n === e.n) return;
  fr.dataset.n = e.n;
  fr.dataset.edition = e.n;
  const q = (s) => fr.querySelector(s);
  q('.tf__no').textContent = `Edition One · No. ${e.n} / 10`;
  q('.tf__art').textContent = e.art;
  q('.tf__where').textContent = `${e.region} · ${e.colour}`;
  q('.tf__line').textContent = e.line;
  [...fr.querySelectorAll('.tf__tick')].forEach((li, i) => li.classList.toggle('is-on', EDITIONS[i].n === e.n));
}

export function initTen() {
  const sec = document.getElementById('ten');
  const stage = document.getElementById('tenStage');
  const fa = stage.querySelector('.tf--a'), fb = stage.querySelector('.tf--b');
  fa.innerHTML = frameHTML(); fb.innerHTML = frameHTML();
  fill(fa, EDITIONS[0]); fill(fb, EDITIONS[1]);
  const pkA = stage.querySelector('.tf__pk--a'), pkB = stage.querySelector('.tf__pk--b');
  const clA = stage.querySelector('.tf__cloth--a'), clB = stage.querySelector('.tf__cloth--b');
  const drA = stage.querySelector('.tf__drop--a'), drB = stage.querySelector('.tf__drop--b');
  // the word blocks that hide while the colour line crosses them (never two editions in one line)
  const cutsA = [...fa.querySelectorAll('.tf__cut')], cutsB = [...fb.querySelectorAll('.tf__cut')];
  const bhit = stage.querySelector('.bhit');
  // the list for screen readers: every edition, in order, in words
  document.getElementById('tenList').innerHTML = EDITIONS.map((e) => `<li>No. ${e.n}, ${esc(e.art)}. ${esc(e.region)}. ${esc(e.colour)}. ${esc(e.line)}</li>`).join('');
  // calm: the spectrum (ten columns, each its own ground, packshot and words)
  if (L.calm) {
    const blocks = calm(stage);
    stage.setAttribute('aria-hidden', 'true');
    // the edition whose screen is under the header
    const at = (y) => { for (const el of blocks) { const r = el.getBoundingClientRect(); if (r.top <= y && r.bottom > y) return EDITIONS[+el.dataset.i]; } return EDITIONS[0]; };
    // (main.js calls warm() on the first scroll; calm has nothing to warm, but it must exist)
    return { id: 'ten', el: sec, stage, update() {}, warm() {}, warmBig() {}, edition: () => EDITIONS[0], inkAt: () => at(36) };
  }

  const S = { sc: null, G: null, A: null, B: null, X: Infinity, seq: { a: 0, b: null, t: 0 }, st: null, p: 0, pxu: 0, cx: 0 };
  let cutKey = '', cutBox = [];
  const pkSrc = (n) => `assets/img/bottle-${n}.webp`;
  const clSrc = (n) => `assets/img/wrap-${n}-sm.webp`;
  const setSrc = (img, url) => { if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; } };

  // ---- 3D ----
  let clothA = null, clothB = null;
  function attach(G) {
    S.G = G;
    S.sc = G.makeScene(stage, { edition: '01', ground: EDITIONS[0].ground });
    const b = S.sc.bottle;
    clothA = clothMesh(G.T, b.band); clothB = clothMesh(G.T, b.band);
    clothA.userData.cloth = clothB.userData.cloth = true;
    clothB.renderOrder = 2;
    b.spin.add(clothA, clothB);
  }
  // the 1448 px painting once it has decoded, the 720 px one until then
  function wrapTex(n) {
    const G = S.G, big = G.tex(G.wrapURL(n, false));
    return G.texReady(big) ? big : G.tex(G.wrapURL(n, true));
  }
  const V3 = () => new S.G.T.Vector3();
  let tmp = null;
  // 2D: where a point of the 3D numbers (bottle units from the axis) stands. The flat cloths start at their own
  // packshot's silhouette (state.js PK: its half-width), a little outside or inside the 3D radius CR, so the colour line
  // and every cloth edge move by that much (on the face of the bottle the line is scaled) and stay locked together.
  const x2d = (x, hA, hB) => { const half = x >= 0 ? hB : hA; return Math.abs(x) >= CR ? x + Math.sign(x) * (half - CR) : (x * half) / CR; };

  function update(p, on) {
    const seq = sequenceAt(p);
    S.seq = seq;
    const eA = EDITIONS[seq.a], eB = seq.b != null ? EDITIONS[seq.b] : null;
    fill(fa, eA);
    if (eB) fill(fb, eB);
    if (!on) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    const geo = L.geo(h, 'ten');
    const cx = w / 2;

    let X = Infinity, st = null, pxuNow = 0;
    if (L.gl && S.sc) {
      const G = S.G, sc = S.sc;
      G.measure(sc);
      const f = G.fit(sc, cx, geo.base, geo.cap);
      // a flat cloth starts just off the stage (8 px past its edge; the lifted cloth's perspective adds
      // about 15 px more), so it never slides in from far away: the slide is the cloth's own speed
      const xfar = (w / 2 + 8) / f.pxu;
      pxuNow = f.pxu;
      st = eB ? stepAt(seq.t, xfar) : null;
      G.pose(sc, f, 0);
      const b = sc.bottle;
      // the shoulder (above the painted band) is cut by the colour line like everything else: the old
      // edition's colour left of it, the new one's right of it (two clip planes through the camera and
      // the line's screen column, set below once X is known), so it never flips colour in one frame
      b.setSkins(eA.n, eB ? eB.n : null);
      b.meshBand.visible = b.meshBandB.visible = false;
      b.meshBare.visible = true;
      G.planeOff(b.planes.lineA); G.planeOff(b.planes.lineB);
      b.spin.updateMatrixWorld(true);
      // a point on the cloth (bottle units, flat part) → px in the stage
      const px = (x, y, z = liftAt(x)) => { if (!tmp) tmp = V3(); tmp.set(x, y, z); b.spin.localToWorld(tmp); return G.project(sc, tmp, { x: 0, y: 0 }); };
      if (eB) {
        // the line in px: the meeting point of the cloths, where it is drawn (with its lift)
        X = px(st.line, CBASE + CH / 2, st.lz).x;
        G.screenPlane(sc, b.planes.lineA, { x: X, keep: 'left' });
        G.screenPlane(sc, b.planes.lineB, { x: X, keep: 'right' });
        const bandTop = px(0, CBASE + CH, CR).y, bandBot = px(0, CBASE, CR).y;
        drops(st, (x) => px(x, CBASE + CH / 2).x, bandTop, bandBot, f.pxu);
      } else drops(null);
      clothA.material.map = wrapTex(eA.n);
      setCloth(clothA, st ? st.out : REST, false);
      clothB.visible = !!eB;
      if (eB) { clothB.material.map = wrapTex(eB.n); setCloth(clothB, st.in, true); }
      sc.hemi.groundColor.set((eB && X < cx ? eB : eA).ground);
      G.changed(sc, p.toFixed(5), eA.n, eB ? eB.n : '-', X.toFixed(2), clothA.material.map.id, eB ? clothB.material.map.id : 0, sc.w, sc.h);
    } else {
      // 2D: the same numbers in px
      const bh = geo.base - geo.cap, pxu = bh / BOTTLE_H;
      const xfar = (w / 2 + 8) / pxu;
      pxuNow = pxu;
      st = eB ? stepAt(seq.t, xfar, visibleRange(xfar)) : null;     // only the part of the step a flat packshot shows
      const hA = L.pk(eA.n).half, hB = eB ? L.pk(eB.n).half : hA;
      if (eB) X = cx + x2d(st.line, hA, hB) * pxu;
      // each packshot stands on the same marks, whatever its file (state.js PK): the same top and base, its bottle's
      // axis in the middle of the stage; the two split at the line (an inset is measured in the image's own box)
      const stand = (im, n) => {
        setSrc(im, pkSrc(n));
        L.packshot(im, h, 'ten', n);
        const c = L.pk(n), iw = parseFloat(im.style.width);
        im.style.translate = `${(-c.ax * 100).toFixed(2)}% 0`;
        return [cx - c.ax * iw, iw];                       // the box's left edge and its width
      };
      const [la, iwA] = stand(pkA, eA.n);
      pkA.style.clipPath = eB ? `inset(0px ${Math.max(0, la + iwA - X).toFixed(1)}px 0px 0px)` : '';
      pkB.style.visibility = eB ? 'visible' : 'hidden';
      if (eB) { const [lb] = stand(pkB, eB.n); pkB.style.clipPath = `inset(0px 0px 0px ${Math.max(0, X - lb).toFixed(1)}px)`; }
      // the cloths: full paintings, cut to the part that lies flat
      const cw = CW * pxu, ch = CH * pxu, top = geo.base - (CBASE + CH) * pxu;
      const place = (img, n, left, clipL, clipR) => {
        setSrc(img, clSrc(n));
        img.style.cssText = `visibility:visible;width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px;top:${top.toFixed(1)}px;` +
          `transform:translateX(${(cx + left).toFixed(1)}px);clip-path:inset(0px ${Math.max(0, clipR).toFixed(1)}px 0px ${Math.max(0, clipL).toFixed(1)}px)`;
      };
      if (eB) {
        const o = st.out, i = st.in;
        // out: the part a < k lies flat at x = a − k − (R + slide), left of the bottle
        // (R is the half-width of that edition's own packshot, not the 3D bottle's: state.js PK)
        if (o.k > 0) place(clA, eA.n, (-o.k - hA - o.slide) * pxu, 0, (CW - Math.min(o.k, CW)) * pxu); else clA.style.visibility = 'hidden';
        // in: the part a > k lies flat at x = a − k + (R + slide), right of the bottle
        if (i.k < CW) place(clB, eB.n, (-i.k + hB + i.slide) * pxu, Math.max(0, i.k) * pxu, 0); else clB.style.visibility = 'hidden';
      } else { clA.style.visibility = 'hidden'; clB.style.visibility = 'hidden'; }
      if (eB) drops(st, (x) => cx + x2d(x, hA, hB) * pxu, top, top + ch, pxu); else drops(null);
    }
    // the frames: b right of the line; a word block the line is crossing waits until it has passed
    S.X = X; S.st = st; S.p = p; S.pxu = pxuNow; S.cx = cx;
    // The blocks' edges are read once for an edition and a window size (and again until the fonts are in), never in the middle of
    // the frame's writes: reading them there made the browser lay the stage out again in every frame.
    const fontsIn = !document.fonts || document.fonts.status === 'loaded', ck = `${eA.n}|${w}|${h}`;
    if (!fontsIn || ck !== cutKey) { cutKey = fontsIn ? ck : ''; cutBox = cutsA.map((el) => [el.offsetLeft - 32, el.offsetLeft + el.offsetWidth + 32]); }
    cutsA.forEach((el, i) => {
      const off = !!eB && X > cutBox[i][0] && X < cutBox[i][1];
      if (el.classList.contains('is-cut') !== off) { el.classList.toggle('is-cut', off); cutsB[i].classList.toggle('is-cut', off); }
    });
    if (eB && X < w) { fb.style.visibility = 'visible'; fb.style.clipPath = `inset(0px 0px 0px ${Math.max(0, X).toFixed(2)}px)`; }
    else fb.style.visibility = 'hidden';
    S.A = eA; S.B = eB;
    hit(eA, eB, cx, geo, pxuNow);
    setOnScreen((eB && X < cx ? eB : eA).n);
  }

  // The cursor's hit-proxy: the standing bottle's box (its body's width, cap top to base, 8 px of play),
  // live only while a step is at rest; its label follows the edition at rest, set before it goes live.
  let hitBox = '', hitN = '';
  function hit(eA, eB, cx, geo, pxu) {
    if (!bhit || !pxu) return;
    const hw = (L.gl ? CR : L.pk(eA.n).half) * pxu + 8;
    const box = `left:${(cx - hw).toFixed(1)}px;top:${geo.cap.toFixed(1)}px;width:${(2 * hw).toFixed(1)}px;height:${(geo.base - geo.cap).toFixed(1)}px`;
    if (box !== hitBox) { hitBox = box; bhit.style.cssText = box; }
    if (!eB && hitN !== eA.n) {
      hitN = eA.n;
      bhit.dataset.cursor = `NO. ${eA.n} · ${eA.art.toUpperCase()}`;
      bhit.dataset.cursorCoin = eA.n;
    }
    const live = !eB;
    if (bhit.classList.contains('is-live') !== live) bhit.classList.toggle('is-live', live);
  }

  // The soft shadow each flat cloth casts on the ground: a blurred band the height of the painting,
  // from the cloth's outer edge to where it leaves the bottle, fading out towards the bottle.
  // toX: bottle units → px; top/bot: the band's edges in px; pxu: px per bottle unit.
  // Only what changed is written, and the shadow moves by translate (the stage is not laid out again for it, and the browser counts it
  // no layout shift): left: 0 in the style sheet, translate: the old left.
  const lastPut = new WeakMap();
  const put1 = (el, prop, v) => {
    let m = lastPut.get(el);
    if (!m) lastPut.set(el, m = {});
    if (m[prop] === v) return;
    m[prop] = v;
    if (prop.startsWith('--')) el.style.setProperty(prop, v); else el.style[prop] = v;
  };
  function drops(st, toX, top, bot, pxu) {
    const put = (el, x0, x1, side) => {
      // x0..x1: the flat part in bottle units; the part in front of the bottle casts nothing seen
      const R = CR + 0.02;
      if (side < 0) x1 = Math.min(x1, -R); else x0 = Math.max(x0, R);
      if (!st || x1 - x0 < 0.05) { put1(el, 'visibility', 'hidden'); return; }
      const a = toX(x0), b = toX(x1);
      put1(el, 'visibility', 'visible');
      put1(el, 'translate', `${a.toFixed(1)}px 0px`);
      put1(el, 'width', `${(b - a).toFixed(1)}px`);
      put1(el, 'top', `${top.toFixed(1)}px`);
      put1(el, 'height', `${(bot - top).toFixed(1)}px`);
      put1(el, '--fade', side < 0 ? 'to left' : 'to right');
      put1(el, '--o', Math.min(1, (x1 - x0) / 0.6).toFixed(3));
    };
    if (!st) { put(drA, 0, 0, -1); put(drB, 0, 0, 1); return; }
    const fo = flatSpan(st.out, false), fi = flatSpan(st.in, true);
    if (fo) put(drA, fo[0], fo[1], -1); else put(drA, 0, 0, -1);
    if (fi) put(drB, fi[0], fi[1], 1); else put(drB, 0, 0, 1);
  }
  // which edition's colours are at screen x (the header asks for its ink)
  const inkAt = (x) => (S.B && x > S.X ? S.B : S.A || EDITIONS[0]);
  // tests: the pictures this step shows, decoded
  async function settled() {
    const ns = [S.A, S.B].filter(Boolean).map((e) => e.n);
    if (L.gl && S.G) await Promise.all(ns.map((n) => S.G.texAsync(S.G.wrapURL(n, false))));
    const imgs = [pkA, pkB, clA, clB].filter((im) => im.getAttribute('src'));
    await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
  }
  // warm the paintings: the ten small ones, then the large one of each edition as it comes near
  function warm() {
    if (L.gl && S.G) EDITIONS.forEach((e) => S.G.tex(S.G.wrapURL(e.n, true)));
    else EDITIONS.forEach((e) => { const a = new Image(); a.src = pkSrc(e.n); const c = new Image(); c.src = clSrc(e.n); });
  }
  function warmBig() {
    if (!(L.gl && S.G)) return;
    const s = S.seq, n = [s.a, s.a + 1, s.a + 2].filter((i) => i < 10);
    n.forEach((i) => S.G.tex(S.G.wrapURL(EDITIONS[i].n, false)));
  }
  // tests (?test, __jal.ten.probe()): where the colour line and the ends of the flat cloths are, in px
  // of the stage, from the numbers of the last update; and the clip frame b was given
  function probe() {
    const st = S.st, r = { p: S.p, a: S.A && S.A.n, b: S.B && S.B.n, t: S.seq.t, X: S.X, clip: fb.style.clipPath, vis: fb.style.visibility, pxu: S.pxu, cx: S.cx };
    if (st && S.pxu) {
      const mid = CBASE + CH / 2, fo = flatSpan(st.out, false), fi = flatSpan(st.in, true);
      const at = L.gl && S.sc
        ? (x, z) => { const v = new S.G.T.Vector3(x, mid, z); S.sc.bottle.spin.localToWorld(v); return S.G.project(S.sc, v).x; }
        : (x) => S.cx + x2d(x, L.pk(S.A.n).half, L.pk((S.B || S.A).n).half) * S.pxu;
      r.line = st.line;
      r.lineX = at(st.line, st.lz);
      r.edges = { oo: fo ? at(fo[0], liftAt(fo[0])) : null, oi: fo ? at(fo[1], liftAt(fo[1])) : null, io: fi ? at(fi[1], liftAt(fi[1])) : null, ii: fi ? at(fi[0], liftAt(fi[0])) : null };
      r.out = st.out; r.in = st.in;
    }
    return r;
  }
  window.__jal = Object.assign(window.__jal || {}, { ten: { probe } });
  return { id: 'ten', el: sec, stage, update, attach, inkAt, settled, warm, warmBig, edition: () => S.A, smooth: 0.3, maxV: 0.03 };
}

// calm (FIX2, 16 Oct 2026): one edition per screen, still, in its own ground, with the same words
// as the moving version (its number, art, region, colour and line) and its packshot standing where
// the 3D bottle stands. The row of ten stays only in L6.
function calm(stage) {
  stage.innerHTML = EDITIONS.map((e, i) => `
    <div class="cal10" data-edition="${e.n}" data-i="${i}">
      <div class="tf__head"><p class="t-label tf__no">Edition One · No. ${e.n} / 10</p><p class="t-h2 tf__art">${esc(e.art)}</p></div>
      <div class="tf__about"><p class="t-small tf__where">${esc(e.region)} · ${esc(e.colour)}</p><p class="t-body tf__line">${esc(e.line)}</p></div>
      <img class="cal10__pk" src="assets/img/bottle-${e.n}.webp" alt="" width="720" height="971" loading="lazy" data-cursor="${cursorLabel(e)}" data-cursor-coin="${e.n}">
      <i class="lx__shadow cal10__shadow"></i>
    </div>`).join('');
  return [...stage.querySelectorAll('.cal10')];
}
