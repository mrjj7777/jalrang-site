// L2. A painting first (Chuna paper). The maker's story as an editorial page: the words and the three
// steps on the left, one tall frame of photographs on the right. The one motion, over the 120vh
// hold: each next photograph rises into the frame under a dead-straight line (the site's cut), in
// place, linear to scroll, and the step it shows becomes the step in play (set heavier). The
// photograph in the frame settles from 106% to 100% as it is read; the pointer moves the frame by a
// few pixels. Everything reverses. Calm: the steps listed with the first photograph, still.
import { swap } from '../core/ui.js';
import { L } from './state.js';

const STEPS = ['Painted at full size', 'Printed round the steel in one piece', 'Signed on the base'];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// image 2 rises over p 0.22 → 0.44, image 3 over 0.58 → 0.80
const WIN = [null, [0.22, 0.44], [0.58, 0.8]];

export function initCraft() {
  const sec = document.getElementById('craft');
  const rows = [...sec.querySelectorAll('.steps__row')];
  const imgs = [...sec.querySelectorAll('.craft__img')];
  const cap = document.getElementById('craftCap');
  const frame = document.getElementById('craftFrame');
  cap.dataset.swap = cap.textContent;
  let step = -1, last = '';
  function setStep(i) {
    if (i === step) return;
    step = i;
    rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
    swap(cap, `0${i + 1} · ${STEPS[i]}`);
  }
  function update(p) {
    if (L.calm) return;
    // a narrow screen reads this chapter in flow: the frame's own way up the screen drives it
    if (document.documentElement.classList.contains('is-narrow')) {
      const r = frame.getBoundingClientRect();
      p = clamp((innerHeight * 0.92 - r.top) / (innerHeight * 0.85));
    }
    const rise = WIN.map((w) => (w ? clamp((p - w[0]) / (w[1] - w[0])) : 1));
    let cur = 0;
    rise.forEach((r, i) => { if (r >= 0.5) cur = i; });
    const key = rise.map((r) => r.toFixed(4)).join('|');
    if (key !== last) {
      last = key;
      imgs.forEach((im, i) => {
        const r = rise[i];
        im.style.clipPath = i === 0 || r >= 1 ? '' : `inset(${((1 - r) * 100).toFixed(3)}% 0% 0% 0%)`;
        im.style.visibility = r <= 0 ? 'hidden' : '';
        // each photograph settles while it is the one being read
        const own = i === 2 ? clamp((p - 0.58) / 0.42) : i === 1 ? clamp((p - 0.22) / 0.36) : clamp(p / 0.22);
        const s = 1.06 - 0.06 * own;
        im.style.setProperty('--s', s.toFixed(4));
      });
    }
    setStep(cur);
  }
  if (L.calm) { rows.forEach((r) => r.classList.remove('is-active')); }
  else update(0);
  // the pointer: the frame drifts up to 6 px against it
  if (!L.calm && matchMedia('(hover: hover)').matches) {
    addEventListener('pointermove', (e) => {
      const x = (e.clientX / innerWidth - 0.5) * -12, y = (e.clientY / innerHeight - 0.5) * -12;
      frame.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    }, { passive: true });
  }
  return { id: 'craft', el: sec, stage: document.getElementById('craftStage'), update };
}
