// ============================================================
// メタ進行（localStorage）
// 序盤から複雑にしない: 恒久強化は4つだけ
// ============================================================

const KEY = 'dopabreak.save.v1';

export const META_UPGRADES = [
  { id: 'power', icon: '🔨', name: 'POWER CORE', desc: '初期ダメージ +1', max: 5, cost: (l) => 120 * Math.pow(2, l) },
  { id: 'luck',  icon: '🍀', name: 'LUCK',       desc: 'レア出現率 UP',   max: 4, cost: (l) => 220 * Math.pow(2, l) },
  { id: 'start', icon: '🚀', name: 'HEAD START', desc: '開始時に強化1つ', max: 3, cost: (l) => 300 * Math.pow(2, l) },
  { id: 'greed', icon: '🪙', name: 'GREED',      desc: 'コイン +25%',     max: 5, cost: (l) => 150 * Math.pow(2, l) },
];

const DEFAULT = {
  coins: 0,
  best: 0,
  bestCombo: 0,
  bestLevel: 0,
  bestDestroyed: 0,
  runs: 0,
  muted: false,
  up: {},
};

export const Meta = {
  data: { ...DEFAULT },

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULT, ...JSON.parse(raw), up: { ...JSON.parse(raw).up } };
    } catch (e) { this.data = { ...DEFAULT }; }
    return this.data;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* noop */ }
  },

  lv(id) { return this.data.up[id] || 0; },

  costOf(id) {
    const u = META_UPGRADES.find((x) => x.id === id);
    const l = this.lv(id);
    return l >= u.max ? null : Math.floor(u.cost(l));
  },

  canBuy(id) {
    const c = this.costOf(id);
    return c !== null && this.data.coins >= c;
  },

  buy(id) {
    const c = this.costOf(id);
    if (c === null || this.data.coins < c) return false;
    this.data.coins -= c;
    this.data.up[id] = this.lv(id) + 1;
    this.save();
    return true;
  },

  addCoins(n) { this.data.coins += n; },

  /** 1プレイ結果を記録し、更新内容を返す */
  submit(res) {
    const d = this.data;
    const out = {
      newBest: res.score > d.best,
      prevBest: d.best,
      newCombo: res.maxCombo > d.bestCombo,
      newDestroyed: res.destroyed > d.bestDestroyed,
    };
    d.runs++;
    d.best = Math.max(d.best, res.score);
    d.bestCombo = Math.max(d.bestCombo, res.maxCombo);
    d.bestLevel = Math.max(d.bestLevel, res.level);
    d.bestDestroyed = Math.max(d.bestDestroyed, res.destroyed);
    this.save();
    return out;
  },
};
