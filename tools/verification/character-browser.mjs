/** Focused main-game character review: short natural motion plus explicitly sampled paused poses. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { isGraphicsFailure } from './tent-portal-browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = process.env.HOW_REVIEW_ORIGIN ?? 'http://127.0.0.1:5198';
const out = path.resolve(process.env.CHARACTER_EVIDENCE_DIR ?? '/tmp/how-character-evidence');
const naturalTimeout = Number(process.env.CHARACTER_NATURAL_TIMEOUT_MS ?? 60000);
assert.ok(out !== path.resolve(root) && !out.startsWith(path.resolve(root) + path.sep), 'Keep evidence outside the repository');
assert.ok(Number.isFinite(naturalTimeout) && naturalTimeout >= 10000 && naturalTimeout <= 120000, 'Natural observation timeout must be 10000–120000 ms');

const canvasSelector = 'canvas[aria-label="森林之家可玩山谷"]';
const digest = value => createHash('sha256').update(value).digest('hex');
const optionalLocalCharacter = url => /^\/__local-character\/(?:j01|villager-j01|villager-j01-02|villager-j02|villager-j02-02)\.glb$/.test(new URL(url, origin).pathname);
const report = {
  status: 'running', origin, startedAt: new Date().toISOString(),
  sourceRevision: process.env.SOURCE_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  captureInputs: { seed: 104729, hour: 14, dpr: 1, naturalViewport: { width: 550, height: 380 }, naturalDeltaSeconds: .5,
    viewports: [{ width: 1100, height: 760 }, { width: 390, height: 844 }], sampledSeconds: [0, 25.5], naturalTimeoutMs: naturalTimeout },
  limits: [
    'Fresh browser contexts enter the real new-game flow. No runtime state, save record or model is injected.',
    'Two compact-viewport snapshots establish 0.5 seconds of natural animation progress. No game-clock advance or second RAF is used.',
    'All PNGs are explicitly sampled paused views of the actual game: wardrobe seconds 0 and 25.5, reduced motion, and the existing horizontal contact inspector.',
    'Sampling changes only the hero presentation pose. The capture hold verifies that GameState and its clock remain unchanged.',
    'Private J01 may be absent. The report names the actual loaded model and does not claim acceptance of missing local assets.',
    'SwiftShader and a phone viewport provide functional evidence, not physical mobile GPU performance. Actual PNGs still require visual inspection.',
  ],
  flows: [], frames: [], holds: [], errors: [], warnings: [], failedRequests: [], optionalAssets: [],
};
let server, serverLog = '', serverFailure = null, browser, context, page, flow, phase = 'startup';
const state = () => page.evaluate(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current);
const rig = s => s.characters?.localPlayer?.liveliness ?? s.characters?.liveliness?.player;
const pose = s => ({ player: s.player, rig: rig(s), visitor: s.characters?.liveliness?.visitor, gameTime: s.gameTime });
const button = name => page.getByRole('button', { name, exact: true });
const act = locator => flow.mobile ? locator.tap() : locator.click();
const waitState = (predicate, arg, timeout = 45000) => page.waitForFunction(predicate, arg, { timeout, polling: 100 });
async function checkpoint() {
  report.phase = phase;
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (server) await fs.writeFile(path.join(out, 'vite.log'), serverLog);
}
async function enterPhase(value) {
  phase = value; console.log('CHARACTER_PHASE', phase); await checkpoint();
}

function finite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), 'Character diagnostics must be finite');
  else if (value && typeof value === 'object') for (const child of Object.values(value)) finite(child);
}
function checkScene(s, label) {
  assert.equal(s.seed, report.captureInputs.seed, label + ': fixed seed');
  assert.equal(s.shaderErrors, 0, label + ': shaders compile');
  assert.equal(s.contextLost, false, label + ': live context');
  assert.equal(s.sceneSpace.active, 'outdoor', label + ': actual camp renderer');
  assert.ok(s.drawCalls > 0 && s.triangles > 0, label + ': real geometry is drawn');
  assert.ok(rig(s), label + ': player liveliness diagnostics are present');
  finite(rig(s));
}

async function startServer() {
  if (!process.env.HOW_REVIEW_ORIGIN) {
    const url = new URL(origin);
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', url.hostname, '--port', url.port, '--strictPort'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { serverLog = (serverLog + bytes).slice(-60000); });
    server.on('error', error => { serverFailure = String(error); });
  }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (serverFailure || server && server.exitCode !== null) throw Error('Vite failed: ' + (serverFailure ?? serverLog));
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* bounded startup retry */ }
    await delay(200);
  }
  throw Error('Vite readiness timeout at ' + origin + ': ' + serverLog);
}

