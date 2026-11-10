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
await shot('05-worker-lob', 'TPH.closeUp(0); TPH.seed(3); TPH.start(0); TPH.hide(true); TPH.step(11.4); TPH.closeUp(1230, 180, 1200)');
await shot('06-worker-throw', 'TPH.closeUp(0); TPH.seed(3); TPH.start(0); TPH.hide(false); TPH.step(10.85); TPH.closeUp(1230, 180, 1200)');
await shot('07-win-leap', 'TPH.closeUp(0); TPH.start(0); TPH.hide(false); TPH.forceWin(); TPH.step(3.2)');
await shot('08-win-cheer', 'TPH.step(2.6); TPH.closeUp(1050, 160, 900)');
await browser.close();
srv.close();
