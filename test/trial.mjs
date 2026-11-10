// Build gate: checks every control on desktop and phone layouts, then plays 10 full games with the autoplayer.
import fs from 'node:fs';
import path from 'node:path';
import { serve, ROOT } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const GAMES = +(process.env.TRIAL_GAMES || 10);
const MIN_WINS = +(process.env.TRIAL_MIN_WINS || 8);
const OUT = path.join(ROOT, 'test-results');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const t0 = Date.now();
const log = s => console.log(s);
async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - start });
    log(`  PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - start, err: e.message.split('\n')[0] });
    log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const srv = await serve();
const BASE = `http://127.0.0.1:${srv.address().port}/?test`;
const browser = await launchBrowser();

async function openPage(contextOpts, label) {
  const { quality, ...opts } = contextOpts;
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => errors.push('request failed: ' + r.url()));
  await page.goto(BASE + '&q=' + (contextOpts.quality ?? 1), { waitUntil: 'load' });
  await page.waitForFunction(() => window.TPH && window.TPH.ready, null, { timeout: 90000 });
  page.label = label;
  page.errors = errors;
  return { context, page };
}
const info = page => page.evaluate(() => window.TPH.info());
async function until(page, fn, arg, ms = 8000, what = 'condition') {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); }
  catch (e) { throw new Error(`timed out waiting for ${what}; state ${JSON.stringify(await info(page))}`); }
}
const ready = page => until(page, () => window.TPH.info().canAim, null, 8000, 'slingshot ready');
async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  assert(b, sel + ' not visible');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function mouseDrag(page, from, dx, dy, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
  const mid = await info(page);
  await page.mouse.up();
  return mid;
}
async function touchDrag(cdp, from, dx, dy, steps = 10) {
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(from.x + (dx * i) / steps, from.y + (dy * i) / steps) });
    await new Promise(r => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchHold(cdp, at, ms) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 2 }] });
  await new Promise(r => setTimeout(r, ms));
}
const touchUp = cdp => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
async function noErrors(page) { assert(page.errors.length === 0, 'console errors: ' + page.errors.slice(0, 3).join(' | ')); }

async function layoutCheck(page) {
  const r = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const ids = ['status', 'topBtns', 'hideBtn', 'ammo'];
    const boxes = ids.map(id => { const b = document.getElementById(id).getBoundingClientRect(); return { id, l: b.left, t: b.top, r: b.right, b: b.bottom }; });
    const out = boxes.filter(b => b.l < -1 || b.t < -1 || b.r > vw + 1 || b.b > vh + 1).map(b => b.id);
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b) overlaps.push(a.id + '/' + c.id);
    }
    const se = document.scrollingElement;
    const cv = document.getElementById('game').getBoundingClientRect();
    return { out, overlaps, scroll: se.scrollWidth > vw + 1 || se.scrollHeight > vh + 1, canvas: [Math.round(cv.width), Math.round(cv.height)], vw, vh };
  });
  assert(!r.out.length, 'outside viewport: ' + r.out.join(', '));
  assert(!r.overlaps.length, 'overlapping HUD: ' + r.overlaps.join(', '));
  assert(!r.scroll, 'page scrolls');
  assert(r.canvas[0] === r.vw && r.canvas[1] === r.vh, `canvas ${r.canvas} does not fill ${r.vw}x${r.vh}`);
}

