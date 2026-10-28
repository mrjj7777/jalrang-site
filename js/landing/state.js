// The landing's mode and its one set of bottle positions, shared by the 3D scenes and the 2D
// packshots so both versions stand the bottle in exactly the same place.
//   '3d'   wide screen, motion allowed, WebGL 2: the 3D bottles
//   '2d'   a phone or tablet held upright, or no usable WebGL: the same motion with the packshots
//          and two flat images for the cloths
//   'calm' reduced motion (the device's wish, or the visitor's choice): every chapter a finished,
//          designed still, in normal page flow
import { ENV, TEST } from '../core/env.js';

const mode = (() => {
  if (TEST.mode === 'flow') return 'calm';
  if (TEST.mode === '3d' || TEST.mode === '2d') return TEST.mode;
  if (ENV.reduce) return 'calm';
  if (ENV.phone || !ENV.webgl || ENV.saveData || ENV.glOff) return '2d';
  return '3d';
})();

// where the bottle stands in each chapter's stage, as shares of the stage height: its base and
// the top of its cap. Narrow screens stand it lower and smaller, under the words.
// L1 (intro): "base" is the waterline, where the standing bottle's visible bottom rests and where JAL and
// RANG stand (js/landing/intro.js takes the 3D base centre a hair above it).
const GEO = {
  wide: { intro: [0.82, 0.14], ten: [0.84, 0.16], hours: [0.842, 0.14] },
  narrow: { intro: [0.78, 0.37], ten: [0.80, 0.33], hours: [0.80, 0.36] },
};
const narrow = () => document.documentElement.classList.contains('is-narrow');

// The ten packshots are ten photographs, and each bottle stands a little differently in its own file: its axis
// lies between 48.0 % and 52.9 % of the width, its cap top 0.2 % to 1.8 % below the top and its base 0.2 % to
// 1.8 % above the bottom, and its body is 0.39 to 0.45 bottle units from the axis (the bottle is 2.72 units tall).
// Measured on the alpha of assets/img/bottle-NN.webp (all 720 px wide; the same method as hours.js for No. 07):
// [file height in px, axis (share of the width), top, base (shares of the height), body half-width in bottle
// units]. L3's 2D version splits two packshots at the colour line; stood on these marks they meet without a step.
const PK = {
  '01': [971, 0.5013, 0.0041, 0.9949, 0.4298],
  '02': [959, 0.5132, 0.0031, 0.9937, 0.4424],
  '03': [973, 0.5035, 0.0175, 0.9887, 0.4130],
  '04': [1023, 0.4798, 0.0029, 0.9824, 0.3977],
  '05': [967, 0.5187, 0.0021, 0.9979, 0.3997],
  '06': [989, 0.5146, 0.0020, 0.9970, 0.4215],
  '07': [980, 0.5285, 0.0071, 0.9980, 0.4496],
  '08': [1024, 0.4813, 0.0049, 0.9941, 0.3934],
  '09': [973, 0.5062, 0.0051, 0.9887, 0.4192],
  '10': [972, 0.5059, 0.0072, 0.9918, 0.4121],
};

export const L = {
  mode,
  gl: mode === '3d',
  calm: mode === 'calm',
  geo(h, which) {
    const g = GEO[narrow() ? 'narrow' : 'wide'][which];
    return { base: g[0] * h, cap: g[1] * h };
  },
  bottleH(h, which) { const g = this.geo(h, which); return g.base - g.cap; },
  // the measured marks of edition n's packshot (PK above): ratio = width / height of the file
  pk(n) {
    const c = PK[n];
    return c ? { ratio: 720 / c[0], ax: c[1], top: c[2], base: c[3], half: c[4] } : { ratio: 720 / 971, ax: 0.5, top: 0.005, base: 0.995, half: 0.4107 };
  },
  // a packshot standing on the same base with the same height. Without n its bottle is taken to fill 99% of
  // the file; with n (the edition whose file it shows) the bottle itself is measured: the same top and base
  // for every edition, and the box's width is set so that it never depends on the picture having arrived.
  // The caller puts the bottle's axis in the middle (L3: translate by -ax of the width).
  packshot(img, h, which, n) {
    const g = this.geo(h, which), bh = g.base - g.cap;
    const c = n ? this.pk(n) : { ratio: 0, top: 0.005, base: 0.995 }, ih = bh / (c.base - c.top);
    img.style.height = ih.toFixed(1) + 'px';
    img.style.top = (g.cap - c.top * ih).toFixed(1) + 'px';
    if (n) img.style.width = (ih * c.ratio).toFixed(1) + 'px';
  },
};
document.documentElement.classList.add('lm-' + mode);
document.documentElement.classList.toggle('is-calm', mode === 'calm');
