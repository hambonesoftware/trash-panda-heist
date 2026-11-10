import { G, GRAV, AIR, MAX_PULL } from './config.js';

// Autoplayer for the trial build: hides when the crew is out, otherwise aims at the highest blocking box.
export function makeBot(api, { reaction = 0.2 } = {}) {
  let dangerSince = -1;
  return function tick() {
    const now = api.time();
    if (api.danger()) {
      if (dangerSince < 0) dangerSince = now;
      if (now - dangerSince >= reaction) api.setHide(true);
      return;
    }
    dangerSince = -1;
    api.setHide(false);
    if (!api.canAim() || api.busy()) return;
    const shot = plan(api);
    api.fireDrag(shot.dx, shot.dy);
  };
}

function plan(api) {
  const all = api.boxes(), statics = api.statics(), r = api.ammo().r;
  const targets = all.filter(b => b.blocking).sort((a, b) => a.top - b.top);
  let best = null;
  for (let ang = 150; ang <= 250; ang += 3) {
    for (let k = 0.3; k <= 1.0001; k += 0.05) {
      const dx = Math.cos((ang * Math.PI) / 180) * k * MAX_PULL * 1.4;
      const dy = Math.sin((ang * Math.PI) / 180) * k * MAX_PULL * 1.4;
      const p = api.constrain(dx, dy), v = api.velocity(p);
      const hit = simulate(p.x, G - p.wy, v.x, v.y, r, all, statics);
      if (!hit) continue;
      const rank = targets.indexOf(hit.box);
      if (rank < 0) continue;
      const score = rank * 100 - hit.speed * 3;
      if (!best || score < best.score) best = { score, dx, dy };
    }
  }
  return best || { dx: -70, dy: -50 };
}

function simulate(x, y, vx, vy, r, boxes, statics) {
  for (let i = 0; i < 420; i++) {
    vx *= 1 - AIR;
    vy = vy * (1 - AIR) + GRAV;
    x += vx;
    y += vy;
    if (y > G - r || x > 1500 || x < 0) return null;
    for (const s of statics) if (x + r > s.minX && x - r < s.maxX && y + r > s.minY && y - r < s.maxY) return null;
    for (const b of boxes) if (x + r > b.minX && x - r < b.maxX && y + r > b.minY && y - r < b.maxY) return { box: b, speed: Math.hypot(vx, vy) };
  }
  return null;
}
