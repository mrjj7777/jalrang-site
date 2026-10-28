// L5. Out in the world (Jamun). Seven clips of ordinary Indian days, in time-of-day order, one at a
// time in one tall 9:16 window. Over the 110vh hold each next clip rises into the window under a
// dead-straight line, in place, linear to scroll; it becomes the current clip (it plays, the caption
// swaps) once its line passes half way. The honesty line under the window is always in view and
// never moves. "Pause the clips" stops them for the visit; a click (or Enter) on the window plays or
// pauses the current one. At most two clips have a source at once (a clip still arriving keeps its source for a few seconds after you leave).
// A clip starts only once it has been the current one, with the chapter in the middle of the screen, for
// DWELL ms (a fast scroll never starts a download it would cancel), a clip that has started is let go only once its
// file has arrived (or after LETGO ms), and none plays in a hidden tab. With Data
// Saver on (or prefers-reduced-data) the clips wait for a tap: the posters stand and the button says "Play the clips".
// Calm: the seven posters in a row that scrolls sideways; a tap plays that one clip.
import { DEPARTURES, byN } from '../editions.js';
import { ENV, clip, store } from '../core/env.js';
import { swap } from '../core/ui.js';
import { L } from './state.js';

const N = DEPARTURES.length;
const H = 0.86;
const win = (k) => [((k - 2) / (N - 1)) * H, ((k - 1) / (N - 1)) * H];   // clip k (2…7) rises in here
const clamp = (v) => Math.max(0, Math.min(1, v));
const DWELL = 400;     // ms a clip is the current one before it is started
const LETGO = 4000;    // ms a clip that is still arriving is given to finish before its file is let go
// the status line a screen reader hears when the visitor pauses or plays the clips (the button's own words flip)
const say = (t) => { const el = document.getElementById('clipsStatus'); if (el) el.textContent = t; };

export function initWorld() {
  const sec = document.getElementById('world');
  const box = document.getElementById('clipWindow');
  const vids = [...box.querySelectorAll('video.clip')];
  const btn = document.getElementById('clipsPause');
  const when = document.getElementById('clipWhen'), where = document.getElementById('clipWhere'), which = document.getElementById('clipWhich');
  [when, where, which].forEach((el) => { el.dataset.swap = el.textContent; });
  if (L.calm) { row(box, vids, btn); return { id: 'world', el: sec, stage: document.getElementById('worldStage'), update() {} }; }

  const rise = vids.map((_, i) => (i === 0 ? 1 : 0));
  let cur = 0, near = false, here = false, mine = null, since = 0;   // since: when the clip in play, or the chapter's place on screen, last changed
  const saved = store.session('clips');
  const lean = ENV.saveData || matchMedia('(prefers-reduced-data: reduce)').matches;
  let paused = saved ? saved === 'paused' : lean;
  // wide screens: the seven as a list of times beside the window, the playing one marked
  const list = document.getElementById('clipList');
  list.innerHTML = DEPARTURES.map((d) => { const e = byN(d.n); return `<li class="cliplist__row"><span class="t-label">${d.time}</span><span class="t-small">${d.place}</span><span class="t-small cliplist__which">${d.colour} · No. ${e.n} ${e.art}</span></li>`; }).join('');
  const rows = [...list.children];
  const caption = (i) => {
    rows.forEach((r, k) => r.classList.toggle('is-on', k === i));
    const d = DEPARTURES[i], e = byN(d.n);
    swap(when, `${d.time} · ${i + 1} / ${N}`);
    swap(where, d.place);
    swap(which, `${d.colour} · No. ${e.n} ${e.art}`);
  };
  const poster = (v) => { if (!v.getAttribute('poster') && v.dataset.poster) v.setAttribute('poster', v.dataset.poster); };
  // A clip lets go of its file only once the file has arrived (at the latest after LETGO ms): cancelling a download
  // half way leaves a cancelled request behind, and a visitor scrolling past would leave several. One that never
  // started has nothing to wait for. A clip told to play is arriving until it has played: for a few frames the
  // element itself says "idle, nothing yet", and a pause or a release then cancels the request. From its first play()
  // a clip is preload="auto": with "none" the browser stops reading once the clip is paused and leaves the request
  // open, which the release would cancel; read to the end, the file arrives (the clips are under a megabyte).
  const leaving = new Map(), asked = new WeakSet();
  const arriving = (v) => asked.has(v) && v.played.length === 0;
  const busy = (v) => arriving(v) || v.networkState === 2 || (v.readyState > 0 && v.buffered.length > 0 && v.buffered.end(v.buffered.length - 1) < v.duration - 0.25);
  const give = (v, on) => {
    if (on) leaving.delete(v);
    if (on && !v.getAttribute('src')) { v.src = clip(v.dataset.clip); return; }
    if (!on && v.getAttribute('src')) {
      if (!arriving(v)) v.pause();
      if (!leaving.has(v)) leaving.set(v, performance.now());
      if (busy(v) && performance.now() - leaving.get(v) < LETGO) return;
      leaving.delete(v); asked.delete(v); v.removeAttribute('src'); v.load(); v.preload = 'none';
    }
  };
  const play = (v) => { asked.add(v); if (v.preload !== 'auto') v.preload = 'auto'; const r = v.play(); if (r && r.catch) r.catch(() => {}); };
  function media() {
    const keep = new Set();
    if (near) { keep.add(cur); keep.add(rise[cur] < 1 ? cur - 1 : cur + 1); }
    vids.forEach((v, i) => give(v, keep.has(i)));
    const dialog = document.documentElement.classList.contains('has-dialog');
    const settled = performance.now() - since > DWELL;
    vids.forEach((v, i) => {
      const want = i === cur && here && !dialog && !document.hidden && (mine && mine.i === cur ? mine.play : !paused && settled);
      if (want) play(v); else if (!v.paused && !arriving(v)) v.pause();
    });
  }
  const paint = (i) => {
    const k = rise[i], v = vids[i];
    const c = i === 0 || k >= 1 ? '' : `inset(${((1 - k) * 100).toFixed(3)}% 0% 0% 0%)`;
    if (v.style.clipPath !== c) v.style.clipPath = c;
    v.style.visibility = k <= 0 ? 'hidden' : '';
  };
  function update(p, on) {
    const nowNear = on;
    let c = 0;
    for (let k = 2; k <= N; k++) {
      const [a, b] = win(k), r = clamp((p - a) / (b - a));
      rise[k - 1] = r;
      if (r >= 0.5) c = k - 1;
    }
    vids.forEach((_, i) => paint(i));
    if (nowNear) vids.forEach((v, i) => { if (Math.abs(i - c) <= 1) poster(v); });
    const r = sec.getBoundingClientRect();
    const nowHere = r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5;
    if (c !== cur) { cur = c; mine = null; caption(c); since = performance.now(); }
    if (nowHere && !here) since = performance.now();
    near = nowNear; here = nowHere;
    media();
  }
  function toggleOne() {
    const v = vids[cur];
    mine = { i: cur, play: v.paused };
    give(v, true);
    if (mine.play) play(v); else if (!arriving(v)) v.pause();
  }
  box.addEventListener('click', toggleOne);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOne(); } });
  // The button's words flip (a toggle that also changed its name would tell a screen reader the opposite of the
  // truth), so it carries no aria-pressed; the pill's word comes from data-cursor, and a polite status line says it.
  const setPaused = (p, remember = true) => {
    paused = p; mine = null;
    btn.textContent = p ? 'Play the clips' : 'Pause the clips';
    btn.dataset.cursor = p ? 'PLAY' : 'PAUSE';
    if (remember) { store.session('clips', p ? 'paused' : 'playing'); say(p ? 'The clips are paused.' : 'The clips are playing.'); }
    media();
  };
  btn.addEventListener('click', () => setPaused(!paused));
  setPaused(paused, false);
  new MutationObserver(media).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', media);
  caption(0);
  // tests: the posters on screen have decoded
  const settled = () => Promise.all(vids.filter((v) => v.getAttribute('poster')).map((v) => new Promise((res) => {
    const im = new Image(); im.onload = im.onerror = () => res(); im.src = v.getAttribute('poster');
  })));
  return { id: 'world', el: sec, stage: document.getElementById('worldStage'), update, settled };
}