async function doctor() {
  const probeContext = await browser.newContext({ viewport: { width: 96, height: 96 }, deviceScaleFactor: 1 });
  try {
    const probePage = await probeContext.newPage();
    await probePage.setContent('<canvas width="64" height="64"></canvas>');
    report.probe = await probePage.evaluate(() => {
      const gl = document.querySelector('canvas').getContext('webgl2');
      if (!gl) return { available: false };
      gl.clearColor(.25, .5, .75, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const pixel = new Uint8Array(4); gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { available: true, pixel: [...pixel], error: gl.getError(), contextLost: gl.isContextLost(),
        renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) };
    });
    assert.equal(report.probe.available, true); assert.equal(report.probe.error, 0); assert.equal(report.probe.contextLost, false);
    assert.ok(report.probe.pixel.slice(0, 3).every((v, i) => Math.abs(v - [64, 128, 191][i]) <= 2), 'Non-black WebGL2 probe');
    const cdp = await probeContext.newCDPSession(probePage);
    try { const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }); assert.ok(shot.data.length > 100); }
    finally { await cdp.detach(); }
  } finally { await probeContext.close(); }
}

function observePage() {
  const observedFlow = flow;
  page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => report.errors.push({ phase, source: 'pageerror', message: String(error) }));
  page.on('crash', () => report.errors.push({ phase, source: 'crash', message: 'Page crashed' }));
  page.on('console', entry => {
    const message = entry.text(), url = entry.location().url;
    if (entry.type() === 'error' && optionalLocalCharacter(url || origin) && /Failed to load resource.*404/.test(message)) return;
    if (entry.type() === 'error' || isGraphicsFailure(message)) report.errors.push({ phase, source: 'console', message });
    else if (entry.type() === 'warning') report.warnings.push({ phase, message });
  });
  page.on('requestfailed', request => {
    if (!observedFlow.closing && !request.failure()?.errorText.includes('ERR_ABORTED')) report.failedRequests.push({ phase, url: request.url(), failure: request.failure() });
  });
  page.on('response', response => {
    if (!response.url().startsWith(origin)) return;
    if (response.url().includes('/__local-character/') && response.status() === 204 || optionalLocalCharacter(response.url()) && response.status() === 404) {
      report.optionalAssets.push({ url: response.url(), status: response.status() }); return;
    }
    if (response.status() >= 400) report.failedRequests.push({ phase, url: response.url(), status: response.status() });
  });
}

