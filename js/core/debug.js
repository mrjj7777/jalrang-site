// Press Shift+D (or open the page with #debug at the end of its link) to see what this device
// can do and what went wrong. Nothing is sent anywhere; it is only drawn on the page.
// The WebGL module is loaded only when the panel opens, so the page never depends on it here.
import { ENV } from './env.js';
import { state as WS } from './worlds.js';

export const counters = { frames: 0, rendered: 0 };

export function initDebug() {
  const errors = [];
  addEventListener('error', (e) => errors.push('error: ' + (e.message || (e.target && (e.target.currentSrc || e.target.src)) || 'unknown')), true);
  addEventListener('unhandledrejection', (e) => errors.push('promise: ' + (e.reason && e.reason.message)));
  let box = null, timer = 0, GL = null;
  const open = () => {
    if (box) { box.remove(); box = null; clearInterval(timer); return; }
    box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;max-width:min(560px,90vw);max-height:60vh;overflow:auto;margin:0;padding:10px 12px;background:#1A1612;color:#F7F2E8;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap';
    document.body.appendChild(box);
    if (ENV.gl && !GL) import('../gl/core.js').then((m) => { GL = m.GL; }).catch(() => {});
    timer = setInterval(draw, 500); draw();
  };
  const draw = () => {
    if (!box) return;
    const all = [...document.querySelectorAll('video')], used = all.filter((v) => v.currentSrc || v.error);
    const vids = [...used.map((v) => `${v.currentSrc.split('/').pop() || '-'} rs${v.readyState} ${v.paused ? 'paused' : 'playing'}${v.error ? ' err' + v.error.code : ''}`), `(${all.length - used.length} without a source)`];
    const j = window.__jal || {};
    const e = WS.edge;
    box.textContent = [
      `viewport ${innerWidth}x${innerHeight} client ${document.documentElement.clientWidth} dpr ${devicePixelRatio}`,
      `mode ${ENV.mode} PARITY ${j.PARITY || '-'} lineOwner ${(j.lineOwner && j.lineOwner()) || '-'} reduce ${ENV.reduce} (device ${ENV.systemReduce}, choice ${ENV.motionChoice || '-'})`,
      `class "${document.documentElement.className}"`,
      `worlds: cur ${WS.cur ? WS.cur.id : '-'} prev ${WS.prev ? WS.prev.id : '-'} k ${WS.k.toFixed(3)} p ${WS.p.toFixed(3)} owner ${WS.owner ? WS.owner.id : '-'} edge ${e ? `${e.y} ${e.above}/${e.below}` : '-'} s ${Math.round(WS.s)}`,
      `ticks ${counters.frames} frames rendered ${GL && GL.renderer ? GL.renderer.info.render.frame : counters.rendered}`,
      GL ? `gpu ${GL.gpu || '-'} tier ${GL.tier} fps ${GL.fps}` : 'gl not loaded',
      'gl errors:', ...(GL && GL.errors && GL.errors.length ? GL.errors : ['none']),
      'page errors:', ...(errors.length ? errors.slice(-8) : ['none']),
      'videos:', ...vids,
    ].join('\n');
  };
  if (/debug/.test(location.hash)) { if (document.body) open(); else addEventListener('DOMContentLoaded', open); }
  addEventListener('keydown', (e) => { if (e.shiftKey && (e.key === 'D' || e.key === 'd') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) open(); });
}
