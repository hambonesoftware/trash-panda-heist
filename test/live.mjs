// Smoke test against the published site: loads, starts, throws with a real mouse drag, hides, no errors.
import { launchBrowser } from './browser.mjs';

const url = process.argv[2] || 'https://hambonesoftware.github.io/trash-panda-heist/';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + (url.includes('?') ? '&' : '?') + 'test&q=1');
await page.waitForFunction(() => window.TPH && window.TPH.ready, null, { timeout: 90000 });
await page.click('button[data-act=play]');
await page.waitForFunction(() => window.TPH.info().canAim, null, { timeout: 15000 });
const p = await page.evaluate(() => window.TPH.pouchScreen());
await page.mouse.move(p.x, p.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(p.x - 11 * i, p.y + 5 * i);
await page.mouse.up();
await page.waitForFunction(() => window.TPH.info().throws === 1, null, { timeout: 5000 });
await page.keyboard.down('Space');
await page.waitForFunction(() => window.TPH.info().hide > 0.9, null, { timeout: 5000 });
await page.keyboard.up('Space');
const info = await page.evaluate(() => window.TPH.info());
console.log(JSON.stringify({ url, throws: info.throws, state: info.state, errors }));
await browser.close();
process.exit(errors.length ? 1 : 0);
