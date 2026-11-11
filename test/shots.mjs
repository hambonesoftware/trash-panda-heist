// Captures a storyboard of key moments (idle, windup, hide, worker spotting, win dive) for visual review.
import fs from 'node:fs';
import path from 'node:path';
import { serve, ROOT } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const OUT = path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const srv = await serve();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/?test&q=2`);
await page.waitForFunction(() => window.TPH && window.TPH.ready, null, { timeout: 90000 });
const shot = async (name, script) => {
  await page.evaluate(`window.TPH.run(false); ${script}; window.TPH.step(1 / 60);`);
  await page.evaluate(() => new Promise(r => { window.TPH.run(true); requestAnimationFrame(() => requestAnimationFrame(() => { window.TPH.run(false); r(); })); }));
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('saved', name);
};
await shot('01-wide', 'TPH.start(0); TPH.step(1)');
await shot('02-windup', 'TPH.start(0); TPH.step(1); TPH.aim(-85, -45); TPH.step(0.3); TPH.closeUp(300, 100, 760)');
await shot('03-release', 'TPH.release(); TPH.step(0.06)');
await shot('04-hidden', 'TPH.closeUp(0); TPH.start(0); TPH.hide(true); TPH.step(1); TPH.closeUp(240, 110, 760)');
// the maze
await shot('10-maze-run', 'TPH.closeUp(0); TPH.hide(false); TPH.start(0); TPH.guardsOff(); TPH.warp(-300, "g"); TPH.move(-1, 0); TPH.step(1.2)');
await shot('11-maze-wide', 'TPH.move(0, 0); TPH.warp(-800, "g"); TPH.step(1.5); TPH.closeUp(-800, 330, 2500)');
await shot('12-rummage', 'TPH.closeUp(0); TPH.warp(-880, "g"); TPH.step(0.5); TPH.closeUp(-890, 90, 620)');
await shot('13-ladder', 'TPH.closeUp(0); TPH.warp(-1440, "g"); TPH.move(0, 1); TPH.step(0.7); TPH.move(0, 0); TPH.closeUp(-1440, 190, 760)');
await shot('14-rope', 'TPH.closeUp(0); TPH.warp(-1030, "A"); TPH.move(1, 0); TPH.step(0.75); TPH.closeUp(-900, 350, 800)');
await shot('15-top-rope-wide', 'TPH.closeUp(0); TPH.warp(-870, "C"); TPH.move(1, 0); TPH.step(0.8); TPH.move(0, 0); TPH.step(0.6)');
await shot('16-guard-chase', 'TPH.closeUp(0); TPH.move(0, 0); TPH.warp(-600, "g"); TPH.guard(0, -980, "g", 1); TPH.step(0.9); TPH.closeUp(-760, 120, 900)');
await shot('17-slick-slip', 'TPH.closeUp(0); TPH.warp(-600, "g"); TPH.guard(0, -860, "g", 1); TPH.trap(); TPH.step(1.45); TPH.closeUp(-640, 110, 760)');
await shot('18-hide-in-can', 'TPH.closeUp(0); TPH.guardsOff(); TPH.warp(-905, "g"); TPH.hide(true); TPH.guard(0, -1100, "g", 1); TPH.step(1.0); TPH.closeUp(-930, 100, 700)');
await shot('19-sack-home', 'TPH.closeUp(0); TPH.hide(false); TPH.guardsOff(); TPH.warp(-1250, "A"); TPH.step(3.4); TPH.warp(120, "g"); TPH.move(1, 0); TPH.step(0.35); TPH.closeUp(200, 110, 760)');
await shot('20-stash', 'TPH.step(1.2); TPH.move(0, 0); TPH.closeUp(260, 110, 700)');
// the meal and the six-hour jump
await shot('30-eating-clock', 'TPH.closeUp(0); TPH.start(0); TPH.forceWin(); TPH.step(4.4)');
await shot('31-run-to-next', 'TPH.step(1.9)');
await shot('32-win-card', 'TPH.step(1.5)');
await shot('33-dawn', 'TPH.start(1); TPH.step(1)');
await shot('34-noon-maze', 'TPH.start(2); TPH.guardsOff(); TPH.warp(-520, "B"); TPH.step(1.2)');
await shot('35-dusk', 'TPH.start(3); TPH.step(1)');
await browser.close();
srv.close();