async function capture(name, reviewPose = null) {
  const hold = await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.begin());
  try {
    const pixels = await page.evaluate(async ({ selector, reviewPose }) => {
      if (reviewPose) window.__HOW_CHARACTER_REVIEW__.sample(reviewPose);
      else window.__HOW_RENDER_REVIEW__.set({});
      const canvas = document.querySelector(selector), gl = canvas.getContext('webgl2');
      const webgl = gl ? { available: true, error: gl.getError(), contextLost: gl.isContextLost() } : { available: false };
      // Read immediately after the existing zero-dt render, before a non-preserved drawing buffer can clear.
      const bitmap = await createImageBitmap(await (await fetch(canvas.toDataURL('image/png'))).blob());
      const sample = document.createElement('canvas'); sample.width = bitmap.width; sample.height = bitmap.height;
      const ctx = sample.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const rgba = ctx.getImageData(0, 0, sample.width, sample.height).data, colors = new Set();
      let nonblack = 0;
      for (let i = 0; i < rgba.length; i += 64) {
        if (rgba[i] > 4 || rgba[i + 1] > 4 || rgba[i + 2] > 4) nonblack++;
        colors.add((rgba[i] >> 4) * 256 + (rgba[i + 1] >> 4) * 16 + (rgba[i + 2] >> 4));
      }
      return { width: sample.width, height: sample.height, nonblackSamples: nonblack, colorBins: colors.size, webgl };
    }, { selector: canvasSelector, reviewPose });
    await waitState(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.loop.mode === 'stopped');
    const s = await state(); checkScene(s, name);
    assert.equal(pixels.webgl.available, true); assert.equal(pixels.webgl.error, 0); assert.equal(pixels.webgl.contextLost, false);
    assert.ok(pixels.nonblackSamples > 1000 && pixels.colorBins > 16, name + ': actual canvas is non-black and non-uniform');
    const cdp = await context.newCDPSession(page);
    let shot;
    try { shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }); }
    finally { await cdp.detach(); }
    const bytes = Buffer.from(shot.data, 'base64'); assert.ok(bytes.length > 10000, name + ': nonempty screenshot');
    await fs.writeFile(path.join(out, name + '.png'), bytes);
    report.frames.push({ name, sampled: true, requested: reviewPose ?? { inspection: s.characters.inspection },
      viewport: page.viewportSize(), dpr: 1, seed: s.seed, gameTime: s.gameTime,
      camera: s.sceneSpace.outdoorCamera, characters: s.characters, merchant: s.merchant,
      shaderErrors: s.shaderErrors, drawCalls: s.drawCalls, triangles: s.triangles, graphicsBackend: s.graphicsBackend,
      pixels, pngBytes: bytes.length, pngSha256: digest(bytes) });
    console.log('CHARACTER_FRAME', name, JSON.stringify({ gameTime: s.gameTime, seconds: rig(s).seconds, gesture: rig(s).gesture }));
    await checkpoint();
    return s;
  } finally {
    const release = await page.evaluate(token => window.__HOW_CAPTURE_HOLD__.end(token), hold.token);
    assert.equal(release.released, true); assert.equal(release.held.world, hold.before.world, name + ': capture freezes world');
    assert.equal(release.held.accumulator, hold.before.accumulator, name + ': capture preserves fixed-step remainder');
    assert.deepEqual(release.held.input, hold.before.input, name + ': capture preserves inputs');
    assert.equal(release.held.loop.frames, hold.before.loop.frames, name + ': no extra frame owner ran during capture');
    report.holds.push({ name, worldSha256: digest(hold.before.world), frames: release.held.loop.frames });
  }
}

