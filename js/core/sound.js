// Sound only if the visitor chose it. Every sound is synthesised: no audio files.
let ctx = null, on = false, master = null, broken = false;
const btn = () => document.getElementById('soundToggle');

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || broken) return null;
  try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination); }
  catch (e) { ctx = null; broken = true; return null; }   // no audio device, or the browser refuses: stay silent, never throw into a click
  return ctx;
}
function env(g, t, a, d, peak = 1) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function noise(len) { const b = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }

const voices = {
  drop() { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.12); env(g, t, 0.004, 0.22, 0.9); o.connect(g).connect(master); o.start(t); o.stop(t + 0.3); },
  pour() { const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise(1.2); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1600, t + 1.1); f.Q.value = 0.8; env(g, t, 0.15, 0.95, 0.35); s.connect(f).connect(g).connect(master); s.start(t); },
  twist() { const t = ctx.currentTime; for (let i = 0; i < 5; i++) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise(0.03); f.type = 'highpass'; f.frequency.value = 3000; env(g, t + i * 0.035, 0.002, 0.025, 0.5); s.connect(f).connect(g).connect(master); s.start(t + i * 0.035); } },
  stamp() { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12); env(g, t, 0.003, 0.16, 1); o.connect(g).connect(master); o.start(t); o.stop(t + 0.2); },
  flap() { const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise(0.02); f.type = 'bandpass'; f.frequency.value = 2400; env(g, t, 0.001, 0.018, 0.25); s.connect(f).connect(g).connect(master); s.start(t); },
};
let lastFlap = 0;
export const sound = {
  get on() { return on; },
  set(v) {
    on = !!v && !!ensure(); if (on) ctx.resume();
    const b = btn(); if (b) { b.textContent = on ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(on)); }
  },
  play(name) {
    if (!on || !ensure()) return;
    if (name === 'flap') { const now = performance.now(); if (now - lastFlap < 40) return; lastFlap = now; }
    try { voices[name] && voices[name](); } catch (e) { /* a sound must never break the page */ }
  },
};
