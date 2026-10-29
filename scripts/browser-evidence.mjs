import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { doctor, ensureBrowser } from './webgl-session.mjs';

const targetUrl = process.env.HOW_QA_URL ?? 'http://127.0.0.1:5173/?qa=1';
const output = resolve(process.env.HOW_EVIDENCE_DIR ?? '.cache/evidence');
const errors = [], requests = [], cases = [], screenshots = [];
const report = { targetUrl, startedAt: new Date().toISOString(), cases, screenshots, errors, failedRequests: requests };
await mkdir(output, { recursive: true });

async function sourceHash() {
  const hash = createHash('sha256');
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path); else hash.update(path).update(await readFile(path));
    }
  }
  await walk('src');
  hash.update(await readFile('package-lock.json'));
  return hash.digest('hex');
}
async function check(name, fn) {
  process.stdout.write(`${name} ... `);
  const result = await fn();
  cases.push({ name, result: 'pass', ...(result === undefined ? {} : { detail: result }) });
  process.stdout.write('PASS\n');
}
function observe(page, label) {
  page.on('pageerror', error => errors.push({ label, message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ label, message: message.text() }); });
  page.on('requestfailed', request => requests.push({ label, url: request.url(), reason: request.failure()?.errorText }));
}
async function ready(page) {
  await page.waitForFunction(() => window.__VISUAL_READY__ === true && !!window.__HOW__, undefined, { timeout: 30000 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const canvas = page.locator('canvas').first();
  assert.equal(await canvas.isVisible(), true, 'Game canvas must be visible');
  const bounds = await canvas.boundingBox();
  assert(bounds && bounds.width > 200 && bounds.height > 200, 'Game canvas must occupy a meaningful area');
}
const state = page => page.evaluate(() => window.__HOW__.state());
async function select(page, tool) { await page.locator(`[data-tool="${tool}"]`).click(); }
async function target(page, point) { await page.evaluate(point => window.__HOW__.target(point), point); }
async function command(page, cmd) { return page.evaluate(cmd => window.__HOW__.command(cmd), cmd); }
async function moveNear(page, point, radius = 1.7) {
  // Fixture positioning uses the same collision-aware domain move command.
  // Every gameplay action below still goes through the visible HUD control.
  // Cancel any still-finishing click-to-walk route before fixture movement.
  // User keyboard/tool input does this too; direct QA commands intentionally do not.
  const activeTool = await page.locator('[data-tool][aria-pressed="true"]').getAttribute('data-tool');
  await select(page, activeTool);
  for (let i = 0; i < 150; i++) {
    const p = (await state(page)).player;
    const d = Math.hypot(point.x - p.x, point.z - p.z);
    if (d <= radius) return;
    await command(page, { type: 'move', x: (point.x - p.x) / d, z: (point.z - p.z) / d, dt: Math.min(0.1, (d - radius + 0.02) / 4.2) });
  }
  throw new Error(`Could not reach fixture point ${JSON.stringify(point)}`);
}
const actionTimes = new WeakMap();
async function act(page, building = false) {
  const previousAction = actionTimes.get(page);
  if (previousAction !== undefined) await page.waitForFunction(time => window.__HOW__.state().time >= time, previousAction + 0.32, { timeout: 10000 });
  const desktop = page.getByTestId(building ? 'build-confirm' : 'action');
  const button = await desktop.isVisible() ? desktop : page.getByTestId(building ? 'touch-build-confirm' : 'touch-action');
  if (process.env.HOW_QA_TRACE) { const s = await state(page); console.log('action-state', JSON.stringify({ player: s.player, inventory: s.inventory, progress: s.progress, label: await button.textContent(), context: await page.locator('.context-main').textContent() })); }
  await button.click();
  actionTimes.set(page, (await state(page)).time);
}
async function shot(page, name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => window.__HOW__.freeze(true));
  const frameState = await state(page);
  const camera = { x: frameState.player.x, z: frameState.player.z - 1.6, zoom: 1 };
  await page.evaluate(camera => window.__HOW__.camera(camera), camera);
  const metrics = await page.evaluate(() => window.__HOW__.metrics());
  const path = join(output, `${name}.png`);
  const statePath = join(output, `${name}.state.json`);
  await writeFile(statePath, JSON.stringify(frameState, null, 2));
  const ui = await page.evaluate(() => ({ tool: document.querySelector('[data-tool][aria-pressed="true"]')?.getAttribute('data-tool'), plant: document.querySelector('[data-testid^="plant-"][aria-pressed="true"]')?.getAttribute('data-testid'), building: document.querySelector('[data-testid^="build-"][aria-pressed="true"]')?.getAttribute('data-testid') }));
  // Capture the compositor directly: Playwright's screenshot animation helper
  // can wait for a frame from a deliberately frozen WebGL runtime.
  const cdp = await page.context().newCDPSession(page);
  let timeout;
  const capture = await Promise.race([
    cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('CDP screenshot timed out')), 30000); }),
  ]).finally(() => clearTimeout(timeout));
  await writeFile(path, Buffer.from(capture.data, 'base64'));
  await cdp.detach();
  screenshots.push({ name, path, statePath, ui, camera: { target: { x: camera.x, y: 0.3, z: camera.z }, offset: { x: 18, y: 24, z: 24 }, zoom: 1 }, viewport: page.viewportSize(), dpr: await page.evaluate(() => devicePixelRatio), seed: frameState.seed, time: frameState.time, player: frameState.player, metrics });
  await page.evaluate(() => window.__HOW__.freeze(false));
}
async function layout(page) {
  return page.evaluate(() => {
    const visibleButtons = [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width && b.getBoundingClientRect().height);
    return {
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      outside: visibleButtons.filter(b => { const r = b.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1; }).map(b => b.getAttribute('aria-label') || b.textContent),
      tools: [...document.querySelectorAll('[data-tool]')].map(b => { const r = b.getBoundingClientRect(); return { tool: b.dataset.tool, width: r.width, height: r.height }; }),
    };
  });
}