async function fresh(viewport) {
  flow = { name: viewport.width < 600 ? 'mobile' : 'desktop', mobile: viewport.width < 600, viewport, checks: [] };
  report.flows.push(flow); await enterPhase(flow.name + ': startup');
  context = await browser.newContext({ viewport: report.captureInputs.naturalViewport, deviceScaleFactor: 1,
    hasTouch: flow.mobile, isMobile: flow.mobile, reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    const review = window.__HOW_CHARACTER_OBSERVATION__ = { samples: [], previous: '' };
    // Read published diagnostics only; never schedule another RAF or mutate the application.
    new MutationObserver(() => {
      const text = document.querySelector('#runtime-stats')?.textContent;
      if (!text || text === review.previous) return;
      review.previous = text;
      let s; try { s = JSON.parse(text).current; } catch { return; }
      const r = s?.characters?.localPlayer?.liveliness ?? s?.characters?.liveliness?.player;
      if (!r) return;
      review.samples.push({ wallMs: performance.now(), gameTime: s.gameTime, mode: s.characters.mode,
        inspection: s.characters.inspection, loop: s.loop.mode, player: r, visitor: s.characters.liveliness.visitor });
      if (review.samples.length > 400) review.samples.shift();
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  page = await context.newPage(); observePage();
  await page.goto(origin + '/?inspect=1&hour=14', { waitUntil: 'domcontentloaded' });
  await page.locator('.loading').waitFor({ state: 'hidden', timeout: 90000 });
  await waitState(() => {
    const s = JSON.parse(document.querySelector('#runtime-stats')?.textContent ?? '{}').current;
    return !!window.__HOW_CAPTURE_HOLD__ && !!window.__HOW_RENDER_REVIEW__ && !!window.__HOW_CHARACTER_REVIEW__ &&
      !!s?.characters?.liveliness && s.frameWork.pending === 0 && s.drawCalls > 0;
  }, null, 90000);
  const initial = await state(); checkScene(initial, phase); flow.model = initial.characters.model;
  assert.equal(initial.appearance.hour, 14);
  assert.equal((await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.read())).owners.manualPause, false, 'Fresh game entered normally');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
  flow.camera = (await state()).sceneSpace.outdoorCamera;
  await checkpoint();
}

async function idlePair() {
  await enterPhase(flow.name + ': compact natural idle');
  await waitState(() => {
    const s = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    const r = s.characters?.localPlayer?.liveliness ?? s.characters?.liveliness?.player;
    return r?.seconds >= .75 && r.idleWeight === 1 && s.characters.mode === 'idle';
  }, null, naturalTimeout);
  const first = await state(), a = rig(first), wallStart = Date.now(); checkScene(first, phase);
  flow.naturalStart = { viewport: page.viewportSize(), gameTime: first.gameTime, player: first.player, camera: first.sceneSpace.outdoorCamera, rig: a };
  await checkpoint();
  await waitState(minimum => {
    const s = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    return (s.characters?.localPlayer?.liveliness ?? s.characters?.liveliness?.player)?.seconds >= minimum;
  }, a.seconds + report.captureInputs.naturalDeltaSeconds, naturalTimeout);
  const second = await state(), b = rig(second); checkScene(second, phase);
  assert.equal(second.characters.mode, 'idle'); assert.equal(b.suppressed, null); assert.ok(b.idleWeight > 0);
  assert.ok(Math.max(...['chestPitch', 'swayRoll', 'headYaw', 'headPitch'].map(key => Math.abs(b[key] - a[key]))) > 1e-6, 'Natural idle evolves');
  assert.deepEqual(second.player, first.player, 'Natural idle never moves the world root');
  assert.equal(first.characters.reviewSeconds, null); assert.equal(second.characters.reviewSeconds, null);
  flow.checks.push({ name: 'natural-idle', activeRenderSeconds: [a.seconds, b.seconds], elapsedWallSeconds: (Date.now() - wallStart) / 1000,
    viewport: page.viewportSize(), source: 'Unmodified animation render clock; no step or sample call between snapshots',
    gameTimes: [first.gameTime, second.gameTime], player: second.player, before: a, after: b });
  await checkpoint();
}

async function pauseFreeze() {
  await enterPhase(flow.name + ': pause'); await act(button('暂停'));
  await waitState(() => window.__HOW_CAPTURE_HOLD__.read().loop.mode === 'stopped');
  const before = await state(), beforeLoop = await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.read().loop);
  await delay(350);
  const after = await state(), afterLoop = await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.read().loop);
  assert.deepEqual(pose(after), pose(before), 'Pause freezes animation and world time'); assert.equal(afterLoop.frames, beforeLoop.frames);
  flow.checks.push({ name: 'pause-freezes', gameTime: after.gameTime, seconds: rig(after).seconds, loop: afterLoop });
  await checkpoint();
  await act(button('回到山谷'));
}

async function wardrobeReview() {
  await enterPhase(flow.name + ': full-size sampled wardrobe');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = ''; element.open = true; });
  await button('近景看穿搭').click();
  await waitState(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.characters.inspection === 'wardrobe');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
  await page.setViewportSize(flow.viewport);
  await waitState(() => {
    const s = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    return s.frameWork.pending === 0 && window.__HOW_CAPTURE_HOLD__.read().loop.mode === 'stopped';
  }, null, 90000);
  const base = await capture(flow.name + '-idle-sampled', { seconds: 0 });
  const gesture = await capture(flow.name + '-gesture-sampled', { seconds: 25.5 });
  assert.equal(base.characters.reviewSeconds, 0); assert.equal(gesture.characters.reviewSeconds, 25.5);
  assert.equal(rig(gesture).suppressed, null); assert.ok(rig(gesture).gestureWeight >= .55);
  assert.notEqual(rig(gesture).gesture, 'none');
  assert.deepEqual(gesture.player, base.player); assert.equal(gesture.gameTime, base.gameTime);
  flow.checks.push({ name: 'sampled-gesture', source: 'Paused wardrobe review of the actual loaded hero',
    gameTime: gesture.gameTime, baseline: rig(base), gesture: rig(gesture) });
  await checkpoint();
}

