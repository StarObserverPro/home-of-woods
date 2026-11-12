/** Built-page verification in one real Chromium session. Artifacts are not source assets. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const cwd = process.cwd();
const out = path.resolve(process.env.CABIN_EVIDENCE_DIR ?? '/tmp/how-cabin-evidence');
const origin = 'http://127.0.0.1:4180';
const target = `${origin}/sandbox/cabin-interior/`;
const storageKey = 'home-of-woods:cabin-audit:v1';
await fs.mkdir(out, { recursive: true });
const built = await fs.readFile(path.join(cwd, 'dist/sandbox/cabin-interior/index.html'));
const report = {
  startedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
  builtEntrySha256: createHash('sha256').update(built).digest('hex'),
  target, node: process.version, browser: null, status: 'running',
  captureInputs: { layout: 'authored-cabin-v1; no random placement', camera: 'fixed inspection bookmarks', animationTiming: 'Paused at capture; idle/walk phase depends on elapsed runtime and is not deterministic.', dpr: 1 },
  frames: [], flows: [], errors: [], networkFailures: [], consoleWarnings: [],
  limits: [
    'Chromium ANGLE/SwiftShader is rendering and interaction evidence, not physical phone GPU performance.',
    'Screenshots and recordings require visual review; automated success does not certify artistic quality.',
    'No GPU timer is inferred from wall-clock or CPU timings.',
  ],
};
let phase = 'start preview', previewLog = '', browser, activePage;
const server = spawn(process.execPath, [path.join(cwd, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { previewLog = (previewLog + chunk).slice(-80000); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForPreview() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Preview exited (${server.exitCode}): ${previewLog}`);
    try { if ((await fetch(target, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* bounded startup retry */ }
    await delay(250);
  }
  throw new Error(`Preview did not become ready: ${previewLog}`);
}
async function snapshot(page) { return page.evaluate(() => window.__CABIN_AUDIT__.getSnapshot()); }
async function ready(page) {
  await page.waitForFunction(() => window.__VISUAL_READY__ === true && !!window.__CABIN_AUDIT__, null, { timeout: 120000 });
  await frames(page, 2);
}
async function frames(page, count = 2) {
  await page.evaluate(count => new Promise(resolve => {
    const tick = () => count-- > 0 ? requestAnimationFrame(tick) : resolve(); tick();
  }), count);
}
async function waitIdle(page) {
  await page.waitForFunction(() => !document.querySelector('#navigation-hint')?.textContent.includes('正在走近'), null, { timeout: 120000 });
  await frames(page, 2);
}
async function waitPosture(page, posture) {
  await page.waitForFunction(posture => window.__CABIN_AUDIT__?.getSnapshot().player.posture === posture, posture, { timeout: 120000 });
  await frames(page, 2);
}
async function settleChest(page) {
  // Reports are published every .75 simulation seconds. Observing two fresh
  // reports guarantees at least one full interval after the open command;
  // the lid's damping reaches within .0002 of its target over that interval.
  await page.evaluate(() => new Promise((resolve, reject) => {
    let previous = window.__QA_STATE__, remaining = 2, done = false;
    const timeout = setTimeout(() => { done = true; reject(new Error('Chest animation did not receive fresh scene updates')); }, 60000);
    const observe = () => {
      if (done) return;
      const next = window.__QA_STATE__;
      if (next && next !== previous) {
        previous = next;
        if (--remaining === 0) { done = true; clearTimeout(timeout); resolve(); return; }
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }));
}
async function clickItem(page, id) { await page.locator(`[data-select="audit:${id}"]`).click(); }
async function capture(page, name, camera) {
  phase = `capture ${name}`;
  // This public inspection bookmark runs the same camera controller, without
  // writing a second state or relying on an approximate hand-orbited position.
  if (camera) await page.evaluate(camera => window.__CABIN_AUDIT__.camera(camera), camera);
  await page.waitForFunction(() => {
    const api = window.__CABIN_AUDIT__;
    const target = api.getSnapshot().doorOpen ? -Math.PI / 2 : 0;
    return Math.abs(api.stats().shell.doorAngle - target) < .002;
  }, null, { timeout: 60000 });
  await frames(page, 2);
  await page.evaluate(() => window.__CABIN_AUDIT__.pause());
  try {
    const evidence = await page.evaluate(() => {
      const api = window.__CABIN_AUDIT__, canvas = document.querySelector('.cabin-canvas');
      const gl = canvas?.getContext('webgl2');
      if (!gl || gl.isContextLost() || window.__CABIN_CONTEXT_LOST__) throw new Error('The actual cabin WebGL context is unavailable or lost');
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 100) throw new Error('Cabin canvas is hidden or too small');
      const sample = document.createElement('canvas'); sample.width = sample.height = 64;
      const ctx = sample.getContext('2d'); ctx.drawImage(canvas, 0, 0, 64, 64);
      const pixels = ctx.getImageData(0, 0, 64, 64).data;
      let sum = 0, sumSq = 0, nonBlack = 0; const colours = new Set();
      for (let i = 0; i < pixels.length; i += 4) {
        const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        sum += light; sumSq += light * light;
        if (light > 8) nonBlack++;
        colours.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
      }
      const mean = sum / 4096, deviation = Math.sqrt(sumSq / 4096 - mean * mean);
      const stats = api.stats();
      if (nonBlack < 256 || colours.size < 12 || deviation < 4 || stats.drawCalls < 10 || stats.triangles < 1000) throw new Error('Cabin canvas is black, uniform or missing actual scene geometry');
      return {
        state: api.getSnapshot(), stats, audit: api.audit(),
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        canvasPixels: { nonBlack, quantizedColours: colours.size, luminanceDeviation: deviation },
        webglVersion: gl.getParameter(gl.VERSION), contextLost: false,
        gpuTimeMs: null, image: api.capture(),
      };
    });
    const imagePath = path.join(out, `${name}-canvas.png`);
    await fs.writeFile(imagePath, Buffer.from(evidence.image.split(',')[1], 'base64'));
    delete evidence.image;
    await page.screenshot({ path: path.join(out, `${name}-ui.png`), fullPage: true, animations: 'disabled' });
    report.frames.push({ name, image: path.basename(imagePath), ui: `${name}-ui.png`, ...evidence });
    assert.equal(evidence.audit.ok, true, `${name}: ${evidence.audit.issues.join('; ')}`);
    console.log(`Captured ${name}: ${evidence.stats.drawCalls} draws / ${evidence.stats.triangles} triangles`);
  } finally { await page.evaluate(() => window.__CABIN_AUDIT__.resume()); }
}
async function setupContext(options, label) {
  const context = await browser.newContext({ deviceScaleFactor: 1, ...options, recordVideo: { dir: path.join(out, 'videos'), size: options.viewport } });
  await context.addInitScript(() => {
    window.__CABIN_CONTEXT_LOST__ = false;
    document.addEventListener('webglcontextlost', () => { window.__CABIN_CONTEXT_LOST__ = true; }, true);
  });
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
  let closing = false;
  page.on('pageerror', error => report.errors.push({ label, phase, type: 'pageerror', message: String(error) }));
  page.on('console', message => {
    if (message.type() === 'error' || /shader error|VALIDATE_STATUS.*false|THREE\.WebGLProgram.*error|GL_INVALID/i.test(message.text())) report.errors.push({ label, phase, type: message.type(), message: message.text() });
    else if (message.type() === 'warning') report.consoleWarnings.push({ label, phase, message: message.text() });
  });
  page.on('requestfailed', request => {
    if (!closing && request.url().startsWith(origin)) report.networkFailures.push({ label, phase, url: request.url(), error: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) report.networkFailures.push({ label, phase, url: response.url(), status: response.status() });
  });
  await page.goto(target); await ready(page);
  return { page, close: async () => { closing = true; await context.close(); } };
}
async function useAndWait(page, id, posture) {
  await clickItem(page, id);
  await page.locator('[data-action="use"]').click();
  if (posture) await waitPosture(page, posture); else await waitIdle(page);
}
async function assertNoOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal overflow`);
}

try {
  await waitForPreview();
  phase = 'launch Chromium';
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  report.browser = await browser.version();
  const desktop = await setupContext({ viewport: { width: 1440, height: 960 } }, 'desktop');
  const page = desktop.page;
  phase = 'starter preset';
  const initial = await snapshot(page);
  assert.equal(initial.items.filter(item => item.location.kind !== 'stored').length, 4);
  assert.equal(new Set(initial.items.map(item => item.instanceId)).size, 10);
  await capture(page, '01-starter-day', 'room');
  await page.locator('[data-preset="full"]').click();
  assert.equal((await snapshot(page)).items.filter(item => item.location.kind !== 'stored').length, 10);
  await capture(page, '02-full-day', 'room');

  phase = 'continuous entry and furniture use';
  await page.getByRole('button', { name: '走进木屋', exact: true }).click();
  await waitIdle(page);
  assert.ok((await snapshot(page)).player.z < 3.5);
  await useAndWait(page, 'bed', 'resting');
  const bedUse = await snapshot(page);
  assert.equal(bedUse.player.usingId, 'audit:bed');
  await capture(page, '03-bed-rest', 'detail');
  await page.getByRole('button', { name: '起身', exact: true }).click();
  await waitPosture(page, 'standing');
  await useAndWait(page, 'stool', 'seated');
  assert.equal((await snapshot(page)).player.usingId, 'audit:stool');
  await capture(page, '04-stool-seat', 'detail');
  await page.getByRole('button', { name: '起身', exact: true }).click();
  await waitPosture(page, 'standing');
  await useAndWait(page, 'chest');
  assert.equal((await snapshot(page)).items.find(item => item.definitionId === 'chest').open, true);
  await settleChest(page);
  await capture(page, '05-chest-open', 'detail');
  await page.getByRole('button', { name: '走进木屋', exact: true }).click(); await waitIdle(page);
  await page.locator('#door').click();
  assert.equal((await snapshot(page)).doorOpen, false);
  await capture(page, '06-door-closed', 'room');
  await page.locator('#door').click();
  assert.equal((await snapshot(page)).doorOpen, true);
  await page.getByRole('button', { name: '走到门前', exact: true }).click(); await waitIdle(page);
  assert.ok((await snapshot(page)).player.z > 3.5);
  report.flows.push({ name: 'entry-rest-stand-seat-stand-chest-door-exit', passed: true });

  phase = 'material and cutaway controls';
  await page.locator('#daylight').click();
  await capture(page, '07-full-evening', 'room');
  await page.locator('#cut-mode').selectOption('stage');
  await capture(page, '08-stage-cut', 'opposite');
  await page.locator('#cut-mode').selectOption('closed');
  await capture(page, '09-complete-roof', 'room');
  await page.locator('#cut-mode').selectOption('auto');
  await page.locator('#daylight').click();
  await page.locator('.audit-panel > summary').click();
  await page.locator('#material-mode').selectOption('clay');
  await capture(page, '10-clay-no-post', 'room');
  await page.locator('#material-mode').selectOption('normal');
  await page.locator('#spaces').check();
  await capture(page, '11-spatial-plan', 'plan');
  await page.locator('#spaces').uncheck();
  report.flows.push({ name: 'day-evening-auto-stage-closed-clay-spatial', passed: true });

  phase = 'valid placement and cancellation';
  await clickItem(page, 'rug');
  const beforeMove = await snapshot(page);
  await page.locator('[data-action="move"]').click();
  await page.locator('[data-nudge="right"]').click();
  assert.equal(await page.locator('#place-confirm').isEnabled(), true);
  await page.locator('#place-confirm').click();
  const moved = await snapshot(page);
  assert.equal(moved.items.length, beforeMove.items.length);
  assert.notDeepEqual(moved.items.find(item => item.definitionId === 'rug').location, beforeMove.items.find(item => item.definitionId === 'rug').location);
  await page.locator('[data-action="move"]').click();
  await page.locator('#rotate').click();
  await page.locator('#place-cancel').click();
  assert.deepEqual(await snapshot(page), moved, 'Cancel must preserve every committed item and player field');

  phase = 'invalid entrance placement';
  await clickItem(page, 'chest');
  const beforeInvalid = await snapshot(page);
  await page.locator('[data-action="move"]').click();
  for (let step = 0; step < 38; step++) await page.locator('[data-nudge="front"]').click();
  assert.equal(await page.locator('#place-confirm').isEnabled(), false);
  assert.ok((await page.locator('#placement-reason').innerText()).trim().length > 3);
  await capture(page, '12-invalid-placement', 'plan');
  await page.locator('#place-cancel').click();
  assert.deepEqual(await snapshot(page), beforeInvalid);
  report.flows.push({ name: 'valid-move-rotate-cancel-invalid-entrance', passed: true });

  phase = 'host movement and dependent item identity';
  await clickItem(page, 'table');
  const beforeHost = await snapshot(page);
  await page.locator('[data-action="move"]').click();
  await page.locator('[data-nudge="right"]').click();
  assert.equal(await page.locator('#place-confirm').isEnabled(), true, await page.locator('#placement-reason').innerText());
  await page.locator('#place-confirm').click();
  const afterHost = await snapshot(page);
  assert.notDeepEqual(afterHost.items.find(item => item.definitionId === 'table').location, beforeHost.items.find(item => item.definitionId === 'table').location);
  for (const id of ['lantern', 'bowl']) {
    assert.deepEqual(afterHost.items.find(item => item.definitionId === id), beforeHost.items.find(item => item.definitionId === id), `${id}: parent-relative identity must be preserved`);
  }
  await capture(page, '13-moved-table-dependents', 'detail');
  await page.locator('[data-action="store"]').click();
  const storedHost = await snapshot(page);
  for (const id of ['table', 'lantern', 'bowl']) assert.equal(storedHost.items.find(item => item.definitionId === id).location.kind, 'stored');
  for (const id of ['table', 'lantern', 'bowl']) await page.locator(`[data-restore="audit:${id}"]`).click();
  const restoredHost = await snapshot(page);
  assert.deepEqual(restoredHost.items.map(item => item.instanceId).sort(), beforeHost.items.map(item => item.instanceId).sort());
  assert.equal(restoredHost.items.filter(item => item.location.kind !== 'stored').length, 10);
  const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  await page.reload(); await ready(page);
  assert.deepEqual(await snapshot(page), persisted);
  await capture(page, '14-restored-after-reload', 'room');
  await assertNoOverflow(page, 'desktop');
  report.flows.push({ name: 'move-host-preserve-children-store-dependents-restore-refresh', passed: true });
  await desktop.close(); activePage = undefined;

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const label = `mobile-${viewport.width}x${viewport.height}`;
    phase = `${label} touch input`;
    const mobile = await setupContext({ viewport, isMobile: true, hasTouch: true }, label);
    const p = mobile.page;
    assert.equal((await snapshot(p)).items.filter(item => item.location.kind !== 'stored').length, 4);
    await p.locator('[data-preset="full"]').tap();
    await p.locator('#enter').tap(); await waitIdle(p);
    await p.locator('[data-select="audit:stool"]').tap();
    await p.locator('[data-action="use"]').tap(); await waitPosture(p, 'seated');
    await assertNoOverflow(p, label);
    await capture(p, `${label}-seated`, 'room');
    await p.locator('#stand').tap(); await waitPosture(p, 'standing');
    await p.locator('[data-select="audit:rug"]').tap();
    await p.locator('[data-action="move"]').tap();
    await p.locator('[data-nudge="right"]').tap();
    assert.equal(await p.locator('#place-confirm').isEnabled(), true);
    await p.locator('#place-confirm').tap();
    await p.locator('#leave').tap(); await waitIdle(p);
    assert.ok((await snapshot(p)).player.z > 3.5);
    await p.locator('#daylight').tap();
    await p.locator('#cut-mode').selectOption('stage');
    await assertNoOverflow(p, label);
    await capture(p, `${label}-evening`, 'room');
    report.flows.push({ name: `${label}-touch-select-seat-stand-move-exit`, passed: true, touchEmulation: true, physicalDevice: false });
    await mobile.close(); activePage = undefined;
  }
  assert.deepEqual(report.errors, [], 'Browser or shader errors occurred');
  assert.deepEqual(report.networkFailures, [], 'Local runtime assets or requests failed');
  report.status = 'passed-automated';
  console.log('CABIN_BROWSER_PASS');
} catch (error) {
  report.status = 'failed'; report.failure = { phase, message: String(error.stack ?? error) };
  if (activePage && !activePage.isClosed()) {
    report.lastBody = await activePage.locator('body').innerText().catch(() => null);
    report.lastState = await snapshot(activePage).catch(() => null);
    await activePage.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  }
  console.error(`CABIN_BROWSER_FAIL (${phase})`, error);
  process.exitCode = 1;
} finally {
  phase = 'teardown';
  await browser?.close().catch(() => {});
  server.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(out, 'preview.log'), previewLog);
}
