// ============================================================
// Juice レイヤー
// 粒子 / 画面振動 / ヒットストップ / スローモー / フラッシュ /
// 数字ポップ / 衝撃波リング / 落雷 / 破片
// ゲーム性より先に、まずここを気持ちよくする
// ============================================================

import { CFG } from './config.js';
import { rand, randInt, TAU, clamp } from './rng.js';

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.rings = [];
    this.bolts = [];
    this.shake = 0;
    this.shakeAng = 0;
    this.hitstop = 0;
    this.slow = 0;         // 残り秒
    this.slowScale = 1;
    this.flash = { a: 0, color: '#fff' };
    this.chroma = 0;       // 色収差っぽい演出量
    this.zoom = 0;         // カメラのズームパンチ
    this.w = 0; this.h = 0;
  }

  setBounds(w, h) { this.w = w; this.h = h; }

  /** 大きい快感のときだけ画面が「寄る」 */
  zoomPunch(a) { this.zoom = Math.min(0.14, this.zoom + a); }
  get zoomScale() { return 1 + this.zoom; }

  reset() {
    this.parts.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.bolts.length = 0;
    this.shake = 0; this.hitstop = 0; this.slow = 0; this.flash.a = 0; this.chroma = 0; this.zoom = 0;
  }

  // ---- 追加API ----
  addShake(amount) { this.shake = Math.min(46, this.shake + amount); this.shakeAng = rand(TAU); }
  addHitstop(sec) { this.hitstop = Math.max(this.hitstop, sec); }
  addSlow(sec, scale = 0.25) { this.slow = Math.max(this.slow, sec); this.slowScale = scale; }
  addFlash(color, a = 0.35) { if (a > this.flash.a) { this.flash.a = a; this.flash.color = color; } }
  addChroma(v) { this.chroma = Math.min(14, this.chroma + v); }

  burst(x, y, n, opts = {}) {
    const {
      color = '#fff', speed = 260, spread = TAU, dir = 0,
      life = 0.5, size = 3, grav = 0, shrink = 1, glow = true, drag = 2.2,
    } = opts;
    const room = CFG.fx.maxParticles - this.parts.length;
    n = Math.min(n, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1.25);
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rand(0.6, 1.3), max: life, color, size: size * rand(0.6, 1.5),
        grav, shrink, glow, drag, rot: rand(TAU), vr: rand(-9, 9),
        shape: opts.shape || 'spark',
      });
    }
  }

  shards(x, y, n, color, sides = 4, size = 5) {
    this.burst(x, y, n, { color, speed: 300, life: 0.7, size, grav: 420, shape: 'shard', drag: 1.1 });
  }

  text(x, y, str, opts = {}) {
    const { color = '#fff', size = 22, life = 0.8, vy = -70, bold = true, shadow = true, scale = 1.35 } = opts;
    // 画面外に出た数字は「見えない報酬」= 無意味なので必ず画面内に収める。
    // 出現直後は scale 倍に膨らむうえ、画面振動とズームでさらに外へ寄るので余裕を持たせる
    if (this.w) {
      const half = str.length * size * scale * 0.32;
      const pad = Math.min(this.w * 0.45, half + 26);
      x = clamp(x, pad, this.w - pad);
      y = clamp(y, 46, this.h - 46);
    }
    if (this.texts.length > 34) this.texts.shift();
    this.texts.push({ x, y, str, color, size, life, max: life, vy, bold, shadow, scale, t: 0 });
  }

  ring(x, y, r, opts = {}) {
    const { color = '#fff', life = 0.4, width = 4, grow = 2.6, fill = 0 } = opts;
    this.rings.push({ x, y, r0: r * 0.25, r, color, life, max: life, width, grow, fill });
  }

  bolt(x1, y1, x2, y2, color = '#bfe9ff', life = 0.22) {
    const pts = [];
    const seg = 9;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const off = i === 0 || i === seg ? 0 : rand(-26, 26);
      const nx = -(y2 - y1), ny = x2 - x1;
      const len = Math.hypot(nx, ny) || 1;
      pts.push({ x: x1 + (x2 - x1) * t + (nx / len) * off, y: y1 + (y2 - y1) * t + (ny / len) * off });
    }
    this.bolts.push({ pts, life, max: life, color });
  }

  // ---- 更新 ----
  update(dt) {
    // 粒子
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.t += dt;
      t.y += t.vy * dt; t.vy *= Math.max(0, 1 - 2.6 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.life <= 0) this.bolts.splice(i, 1);
    }

    this.shake = Math.max(0, this.shake - this.shake * CFG.fx.shakeDecay * dt - 12 * dt);
    this.flash.a = Math.max(0, this.flash.a - dt * 2.6);
    this.chroma = Math.max(0, this.chroma - dt * 22);
    this.zoom = Math.max(0, this.zoom - this.zoom * 7 * dt - 0.06 * dt);
  }

  shakeOffset() {
    if (this.shake < 0.2) return { x: 0, y: 0 };
    this.shakeAng += 2.1;
    return {
      x: Math.cos(this.shakeAng) * this.shake * rand(0.5, 1),
      y: Math.sin(this.shakeAng * 1.7) * this.shake * rand(0.5, 1),
    };
  }

  // ---- 描画 ----
  drawWorld(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // リング
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = r.r0 + (r.r * r.grow - r.r0) * (1 - Math.pow(1 - t, 2.4));
      const a = Math.pow(1 - t, 1.6);
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.75) + 0.6;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      if (r.fill) {
        ctx.globalAlpha = a * r.fill;
        ctx.fillStyle = r.color;
        ctx.fill();
      }
    }

    // 雷
    for (const b of this.bolts) {
      const a = b.life / b.max;
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.color;
      ctx.lineCap = 'round';
      for (const w of [11, 4.5, 1.6]) {
        ctx.lineWidth = w * a;
        ctx.beginPath();
        ctx.moveTo(b.pts[0].x, b.pts[0].y);
        for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i].x, b.pts[i].y);
        ctx.stroke();
      }
    }

    // 粒子
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * (p.shrink ? a : 1);
      if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
        ctx.restore();
      } else if (p.shape === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, s * 2, 0, TAU); ctx.stroke();
      } else {
        const st = Math.hypot(p.vx, p.vy) * 0.012;
        if (st > 1.2) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillRect(-s * st, -s * 0.5, s * st * 2, s);
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      // 出た瞬間デカく → すぐ縮む（ポップ感）
      const pop = k < 0.16 ? 1 + (1 - k / 0.16) * (t.scale - 1) : 1 - k * 0.12;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `${t.bold ? '900' : '700'} ${t.size * pop}px ui-rounded, "Arial Black", Impact, system-ui, sans-serif`;
      if (t.shadow) {
        ctx.lineWidth = Math.max(3, t.size * pop * 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(t.str, t.x, t.y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }

  drawFlash(ctx, w, h) {
    if (this.flash.a <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.flash.a;
    ctx.fillStyle = this.flash.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