async function reducedMotion() {
  await enterPhase(flow.name + ': reduced motion'); await act(button('操作'));
  const help = page.getByRole('dialog', { name: '操作说明', exact: true });
  await act(help.getByRole('button', { name: '显示', exact: true }));
  await help.getByLabel('减少动态效果').check(); await act(help.getByRole('button', { name: '关闭操作说明', exact: true }));
  // The inspector is stopped. Its sample causes one normal zero-dt render to apply the real UI preference.
  const s = await capture(flow.name + '-reduced-sampled', { seconds: 25.5 });
  for (const r of [rig(s), s.characters.liveliness.visitor]) {
    assert.equal(r.suppressed, 'reduced-motion'); assert.equal(r.idleWeight, 0); assert.equal(r.gestureWeight, 0);
    for (const key of ['chestPitch', 'swayRoll', 'headYaw', 'headPitch', 'blink']) assert.equal(r[key], 0, 'Reduced motion: ' + r.id + ' ' + key);
  }
  flow.checks.push({ name: 'reduced-motion', player: rig(s), visitor: s.characters.liveliness.visitor });
  await checkpoint();
  await act(button('操作')); await help.getByLabel('减少动态效果').uncheck();
  await act(help.getByRole('button', { name: '关闭操作说明', exact: true }));
}

async function desktopActions() {
  await enterPhase('desktop: locomotion');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = ''; element.open = true; });
  await button('返回漫步').click();
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
  await page.setViewportSize(report.captureInputs.naturalViewport);
  await waitState(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.characters.reviewSeconds === null);
  await page.keyboard.down('w');
  try {
    await waitState(() => {
      const s = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
      return s.player.moving && ['walk', 'run'].includes(s.characters.mode);
    }, null, 15000);
    const s = await state(), r = rig(s);
    assert.equal(r.idleWeight, 0); assert.equal(r.gestureWeight, 0); assert.equal(r.suppressed, 'action-or-locomotion');
    flow.checks.push({ name: 'locomotion-suppression', mode: s.characters.mode, rig: r });
  } finally { await page.keyboard.up('w'); }
  await waitState(() => {
    const s = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    return !s.player.moving && s.characters.mode === 'idle';
  });
  await enterPhase('desktop: sampled action');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = ''; element.open = true; });
  await button('检视横砍止点').click();
  await waitState(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.characters.inspection === 'horizontal');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
  await page.setViewportSize(flow.viewport);
  const s = await capture('desktop-action-sampled'), r = rig(s);
  assert.equal(r.idleWeight, 0); assert.equal(r.gestureWeight, 0); assert.equal(r.suppressed, 'action-or-locomotion');
  assert.equal(s.characters.stopFound, true, 'Action still finds the authored axe contact');
  flow.checks.push({ name: 'sampled-action-preserved', mode: s.characters.mode, stopFound: s.characters.stopFound,
    contactClearance: s.characters.contactClearance, rig: r });
  assert.equal(s.characters.reviewSeconds, null, 'Leaving wardrobe clears the character-time override');
  await checkpoint();
}

await fs.mkdir(out, { recursive: true });
try {
  await startServer();
  browser = await chromium.launch({ headless: true,
    ...(process.env.HOW_BROWSER_EXECUTABLE ? { executablePath: process.env.HOW_BROWSER_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browser = browser.version(); await doctor();
  for (const viewport of report.captureInputs.viewports) {
    await fresh(viewport); await idlePair(); await pauseFreeze(); await wardrobeReview(); await reducedMotion();
    if (!flow.mobile) await desktopActions();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal viewport overflow');
    flow.samples = await page.evaluate(() => window.__HOW_CHARACTER_OBSERVATION__.samples);
    flow.status = 'passed'; flow.closing = true; await context.close(); context = null; page = null;
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []); assert.equal(report.frames.length, 7);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.phase = phase; report.failure = String(error); report.stack = error.stack; process.exitCode = 1;
  if (page) {
    try { report.failureState = await state(); flow.samples = await page.evaluate(() => window.__HOW_CHARACTER_OBSERVATION__?.samples); } catch { /* retain other evidence */ }
    try { await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 10000 }); } catch { /* browser itself may have failed */ }
  }
} finally {
  if (flow) flow.closing = true;
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (server) await fs.writeFile(path.join(out, 'vite.log'), serverLog);
  console.log(JSON.stringify({ status: report.status, failure: report.failure, out,
    flows: report.flows.map(({ name, status }) => ({ name, status })), frames: report.frames.length }));
}
