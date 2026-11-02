/** Actual production UI/runtime capture. Install playwright separately; no runtime dependency. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const out = 'evidence/wildlife-phase1/browser'; await fs.mkdir(out, { recursive: true });
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const report = { sourceCommit, backend: 'GitHub Actions Chromium / SwiftShader', deviceLimit: 'Viewport emulation only; not physical mobile GPU validation', frames: {}, reentries: [], errors: [] };
const stats = async page => JSON.parse(await page.locator('#runtime-stats').textContent());
const small = data => ({ time: data.gameTime, wildlife: data.wildlife, encounters: data.wildlifeViews, resources: data.resources,
  drawCalls: data.drawCalls, triangles: data.triangles, gpu: data.gpu, shaderErrors: data.shaderErrors,
  canvas: data.canvas, appearance: data.appearance, loop: data.loop, graphicsBackend: data.graphicsBackend });
async function ready(page, expected = 2) {
  await page.waitForFunction(expected => {
    const text = document.querySelector('#runtime-stats')?.textContent;
    if (!text) return false;
    const data = JSON.parse(text).current;
    return data.wildlife?.active === expected && data.gameTime > 2;
  }, expected, { timeout: 120000 });
}
async function capture(page, name, view, night = false) {
  await page.locator('details.diagnostics').evaluate(e => { e.open = true; });
  await page.getByLabel('场景观察位置').selectOption(view);
  if (night) await page.getByRole('button', { name: '夜晚', exact: true }).click();
  else await page.getByRole('button', { name: '白昼', exact: true }).click();
  const data = (await stats(page)).current;
  assert.equal(data.shaderErrors, 0); assert.equal(data.wildlife.active, 2);
  assert.equal(data.wildlife.visible, night ? 0 : 2);
  const before = JSON.stringify(data.wildlifeViews), time = data.gameTime;
  await page.waitForTimeout(250);
  const frozen = (await stats(page)).current;
  assert.equal(frozen.gameTime, time); assert.equal(JSON.stringify(frozen.wildlifeViews), before);
  await page.locator('details.diagnostics').evaluate(e => { e.style.visibility = 'hidden'; });
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.locator('details.diagnostics').evaluate(e => { e.style.visibility = ''; });
  report.frames[name] = small(data);
}
try {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?inspect=1', { waitUntil: 'domcontentloaded' }); await ready(page);
  await page.screenshot({ path: `${out}/desktop-normal.png` });
  await capture(page, 'desktop-pair', 'wildlife');
  await capture(page, 'desktop-squirrel', 'squirrel');
  await capture(page, 'desktop-hare', 'hare');
  await capture(page, 'desktop-night', 'wildlife', true);
  const originalIds = (await stats(page)).current.wildlife.ids;
  for (let i = 0; i < 5; i++) {
    const version = Number(await page.locator('#runtime-stats').getAttribute('data-runtime-version'));
    await page.getByRole('button', { name: '卸载并重入', exact: true }).click();
    await page.waitForFunction(v => Number(document.querySelector('#runtime-stats')?.getAttribute('data-runtime-version')) > v, version, { timeout: 120000 });
    await ready(page);
    const data = await stats(page), dead = data.audit.at(-1);
    assert.equal(dead.destroyed, true); assert.equal(dead.loop.destroyed, true); assert.equal(dead.resources.disposed, true);
    assert.equal(dead.resources.extras, 0); assert.equal(dead.wildlife.active, 0);
    assert.deepEqual(data.current.wildlife.ids, originalIds);
    report.reentries.push({ released: small(dead), current: small(data.current) });
  }
  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage(); phone.on('pageerror', e => report.errors.push(e.message));
  await phone.goto('http://127.0.0.1:5173/?inspect=1'); await ready(phone);
  await capture(phone, 'mobile-pair', 'wildlife'); await capture(phone, 'mobile-hare', 'hare'); await mobile.close();
  const offline = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await offline.route('**/assets/wildlife/*.glb', route => route.abort('failed'));
  const fallback = await offline.newPage(); fallback.on('pageerror', e => report.errors.push(e.message));
  await fallback.goto('http://127.0.0.1:5173/?inspect=1'); await ready(fallback, 0);
  report.optionalFailure = small((await stats(fallback)).current); assert.equal(report.optionalFailure.shaderErrors, 0);
  await offline.close(); assert.deepEqual(report.errors, []);
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = String(error?.stack ?? error); throw error; }
finally { await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
