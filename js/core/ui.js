// Small shared pieces: maths, the value swap, and type measured with the real fonts.
import { ENV } from './env.js';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (v, a, b) => clamp((v - a) / (b - a));
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
};
export const fmt = (v) => '₹' + v.toLocaleString('en-IN');

// The value swap (B11): a name changes by a 200 ms cross-fade, never by moving.
// Rapid calls settle on the last text.
export function swap(el, text) {
  if (!el) return;
  if (el.dataset.swap === text) return;
  el.dataset.swap = text;
  if (ENV.reduce || !el.isConnected || !el.textContent || !window.gsap) { el.textContent = text; return; }
  gsap.killTweensOf(el);
  gsap.to(el, { opacity: 0, duration: 0.1, ease: 'none', onComplete: () => {
    el.textContent = el.dataset.swap;
    gsap.to(el, { opacity: 1, duration: 0.1, ease: 'none' });
  } });
}

// A custom property changed on <html> is inherited by every element, so the whole document is styled again (570 to 1500 elements: 5 to 10 ms, 60 to 140 ms
// at CPU 4x) each time a chapter or a world changes the header's ink or the swatches' ink. Those live on the elements that use them, found by selector:
// the header and the landing's band (--nav-ink, --nav-ink-l, --nav-ground), the shop's swatch column (--index-ink).
export function setInk(sel, prop, value) {
  document.querySelectorAll(sel).forEach((el) => el.style.setProperty(prop, value));
}

