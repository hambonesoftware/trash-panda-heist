let ac = null, muted = false, lastThud = 0;

export function initAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
}
export const isMuted = () => muted;
export function toggleMute() { muted = !muted; return muted; }

function tone(f, d, type = 'sine', v = 0.12, f2 = 0, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + d + 0.02);
}

function noise(d, v = 0.2, freq = 1200) {
  if (!ac || muted) return;
  const n = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, n, ac.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; fl.type = 'lowpass'; fl.frequency.value = freq; g.gain.value = v;
  src.connect(fl); fl.connect(g); g.connect(ac.destination);
  src.start();
}

export const sfx = {
  stretch(k) { tone(160 + k * 340, 0.07, 'triangle', 0.035, 0); },
  snap() { noise(0.12, 0.2, 2600); tone(520, 0.12, 'triangle', 0.08, 180); },
  thud(power) {
    if (!ac) return;
    if (ac.currentTime - lastThud < 0.06) return;
    lastThud = ac.currentTime;
    tone(120, 0.12, 'sine', Math.min(0.25, Math.max(0.05, power * 0.02)), 55);
  },
  smash() { noise(0.2, 0.22, 2400); tone(170, 0.1, 'square', 0.05, 70); },
  door() { tone(170, 0.45, 'sawtooth', 0.045, 85); noise(0.3, 0.06, 500); },
  spotted() { tone(880, 0.09, 'square', 0.07); tone(1175, 0.12, 'square', 0.07, 0, 0.1); },
  hurt() { tone(320, 0.32, 'sawtooth', 0.14, 70); noise(0.15, 0.2, 700); },
  clang() { tone(1250, 0.28, 'triangle', 0.12, 720); },
  duck() { tone(420, 0.1, 'triangle', 0.06, 200); },
  split() { tone(700, 0.1, 'triangle', 0.08, 1300); },
  grab() { tone(540, 0.07, 'triangle', 0.08, 880); noise(0.08, 0.1, 1800); },
  rip() { noise(0.22, 0.2, 900); tone(210, 0.16, 'sawtooth', 0.05, 90); },
  slip() { tone(900, 0.28, 'sine', 0.1, 180); noise(0.2, 0.16, 600); },
  bank() { [660, 880].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.08)); },
  tick() { tone(1400, 0.03, 'square', 0.03); },
  munch() { noise(0.09, 0.14, 1400); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 0, i * 0.11)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, 'sawtooth', 0.08, 0, i * 0.14)); },
};