// ------------------------------------------------------------ desktop
log('\nDesktop controls (1280x720, mouse + keyboard)');
{
  const { context, page } = await openPage({ viewport: { width: 1280, height: 720 } }, 'desktop');
  await check('renders frames with WebGL', async () => {
    await until(page, () => window.TPH.frames > 20, null, 30000, 'frames');
  });
  await check('Play button starts level 1', async () => {
    await page.click('button[data-act=play]');
    await until(page, () => window.TPH.info().state === 'play' && !window.TPH.info().overlay, null, 5000, 'play state');
  });
  await check('layout fits with no overlap', () => layoutCheck(page));
  await check('mouse: drag the pouch back to wind up, release to throw', async () => {
    await ready(page);
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    const mid = await mouseDrag(page, p, -130, 60);
    assert(mid.aiming && mid.pull > 0.5, 'not winding up while dragging: ' + JSON.stringify(mid));
    await until(page, () => window.TPH.info().throws === 1, null, 3000, 'throw');
  });
  await check('mouse: tiny drag cancels instead of throwing', async () => {
    await ready(page);
    const before = (await info(page)).throws;
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    await mouseDrag(page, p, -4, 2, 2);
    await page.waitForTimeout(300);
    assert((await info(page)).throws === before, 'tiny drag threw');
  });
  await check('mouse: drag starting on the left side (off the raccoon) also throws', async () => {
    await ready(page);
    const before = (await info(page)).throws;
    await mouseDrag(page, { x: 380, y: 360 }, -120, 70);
    await until(page, n => window.TPH.info().throws === n + 1, before, 3000, 'throw');
  });
  await check('mouse: right-side click does not start a pull', async () => {
    await ready(page);
    const before = (await info(page)).throws;
    await mouseDrag(page, { x: 1100, y: 420 }, -150, 50);
    await page.waitForTimeout(300);
    assert((await info(page)).throws === before, 'right side started a throw');
  });
  for (const key of ['Space', 'ArrowDown', 'KeyS']) {
    await check(`keyboard: hold ${key} to hide, release to pop back up`, async () => {
      await page.keyboard.down(key);
      await until(page, () => window.TPH.info().hide > 0.95, null, 2000, 'hidden');
      await page.keyboard.up(key);
      await until(page, () => window.TPH.info().hide < 0.05, null, 2000, 'unhidden');
    });
  }
  await check('hidden raccoon cannot be pulled back', async () => {
    await ready(page);
    const before = (await info(page)).throws;
    await page.keyboard.down('Space');
    await until(page, () => window.TPH.info().hide > 0.95, null, 2000, 'hidden');
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    await mouseDrag(page, p, -130, 60);
    await page.keyboard.up('Space');
    await page.waitForTimeout(300);
    assert((await info(page)).throws === before, 'threw while hidden');
  });
  await check('HIDE button: hold with mouse', async () => {
    const c = await center(page, '#hideBtn');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await until(page, () => window.TPH.info().hide > 0.95, null, 2000, 'hidden');
    await page.mouse.up();
    await until(page, () => window.TPH.info().hide < 0.05, null, 2000, 'unhidden');
  });
  await check('fish bones split into three on click', async () => {
    await page.evaluate(() => { window.TPH.start(0); window.TPH.setAmmo('fish'); });
    await ready(page);
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    await mouseDrag(page, p, -110, 80);
    await page.waitForTimeout(120);
    await page.mouse.click(900, 200);
    await until(page, () => window.TPH.info().projs >= 3, null, 1500, 'split');
    await page.evaluate(() => window.TPH.setAmmo(null));
  });
  await check('R restarts the level', async () => {
    await page.keyboard.press('KeyR');
    await until(page, () => { const i = window.TPH.info(); return i.throws === 0 && i.levelTime < 1.5 && i.state === 'play'; }, null, 2000, 'restart');
  });
  await check('restart button restarts the level', async () => {
    await ready(page);
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    await mouseDrag(page, p, -120, 50);
    await until(page, () => window.TPH.info().throws === 1, null, 3000, 'throw');
    await page.click('#restartBtn');
    await until(page, () => window.TPH.info().throws === 0, null, 2000, 'restart');
  });
  await check('M key and sound button toggle mute', async () => {
    await page.keyboard.press('KeyM');
    assert((await info(page)).muted === true, 'M did not mute');
    assert(await page.getAttribute('#muteBtn', 'aria-pressed') === 'true', 'button not pressed');
    await page.click('#muteBtn');
    assert((await info(page)).muted === false, 'button did not unmute');
  });
  await check('P pauses (time stops), Resume button continues', async () => {
    await page.keyboard.press('KeyP');
    await until(page, () => window.TPH.info().state === 'paused', null, 2000, 'paused');
    const a = (await info(page)).levelTime;
    await page.waitForTimeout(500);
    assert((await info(page)).levelTime === a, 'time moved while paused');
    await page.click('button[data-act=resume]');
    await until(page, () => window.TPH.info().state === 'play', null, 2000, 'resumed');
  });
  await check('pause button and Escape toggle pause', async () => {
    await page.click('#pauseBtn');
    await until(page, () => window.TPH.info().state === 'paused', null, 2000, 'paused');
    await page.keyboard.press('Escape');
    await until(page, () => window.TPH.info().state === 'play', null, 2000, 'resumed');
  });
  await check('win screen: Next level button', async () => {
    await page.evaluate(() => window.TPH.forceWin());
    await page.waitForSelector('button[data-act=next]', { timeout: 25000 });
    await page.click('button[data-act=next]');
    await until(page, () => window.TPH.info().level === 1 && window.TPH.info().state === 'play', null, 3000, 'level 2');
  });
  await check('win screen: Replay button and Enter key', async () => {
    await page.evaluate(() => window.TPH.forceWin());
    await page.waitForSelector('button[data-act=retry]', { timeout: 25000 });
    await page.click('button[data-act=retry]');
    await until(page, () => window.TPH.info().level === 1 && window.TPH.info().state === 'play', null, 3000, 'replay');
    await page.evaluate(() => window.TPH.forceWin());
    await page.waitForSelector('button[data-act=next]', { timeout: 25000 });
    await page.keyboard.press('Enter');
    await until(page, () => window.TPH.info().level === 2 && window.TPH.info().state === 'play', null, 3000, 'Enter advanced');
  });
  await check('lose screen: Try again button', async () => {
    await page.evaluate(() => window.TPH.forceLose());
    await page.waitForSelector('button[data-act=retry]', { timeout: 25000 });
    await page.click('button[data-act=retry]');
    await until(page, () => { const i = window.TPH.info(); return i.state === 'play' && i.hearts === 3; }, null, 3000, 'retry');
  });
  await check('rule: worker throws at an exposed raccoon (lose a heart)', async () => {
    const r = await page.evaluate(() => {
      const T = window.TPH; T.run(false); T.seed(7); T.start(0); T.hide(false);
      let g = 0; while (T.info().hearts === 3 && g++ < 60 * 40) T.step(1 / 60);
      const out = T.info(); T.run(true); return out;
    });
    assert(r.hearts === 2, 'no damage taken: ' + JSON.stringify(r));
  });
  await check('rule: hiding in the can blocks the worker', async () => {
    const r = await page.evaluate(() => {
      const T = window.TPH; T.run(false); T.seed(7); T.start(0); T.hide(true);
      T.step(40); const out = T.info(); T.hide(false); T.run(true); return out;
    });
    assert(r.hearts === 3, 'took damage while hidden: ' + JSON.stringify(r));
    assert(r.boxes >= 10, 'worker did not restock: ' + JSON.stringify(r));
  });
  await check('rule: window blur releases a held hide', async () => {
    await page.keyboard.down('Space');
    await until(page, () => window.TPH.info().hide > 0.9, null, 2000, 'hidden');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await until(page, () => window.TPH.info().hide < 0.05, null, 2000, 'released');
    await page.keyboard.up('Space');
  });
  await page.screenshot({ path: path.join(OUT, 'desktop.png') });
  await check('desktop: no console errors', () => noErrors(page));

  // ------------------------------------------------------------ trial
  log(`\n${GAMES}-game trial (autoplayer, real game rules, fixed seeds)`);
  const games = [];
  for (let i = 0; i < GAMES; i++) {
    const r = await page.evaluate(([lvl, seed]) => { window.TPH.run(false); return window.TPH.autoplay(lvl, seed); }, [i % 3, 1000 + i]);
    games.push(r);
    log(`  game ${String(i + 1).padStart(2)}  level ${r.level}  ${r.result.padEnd(7)}  ${String(r.time).padStart(6)}s  ${String(r.throws).padStart(3)} throws  ${r.hearts} hearts`);
  }
  await page.evaluate(() => window.TPH.run(true));
  const wins = games.filter(g => g.result === 'win').length;
  await check(`trial: all ${GAMES} games finished (no hangs or timeouts)`, async () => {
    const bad = games.filter(g => g.result === 'timeout');
    assert(!bad.length, bad.length + ' game(s) timed out');
  });
  await check(`trial: autoplayer won at least ${MIN_WINS} of ${GAMES}`, async () => assert(wins >= MIN_WINS, `won ${wins}`));
  await check('trial: no console errors during games', () => noErrors(page));
  fs.writeFileSync(path.join(OUT, 'trial.json'), JSON.stringify(games, null, 2));
  await context.close();
}