// ---- type measured at runtime (fonts can be swapped; nothing here assumes a font) ----
// the y of the first baseline inside el, in px from el's top edge
export function baselineOf(el) {
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;padding:0;margin:0;border:0';
  el.prepend(probe);
  const y = probe.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
  probe.remove();
  return y;
}
// The ink of a string set in el's computed font, in em: ascent above and descent below the
// baseline, and the left / right ink edges from the start of the advance box. Canvas text cannot
// take a variable font's optical size, so the glyphs are drawn in an SVG image that embeds the
// page's own font file with the element's own variation settings, and their pixels are read.
const fontFiles = new Map();
function covers(range, cp) {
  if (!range) return true;
  return range.split(',').some((part) => {
    const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
    if (!m) return false;
    const a = parseInt(m[1].replace(/\?/g, '0'), 16), b = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16);
    return cp >= a && cp <= b;
  });
}
function fontURL(family, cp) {
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule)) continue;
      if (r.style.getPropertyValue('font-family').replace(/["']/g, '').trim() !== family) continue;
      if (!covers(r.style.getPropertyValue('unicode-range'), cp)) continue;
      const m = /url\(["']?([^"')]+)["']?\)/.exec(r.style.getPropertyValue('src'));
      if (m) return new URL(m[1], sheet.href || location.href).href;
    }
  }
  return null;
}
function fontData(url) {
  if (!fontFiles.has(url)) {
    fontFiles.set(url, fetch(url, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error('font ' + r.status); return r.blob(); }).then((b) => new Promise((res, rej) => {   // a missing file is not measured as if it were the font
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b);
    })).catch(() => null));
  }
  return fontFiles.get(url);
}
// The box of the pixels whose alpha is above `min` (96) in a canvas read (d: its RGBA bytes), { left, right, top, bottom } as pixel indices,
// or null where there are none. A pixel is read as one 32-bit word (its alpha is the top byte) and every row stops at the first hit, so
// the empty margins cost one read a pixel and the inked rows hardly more than their own width; the answer is the one a pass over every
// pixel gives. Also read by stage2d.js, for a packshot's silhouette.
const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
export function alphaBox(d, W, H, min = 96) {
  if (!LE) {
    let top = H, bottom = -1, left = W, right = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > min) { if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x; }
    }
    return bottom < 0 ? null : { left, right, top, bottom };
  }
  const u = new Uint32Array(d.buffer, d.byteOffset, W * H);
  let top = -1, bottom = -1;
  for (let y = 0; y < H && top < 0; y++) { const o = y * W; for (let x = 0; x < W; x++) if (u[o + x] >>> 24 > min) { top = y; break; } }
  if (top < 0) return null;
  for (let y = H - 1; y >= top && bottom < 0; y--) { const o = y * W; for (let x = 0; x < W; x++) if (u[o + x] >>> 24 > min) { bottom = y; break; } }
  let left = W, right = -1;
  for (let y = top; y <= bottom; y++) {
    const o = y * W;
    for (let x = 0; x < left; x++) if (u[o + x] >>> 24 > min) { left = x; break; }
    for (let x = W - 1; x > right; x--) if (u[o + x] >>> 24 > min) { right = x; break; }
  }
  return { left, right, top, bottom };
}
const scratch = document.createElement('canvas');   // one canvas for every measure (each one draws and reads it before the next starts)
const inkCache = new Map();
export async function inkOf(text, el) {
  const cs = getComputedStyle(el);
  const t = cs.textTransform === 'uppercase' ? text.toUpperCase() : text;
  const size = Math.max(48, Math.min(400, parseFloat(cs.fontSize) || 100));
  const ls = (parseFloat(cs.letterSpacing) || 0) / (parseFloat(cs.fontSize) || 1);
  const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const key = [t, family, cs.fontWeight, cs.fontStretch, cs.fontVariationSettings, cs.fontFeatureSettings, cs.fontOpticalSizing, size, ls].join('|');
  if (inkCache.has(key)) return inkCache.get(key);
  const job = (async () => {
    const url = fontURL(family, t.codePointAt(0));
    const data = url && await fontData(url);
    if (!data) return null;
    const esc = t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const css = `@font-face{font-family:P;src:url(${data}) format('woff2');font-weight:1 1000;font-stretch:50% 200%}` +
      `text{font-family:P;font-size:${size}px;font-weight:${cs.fontWeight};font-variation-settings:${cs.fontVariationSettings};` +
      `font-stretch:${cs.fontStretch};font-feature-settings:${cs.fontFeatureSettings};font-optical-sizing:${cs.fontOpticalSizing};letter-spacing:${ls}em;font-kerning:normal}`;
    // The glyphs are drawn at (x0, y0), whole pixels, in a box with room for any ink: 1.3 em a letter and 2 em more wide, 1.5 em above
    // the baseline, 0.7 below (both rounded up to a multiple of 4). Reading every pixel of it took most of the time, so it is read twice:
    // first a quarter of the size (a sixteenth of the pixels) to find where the ink is, to within one of those pixels (any alpha at all;
    // a pixel of the full-size picture that is more than a third inked gives its quarter-size pixel at least 6/255); then, at full
    // size, only the part of the box round it, one quarter-size pixel wider each side. The full-size pixels are the same ones.
    const Q = 4, W = Math.ceil(size * (t.length * 1.3 + 2) / Q) * Q, H = Math.ceil(size * 2.2 / Q) * Q, x0 = Math.round(size), y0 = Math.round(size * 1.5);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><style>${css}</style><text x="${x0}" y="${y0}">${esc}</text></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    try { await img.decode(); } catch (e) { return null; }
    let box;
    try {
      scratch.width = W / Q; scratch.height = H / Q;
      let x = scratch.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, W / Q, H / Q);
      const c = alphaBox(x.getImageData(0, 0, W / Q, H / Q).data, W / Q, H / Q, 0);
      if (!c) return null;
      const X0 = Math.max(0, (c.left - 1) * Q), Y0 = Math.max(0, (c.top - 1) * Q), X1 = Math.min(W, (c.right + 2) * Q), Y1 = Math.min(H, (c.bottom + 2) * Q);
      scratch.width = X1 - X0; scratch.height = Y1 - Y0;
      x = scratch.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0, 0, 0, X1 - X0, Y1 - Y0);
      const b = alphaBox(x.getImageData(0, 0, X1 - X0, Y1 - Y0).data, X1 - X0, Y1 - Y0);
      if (!b) return null;
      box = { left: b.left + X0, right: b.right + X0, top: b.top + Y0, bottom: b.bottom + Y0 };
    } catch (e) { return null; }
    return { ascent: (y0 - box.top) / size, descent: (box.bottom + 1 - y0) / size, left: (box.left - x0) / size, right: (box.right + 1 - x0) / size };
  })();
  inkCache.set(key, job);
  return job;
}
