// Fast pre-check: every source file parses and every module import resolves to a real file or a pinned CDN URL.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './serve.mjs';

const src = path.join(ROOT, 'src');
const files = fs.readdirSync(src).filter(f => f.endsWith('.js')).map(f => path.join(src, f));
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(r.stderr); }
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec === 'three' || spec.startsWith('three/addons/')) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), spec))) { bad++; console.error(`${path.basename(f)}: missing import ${spec}`); }
  }
}
// Every complex's maze must be solvable: every can reachable from the slingshot and back,
// ropes cross, guards (and residents) stay off them, and each level's own building has enough
// guard slots and valid resident floors.
{
  const url = f => new URL('file:///' + path.join(ROOT, f).replace(/\\/g, '/')).href;
  const { buildNav, newAgent, stepAgent, route } = await import(url('src/maze.js'));
  const { MAZES, ROAM, PERCH_X, AMMO, LEVELS } = await import(url('src/config.js'));
  const o = { run: ROAM.run, climb: ROAM.climb, rope: ROAM.rope, grav: ROAM.grav, xMin: ROAM.xMin, xMax: 336, canRope: true, canFall: true };
  const fail = msg => { bad++; console.error('maze: ' + msg); };
  const walk = (nav, a, target) => {
    for (let t = 0; t < 60; t += 1 / 60) {
      if (a.mode === 'floor' && a.floor === target.floor && Math.abs(a.x - target.x) < 8) return true;
      stepAgent(nav, a, route(nav, a, target), 1 / 60, o);
    }
    return false;
  };
  MAZES.forEach((MAZE, mi) => {
    const nav = buildNav(MAZE);
    const tag = `complex ${mi}`;
    const a = newAgent(nav, PERCH_X, 'g');
    for (const c of MAZE.cans) {
      if (!nav.byId[c.floor]) { fail(`${tag}: can at ${c.x} is on unknown floor ${c.floor}`); continue; }
      if (!walk(nav, a, { x: c.x, floor: nav.byId[c.floor] })) fail(`${tag}: cannot reach the can at ${c.x} on ${c.floor}`);
      for (const t of c.loot) if (!AMMO[t]) fail(`${tag}: can at ${c.x} holds unknown trash "${t}"`);
    }
    if (!walk(nav, a, { x: PERCH_X, floor: nav.byId.g })) fail(`${tag}: cannot get back to the slingshot`);
    for (const l of nav.ladders) if (!l.top || !l.bottom) fail(`${tag}: ladder at ${l.x} does not join two floors`);
    for (const r of MAZE.ropes) {
      const b = newAgent(nav, r.x0 - 20, nav.floorAt(r.x0 - 20, r.h).id);
      let rode = false;
      for (let i = 0; i < 600 && !(b.mode === 'floor' && b.x > r.x1); i++) { stepAgent(nav, b, { mx: 1 }, 1 / 60, o); rode = rode || b.mode === 'rope'; }
      if (!rode || b.mode !== 'floor' || b.h !== r.h) fail(`${tag}: rope at height ${r.h} does not carry the raccoon across`);
      const g = newAgent(nav, r.x0 - 20, nav.floorAt(r.x0 - 20, r.h).id);
      for (let i = 0; i < 300; i++) stepAgent(nav, g, { mx: 1 }, 1 / 60, { ...o, canRope: false, canFall: false });
      if (g.x > r.x0 + 0.01) fail(`${tag}: a guard can walk onto the rope at height ${r.h}`);
    }
    for (const g of MAZE.guards) if (!nav.byId[g.floor]) fail(`${tag}: guard on unknown floor ${g.floor}`);
    for (const r of MAZE.residents || []) if (!nav.byId[r.floor]) fail(`${tag}: resident on unknown floor ${r.floor}`);
  });
  LEVELS.forEach((L, i) => { if (L.guards > MAZES[i].guards.length) fail(`${L.name} wants ${L.guards} guards but complex ${i} only has ${MAZES[i].guards.length}`); });
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/src="(https?:[^"]+)"/g)) if (!/@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//.test(m[1])) { bad++; console.error('unpinned script ' + m[1]); }
if (!html.includes('"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/')) { bad++; console.error('import map for three is missing or unpinned'); }
console.log(`check: ${files.length} modules parsed${bad ? `, ${bad} problem(s)` : ', ok'}`);
process.exit(bad ? 1 : 0);