// ------------------------------------------------------------ phones
const PHONES = [
  { label: 'Phone landscape (844x390, touch)', viewport: { width: 844, height: 390 } },
  { label: 'Phone portrait (390x844, touch)', viewport: { width: 390, height: 844 } },
];
for (const ph of PHONES) {
  log('\n' + ph.label);
  const { context, page } = await openPage({ viewport: ph.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, quality: 0 }, ph.label);
  const cdp = await context.newCDPSession(page);
  await check('tap Play starts the game', async () => {
    const c = await center(page, 'button[data-act=play]');
    await page.touchscreen.tap(c.x, c.y);
    await until(page, () => window.TPH.info().state === 'play', null, 5000, 'play');
  });
  await check('layout fits with no overlap', () => layoutCheck(page));
  if (ph.viewport.height > ph.viewport.width) {
    await check('rotate hint shows in portrait', async () => {
      assert(await page.isVisible('#rotate'), 'rotate hint hidden');
    });
  }
  await check('touch: drag the pouch back and release to throw', async () => {
    await ready(page);
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    const k = ph.viewport.width / 1280;
    await touchDrag(cdp, p, -150 * k, 70 * k);
    await until(page, () => window.TPH.info().throws === 1, null, 3000, 'throw');
  });
  await check('touch: hold HIDE to duck, lift to pop up', async () => {
    const c = await center(page, '#hideBtn');
    await touchHold(cdp, c, 500);
    assert((await info(page)).hide > 0.9, 'not hidden while held');
    await touchUp(cdp);
    await until(page, () => window.TPH.info().hide < 0.05, null, 2000, 'unhidden');
  });
  await check('touch: tap splits fish bones mid-flight', async () => {
    await page.evaluate(() => { window.TPH.start(0); window.TPH.setAmmo('fish'); });
    await ready(page);
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    const k = ph.viewport.width / 1280;
    await touchDrag(cdp, p, -140 * k, 90 * k);
    await page.waitForTimeout(100);
    await page.touchscreen.tap(ph.viewport.width * 0.7, ph.viewport.height * 0.3);
    await until(page, () => window.TPH.info().projs >= 3, null, 1500, 'split');
    await page.evaluate(() => window.TPH.setAmmo(null));
  });
  await check('touch: pause and restart buttons respond to taps', async () => {
    const pb = await center(page, '#pauseBtn');
    await page.touchscreen.tap(pb.x, pb.y);
    await until(page, () => window.TPH.info().state === 'paused', null, 2000, 'paused');
    const rb = await center(page, 'button[data-act=resume]');
    await page.touchscreen.tap(rb.x, rb.y);
    await until(page, () => window.TPH.info().state === 'play', null, 2000, 'resumed');
    const rs = await center(page, '#restartBtn');
    await page.touchscreen.tap(rs.x, rs.y);
    await until(page, () => window.TPH.info().throws === 0, null, 2000, 'restart');
  });
  await check('touch: second finger cannot throw while a thumb holds HIDE', async () => {
    await ready(page);
    const before = (await info(page)).throws;
    const hb = await center(page, '#hideBtn');
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    const k = ph.viewport.width / 1280;
    const both = (x, y) => [{ x: hb.x, y: hb.y, id: 2 }, { x, y, id: 3 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hb.x, y: hb.y, id: 2 }] });
    await until(page, () => window.TPH.info().hide > 0.9, null, 2000, 'hidden');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: both(p.x, p.y) });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: both(p.x - 18 * i * k, p.y + 9 * i * k) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: hb.x, y: hb.y, id: 2 }] });
    await touchUp(cdp);
    await page.waitForTimeout(300);
    assert((await info(page)).throws === before, 'threw while hidden');
    await until(page, () => window.TPH.info().hide < 0.05, null, 2000, 'unhidden');
  });
  await check('touch: long press does not open a menu or select text', async () => {
    const r = await page.evaluate(() => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      const a = document.getElementById('game').dispatchEvent(ev);
      const b = document.getElementById('hideBtn').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return { canvas: a, hide: b, select: getComputedStyle(document.body).userSelect };
    });
    assert(!r.canvas && !r.hide, 'context menu not suppressed');
    assert(r.select === 'none', 'text selectable');
  });
  await check('touch: win and lose screen buttons respond to taps', async () => {
    await page.evaluate(() => window.TPH.forceWin());
    await page.waitForSelector('button[data-act=next]', { timeout: 25000 });
    let c = await center(page, 'button[data-act=next]');
    await page.touchscreen.tap(c.x, c.y);
    await until(page, () => window.TPH.info().level === 1 && window.TPH.info().state === 'play', null, 3000, 'next level');
    await page.evaluate(() => window.TPH.forceLose());
    await page.waitForSelector('button[data-act=retry]', { timeout: 25000 });
    c = await center(page, 'button[data-act=retry]');
    await page.touchscreen.tap(c.x, c.y);
    await until(page, () => window.TPH.info().state === 'play' && window.TPH.info().hearts === 3, null, 3000, 'retry');
  });
  await check('rotating the phone mid-game keeps the game playable', async () => {
    const { width, height } = ph.viewport;
    await page.evaluate(() => window.TPH.start(2));
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(400);
    await layoutCheck(page);
    await ready(page);
    const before = (await info(page)).throws;
    const p = await page.evaluate(() => window.TPH.pouchScreen());
    const k = Math.min(width, height) / 720;
    await touchDrag(cdp, p, -150 * k, 70 * k);
    await until(page, n => window.TPH.info().throws === n + 1, before, 3000, 'throw after rotate');
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await layoutCheck(page);
  });
  await check('touch: page does not scroll or zoom on drag', async () => {
    await touchDrag(cdp, { x: ph.viewport.width * 0.8, y: ph.viewport.height * 0.6 }, -200, -200);
    const s = await page.evaluate(() => [scrollX, scrollY, visualViewport ? visualViewport.scale : 1]);
    assert(s[0] === 0 && s[1] === 0 && s[2] === 1, 'scrolled/zoomed: ' + s);
  });
  await page.screenshot({ path: path.join(OUT, ph.viewport.width > ph.viewport.height ? 'phone-landscape.png' : 'phone-portrait.png') });
  await check('no console errors', () => noErrors(page));
  await context.close();
}

await browser.close();
srv.close();

const failed = results.filter(r => !r.ok);
log(`\n${results.length - failed.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)}s. Screenshots and trial.json are in test-results/.`);
fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(results, null, 2));
if (failed.length) {
  log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