// calm: the seven posters side by side, a caption under each; a tap plays that clip alone
function row(box, vids, btn) {
  box.classList.add('cliprow');
  box.removeAttribute('tabindex');
  box.setAttribute('aria-label', 'Seven clips');
  const btns = vids.map((v, i) => {
    const d = DEPARTURES[i], e = byN(d.n);
    const fig = document.createElement('figure');
    fig.className = 'poster';
    fig.innerHTML = `<button class="poster__btn" type="button" aria-pressed="false"></button><figcaption class="t-small poster__cap">${d.time} · ${d.place} · ${d.colour} · No. ${e.n} ${e.art}</figcaption>`;
    const b = fig.firstElementChild;
    b.setAttribute('aria-label', v.getAttribute('aria-label'));
    v.removeAttribute('aria-label');
    v.setAttribute('aria-hidden', 'true');
    v.setAttribute('poster', v.dataset.poster);
    b.append(v);
    box.append(fig);
    return b;
  });
  let on = -1;
  const render = () => {
    vids.forEach((v, i) => {
      const me = i === on;
      btns[i].setAttribute('aria-pressed', String(me));
      if (me && !v.getAttribute('src')) v.src = clip(v.dataset.clip);
      if (!me && v.getAttribute('src')) { v.pause(); v.removeAttribute('src'); v.load(); }
      if (me) { v.preload = 'auto'; const r = v.play(); if (r && r.catch) r.catch(() => {}); }
    });
    btn.textContent = on >= 0 ? 'Pause the clips' : 'Play the clips';
  };
  btns.forEach((b, i) => b.addEventListener('click', () => { on = on === i ? -1 : i; render(); }));
  btn.addEventListener('click', () => { on = on >= 0 ? -1 : 0; render(); say(on >= 0 ? 'The first clip is playing.' : 'The clips are paused.'); });
  render();
}
