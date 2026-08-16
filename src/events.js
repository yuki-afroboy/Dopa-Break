// ============================================================
// ランダムイベント
// 必ず「3秒前の予告」を出す = 期待感を常に画面に置く
// ============================================================

import { rand, randInt, weighted } from './rng.js';

export const EVENTS = {
  GOLD_RUSH: {
    key: 'GOLD_RUSH', label: 'GOLD RUSH', color: '#ffcf3f', dur: 7, w: 22,
    mods: { coinMul: 4, dropAll: 1 },
    sub: 'コインが降り注ぐ',
  },
  CRIT_TIME: {
    key: 'CRIT_TIME', label: 'CRITICAL TIME', color: '#ff5aa8', dur: 6, w: 20,
    mods: { critAdd: 1 },
    sub: '全弾クリティカル',
  },
  DOUBLE: {
    key: 'DOUBLE', label: 'DOUBLE SCORE', color: '#4fd8ff', dur: 8, w: 20,
    mods: { scoreMul: 2 },
    sub: 'スコア2倍',
  },
  SWARM: {
    key: 'SWARM', label: 'BONUS STAGE', color: '#7dff9b', dur: 6.5, w: 18,
    mods: { spawnMul: 4.2, hpMul: 0.34, scoreMul: 1.3 },
    sub: '大量破壊タイム',
  },
  METEOR: {
    key: 'METEOR', label: 'METEOR STORM', color: '#ff8a3d', dur: 6, w: 14,
    mods: { meteor: 1 },
    sub: '空から爆撃',
  },
  BOSS: {
    key: 'BOSS', label: 'BOSS', color: '#ff4d4d', dur: 0, w: 16,
    mods: {},
    sub: '倒せば TIME+10',
  },
  TREASURE: {
    key: 'TREASURE', label: 'TREASURE', color: '#ffe14d', dur: 0, w: 14,
    mods: {},
    sub: '宝箱を壊せ',
  },
};

const LIST = Object.values(EVENTS);

export class EventManager {
  constructor() { this.reset(); }

  reset() {
    this.active = [];          // {def, t}
    this.pending = null;       // {def, t}  予告中
    this.nextAt = 11;          // 最初のイベント
    this.time = 0;
    this.count = 0;
    this.lastKey = null;
  }

  update(dt, game) {
    this.time += dt;

    // 予告カウントダウン
    if (this.pending) {
      this.pending.t -= dt;
      const sec = Math.ceil(this.pending.t);
      if (sec !== this.pending.lastSec) {
        this.pending.lastSec = sec;
        if (sec > 0) game.onEventWarnTick(this.pending.def, sec);
      }
      if (this.pending.t <= 0) {
        const def = this.pending.def;
        this.pending = null;
        this.trigger(def, game);
      }
    } else if (this.time >= this.nextAt) {
      const def = this.roll();
      this.pending = { def, t: 3, lastSec: 99 };
      this.nextAt = this.time + rand(13, 19);
      game.onEventWarn(def);
    }

    // アクティブイベント
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t -= dt;
      if (a.t <= 0) {
        this.active.splice(i, 1);
        game.onEventEnd(a.def);
      }
    }
  }

  roll() {
    const cand = LIST.filter((e) => e.key !== this.lastKey);
    const def = weighted(cand);
    this.lastKey = def.key;
    return def;
  }

  trigger(def, game) {
    this.count++;
    if (def.dur > 0) this.active.push({ def, t: def.dur });
    game.onEventStart(def);
  }

  /** 現在有効な修正値をまとめて返す */
  mods() {
    const m = { coinMul: 1, scoreMul: 1, critAdd: 0, spawnMul: 1, hpMul: 1, dropAll: 0, meteor: 0 };
    for (const a of this.active) {
      const s = a.def.mods;
      if (s.coinMul) m.coinMul *= s.coinMul;
      if (s.scoreMul) m.scoreMul *= s.scoreMul;
      if (s.critAdd) m.critAdd += s.critAdd;
      if (s.spawnMul) m.spawnMul *= s.spawnMul;
      if (s.hpMul) m.hpMul *= s.hpMul;
      if (s.dropAll) m.dropAll = 1;
      if (s.meteor) m.meteor = 1;
    }
    return m;
  }

  /** HUD 用: 一番目立たせたい "もうすぐ何か起きる" 情報 */
  hudHint() {
    if (this.pending) return { label: this.pending.def.label, sec: Math.ceil(this.pending.t), color: this.pending.def.color };
    return null;
  }

  activeLabels() {
    return this.active.map((a) => ({ label: a.def.label, color: a.def.color, t: a.t, dur: a.def.dur }));
  }
}
