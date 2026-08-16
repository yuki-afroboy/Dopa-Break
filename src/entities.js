// ============================================================
// エンティティ: 敵 / コイン
// ============================================================

import { CFG } from './config.js';
import { rand, TAU, clamp } from './rng.js';

export class Enemy {
  constructor(type, x, y, hpScale = 1, opts = {}) {
    const d = CFG.enemies[type];
    this.type = type;
    this.def = d;
    this.x = x; this.y = y;
    this.r = d.r * (opts.sizeMul || 1);
    this.maxHp = Math.max(1, Math.round(d.hp * hpScale * (opts.hpMul || 1)));
    this.hp = this.maxHp;
    this.speed = d.speed * rand(0.85, 1.15) * (opts.speedMul || 1);
    this.color = d.color;
    this.sides = d.sides;
    this.angle = rand(TAU);
    this.spin = rand(-1.6, 1.6);
    this.kx = 0; this.ky = 0;      // ノックバック速度
    this.hitFlash = 0;
    this.squash = 0;
    this.dead = false;
    this.spawnT = 0;
    this.isBoss = type === 'boss';
    this.isChest = type === 'chest';
    this.reached = false;
    this.charm = 0;                // ブラックホール引き寄せ
  }

  update(dt, cx, cy) {
    this.spawnT += dt;
    const dx = cx - this.x, dy = cy - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const sp = this.speed;
    this.x += (dx / dist) * sp * dt;
    this.y += (dy / dist) * sp * dt;

    this.x += this.kx * dt;
    this.y += this.ky * dt;
    const damp = Math.max(0, 1 - 7 * dt);
    this.kx *= damp; this.ky *= damp;

    this.angle += this.spin * dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.squash = Math.max(0, this.squash - dt * 5.5);
  }

  hit(dmg, fromX, fromY, knock) {
    this.hp -= dmg;
    this.hitFlash = 1;
    this.squash = 1;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    const k = knock / (1 + this.r * 0.02) * (this.isBoss ? 0.25 : 1);
    this.kx += Math.cos(a) * k;
    this.ky += Math.sin(a) * k;
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  draw(ctx, time, lowGlow = false) {
    const appear = clamp(this.spawnT / 0.22, 0, 1);
    const sq = 1 + this.squash * 0.35;
    const sq2 = 1 - this.squash * 0.22;
    const r = this.r * appear;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.scale(sq, sq2);

    const hpRatio = this.hp / this.maxHp;

    // グロー（大量に出るので薄く。積み重なると画面が白飛びする）
    if (!lowGlow || this.hitFlash > 0.2 || this.r > 22) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (lowGlow ? 0.07 : 0.13) + this.hitFlash * 0.45;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      poly(ctx, 0, 0, r * 1.3, this.sides);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;

    // 本体
    ctx.beginPath();
    poly(ctx, 0, 0, r, this.sides);
    ctx.fillStyle = this.hitFlash > 0.35 ? '#ffffff' : shade(this.color, 0.16 + hpRatio * 0.2);
    ctx.fill();
    ctx.lineWidth = this.isBoss ? 5 : 2.5;
    ctx.strokeStyle = this.hitFlash > 0.2 ? '#ffffff' : this.color;
    ctx.stroke();

    // 内側コア（HP表現）
    if (this.maxHp > 1) {
      ctx.beginPath();
      poly(ctx, 0, 0, r * 0.52 * hpRatio, this.sides);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.isChest) {
      ctx.fillStyle = '#3a2a00';
      ctx.fillRect(-r * 0.6, -r * 0.12, r * 1.2, r * 0.24);
    }

    ctx.restore();

    // ボスHPバー
    if (this.isBoss) {
      const w = this.r * 2.4;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 20, w, 8);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillRect(this.x - w / 2, this.y - this.r - 20, w * hpRatio, 8);
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x - w / 2, this.y - this.r - 20, w, 8);
      ctx.restore();
    }
  }
}

export class Coin {
  constructor(x, y, value, target) {
    this.x = x; this.y = y;
    const a = rand(TAU), s = rand(90, 300);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s - 90;
    this.value = value;
    this.t = 0;
    this.delay = rand(0.12, 0.34);
    this.target = target;
    this.dead = false;
    this.r = 6.5;
    this.spin = rand(TAU);
  }

  update(dt, magnet) {
    this.t += dt;
    this.spin += dt * 9;
    if (this.t < this.delay) {
      this.vy += 900 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= Math.max(0, 1 - 3 * dt);
    } else {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = (620 + (this.t - this.delay) * 2100) * magnet;
      this.x += (dx / d) * sp * dt;
      this.y += (dy / d) * sp * dt;
      if (d < 26) this.dead = true;
    }
  }

  draw(ctx) {
    const s = Math.abs(Math.cos(this.spin)) * 0.75 + 0.25;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffcf3f';
    ctx.beginPath(); ctx.arc(0, 0, this.r * 2.1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }
}

export function poly(ctx, x, y, r, sides) {
  if (sides < 3) { ctx.arc(x, y, r, 0, TAU); return; }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// hex色を暗くする（背景に沈める用）
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}
