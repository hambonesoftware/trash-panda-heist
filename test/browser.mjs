import { chromium } from 'playwright-core';

const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

// Uses an installed Edge or Chrome so the tests need no browser download. BROWSER_PATH overrides.
export async function launchBrowser() {
  const tries = process.env.BROWSER_PATH
    ? [{ executablePath: process.env.BROWSER_PATH }]
    : [{ channel: 'msedge' }, { channel: 'chrome' }, { channel: 'chromium' }];
  let lastErr;
  for (const opt of tries) {
    try { return await chromium.launch({ headless: true, args: ARGS, ...opt }); } catch (e) { lastErr = e; }
  }
  throw new Error('No Edge/Chrome found for tests. Set BROWSER_PATH to a Chromium-based browser.\n' + lastErr.message);
}
