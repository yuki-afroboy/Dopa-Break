// ============================================================
// DOPA BREAK - ゲーム本体
// ============================================================

import { CFG } from './config.js';
import { rand, randInt, chance, pick, weighted, clamp, lerp, TAU } from './rng.js';
import { SFX, vibrate } from './audio.js';
import { FX } from './fx.js';
import { Enemy, Coin, poly } from './entities.js';
import { rollChoices } from './upgrades.js';
import { EventManager, EVENTS } from './events.js';
import { Meta } from './meta.js';

export const STATE = { TITLE: 'title', PLAY: 'play', LEVELUP: 'levelup', RESULT: 'result' };

export class Game {
  constructor(canvas, ctx, ui) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.ui = ui;
    this.fx = new FX();
    this.events = new EventManager();
    this.w = 0; this.h = 0;
    this.state = STATE.TITLE;
    this.pointer = { x: 0, y: 0, down: false, active: false };
    this.time = 0;          // 実時間（演出用）
    this.timers = [];
    this.taken = {};
    this.resetRun(true);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.cx = w / 2; this.cy = h / 2;
    this.coinTarget = { x: Math.min(120, w * 0.24), y: Math.max(60, h * 0.06) };
    this.fx.setBounds(w, h);
    if (this.state === STATE.TITLE) this.seedTitleEnemies();
  }

  // ---------------------------------------------------------
  // ラン初期化
  // ---------------------------------------------------------
  resetRun(silent = false) {
    const S = { ...CFG.base };
    S.feverGain = CFG.fever.gain;
    S.enemySlow = 1;
    S.lightningCombo = 0;
    S.lightningCount = 0;
    S.critBomb = 0;
    S.splitCount = 0;
    S.chainDepth = 1;
    S.feverBonus = 0;
    S.feverChain = 0;
    S.coinScore = 0;
    S.damage += Meta.lv('power');
    S.coinMul *= 1 + 0.25 * Meta.lv('greed');
    this.stats = S;
    this.luck = Meta.lv('luck');

    this.enemies = [];
    this.coins = [];
    this.timers = [];
    this.taken = {};

    this.score = 0; this.displayScore = 0;
    this.coinsEarned = 0;
    this.destroyed = 0;
    this.combo = 0; this.maxCombo = 0; this.comboTimer = 0;
    this.level = 1; this.exp = 0; this.expNeed = CFG.level.need(1);
    this.pendingLevels = 0;
    this.maxHp = CFG.run.coreHp; this.hp = this.maxHp;
    this.timeLeft = CFG.run.time;
    this.elapsed = 0;
    this.fever = 0; this.feverT = 0;
    this.shotAcc = 0; this.shotCount = 0; this.queuedShots = 0;
    this.explosionBudget = 0;
    this.bossAlive = false;
    this.firstKill = false;
    this._lastPopT = -9; this._lastCritPopT = -9;
    this.tutorialDone = false;
    this.fx.reset();
    this.events.reset();
    if (!silent) this.ui.clearBanners();
  }

  seedTitleEnemies() {
    this.enemies.length = 0;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand(-0.3, 0.3);
      const rr = Math.min(this.w, this.h) * rand(0.28, 0.44);
      const e = new Enemy('cube', this.cx + Math.cos(a) * rr, this.cy + Math.sin(a) * rr, 1);
      e.speed = 6;
      this.enemies.push(e);
    }
  }

  // ---------------------------------------------------------
  // ステート遷移
  // ---------------------------------------------------------
  goTitle() {
    this.state = STATE.TITLE;
    this.resetRun();
    this.seedTitleEnemies();
    this.ui.showTitle(this);
  }

  startRun() {
    this.resetRun();
    this.state = STATE.PLAY;
    this.ui.hideTitle();
    this.ui.hideResult();
    SFX.start();
    // 開始直後から壊すものが「指の届く位置に」ある（退屈な0秒を作らない）
    for (let i = 0; i < 9; i++) this.spawnEnemy(rand(0.34, 0.62));
    // HEAD START
    const hs = Meta.lv('start');
    for (let i = 0; i < hs; i++) this.pendingLevels++;
    if (hs) this.tryLevelUp();
    this.fx.addFlash('#6cf', 0.3);
  }

  gameOver(reason) {
    if (this.state === STATE.RESULT) return;
    this.state = STATE.RESULT;
    this.fx.addSlow(0.9, 0.16);
    this.fx.addShake(26);
    this.fx.addFlash('#fff', 0.5);
    SFX.gameover();
    vibrate([40, 60, 120]);
    Meta.addCoins(Math.floor(this.coinsEarned));
    const res = {
      score: Math.floor(this.score),
      maxCombo: this.maxCombo,
      destroyed: this.destroyed,
      level: this.level,
      coins: Math.floor(this.coinsEarned),
      reason,
    };
    const info = Meta.submit(res);
    this.ui.showResult(res, info, this);
  }

  // ---------------------------------------------------------
  // メインループ
  // ---------------------------------------------------------
  update(rawDt) {
    this.time += rawDt;

    // ヒットストップ（実時間で消化）
    if (this.fx.hitstop > 0) {
      this.fx.hitstop -= rawDt;
      this.fx.update(rawDt * 0.1);
      return;
    }

    let scale = 1;
    if (this.fx.slow > 0) {
      this.fx.slow -= rawDt;
      scale = this.fx.slowScale;
    }
    const dt = Math.min(0.05, rawDt) * scale;

    this.fx.update(dt);
    this.runTimers(dt);
    this.explosionBudget = 60;

    if (this.state === STATE.TITLE) { this.updateTitle(dt); return; }
    if (this.state === STATE.LEVELUP) { this.updateEntitiesIdle(dt); return; }
    if (this.state === STATE.RESULT) { this.updateEntitiesIdle(dt); return; }

    this.elapsed += dt;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.gameOver('TIME UP'); return; }

    this.events.update(dt, this);
    const mods = this.events.mods();

    this.updateFever(dt);
    this.updateSpawn(dt, mods);
    this.updateFiring(dt, mods);
    this.updateEnemies(dt);
    this.updateCoins(dt);

    // コンボ減衰
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo();
    }

    if (mods.meteor) {
      this.meteorAcc = (this.meteorAcc || 0) + dt;
      while (this.meteorAcc > 0.22) {
        this.meteorAcc -= 0.22;
        const x = rand(this.w * 0.08, this.w * 0.92);
        const y = rand(this.h * 0.12, this.h * 0.88);
        this.explode(x, y, this.stats.blastRadius * 1.5, this.stats.damage * 2, { color: '#ff8a3d', power: 1.4 });
      }
    }

    this.displayScore += (this.score - this.displayScore) * Math.min(1, dt * 12);
    this.ui.update(this);
  }

  updateTitle(dt) {
    for (const e of this.enemies) { e.update(dt, this.cx, this.cy); }
    // タイトルの敵が中心に着いたら外へ戻す
    for (const e of this.enemies) {
      if (Math.hypot(e.x - this.cx, e.y - this.cy) < 70) {
        const a = rand(TAU);
        const rr = Math.min(this.w, this.h) * 0.45;
        e.x = this.cx + Math.cos(a) * rr; e.y = this.cy + Math.sin(a) * rr;
      }
    }
  }

  updateEntitiesIdle(dt) {
    for (const c of this.coins) c.update(dt, this.stats.magnet);
    this.coins = this.coins.filter((c) => !c.dead);
  }

  runTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  /** 触れた「その瞬間」に1発出す（連射待ちのラグを消す）。
   *  ホールド状態に依存させないので、素早い連打でもちゃんと撃てる。 */
  primeShot() { this.queuedShots = Math.min(3, (this.queuedShots || 0) + 1); }

  // ---------------------------------------------------------
  // FEVER
  // ---------------------------------------------------------
  updateFever(dt) {
    if (this.feverT > 0) {
      this.feverT -= dt;
      if (this.feverT <= 0) {
        this.feverT = 0;
        this.ui.banner('FEVER END', '#ffa', '');
      }
    }
  }

  addFever(n) {
    if (this.feverT > 0) return;
    this.fever += n * this.stats.feverGain;
    if (this.fever >= CFG.fever.max) {
      this.fever = 0;
      this.feverT = CFG.fever.duration + this.stats.feverBonus;
      this.ui.banner('FEVER!!', '#ff4fd8', '自動連射 + 全弾クリティカル');
      SFX.jackpot();
      vibrate([25, 30, 25, 30, 60]);
      this.fx.addFlash('#ff4fd8', 0.55);
      this.fx.addShake(22);
      this.fx.addSlow(0.35, 0.25);
      this.fx.zoomPunch(0.1);
      for (let i = 0; i < 3; i++) {
        this.fx.ring(this.cx, this.cy, 60 + i * 40, { color: '#ff4fd8', life: 0.8, width: 8, grow: 6 });
      }
    }
  }

  get inFever() { return this.feverT > 0; }

  // ---------------------------------------------------------
  // 敵の出現
  // ---------------------------------------------------------
  updateSpawn(dt, mods) {
    if (this.enemies.length > 300) return;
    const rate = CFG.spawn.ratePerSec(this.elapsed) * mods.spawnMul;
    this.spawnAcc = (this.spawnAcc || 0) + dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawnEnemy(1, mods);
    }
  }

  spawnEnemy(distMul = 1, mods = { hpMul: 1 }) {
    const table = CFG.spawn.table.filter((t) => this.elapsed >= t.from);
    const type = weighted(table).type;
    const a = rand(TAU);
    const rx = (this.w / 2 + 50) * distMul;
    const ry = (this.h / 2 + 50) * distMul;
    const x = this.cx + Math.cos(a) * rx;
    const y = this.cy + Math.sin(a) * ry;
    const e = new Enemy(type, x, y, CFG.spawn.hpScale(this.elapsed), { hpMul: mods.hpMul || 1 });
    e.speed *= this.stats.enemySlow;
    this.enemies.push(e);
    return e;
  }

  spawnSpecial(type, count = 1, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = rand(TAU);
      const x = this.cx + Math.cos(a) * (this.w / 2 + 60);
      const y = this.cy + Math.sin(a) * (this.h / 2 + 60);
      const e = new Enemy(type, x, y, type === 'boss' ? 1 + this.elapsed / 26 : 1, opts);
      e.speed *= this.stats.enemySlow;
      this.enemies.push(e);
      this.fx.ring(x, y, 60, { color: e.color, life: 0.6, width: 6, grow: 2.4 });
    }
  }

  // ---------------------------------------------------------
  // 発射
  // ---------------------------------------------------------
  updateFiring(dt, mods) {
    const S = this.stats;
    const fever = this.inFever;
    const rate = S.fireRate * (fever ? CFG.fever.fireRateMul : 1);

    // タップ（押した瞬間）の分は、ホールド状態と無関係に必ず撃つ
    while (this.queuedShots > 0) {
      this.queuedShots--;
      this.fire(this.pointer.x, this.pointer.y, mods);
      this.shotAcc = 0;
    }

    const wantFire = this.pointer.down || fever;
    if (!wantFire) { this.shotAcc = Math.min(this.shotAcc, 1); return; }

    this.shotAcc += dt * rate;
    let guard = 0;
    while (this.shotAcc >= 1 && guard++ < 6) {
      this.shotAcc -= 1;
      let tx = this.pointer.x, ty = this.pointer.y;
      if (!this.pointer.down) {
        // FEVER 中の自動照準（一番近い敵 or ランダム）
        const t = this.pickAutoTarget();
        if (!t) break;
        tx = t.x; ty = t.y;
      }
      this.fire(tx, ty, mods);
    }
  }

  pickAutoTarget() {
    if (!this.enemies.length) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < this.enemies.length; i += 1) {
      const e = this.enemies[i];
      const d = Math.hypot(e.x - this.cx, e.y - this.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return chance(0.4) ? pick(this.enemies) : best;
  }

  fire(x, y, mods) {
    const S = this.stats;
    this.shotCount++;
    const fever = this.inFever;
    let radius = S.blastRadius * (fever ? CFG.fever.radiusMul : 1);
    let dmg = S.damage;
    let nuke = false;

    if (S.nukeEvery && this.shotCount % S.nukeEvery === 0) {
      nuke = true; radius *= 3.1; dmg *= 6;
    }

    const critP = clamp(S.critChance + (mods ? mods.critAdd : 0) + (fever ? 1 : 0), 0, 1);
    const shots = S.shots;

    SFX.shoot(1 + Math.min(0.6, this.combo * 0.006) + (nuke ? -0.3 : 0));

    for (let i = 0; i < shots; i++) {
      let ox = 0, oy = 0;
      if (shots > 1) {
        const a = (i / shots) * TAU + this.time * 2.2;
        const d = S.spread * (0.55 + 0.45 * (i % 2));
        ox = Math.cos(a) * d; oy = Math.sin(a) * d;
      }
      const crit = chance(critP);
      this.explode(x + ox, y + oy, radius * (i === 0 ? 1 : 0.85), dmg, {
        crit, power: nuke ? 3 : 1, color: nuke ? '#ffcf3f' : (crit ? '#ffe14d' : '#7fe9ff'), nuke,
      });
    }

    if (nuke) {
      this.fx.addFlash('#ffcf3f', 0.55);
      this.fx.addShake(24);
      this.fx.addSlow(0.14, 0.3);
      this.fx.zoomPunch(0.07);
      this.fx.text(x, y - 60, 'NUKE!', { color: '#ffcf3f', size: 34, life: 0.7, vy: -60, scale: 2 });
      vibrate(50);
    }

    // 照準の反動
    this.recoil = 1;
  }

  // ---------------------------------------------------------
  // 爆発
  // ---------------------------------------------------------
  explode(x, y, radius, damage, opts = {}) {
    if (this.explosionBudget-- <= 0) return;
    const S = this.stats;
    const {
      crit = false, depth = 0, color = '#7fe9ff', power = 1, nuke = false, silent = false,
    } = opts;

    const dmg = Math.max(1, Math.round(damage * (crit ? S.critMul : 1)));

    // --- 見た目 ---
    this.fx.ring(x, y, radius, { color, life: 0.34 + power * 0.06, width: 5 + power * 3, grow: 1.15, fill: 0.1 });
    // 中心の白い閃光（「当たった」瞬間を最短で伝える）
    this.fx.ring(x, y, radius * 0.5, { color: '#ffffff', life: 0.13 + power * 0.04, width: 2, grow: 1.5, fill: 0.7 });
    const pn = Math.min(34, 8 + radius * 0.12 + power * 8);
    this.fx.burst(x, y, pn, { color, speed: 200 + radius * 2.4, life: 0.32 + power * 0.1, size: 2.4 + power, drag: 3 });
    if (!silent) SFX.boom(power * (crit ? 1.4 : 1));
    this.fx.addShake(1.6 + power * 2.2 + (crit ? 2 : 0));
    if (crit) this.fx.addChroma(4);

    // --- 判定 ---
    let hits = 0, kills = 0;
    const pull = S.pullForce;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius + e.r) {
        // ブラックホールは範囲外も少し引く
        if (pull && d < radius * 2.2) {
          const f = (pull * 0.35) / Math.max(40, d);
          e.kx -= (dx / (d || 1)) * f * 12;
          e.ky -= (dy / (d || 1)) * f * 12;
        }
        continue;
      }
      hits++;
      if (pull) {
        const f = pull / Math.max(30, d);
        e.kx -= (dx / (d || 1)) * f * 10;
        e.ky -= (dy / (d || 1)) * f * 10;
      }
      const died = e.hit(dmg, x, y, S.knockback * (nuke ? 2 : 1));
      if (died) {
        kills++;
        this.killEnemy(e, i, { crit, depth, color });
      }
    }

    if (hits > 0) {
      this.fx.addHitstop(clamp(0.012 + hits * 0.002 + (crit ? 0.02 : 0), 0, 0.075));
    }

    // --- 派生 ---
    if (S.shockwave && depth === 0) {
      this.after(0.07, () => {
        this.fx.ring(x, y, radius * 1.6, { color: '#9fd8ff', life: 0.4, width: 3, grow: 1.8 });
        this.explode(x, y, radius * 1.75, Math.max(1, Math.round(damage * 0.5 * S.shockwave)), {
          depth: depth + 1, color: '#9fd8ff', power: 0.6, silent: true,
        });
      });
    }
    if (S.critBomb && crit && depth === 0) {
      this.after(0.06, () => {
        this.explode(x, y, radius * (1.7 + S.critBomb * 0.2), damage * 1.5, {
          depth: depth + 1, color: '#ffe14d', power: 1.6,
        });
      });
    }
    if (S.splitCount && depth === 0) {
      for (let i = 0; i < S.splitCount; i++) {
        const a = rand(TAU), d = radius * rand(0.8, 1.7);
        this.after(0.05 + i * 0.03, () => {
          this.explode(x + Math.cos(a) * d, y + Math.sin(a) * d, radius * 0.55, Math.max(1, damage * 0.6), {
            depth: depth + 1, color: '#c07bff', power: 0.7, silent: true,
          });
        });
      }
    }
  }

  // ---------------------------------------------------------
  // 撃破
  // ---------------------------------------------------------
  killEnemy(e, index, ctx = {}) {
    const S = this.stats;
    const def = e.def;
    this.enemies.splice(index, 1);
    this.destroyed++;

    // コンボ
    this.combo++;
    this.comboTimer = S.comboTime;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const tierIdx = this.comboTierIndex();
    const tier = CFG.comboTiers[tierIdx];

    const mods = this.events.mods();
    const gained = def.score * tier.mul * S.scoreMul * mods.scoreMul * (ctx.crit ? 1.5 : 1) * (this.inFever ? CFG.fever.scoreMul : 1);
    this.score += gained;

    // EXP
    this.exp += def.exp * S.expMul;
    if (this.exp >= this.expNeed) this.levelUp();

    // FEVER
    this.addFever(1 + (e.isBoss ? 25 : 0));

    // 演出
    const big = e.isBoss || e.isChest;
    const pc = clamp(8 + tierIdx * 4 + def.r * 0.35, 8, 46);
    this.fx.shards(e.x, e.y, pc, def.color, def.sides, 3 + def.r * 0.12);
    this.fx.burst(e.x, e.y, Math.floor(pc * 0.6), { color: '#ffffff', speed: 320, life: 0.24, size: 2.2 });
    this.fx.ring(e.x, e.y, e.r * 1.2, { color: def.color, life: 0.3, width: 3, grow: 2.2 });
    SFX.kill(Math.min(15, tierIdx * 2 + Math.min(6, (this.combo / 6) | 0)), ctx.crit);

    // 数字ポップ。
    // 撃破数で間引くと高コンボ時に秒間数十個出て画面が数字で埋まるので、
    // 「1秒あたり何個まで出すか」で制限する（報酬は読めて初めて報酬になる）
    const gap = this.combo < 25 ? 0.045 : this.combo < 100 ? 0.1 : 0.17;
    if (big || this.time - (this._lastPopT || -9) >= gap) {
      this._lastPopT = this.time;
      this.fx.text(e.x, e.y - e.r, `+${Math.floor(gained)}`, {
        color: ctx.crit ? '#ffe14d' : '#ffffff',
        size: clamp(17 + tierIdx * 4 + (ctx.crit ? 6 : 0), 16, 42),
        life: 0.62, vy: -85,
      });
    }
    if (ctx.crit && this.time - (this._lastCritPopT || -9) >= 0.42) {
      this._lastCritPopT = this.time;
      this.fx.text(e.x + rand(-14, 14), e.y - e.r - 26, 'CRITICAL', { color: '#ffe14d', size: 15, life: 0.5 });
    }

    // コイン
    let coinN = def.coin * S.coinMul * mods.coinMul;
    if (mods.dropAll) coinN = Math.max(coinN, 1.5 * S.coinMul);
    let n = Math.floor(coinN);
    if (chance(coinN - n)) n++;
    n = Math.min(n, 26);
    for (let i = 0; i < n; i++) this.coins.push(new Coin(e.x, e.y, 1, this.coinTarget));

    // 連鎖爆発
    if (S.chainChance > 0 && (ctx.depth || 0) < S.chainDepth && chance(S.chainChance + (this.inFever ? S.feverChain : 0))) {
      this.after(0.03, () => {
        this.explode(e.x, e.y, S.blastRadius * S.chainRadiusMul, Math.max(1, S.damage), {
          depth: (ctx.depth || 0) + 1, color: '#ff8a3d', power: 1.1,
        });
      });
    }

    // 落雷
    if (S.lightningCombo && this.combo % S.lightningCombo === 0) this.lightning(S.lightningCount);

    // ボス / 宝箱
    if (e.isBoss) this.onBossKill(e);
    if (e.isChest) this.onChestKill(e);

    // 最初の1体だけ特別に褒める（0-10秒の快感を確実にする）
    if (!this.firstKill) {
      this.firstKill = true;
      this.fx.text(this.cx, this.cy - 90, 'NICE!!', { color: '#7fe9ff', size: 40, life: 0.9, vy: -50 });
      this.fx.addFlash('#7fe9ff', 0.22);
      vibrate(12);
    }

    // コンボ節目の演出
    if (tierIdx > (this.lastTier || 0)) {
      this.lastTier = tierIdx;
      this.onComboTier(tierIdx, tier);
    }
  }

  comboTierIndex() {
    let idx = 0;
    for (let i = 0; i < CFG.comboTiers.length; i++) if (this.combo >= CFG.comboTiers[i].at) idx = i;
    return idx;
  }

  onComboTier(idx, tier) {
    if (idx <= 0) return;
    const label = `${tier.name}  x${tier.mul}`;
    // 画面幅からはみ出さない文字サイズにする
    const size = Math.min(30 + idx * 4, (this.w * 0.86) / (label.length * 0.56));
    this.fx.text(this.cx, this.cy - this.h * 0.2, label, {
      color: ['#fff', '#7fe9ff', '#7dff9b', '#ffe14d', '#ff8a3d', '#ff5aa8', '#c07bff', '#ffcf3f'][idx] || '#fff',
      size, life: 1.0, vy: -30, scale: 1.7,
    });
    this.fx.addFlash('#ffffff', 0.1 + idx * 0.03);
    this.fx.addShake(6 + idx * 2);
    this.fx.zoomPunch(0.02 + idx * 0.008);
    for (let i = 0; i < 2; i++) {
      this.fx.ring(this.cx, this.cy, 80 + i * 60, { color: '#ffffff', life: 0.5, width: 4, grow: 4 });
    }
    if (idx >= 4) { SFX.jackpot(); this.fx.addSlow(0.2, 0.3); vibrate([15, 25, 15]); }
  }

  breakCombo() {
    // 「切れた」ことは伝えるが、罰は与えない（ストレスにしない）
    if (this.combo >= 10) {
      this.fx.text(this.cx, this.cy + this.h * 0.16, `COMBO ${this.combo} END`, {
        color: '#8fa6c0', size: 20, life: 0.7, vy: -20, scale: 1.1,
      });
      this.fx.ring(this.cx, this.cy, 90, { color: '#8fa6c0', life: 0.35, width: 2, grow: 1.6 });
    }
    this.combo = 0;
    this.lastTier = 0;
  }

  lightning(count = 1) {
    const n = Math.max(1, count);
    for (let i = 0; i < n; i++) {
      const e = this.enemies.length ? pick(this.enemies) : null;
      const tx = e ? e.x : rand(this.w), ty = e ? e.y : rand(this.h);
      this.after(i * 0.045, () => {
        this.fx.bolt(tx + rand(-40, 40), -30, tx, ty, '#cfe9ff', 0.24);
        this.fx.addFlash('#bfe0ff', 0.14);
        this.explode(tx, ty, this.stats.blastRadius * 1.35, Math.max(2, this.stats.damage * 2), {
          color: '#cfe9ff', power: 1.3, silent: i > 0,
        });
      });
    }
    vibrate(18);
  }

  onBossKill(e) {
    this.addTime(10);
    this.ui.banner('BOSS DOWN!  TIME +10', '#ff4d4d', 'JACKPOT');
    SFX.jackpot();
    this.fx.addSlow(0.5, 0.18);
    this.fx.addFlash('#fff', 0.6);
    this.fx.addShake(34);
    this.fx.zoomPunch(0.13);
    vibrate([30, 40, 30, 40, 90]);
    for (let i = 0; i < 5; i++) {
      this.after(i * 0.08, () => this.fx.ring(e.x, e.y, 70 + i * 50, { color: '#ffcf3f', life: 0.7, width: 7, grow: 4 }));
    }
    this.fx.text(this.cx, this.cy - 60, 'JACKPOT!!', { color: '#ffcf3f', size: 52, life: 1.4, vy: -26, scale: 2.4 });
    this.bossAlive = false;
    this.score += 3000 * this.stats.scoreMul;
  }

  onChestKill(e) {
    this.ui.banner('TREASURE!', '#ffe14d', '');
    SFX.jackpot();
    this.fx.addFlash('#ffe14d', 0.4);
    this.fx.addShake(18);
    for (let i = 0; i < 26; i++) this.coins.push(new Coin(e.x, e.y, 1, this.coinTarget));
    this.fx.text(e.x, e.y - 40, 'BIG BONUS', { color: '#ffe14d', size: 34, life: 1.1, vy: -40, scale: 2 });
    this.addFever(12);
  }

  addTime(n) {
    this.timeLeft = clamp(this.timeLeft + n, 0, CFG.run.maxTime);
    if (n > 0) this.fx.text(this.cx, 120, `TIME +${n}`, { color: '#7dff9b', size: 30, life: 1.0, vy: -40 });
    else this.fx.text(this.cx, 120, `TIME ${n}`, { color: '#ff6b6b', size: 26, life: 1.0, vy: -40 });
  }

  // ---------------------------------------------------------
  // 敵・コインの更新
  // ---------------------------------------------------------
  updateEnemies(dt) {
    const cr = CFG.run.coreRadius;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this.cx, this.cy);
      const d = Math.hypot(e.x - this.cx, e.y - this.cy);
      if (d < cr + e.r * 0.7) {
        this.enemies.splice(i, 1);
        this.onCoreHit(e);
      }
    }
  }

  onCoreHit(e) {
    if (e.def.dmg <= 0) return;
    this.hp -= e.def.dmg;
    this.fx.addShake(12);
    this.fx.addFlash('#ff3355', 0.3);
    this.fx.burst(e.x, e.y, 16, { color: '#ff3355', speed: 240, life: 0.4, size: 3 });
    this.fx.ring(this.cx, this.cy, CFG.run.coreRadius * 1.4, { color: '#ff3355', life: 0.4, width: 5, grow: 2.4 });
    SFX.hurt();
    vibrate(35);
    // ストレスにしすぎない: コンボは全損ではなく減衰
    this.combo = Math.floor(this.combo * 0.6);
    this.lastTier = this.comboTierIndex();
    if (this.hp <= 0) { this.hp = 0; this.gameOver('CORE DOWN'); }
  }

  updateCoins(dt) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      const wasFlying = c.t >= c.delay;
      c.update(dt, this.stats.magnet);
      // MIDAS: コインが敵に触れると爆発
      if (this.stats.coinDamage && wasFlying && (i % 2 === 0)) {
        for (const e of this.enemies) {
          if (Math.hypot(e.x - c.x, e.y - c.y) < e.r + 10) {
            c.dead = true;
            this.explode(c.x, c.y, 44, this.stats.coinDamage, { color: '#ffcf3f', power: 0.7, silent: true });
            break;
          }
        }
      }
      if (c.dead) {
        this.coins.splice(i, 1);
        this.coinsEarned += c.value;
        if (this.stats.coinScore) this.score += 50 * this.stats.scoreMul;
        if (i % 3 === 0) SFX.coin();
      }
    }
  }

  // ---------------------------------------------------------
  // レベルアップ
  // ---------------------------------------------------------
  levelUp() {
    while (this.exp >= this.expNeed) {
      this.exp -= this.expNeed;
      this.level++;
      this.expNeed = CFG.level.need(this.level);
      this.pendingLevels++;
    }
    this.tryLevelUp();
  }

  tryLevelUp() {
    if (this.pendingLevels <= 0) return;
    if (this.state !== STATE.PLAY) return;
    this.state = STATE.LEVELUP;
    const choices = rollChoices(this.taken, this.level, this.luck, 3);
    const hasLegend = choices.some((c) => c.r === 'LEGENDARY');
    SFX.levelup();
    if (hasLegend) { SFX.legendary(); this.fx.addFlash('#ffc93f', 0.6); this.fx.addShake(20); vibrate([20, 40, 20, 40, 80]); }
    this.fx.addFlash('#ffffff', 0.3);
    this.fx.addShake(10);
    this.fx.zoomPunch(hasLegend ? 0.12 : 0.05);
    for (let i = 0; i < 3; i++) {
      this.fx.ring(this.cx, this.cy, 50 + i * 55, { color: hasLegend ? '#ffc93f' : '#7fe9ff', life: 0.7, width: 6, grow: 5 });
    }
    this.ui.showCards(choices, hasLegend, (u) => this.pickUpgrade(u));
  }

  pickUpgrade(u) {
    this.taken[u.id] = (this.taken[u.id] || 0) + 1;
    u.apply(this.stats, this);
    SFX.pickup(['COMMON', 'RARE', 'EPIC', 'LEGENDARY'].indexOf(u.r));
    this.pendingLevels--;
    this.fx.text(this.cx, this.cy - 40, u.name, { color: '#fff', size: 30, life: 0.9, vy: -40, scale: 1.8 });
    this.fx.addFlash('#ffffff', 0.25);
    this.fx.addSlow(0.25, 0.35);
    this.state = STATE.PLAY;
    this.ui.hideCards();
    if (this.pendingLevels > 0) this.after(0.32, () => this.tryLevelUp());
  }

  // ---------------------------------------------------------
  // イベントコールバック
  // ---------------------------------------------------------
  onEventWarn(def) {
    this.ui.warn(def.label, 3, def.color);
  }

  onEventWarnTick(def, sec) {
    SFX.warn();
    this.ui.warn(def.label, sec, def.color);
    this.fx.addFlash(def.color, 0.08);
  }

  onEventStart(def) {
    this.ui.clearWarn();
    this.ui.banner(def.label, def.color, def.sub);
    SFX.event(Object.keys(EVENTS).indexOf(def.key));
    this.fx.addFlash(def.color, 0.4);
    this.fx.addShake(16);
    this.fx.addSlow(0.22, 0.3);
    vibrate([20, 30, 20]);
    for (let i = 0; i < 3; i++) {
      this.fx.ring(this.cx, this.cy, 60 + i * 70, { color: def.color, life: 0.8, width: 6, grow: 5 });
    }
    if (def.key === 'BOSS') { this.spawnSpecial('boss', 1); this.bossAlive = true; }
    if (def.key === 'TREASURE') this.spawnSpecial('chest', 3);
  }

  onEventEnd(def) { this.ui.clearBannerIf(def.label); }

  // ---------------------------------------------------------
  // 描画
  // ---------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 背景
    this.drawBackground(ctx, w, h);

    const off = this.fx.shakeOffset();
    ctx.save();
    ctx.translate(off.x, off.y);
    // ズームパンチ（大きい快感のときだけ画面が寄る）
    if (this.fx.zoom > 0.0005) {
      const z = this.fx.zoomScale;
      ctx.translate(this.cx, this.cy); ctx.scale(z, z); ctx.translate(-this.cx, -this.cy);
    }

    this.drawCore(ctx);
    const lowGlow = this.enemies.length > 55;
    for (const e of this.enemies) e.draw(ctx, this.time, lowGlow);
    for (const c of this.coins) c.draw(ctx);
    this.fx.drawWorld(ctx);
    if (this.state === STATE.PLAY || this.state === STATE.LEVELUP) this.drawReticle(ctx);
    this.fx.drawTexts(ctx);

    ctx.restore();

    this.fx.drawFlash(ctx, w, h);
    this.drawVignette(ctx, w, h);
  }

  drawBackground(ctx, w, h) {
    const fever = this.inFever;
    // 全画面グラデーションは毎フレーム作ると重いのでキャッシュする
    const key = `${w}x${h}:${fever ? 1 : 0}`;
    if (this._bgKey !== key) {
      const g = ctx.createRadialGradient(this.cx, this.cy, 20, this.cx, this.cy, Math.max(w, h) * 0.75);
      if (fever) {
        g.addColorStop(0, '#3a0e33'); g.addColorStop(0.55, '#160a20'); g.addColorStop(1, '#05030c');
      } else {
        g.addColorStop(0, '#111d33'); g.addColorStop(0.55, '#0a0f1e'); g.addColorStop(1, '#05060d');
      }
      this._bg = g; this._bgKey = key;
    }
    ctx.fillStyle = this._bg;
    ctx.fillRect(0, 0, w, h);

    // 放射グリッド（中心に吸い込まれる感じ）
    ctx.save();
    ctx.globalAlpha = fever ? 0.16 : 0.09;
    ctx.strokeStyle = fever ? '#ff7fe0' : '#5fa8ff';
    ctx.lineWidth = 1;
    const spokes = 14;
    const rot = this.time * 0.06;
    const R = Math.max(w, h);
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const a = rot + (i / spokes) * TAU;
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(this.cx + Math.cos(a) * R, this.cy + Math.sin(a) * R);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i <= 7; i++) {
      const rr = ((i / 7) * R * 0.8 + ((this.time * 26) % (R * 0.114))) % (R * 0.8);
      ctx.moveTo(this.cx + rr, this.cy);
      ctx.arc(this.cx, this.cy, rr, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawCore(ctx) {
    const r = CFG.run.coreRadius;
    const hpR = clamp(this.hp / this.maxHp, 0, 1);
    const pulse = 1 + Math.sin(this.time * 6) * 0.05 + (1 - hpR) * Math.sin(this.time * 18) * 0.06;
    const col = hpR > 0.5 ? '#4fd8ff' : hpR > 0.25 ? '#ffcf3f' : '#ff4d4d';

    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.1 * pulse, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.rotate(this.time * 0.7);
    ctx.beginPath(); poly(ctx, 0, 0, r * pulse, 6);
    ctx.fillStyle = '#0b1524'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    ctx.rotate(-this.time * 1.6);
    ctx.beginPath(); poly(ctx, 0, 0, r * 0.55 * pulse, 3);
    ctx.fillStyle = col; ctx.fill();
    ctx.restore();

    // HPリング
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath(); ctx.arc(0, 0, r + 12, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * hpR); ctx.stroke();
    ctx.restore();
  }

  drawReticle(ctx) {
    const S = this.stats;
    const r = S.blastRadius * (this.inFever ? CFG.fever.radiusMul : 1);
    this.recoil = (this.recoil || 0) * 0.86;
    const x = this.pointer.x, y = this.pointer.y;
    if (!this.pointer.active) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const a = this.pointer.down ? 0.55 : 0.3;
    ctx.globalAlpha = a;
    ctx.strokeStyle = this.inFever ? '#ff7fe0' : '#8fe9ff';
    ctx.lineWidth = 2;
    const rr = r * (1 + this.recoil * 0.16);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = a * 0.55;
    ctx.beginPath(); ctx.arc(x, y, rr * 0.35, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + this.time * 1.4;
      ctx.moveTo(x + Math.cos(ang) * rr * 0.72, y + Math.sin(ang) * rr * 0.72);
      ctx.lineTo(x + Math.cos(ang) * rr * 1.05, y + Math.sin(ang) * rr * 1.05);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawVignette(ctx, w, h) {
    const danger = this.hp / this.maxHp < 0.3 && this.state === STATE.PLAY;
    const key = `${w}x${h}:${danger ? 1 : 0}`;
    if (this._vigKey !== key) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, danger ? 'rgba(90,0,20,.65)' : 'rgba(0,0,0,.55)');
      this._vig = g; this._vigKey = key;
    }
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, w, h);

    // FEVER 中は画面の縁が脈打つ
    if (this.inFever) {
      if (this._fevKey !== `${w}x${h}`) {
        const g2 = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.62);
        g2.addColorStop(0, 'rgba(255,80,200,0)');
        g2.addColorStop(0.75, 'rgba(255,80,200,.06)');
        g2.addColorStop(1, 'rgba(255,80,200,.55)');
        this._fev = g2; this._fevKey = `${w}x${h}`;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + Math.sin(this.time * 12) * 0.1;
      ctx.fillStyle = this._fev;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
