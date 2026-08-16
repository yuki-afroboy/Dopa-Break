// ============================================================
// 強化カード
// 方針: 「数値が上がった」ではなく「見た目が変わった」を優先。
//       組み合わせると指数関数的に壊れる設計にしてある。
// ============================================================

import { RARITY } from './config.js';
import { weighted, clamp } from './rng.js';

export const UPGRADES = [
  // ---------------- COMMON ----------------
  { id: 'rapid',  r: 'COMMON', icon: '⚡', name: 'RAPID FIRE',  desc: '連射速度 +22%',        max: 8, apply: (S) => { S.fireRate *= 1.22; } },
  { id: 'bigger', r: 'COMMON', icon: '💥', name: 'BIG BLAST',   desc: '爆発範囲 +18%',        max: 8, apply: (S) => { S.blastRadius *= 1.18; } },
  { id: 'power',  r: 'COMMON', icon: '🔨', name: 'POWER',       desc: 'ダメージ +1',          max: 12, apply: (S) => { S.damage += 1; } },
  { id: 'crit',   r: 'COMMON', icon: '🎯', name: 'CRITICAL',    desc: 'クリティカル率 +12%',  max: 6, apply: (S) => { S.critChance += 0.12; } },
  { id: 'greed',  r: 'COMMON', icon: '🪙', name: 'GREED',       desc: 'コイン獲得 +35%',      max: 6, apply: (S) => { S.coinMul *= 1.35; } },
  { id: 'wisdom', r: 'COMMON', icon: '📘', name: 'WISDOM',      desc: 'EXP獲得 +28%',         max: 6, apply: (S) => { S.expMul *= 1.28; } },
  { id: 'hold',   r: 'COMMON', icon: '⏱', name: 'COMBO HOLD',  desc: 'コンボ持続 +0.5秒',    max: 5, apply: (S) => { S.comboTime += 0.5; } },
  { id: 'magnet', r: 'COMMON', icon: '🧲', name: 'MAGNET',      desc: 'コイン回収 +60%',      max: 4, apply: (S) => { S.magnet *= 1.6; } },
  { id: 'knock',  r: 'COMMON', icon: '🌊', name: 'IMPACT',      desc: 'ノックバック +70%',    max: 4, apply: (S) => { S.knockback *= 1.7; } },

  // ---------------- RARE ----------------
  { id: 'twin',   r: 'RARE', icon: '🔱', name: 'MULTI BLAST', desc: '爆発が 1つ増える',           max: 4, apply: (S) => { S.shots += 1; } },
  { id: 'chain',  r: 'RARE', icon: '🔗', name: 'CHAIN',       desc: '撃破時 35% で連鎖爆発',      max: 3, apply: (S) => { S.chainChance += 0.35; } },
  { id: 'deep',   r: 'RARE', icon: '🗡', name: 'DEEP CRIT',   desc: 'クリティカル倍率 +1.5',      max: 4, apply: (S) => { S.critMul += 1.5; } },
  { id: 'shock',  r: 'RARE', icon: '📡', name: 'SHOCKWAVE',   desc: '爆発から衝撃波が広がる',      max: 3, apply: (S) => { S.shockwave += 1; } },
  { id: 'armor',  r: 'RARE', icon: '🛡', name: 'REPAIR',      desc: 'CORE を 35 回復',            max: 6, apply: (S, g) => { g.hp = Math.min(g.maxHp, g.hp + 35); } },
  { id: 'clock',  r: 'RARE', icon: '⏳', name: 'OVERTIME',    desc: 'TIME +8秒',                  max: 6, apply: (S, g) => { g.addTime(8); } },
  { id: 'fev',    r: 'RARE', icon: '🔥', name: 'FEVER CHARGE',desc: 'FEVER 蓄積 +60%',            max: 4, apply: (S) => { S.feverGain *= 1.6; } },
  { id: 'wide',   r: 'RARE', icon: '↔️', name: 'WIDE SPREAD', desc: '複数爆発の展開幅 +50%',       max: 3, apply: (S) => { S.spread *= 1.5; } },
  { id: 'thorn',  r: 'RARE', icon: '❄️', name: 'SLOW FIELD',  desc: '敵の速度 -18%',              max: 4, apply: (S) => { S.enemySlow *= 0.82; } },

  // ---------------- EPIC ----------------
  { id: 'deton',  r: 'EPIC', icon: '☢️', name: 'DETONATOR',   desc: '撃破した敵が必ず爆発する',        max: 1, apply: (S) => { S.chainChance = Math.max(S.chainChance, 1); } },
  { id: 'nuke',   r: 'EPIC', icon: '🚀', name: 'NUKE ROUND',  desc: '一定発ごとに極大爆発',            max: 3, apply: (S) => { S.nukeEvery = S.nukeEvery ? Math.max(4, S.nukeEvery - 4) : 14; } },
  { id: 'midas',  r: 'EPIC', icon: '💰', name: 'MIDAS',       desc: 'コインが爆発する',                max: 3, apply: (S) => { S.coinDamage += 3; } },
  { id: 'hole',   r: 'EPIC', icon: '🕳', name: 'BLACK HOLE',  desc: '爆発が敵を吸い込む',              max: 3, apply: (S) => { S.pullForce += 340; } },
  { id: 'bolt',   r: 'EPIC', icon: '🌩', name: 'LIGHTNING',   desc: '一定コンボごとに落雷',            max: 4, apply: (S) => { S.lightningCombo = S.lightningCombo ? Math.max(2, S.lightningCombo - 2) : 8; S.lightningCount += 1; } },
  { id: 'glass',  r: 'EPIC', icon: '💎', name: 'GLASS CANNON',desc: 'ダメージ x1.7 / TIME -3秒',       max: 3, apply: (S, g) => { S.damage = Math.ceil(S.damage * 1.7); g.addTime(-3); } },
  { id: 'critb',  r: 'EPIC', icon: '✴️', name: 'CRIT BOMB',   desc: 'クリティカルで巨大な追撃爆発',     max: 2, apply: (S) => { S.critBomb += 1; } },
  { id: 'fevlord',r: 'EPIC', icon: '👑', name: 'FEVER LORD',  desc: 'FEVER +3秒 / FEVER中 連鎖+60%',   max: 2, apply: (S) => { S.feverBonus += 3; S.feverChain += 0.6; } },
  { id: 'split',  r: 'EPIC', icon: '🎇', name: 'SPLITTER',    desc: '爆発が小爆発を2つ撒く',           max: 3, apply: (S) => { S.splitCount += 2; } },

  // ---------------- LEGENDARY ----------------
  { id: 'over',   r: 'LEGENDARY', icon: '🌟', name: 'OVERDRIVE',  desc: '連射 x1.8 / 範囲 x1.4 / DMG +3',
    max: 2, apply: (S) => { S.fireRate *= 1.8; S.blastRadius *= 1.4; S.damage += 3; } },
  { id: 'apoc',   r: 'LEGENDARY', icon: '🌋', name: 'APOCALYPSE', desc: '連鎖100% / 連鎖が連鎖する',
    max: 1, apply: (S) => { S.chainChance = 1; S.chainDepth += 3; S.chainRadiusMul = 1.0; } },
  { id: 'singu',  r: 'LEGENDARY', icon: '🌀', name: 'SINGULARITY',desc: '全爆発が特大ブラックホール化',
    max: 1, apply: (S) => { S.pullForce += 900; S.blastRadius *= 1.25; S.shockwave += 2; } },
  { id: 'god',    r: 'LEGENDARY', icon: '🏆', name: 'GOLDEN GOD', desc: 'コイン x3 / コイン爆発 / コイン=スコア',
    max: 1, apply: (S) => { S.coinMul *= 3; S.coinDamage += 4; S.coinScore = 1; } },
  { id: 'thunder',r: 'LEGENDARY', icon: '⚔️', name: 'THUNDER GOD',desc: '3コンボごとに落雷5本',
    max: 1, apply: (S) => { S.lightningCombo = 3; S.lightningCount += 5; } },
  { id: 'hell',   r: 'LEGENDARY', icon: '🎆', name: 'BULLET HELL',desc: '爆発+3 / 幅+80% / 連射+45%',
    max: 1, apply: (S) => { S.shots += 3; S.spread *= 1.8; S.fireRate *= 1.45; } },
];

const BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
export const getUpgrade = (id) => BY_ID[id];

// レベルが上がるほど上位レアリティが出やすくなる
function rarityWeight(rarity, level, luck) {
  switch (rarity) {
    case 'COMMON':    return Math.max(22, 100 - level * 5.5);
    case 'RARE':      return 44 + level * 1.4;
    case 'EPIC':      return 9 + level * 2.3 + luck * 4;
    case 'LEGENDARY': return clamp(1.2 + level * 0.85 + luck * 2.2, 0, 18);
    default:          return 1;
  }
}

/**
 * 3枚のカードを抽選する。
 * 同一カードは重複しない / 上限に達したものは除外。
 */
export function rollChoices(taken, level, luck = 0, n = 3) {
  const pool = UPGRADES.filter((u) => (taken[u.id] || 0) < u.max);
  const out = [];
  const used = new Set();
  for (let i = 0; i < n && pool.length; i++) {
    const cand = pool.filter((u) => !used.has(u.id));
    if (!cand.length) break;
    const u = weighted(cand, (x) => rarityWeight(x.r, level, luck));
    used.add(u.id);
    out.push(u);
  }
  return out;
}

export function rarityInfo(r) { return RARITY[r]; }
export const RARITY_ORDER = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
