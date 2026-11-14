// Smoke test against the published site: loads, starts, throws with a real mouse drag from the slingshot, hides,
// then runs out to a trash can and digs. No errors allowed.
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] || 'https://hambonesoftware.github.io/trash-panda-heist/';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + (url.includes('?') ? '&' : '?') + 'test&q=1', {
  waitUntil: 'domcontentloaded', timeout: 90000,
});
await page.waitForFunction(() => window.TPH && window.TPH.ready, null, { timeout: 90000 });
await page.click('button[data-act=play]');
// each meal starts out in the alley with an empty sack, so put him at the slingshot with some trash to throw
await page.waitForFunction(() => window.TPH.info().state === 'play', null, { timeout: 15000 });
const start = await page.evaluate(() => window.TPH.info());
if (start.where !== 'roam' || start.x > -1400 || start.stash !== 0 || start.loaded !== null) {
  throw new Error('Expected an empty-handed start on the far side of the alley');
}
// Isolate the real mouse and keyboard interactions from patrol timing.
await page.evaluate(() => { window.TPH.toPerch(); window.TPH.setStash(['can']); });
await page.waitForFunction(() => window.TPH.info().canAim, null, { timeout: 25000 });
const p = await page.evaluate(() => window.TPH.pouchScreen());
await page.mouse.move(p.x, p.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(p.x - 11 * i, p.y + 5 * i);
await page.mouse.up();
await page.waitForFunction(() => window.TPH.info().throws === 1, null, { timeout: 5000 });
await page.keyboard.down('Space');
await page.waitForFunction(() => window.TPH.info().hide > 0.9, null, { timeout: 5000 });
await page.keyboard.up('Space');
await page.waitForFunction(() => window.TPH.info().hide < 0.05, null, { timeout: 5000 });
// leave the slingshot, run to the first can and dig (guards sent away so the check is repeatable)
await page.evaluate(() => { window.TPH.guardsOff(); window.TPH.run(false); });
await page.keyboard.down('KeyA');
await page.evaluate(() => {
  const T = window.TPH;
  for (let i = 0; i < 180 && T.info().x > -250; i++) T.step(1 / 60);
  if (T.info().where !== 'roam' || Math.abs(T.info().x + 250) > 10) {
    throw new Error('Keyboard movement did not reach the first can');
  }
});
await page.keyboard.up('KeyA');
await page.evaluate(() => window.TPH.step(2));
const info = await page.evaluate(() => window.TPH.info());
if (!info.sack) throw new Error('Rummaging did not collect trash');
console.log(JSON.stringify({ url, throws: info.throws, state: info.state, where: info.where, sack: info.sack, hearts: info.hearts, hour: info.hour, errors }));
await browser.close();
process.exit(errors.length ? 1 : 0);
