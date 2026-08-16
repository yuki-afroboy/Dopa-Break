// ============================================================
// WebAudio 合成SE（音声素材ゼロで成立させる）
// コンボが上がるほどキル音のピッチが上がっていく = ドーパミンの本体
// ============================================================

const NOTES = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this._noise = null;
    this._last = new Map();
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;

    // 全体を軽く潰して「デカい音」に聞かせる
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;
    this.master.connect(comp).connect(this.ctx.destination);

    // ノイズバッファ（爆発用）
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;

    this.ready = true;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  get t() { return this.ctx.currentTime; }

  _ok(key, minGap = 0) {
    if (!this.ready || this.muted) return false;
    if (minGap) {
      const now = this.ctx.currentTime;
      if ((this._last.get(key) || -9) + minGap > now) return false;
      this._last.set(key, now);
    }
    return true;
  }

  _osc(type, freq, t0, dur, gain, { to = null, curve = 'exp', pan = 0 } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      else o.frequency.linearRampToValueAtTime(Math.max(20, to), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    o.connect(g); node.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
    return o;
  }

  _noiseHit(t0, dur, gain, f0, f1, q = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }

  // ---- SE ----

  shoot(pitch = 1) {
    if (!this._ok('shoot', 0.035)) return;
    const t = this.t;
    this._osc('square', 620 * pitch, t, 0.055, 0.06, { to: 200 * pitch });
    this._noiseHit(t, 0.05, 0.05, 2600, 500);
  }

  boom(power = 1) {
    if (!this._ok('boom', 0.028)) return;
    const t = this.t;
    const p = Math.min(2.4, power);
    this._noiseHit(t, 0.16 + p * 0.09, 0.16 * p, 1400 + p * 900, 90, 1.2);
    this._osc('sine', 150 * (1 / (0.7 + p * 0.3)), t, 0.2 + p * 0.1, 0.24 * p, { to: 38 });
  }

  kill(comboIndex = 0, crit = false) {
    if (!this._ok('kill', 0.012)) return;
    const t = this.t;
    const semi = NOTES[Math.min(NOTES.length - 1, comboIndex)];
    const f = 330 * Math.pow(2, semi / 12);
    this._osc(crit ? 'sawtooth' : 'triangle', f, t, crit ? 0.13 : 0.075, crit ? 0.13 : 0.075, { to: f * 2.1 });
    if (crit) this._osc('square', f * 2, t + 0.01, 0.1, 0.06, { to: f * 3 });
  }

  coin() {
    if (!this._ok('coin', 0.03)) return;
    const t = this.t;
    this._osc('square', 1180, t, 0.05, 0.05);
    this._osc('square', 1760, t + 0.045, 0.09, 0.05);
  }

  hurt() {
    if (!this._ok('hurt', 0.1)) return;
    const t = this.t;
    this._osc('sawtooth', 210, t, 0.22, 0.14, { to: 55 });
    this._noiseHit(t, 0.2, 0.1, 700, 100);
  }

  levelup() {
    if (!this._ok('lv')) return;
    const t = this.t;
    [0, 4, 7, 12].forEach((s, i) => {
      this._osc('triangle', 440 * Math.pow(2, s / 12), t + i * 0.045, 0.26, 0.12);
    });
  }

  legendary() {
    if (!this._ok('leg')) return;
    const t = this.t;
    [0, 7, 12, 16, 19, 24].forEach((s, i) => {
      this._osc('sawtooth', 220 * Math.pow(2, s / 12), t + i * 0.06, 0.9, 0.09, { to: 220 * Math.pow(2, (s + 12) / 12) });
    });
    this._noiseHit(t, 0.9, 0.1, 400, 6000, 3);
  }

  pickup(rarityIdx = 0) {
    if (!this._ok('pick')) return;
    const t = this.t;
    const base = 520 + rarityIdx * 90;
    this._osc('square', base, t, 0.08, 0.1);
    this._osc('square', base * 1.5, t + 0.06, 0.16, 0.09);
  }

  event(kind = 0) {
    if (!this._ok('ev')) return;
    const t = this.t;
    this._osc('sawtooth', 300 + kind * 40, t, 0.5, 0.11, { to: 900 + kind * 60 });
    this._osc('square', 150, t, 0.5, 0.08, { to: 450 });
  }

  warn() {
    if (!this._ok('warn', 0.2)) return;
    const t = this.t;
    this._osc('square', 880, t, 0.09, 0.07);
    this._osc('square', 660, t + 0.1, 0.09, 0.06);
  }

  jackpot() {
    if (!this._ok('jack')) return;
    const t = this.t;
    for (let i = 0; i < 12; i++) {
      this._osc('square', 500 * Math.pow(2, (i * 2) / 12), t + i * 0.035, 0.2, 0.07);
    }
  }

  gameover() {
    if (!this._ok('go')) return;
    const t = this.t;
    [0, -3, -7, -12].forEach((s, i) => {
      this._osc('triangle', 400 * Math.pow(2, s / 12), t + i * 0.13, 0.55, 0.12);
    });
  }

  start() {
    if (!this._ok('start')) return;
    const t = this.t;
    [0, 7, 12].forEach((s, i) => this._osc('square', 330 * Math.pow(2, s / 12), t + i * 0.05, 0.2, 0.1));
  }
}

export const SFX = new AudioEngine();

export function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* noop */ } }
}
