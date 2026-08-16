export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function weighted(items, getW = (o) => o.w) {
  let total = 0;
  for (const it of items) total += getW(it);
  let r = Math.random() * total;
  for (const it of items) {
    r -= getW(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
