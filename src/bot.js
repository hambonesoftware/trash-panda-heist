import { G, GRAV, AIR, MAX_PULL } from './config.js';
import { route } from './maze.js';

// Autoplayer for the trial build. It plays by the same rules as a person:
// throws from the stash, ducks when the stocker is out, and when the stash runs dry
// goes out to raid the cans, tripping or hiding from guards on the way.
export function makeBot(api, { reaction = 0.2 } = {}) {
  let dangerSince = -1;
  const mem = { goal: null, standUntil: 0, hideUntil: 0 };
  return function tick() {
    const now = api.time();
    if (api.where() === 'perch') {
      api.setMove(null);
      mem.goal = null;
      if (!api.stash().length && !api.busy() && api.cans().some(c => c.loot.length)) {
        api.setHide(false);
        if (api.hideAmount() <= 0.05) api.raid();
        return;
      }
      if (api.danger()) {
        if (dangerSince < 0) dangerSince = now;
        if (now - dangerSince >= reaction) api.setHide(true);
        return;
      }
      dangerSince = -1;
      api.setHide(false);
      if (!api.stash().length || !api.canAim() || api.busy()) return;
      const shot = plan(api);
      api.fireDrag(shot.dx, shot.dy);
      return;
    }
    roam(api, now, mem);
  };
}

function roam(api, now, mem) {
  const a = api.agent(), nav = api.nav, cans = api.cans();
  const home = { x: api.perchX + 14, floor: nav.byId.g };
  const steer = t => route(nav, a, t);

  // gather until the sack is worth the trip (less if one more catch would end the night), then go home
  const enough = api.sack().length >= (api.hearts() <= 1 ? 4 : 8);
  const full = cans.filter(c => c.loot.length);
  if (enough || (mem.goal && !mem.goal.loot.length)) mem.goal = null;
  if (!enough && !mem.goal && full.length) {
    let best = null, cost = Infinity;
    for (const c of full) { const k = steer({ x: c.x, floor: c.floor }).cost; if (k < cost) { cost = k; best = c; } }
    mem.goal = best;
  }
  const target = mem.goal ? { x: mem.goal.x, floor: mem.goal.floor } : home;
  const want = steer(target);

  // the closest guard on this level that is awake
  let threat = null, td = 250;
  for (const g of api.guards()) {
    if (g.state === 'stun' || g.state === 'gloat') continue;
    const dx = Math.abs(g.a.x - a.x), dh = Math.abs(g.a.h - a.h);
    if (dh < 100 && dx < td) { td = dx; threat = g; }
  }
  const toward = threat ? Math.sign(threat.a.x - a.x) || 1 : 0;
  const coming = threat && (threat.state === 'chase' || threat.state === 'investigate' || threat.a.face === -toward);

  if (api.inCan()) {
    // sit tight only while he is right outside
    if (coming && td < 170 && now < mem.hideUntil) { api.setHide(true); api.setMove(null); return; }
    api.setHide(false);
    return;
  }
  api.setHide(false);

  if (coming && a.mode === 'floor') {
    if (api.trapReady()) { api.trap(); mem.standUntil = now + 2.4; }
    const onSlick = api.slicks().some(s => s.floor === a.floor && Math.abs(s.x - a.x) < 20);
    if (onSlick && now < mem.standUntil) { api.setMove(null); return; }     // he slips before he can reach us
    const can = cans.find(c => c.floor === a.floor && Math.abs(c.x - a.x) < 55);
    if (can && td > 95 && now > (mem.hideUntil || 0) + 1.5) { api.setHide(true); api.setMove(null); mem.hideUntil = now + 2.2; return; }
    api.setMove({ mx: -toward, my: 0 });                                     // nothing else for it: run
    return;
  }
  // ladders: never climb into a guard waiting at the far end, or one on the ladder between us and it
  // (a guard behind us on the ladder is a reason to keep going, not to turn back)
  if (want.my) {
    const L = a.mode === 'ladder' ? a.ladder : nav.ladders.find(l => Math.abs(l.x - a.x) < 18);
    if (L) {
      const endH = want.my > 0 ? L.h1 : L.h0;
      const blocked = api.guards().some(g => g.state !== 'stun' && g.state !== 'gloat' &&
        ((g.a.mode === 'ladder' && g.a.ladder === L && (g.a.h - a.h) * want.my > 0) || (Math.abs(g.a.x - L.x) < 170 && Math.abs(g.a.h - endH) < 70)));
      if (blocked) { api.setMove(a.mode === 'ladder' ? { mx: 0, my: -want.my } : null); return; }
    }
  }
  api.setMove(want.mx || want.my ? { mx: want.mx, my: want.my } : null);
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