let browser;
const contexts = [];
try {
  report.doctor = await doctor();
  report.baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  report.sourceHash = await sourceHash();
  browser = await ensureBrowser();
  if (!process.argv.includes('--mobile-only')) {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }); contexts.push(desktop);
  const page = await desktop.newPage(); observe(page, 'desktop');
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }); await ready(page);
  await check('real game canvas and deterministic start', async () => {
    const initial = await state(page);
    assert.equal(initial.seed, 20261029); assert.equal(initial.inventory.wood, 0); assert(initial.trees.length >= 20);
    await shot(page, 'desktop-start');
    const result = await layout(page); assert.equal(result.horizontalOverflow, false); assert.deepEqual(result.outside, []); return result;
  });

  if (!process.argv.includes('--capture-only')) {
    await check('keyboard movement and five real tool shortcuts', async () => {
      const before = (await state(page)).player;
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
      const after = (await state(page)).player;
      assert(Math.hypot(after.x - before.x, after.z - before.z) > 0.1);
      for (const [i, tool] of ['axe', 'hoe', 'water', 'plant', 'build'].entries()) {
        await page.keyboard.press(String(i + 1));
        assert.equal(await page.locator(`[data-tool="${tool}"]`).getAttribute('aria-pressed'), 'true');
      }
      await select(page, 'axe');
    });
    await check('HUD clicks do not trigger actions behind it', async () => {
      await moveNear(page, { x: -3, z: 1 }); await target(page, { x: -3, z: 1 });
      const before = await state(page);
      await select(page, 'axe'); await select(page, 'hoe'); await select(page, 'axe');
      const after = await state(page);
      assert.deepEqual(after.inventory, before.inventory); assert.deepEqual(after.trees, before.trees);
    });
    await check('world raycast click walks to a reachable ground point', async () => {
      await select(page, 'axe');
      const before = (await state(page)).player;
      const screen = await page.evaluate(() => window.__HOW__.project({ x: 1, z: -1 }));
      await page.mouse.click(screen.x, screen.y);
      await page.waitForFunction(() => { const p = window.__HOW__.state().player; return Math.hypot(p.x - 1, p.z + 1) < 1.2; }, undefined, { timeout: 15000 });
      const after = (await state(page)).player; assert(Math.hypot(after.x - before.x, after.z - before.z) > 0.8);
      await select(page, 'axe');
    });
    await check('chop three trees through the action button', async () => {
      for (const position of [{ x: -3, z: 1 }, { x: -5, z: -2 }, { x: -1, z: -4 }]) {
        await moveNear(page, position); await select(page, 'axe'); await target(page, position);
        for (let i = 0; i < 3; i++) await act(page);
      }
      const s = await state(page); assert.equal(s.inventory.wood, 12); assert.equal(s.progress.chopped, 3);
      assert.equal(s.trees.some(t => t.x === -3 && t.z === 1), false);
    });
    await check('plant a replacement tree and harvest one ripe field', async () => {
      await moveNear(page, { x: -1, z: -4 });
      await select(page, 'plant'); await page.getByTestId('plant-tree').click(); await target(page, { x: -1, z: -4 }); await act(page);
      let s = await state(page); assert.equal(s.progress.planted, 1); assert(s.trees.some(t => t.x === -1 && t.z === -4 && t.stage === 'sapling'));
      await moveNear(page, { x: 3, z: 3 }); await target(page, { x: 3, z: 3 });
      await page.getByTestId('plant-carrot').click(); await act(page);
      s = await state(page); assert.equal(s.inventory.carrots, 3); assert.equal(s.progress.harvested, 1);
    });
    await check('seed and water a field through two tools', async () => {
      await target(page, { x: 3, z: 3 }); await act(page);
      let s = await state(page); const p = s.plots.find(p => p.x === 3 && p.z === 3); assert.equal(p.crop, 'carrot'); assert.equal(p.watered, false);
      await select(page, 'water'); await target(page, { x: 3, z: 3 }); await act(page);
      s = await state(page); assert.equal(s.plots.find(p => p.x === 3 && p.z === 3).watered, true);
    });
    await check('build preview, rotation and cancel keep materials; confirm builds once', async () => {
      await moveNear(page, { x: 3, z: -4 }, 0.45); await select(page, 'build'); await target(page, { x: 5, z: -4 });
      const before = await state(page);
      await page.getByTestId('build-rotate').click(); await page.getByTestId('build-cancel').click();
      assert.equal((await state(page)).inventory.wood, before.inventory.wood);
      await select(page, 'build'); await target(page, { x: 5, z: -4 });
      await shot(page, 'desktop-build-preview'); await act(page, true);
      const built = await state(page); assert.equal(built.inventory.wood, 0); assert.equal(built.buildings.length, 1);
      await select(page, 'axe'); await shot(page, 'desktop-home');
    });
    await check('pause and resume freeze game time and preserve input state', async () => {
      await page.getByTestId('pause').click(); await page.getByRole('dialog').waitFor();
      const before = await state(page);
      await page.keyboard.down('w'); await page.waitForTimeout(300); await page.keyboard.up('w');
      assert.equal((await state(page)).time, before.time); assert.deepEqual((await state(page)).player, before.player);
      await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.waitForTimeout(150); assert((await state(page)).time > before.time);
    });
    await check('save and reload preserve the completed loop', async () => {
      const before = await state(page);
      await page.reload(); await ready(page);
      const after = await state(page);
      assert.deepEqual(after.inventory, before.inventory); assert.deepEqual(after.buildings, before.buildings); assert.deepEqual(after.progress, before.progress);
      assert.equal(after.trees.length, before.trees.length); assert(after.time >= before.time - 2 && after.time < before.time + 2);
    });
    await check('WebGL context loss freezes simulation and restores the scene', async () => {
      const supported = await page.evaluate(() => {
        const gl = document.querySelector('canvas').getContext('webgl2'); const extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) return false;
        window.__qaRestoreContext = () => extension.restoreContext(); extension.loseContext(); return true;
      });
      assert(supported, 'WEBGL_lose_context unavailable');
      await page.waitForTimeout(100); const before = await state(page);
      await page.waitForTimeout(250); assert.equal((await state(page)).time, before.time);
      await page.evaluate(() => window.__qaRestoreContext()); await ready(page);
      await page.waitForTimeout(200); assert((await state(page)).time > before.time);
    });
    report.finalMetrics = await page.evaluate(() => window.__HOW__.metrics());
  }
  await desktop.close();
  }

  for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['mobile-landscape', { width: 844, height: 390 }]]) {
    if (process.argv.includes('--desktop-only')) continue;
    if (process.env.HOW_QA_VIEWPORT && process.env.HOW_QA_VIEWPORT !== name) continue;
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true }); contexts.push(context);
    const phone = await context.newPage(); observe(phone, name);
    await phone.goto(targetUrl, { waitUntil: 'domcontentloaded' }); await ready(phone);
    await check(`${name} viewport, safe controls and touch movement`, async () => {
      const result = await layout(phone);
      assert.equal(result.horizontalOverflow, false); assert.deepEqual(result.outside, []);
      assert(result.tools.every(t => t.width >= 44 && t.height >= 44));
      await shot(phone, name);
      if (!process.argv.includes('--capture-only')) {
        const before = (await state(phone)).player;
        const box = await phone.getByTestId('joystick').boundingBox(); assert(box);
        const cdp = await context.newCDPSession(phone);
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 30, y, id: 1 }] });
        await phone.waitForTimeout(250);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const after = (await state(phone)).player; assert(Math.hypot(after.x - before.x, after.z - before.z) > 0.1);
        await phone.waitForTimeout(150); assert.deepEqual((await state(phone)).player, after, 'Joystick release must stop movement');
        await phone.locator('[data-tool="plant"]').tap(); await phone.getByTestId('plant-carrot').tap();
        await shot(phone, `${name}-plant`);
        await phone.getByTestId('pause').tap(); await phone.getByTestId('resume').tap();
        await cdp.detach();
      }
      return result;
    });
    await context.close();
  }
  assert.deepEqual(errors, [], 'No console or runtime errors are accepted');
  assert.deepEqual(requests, [], 'No failed network requests are accepted');
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = { message: error.message, stack: error.stack };
  report.failureStates = [];
  for (const context of contexts) for (const page of context.pages()) {
    try { report.failureStates.push(await page.evaluate(() => ({ url: location.href, state: window.__HOW__?.state(), context: document.querySelector('.action-context')?.textContent, metrics: window.__HOW__?.metrics() }))); } catch {}
  }
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  for (const context of contexts) await context.close().catch(() => {});
  console.log(`Evidence: ${output}`);
  process.exit(report.ok ? 0 : 1);
}
