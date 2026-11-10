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
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/src="(https?:[^"]+)"/g)) if (!/@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//.test(m[1])) { bad++; console.error('unpinned script ' + m[1]); }
if (!html.includes('"three": "https://cdn.jsdelivr.net/npm/three@0.160.0/')) { bad++; console.error('import map for three is missing or unpinned'); }
console.log(`check: ${files.length} modules parsed${bad ? `, ${bad} problem(s)` : ', ok'}`);
process.exit(bad ? 1 : 0);
