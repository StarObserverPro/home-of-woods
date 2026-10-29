import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ensureBrowser } from './webgl-session.mjs';

const url = process.env.HOW_PRODUCTION_URL ?? 'http://127.0.0.1:4173/';
const output = resolve(process.env.HOW_EVIDENCE_DIR ?? '.cache/evidence-production');
await mkdir(output, { recursive: true });
const browser = await ensureBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage(), errors = [], failedRequests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', r => failedRequests.push({ url: r.url(), reason: r.failure()?.errorText }));
const report = { url, viewport: { width: 1280, height: 800 }, errors, failedRequests, ok: false };
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.locator('[data-tool="axe"]').waitFor({ state: 'visible' });
  const startup = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    return { debugHooks: typeof window.__HOW__, readinessHook: typeof window.__VISUAL_READY__, webgl: gl?.getParameter(gl.VERSION), contextLost: gl?.isContextLost(), width: document.querySelector('canvas').width };
  });
  assert.equal(startup.debugHooks, 'undefined'); assert.equal(startup.readinessHook, 'undefined');
  assert(startup.webgl.includes('WebGL 2.0')); assert.equal(startup.contextLost, false); assert(startup.width >= 1280);
  report.startup = startup;
  // Let the entry camera settle before comparing the world region for movement.
  await page.waitForTimeout(3000);
  const cdp = await context.newCDPSession(page);
  const capture = async name => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64')); return data;
  };
  const before = await capture('production-start');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  const after = await capture('production-moved');
  report.worldMovement = await page.evaluate(async ({ before, after }) => {
    const decode = data => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.src = `data:image/png;base64,${data}`; });
    const a = await decode(before), b = await decode(after);
    const canvas = document.createElement('canvas'); canvas.width = a.width; canvas.height = a.height;
    const ctx = canvas.getContext('2d');
    const x = Math.floor(a.width * .25), y = Math.floor(a.height * .25), width = Math.floor(a.width * .5), height = Math.floor(a.height * .4);
    ctx.drawImage(a, 0, 0); const first = ctx.getImageData(x, y, width, height).data;
    ctx.drawImage(b, 0, 0); const second = ctx.getImageData(x, y, width, height).data;
    let changed = 0;
    for (let i = 0; i < first.length; i += 4) if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 20) changed++;
    return { changedPixels: changed, checkedPixels: width * height, fraction: changed / (width * height), region: { x, y, width, height } };
  }, { before, after });
  assert(report.worldMovement.fraction > 0.005, 'Keyboard movement must visibly change the central game world');
  await page.keyboard.press('2'); assert.equal(await page.locator('[data-tool="hoe"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('5'); assert.equal(await page.locator('[data-tool="build"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('[data-tool="axe"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); report.ok = true;
  console.log('Production entry, stripped QA hooks, live WebGL, keyboard movement and tools PASS');
} catch (error) { report.failure = { message: error.message, stack: error.stack }; console.error(error); }
finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await context.close(); console.log(`Production evidence: ${output}`); process.exit(report.ok ? 0 : 1);
}
