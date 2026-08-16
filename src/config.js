// ============================================================
// DOPA BREAK - tuning values
// 迷ったら「この数値で次の10秒が面白くなるか？」で決める
// ============================================================

export const CFG = {
  run: {
    time: 60,            // 1プレイの基本秒数
    maxTime: 99,         // TIME上限（ボーナスで伸びる）
    coreHp: 100,
    coreRadius: 26,
  },

  // ---- プレイヤー基礎ステータス ----
  base: {
    fireRate: 6.0,       // 発/秒（ホールド連射）
    blastRadius: 66,
    damage: 1,
    critChance: 0.05,
    critMul: 3,
    shots: 1,
    spread: 30,
    knockback: 90,

    chainChance: 0,      // 撃破時に爆発する確率
    chainRadiusMul: 0.8,
    lightningCombo: 0,   // Nコンボごとに落雷
    pullForce: 0,        // ブラックホール
    nukeEvery: 0,        // Nショットごとに超巨大爆発
    coinDamage: 0,       // コインが爆発する
    shockwave: 0,        // 爆発から広がる衝撃リング

    coinMul: 1,
    expMul: 1,
    scoreMul: 1,
    comboTime: 1.75,
    magnet: 1,
  },

  // ---- コンボ倍率テーブル ----
  comboTiers: [
    { at: 0,   mul: 1,   name: '' },
    { at: 5,   mul: 2,   name: 'NICE' },
    { at: 15,  mul: 3,   name: 'GREAT' },
    { at: 30,  mul: 5,   name: 'EXCELLENT' },
    { at: 60,  mul: 10,  name: 'INSANE' },
    { at: 100, mul: 20,  name: 'GODLIKE' },
    { at: 200, mul: 50,  name: 'UNREAL' },
    { at: 400, mul: 100, name: 'DOPAMINE' },
  ],

  // ---- レベル ----
  level: {
    // 必要EXP: 序盤4-6秒 / 中盤8-14秒でLVUPする曲線
    need: (lv) => Math.floor(9 + lv * 4.5 + lv * lv * 1.6),
  },

  // ---- FEVER ----
  fever: {
    gain: 1.0,           // キル1体あたりのゲージ
    max: 90,
    duration: 6.5,
    scoreMul: 2,
    fireRateMul: 1.8,
    radiusMul: 1.35,
  },

  // ---- 敵 ----
  enemies: {
    cube:   { hp: 1,  r: 17, speed: 34, exp: 1,  score: 10,  coin: 0.55, sides: 4, color: '#4fd8ff', dmg: 8 },
    runner: { hp: 1,  r: 13, speed: 74, exp: 1,  score: 16,  coin: 0.5,  sides: 3, color: '#ffe14d', dmg: 6 },
    elite:  { hp: 4,  r: 21, speed: 42, exp: 3,  score: 34,  coin: 1.4,  sides: 5, color: '#ff5aa8', dmg: 12 },
    tank:   { hp: 9,  r: 28, speed: 21, exp: 5,  score: 60,  coin: 2.2,  sides: 6, color: '#b06bff', dmg: 18 },
    chest:  { hp: 6,  r: 25, speed: 10, exp: 8,  score: 150, coin: 14,   sides: 4, color: '#ffcf3f', dmg: 0 },
    boss:   { hp: 150,r: 54, speed: 15, exp: 40, score: 1200,coin: 30,   sides: 8, color: '#ff4d4d', dmg: 30 },
  },

  spawn: {
    ratePerSec: (t) => 2.6 + t * 0.15 + Math.max(0, t - 30) * 0.1,   // 60秒後 ≒ 14.6体/秒
    hpScale: (t) => 1 + Math.floor(t / 14) * 0.7,
    // 出現テーブル（時間で解禁）
    table: [
      { type: 'cube',   w: 100, from: 0 },
      { type: 'runner', w: 40,  from: 6 },
      { type: 'elite',  w: 26,  from: 14 },
      { type: 'tank',   w: 16,  from: 24 },
    ],
  },

  fx: {
    maxParticles: 900,
    shakeDecay: 6.5,
  },
};

export const RARITY = {
  COMMON:    { name: 'COMMON',    color: '#8fa6c0', glow: 'rgba(143,166,192,.55)', w: 100 },
  RARE:      { name: 'RARE',      color: '#4fd8ff', glow: 'rgba(79,216,255,.65)',  w: 46 },
  EPIC:      { name: 'EPIC',      color: '#c07bff', glow: 'rgba(192,123,255,.7)',  w: 17 },
  LEGENDARY: { name: 'LEGENDARY', color: '#ffc93f', glow: 'rgba(255,201,63,.85)',  w: 4 },
};
