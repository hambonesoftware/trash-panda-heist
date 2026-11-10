let seed = 0, seeded = false;

export function seedRandom(s) { seed = s >>> 0; seeded = true; }
export function unseedRandom() { seeded = false; }

export function rng() {
  if (!seeded) return Math.random();
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (a, b) => a + rng() * (b - a);
export const pick = arr => arr[Math.floor(rng() * arr.length)];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const smooth = t => t * t * (3 - 2 * t);

export function angleDamp(a, b, k, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
