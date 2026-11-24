/** Focused real-game fox review. Run in CI; all visual evidence stays outside git. */
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { isGraphicsFailure } from './tent-portal-browser.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.resolve(process.env.FOX_EVIDENCE_DIR ?? '/tmp/how-fox-evidence');
assert.ok(out !== path.resolve(root) && !out.startsWith(path.resolve(root) + path.sep), 'Keep evidence outside the repository');
const origin = 'http://127.0.0.1:5197', canvasSelector = 'canvas[aria-label="森林之家可玩山谷"]';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const optionalLocalCharacter = url => /^\/__local-character\/(?:j01|villager-j01|villager-j01-02|villager-j02|villager-j02-02)\.glb$/.test(new URL(url, origin).pathname);
const report = {
  status: 'running', startedAt: new Date().toISOString(), origin,
  sourceRevision: process.env.SOURCE_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  target: 'Actual main game served by Vite DEV; production compilation is checked separately by the workflow.',
  captureInputs: { seed: 104729, dpr: 1, hour: 14, weather: 'sunny', naturalMinimumGameSeconds: 2, naturalViewport: { width: 550, height: 380 },
    viewports: [{ width: 1100, height: 760 }, { width: 390, height: 844 }] },
  limits: [
    'SwiftShader and touch emulation provide functional WebGL evidence, not physical mobile GPU performance.',
    'Natural blink evidence uses normal game time and published diagnostics in a compact 550x380 desktop canvas, with no fixed-step advance or extra RAF. Full-size desktop and portrait-phone frames use the paused inspector.',
    'Frames named sampled use the paused fox inspector and absolute animation samples; they are not natural gameplay.',
    'Private NP120/J01 files are absent from public CI; exact optional local-character 204/404 responses are recorded and the shipped KayKit fallback remains visible.',
    'Human inspection of the actual PNGs is required for eye appeal, gaze direction, silhouette and foot placement.',
  ],
  flows: [], frames: [], holds: [], errors: [], warnings: [], failedRequests: [], assetResponses: [], optionalLocalCharacters: [],
};
let server, browser, activePage, phase = 'startup', serverLog = '';
await fs.mkdir(out, { recursive: true });
const stats = page => page.evaluate(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current);
const inspectedFox = state => state.wildlife.expressions.find(expression => expression.id.includes('inspect:wildlife.fox'));
const poseState = state => ({ gameTime: state.gameTime, player: state.player, wildlifeState: state.wildlifeState,
  wildlifeViews: state.wildlifeViews, expressions: state.wildlife.expressions, camera: state.sceneSpace.outdoorCamera });

function checkScene(state, label) {
  assert.equal(state.shaderErrors, 0, `${label}: shaders compile`);
  assert.equal(state.contextLost, false, `${label}: WebGL context remains live`);
  assert.ok(state.drawCalls > 0 && state.triangles > 0, `${label}: real scene geometry is drawn`);
  assert.equal(state.sceneSpace.active, 'outdoor', `${label}: actual camp renderer`);
  assert.ok(state.wildlife.available.includes('wildlife.fox'), `${label}: fox asset was admitted`);
  assert.ok(!state.wildlife.available.includes('wildlife.hare'), `${label}: retired hare is unavailable`);
  assert.ok(!state.wildlifeState.encounters.some(encounter => encounter.definitionId === 'wildlife.hare'), `${label}: no hare encounter`);
}

async function startServer() {
  // The DEV-only review hooks intentionally require vite, not vite preview.
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => { serverLog = (serverLog + bytes).slice(-80000); });
  server.on('error', error => { serverLog += `\n${error.stack ?? error}`; });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw Error(`Vite exited (${server.exitCode}): ${serverLog}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* startup retry */ }
    await delay(250);
  }
  throw Error(`Vite did not become ready: ${serverLog}`);
}

function observe(page, flow) {
  const stamp = () => ({ flow: flow.name, phase, at: new Date().toISOString() });
  page.setDefaultTimeout(45000); page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', error => report.errors.push({ ...stamp(), source: 'pageerror', message: String(error) }));
  page.on('crash', () => report.errors.push({ ...stamp(), source: 'crash', message: 'Page crashed' }));
  page.on('console', message => {
    const record = { ...stamp(), message: message.text() };
    if (message.type() === 'error' && optionalLocalCharacter(message.location().url) && /Failed to load resource.*404/.test(message.text())) {
      report.optionalLocalCharacters.push({ ...record, source: 'known-optional-404-console', url: message.location().url }); return;
    }
    if (message.type() === 'error' || isGraphicsFailure(message.text())) report.errors.push({ ...record, source: 'console' });
    else if (message.type() === 'warning') report.warnings.push(record);
  });
  page.on('request', request => {
    if (/\/assets\/wildlife\/hare\.glb(?:\?|$)/.test(request.url())) report.errors.push({ ...stamp(), source: 'retired-asset', url: request.url() });
  });
  page.on('requestfailed', request => {
    if (!flow.closing && request.url().startsWith(origin)) report.failedRequests.push({ ...stamp(), url: request.url(), failure: request.failure() });
  });
  page.on('response', response => {
    if (!response.url().startsWith(origin)) return;
    if (/\.glb(?:\?|$)/.test(response.url())) report.assetResponses.push({ ...stamp(), url: response.url(), status: response.status() });
    if (optionalLocalCharacter(response.url()) && [204, 404].includes(response.status())) {
      report.optionalLocalCharacters.push({ ...stamp(), url: response.url(), status: response.status(), fallback: 'Shipped KayKit character' }); return;
    }
    if (response.status() >= 400) report.failedRequests.push({ ...stamp(), url: response.url(), status: response.status() });
  });
}

async function doctor() {
  const context = await browser.newContext({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent('<!doctype html><title>WebGL2 probe</title><canvas width="64" height="64"></canvas>');
    const probe = await page.evaluate(() => {
      const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl2');
      if (!gl) throw Error('WebGL2 is unavailable');
      gl.clearColor(.25, .5, .75, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const pixel = new Uint8Array(4); gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return { pixel: [...pixel], error: gl.getError(), contextLost: gl.isContextLost(), version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
    });
    report.webglProbe = probe;
    assert.equal(probe.error, 0); assert.equal(probe.contextLost, false);
    assert.ok(probe.pixel.slice(0, 3).every((value, index) => Math.abs(value - [64, 128, 191][index]) <= 2), 'The WebGL2 probe must be non-black');
    const cdp = await context.newCDPSession(page);
    try {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await fs.writeFile(path.join(out, 'webgl2-probe.png'), Buffer.from(image.data, 'base64'));
    } finally { await cdp.detach(); }
  } finally { await context.close(); }
}

async function fresh(flow) {
  const context = await browser.newContext({ viewport: report.captureInputs.naturalViewport, deviceScaleFactor: 1,
    hasTouch: flow.name === 'phone', isMobile: flow.name === 'phone', reducedMotion: 'no-preference' });
  flow.context = context;
  await context.addInitScript(() => {
    const review = window.__HOW_FOX_OBSERVATION__ = { stage: 'startup', samples: [], previous: '' };
    // Read published state only. This observer never renders, mutates gameplay or requests a RAF.
    new MutationObserver(() => {
      const text = document.querySelector('#runtime-stats')?.textContent;
      if (!text || text === review.previous) return;
      review.previous = text;
      let state; try { state = JSON.parse(text).current; } catch { return; }
      if (!state?.wildlife?.expressions) return;
      review.samples.push({ stage: review.stage, wallMs: performance.now(), gameTime: state.gameTime,
        scenePreset: state.scenePreset, loop: state.loop.mode, shaderErrors: state.shaderErrors,
        player: state.player, encounters: state.wildlifeState.encounters.map(({ id, definitionId }) => ({ id, definitionId })),
        expressions: state.wildlife.expressions });
      if (review.samples.length > 1200) review.samples.shift();
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const page = await context.newPage(); activePage = page; observe(page, flow);
  await page.route('**/__fox-starter-fixture', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><link rel="icon" href="data:,"><title>Fox review starter save</title>' }));
  await page.goto(origin + '/__fox-starter-fixture', { waitUntil: 'domcontentloaded' });
  flow.fixture = await page.evaluate(async () => {
    const { createStarterState } = await import('/src/domain/state.ts');
    const { createWeather } = await import('/src/domain/weather.ts');
    const { createSaveContext } = await import('/src/domain/save-context.ts');
    const { serializeWorldSave } = await import('/src/domain/world-save.ts');
    const { createBrowserWorldSaveStore } = await import('/src/app/world-save-store.ts');
    const state = createStarterState(), store = createBrowserWorldSaveStore();
    state.weather = { ...createWeather(state.time), kind: 'sunny', auto: false };
    const raw = await serializeWorldSave(state, createSaveContext(), { sequence: 1, savedAt: 0 });
    if (!await store.compareAndSwap(await store.read(), { primary: raw, backup: raw })) throw Error('Starter save was not committed');
    return { seed: state.seed, time: state.time, player: state.player };
  });
  await page.goto(origin + '/?inspect=1&hour=14', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = JSON.parse(document.querySelector('#runtime-stats')?.textContent ?? '{}').current;
    return window.__HOW_CAPTURE_HOLD__ && window.__HOW_FOX_REVIEW__ && window.__HOW_RENDER_REVIEW__ &&
      state?.wildlife?.available.includes('wildlife.fox') && state.drawCalls > 0 && state.frameWork.pending === 0 &&
      window.__HOW_CAPTURE_HOLD__.read().loop.mode === 'stopped';
  }, undefined, { timeout: 180000, polling: 100 });
  const initial = await stats(page); checkScene(initial, flow.name + ': loaded');
  flow.characterModel = initial.characters.model;
  assert.equal(initial.seed, report.captureInputs.seed);
  assert.equal(initial.appearance.hour, 14);
  assert.deepEqual(initial.wildlifeState.encounters.filter(encounter => ['wildlife.fox', 'wildlife.squirrel'].includes(encounter.definitionId))
    .map(encounter => encounter.definitionId).sort(), ['wildlife.fox', 'wildlife.squirrel'], 'The actual camp admits its two common animals');
  assert.equal((await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.read())).owners.manualPause, true);
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
  return page;
}

async function held(page, label, action) {
  const hold = await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.begin());
  try { return await action(hold); }
  finally {
    const release = await page.evaluate(token => window.__HOW_CAPTURE_HOLD__.end(token), hold.token);
    assert.equal(release.released, true, `${label}: hold released`);
    assert.equal(release.held.world, hold.before.world, `${label}: world and game clock stay frozen`);
    assert.equal(release.held.accumulator, hold.before.accumulator, `${label}: fixed-step remainder is preserved`);
    assert.deepEqual(release.held.input, hold.before.input, `${label}: input is preserved`);
    assert.equal(release.held.loop.mode, 'stopped');
    assert.equal(release.held.loop.frames, hold.before.loop.frames, `${label}: no simulation or presentation RAF ran during capture`);
    report.holds.push({ label, worldSha256: digest(hold.before.world), gameTime: JSON.parse(hold.before.world).time,
      beforeLoop: hold.before.loop, heldLoop: release.held.loop, afterLoop: release.after.loop });
  }
}

async function pixels(page, image, reference) {
  return page.evaluate(async ({ image, reference }) => {
    const decode = async source => {
      const bitmap = await createImageBitmap(await (await fetch(source)).blob());
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const current = await decode(image), previous = reference ? await decode(reference) : null;
    if (previous && (current.width !== previous.width || current.height !== previous.height)) throw Error('Comparison image sizes differ');
    let nonblack = 0, changedPixels = 0, maximumDelta = 0;
    const colors = new Set();
    for (let index = 0; index < current.data.length; index += 4) {
      const rgb = current.data.subarray(index, index + 3);
      if (rgb.some(value => value > 4)) nonblack++;
      if (index % 64 === 0) colors.add((rgb[0] >> 4) * 256 + (rgb[1] >> 4) * 16 + (rgb[2] >> 4));
      if (previous) {
        let different = false;
        for (let channel = 0; channel < 3; channel++) {
          const difference = Math.abs(current.data[index + channel] - previous.data[index + channel]);
          maximumDelta = Math.max(maximumDelta, difference); different ||= difference > 2;
        }
        if (different) changedPixels++;
      }
    }
    return { width: current.width, height: current.height, nonblack, sampledColorBins: colors.size,
      ...(previous ? { changedPixels, maximumDelta } : {}) };
  }, { image, reference });
}

async function saveFrame(page, flow, name, image, state, requested = null, reference = null) {
  const bytes = Buffer.from(image.split(',')[1], 'base64');
  await fs.writeFile(path.join(out, name + '.png'), bytes);
  const pixelStats = await pixels(page, image, reference);
  const webgl = await page.locator(canvasSelector).evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    return gl ? { available: true, contextLost: gl.isContextLost(), error: gl.getError(), version: gl.getParameter(gl.VERSION) } : { available: false };
  });
  report.frames.push({ name, viewport: page.viewportSize(), dpr: 1, sampled: requested !== null, requested,
    actualFox: requested ? inspectedFox(state) : state.wildlife.expressions, gameTime: state.gameTime,
    camera: state.sceneSpace.outdoorCamera, drawCalls: state.drawCalls, triangles: state.triangles,
    shaderErrors: state.shaderErrors, graphicsBackend: state.graphicsBackend, webgl, pixels: pixelStats,
    pngBytes: bytes.length, pngSha256: digest(bytes) });
  checkScene(state, name);
  assert.equal(webgl.available, true); assert.equal(webgl.contextLost, false); assert.equal(webgl.error, 0);
  assert.ok(pixelStats.nonblack > 1000 && pixelStats.sampledColorBins > 16, `${name}: the real camp canvas must not be blank or uniform`);
  assert.deepEqual(report.errors, [], `${name}: browser and shader errors`);
  console.log('FOX_FRAME', name, JSON.stringify({ gameTime: state.gameTime, pixels: pixelStats }));
  return { image, state, pixels: pixelStats };
}

async function natural(page, flow) {
  phase = flow.name + ': natural gameplay';
  await page.evaluate(() => { window.__HOW_FOX_OBSERVATION__.stage = 'natural'; });
  await page.getByRole('button', { name: '回到山谷', exact: true }).evaluate(button => button.click());
  flow.naturalCamera = { viewport: page.viewportSize(), camera: (await stats(page)).sceneSpace.outdoorCamera };
  await page.waitForFunction(minimumGameSeconds => {
    const samples = window.__HOW_FOX_OBSERVATION__.samples.filter(sample => sample.stage === 'natural' && sample.scenePreset === null && sample.loop === 'simulation');
    const blinks = samples.flatMap(sample => sample.expressions.filter(expression => !expression.id.includes('inspect:')).map(expression => expression.blink));
    return samples.length >= 8 && samples.at(-1).gameTime - samples[0].gameTime >= minimumGameSeconds && blinks.length >= 8 &&
      Math.min(...blinks) < .05 && Math.max(...blinks) > .1;
  }, report.captureInputs.naturalMinimumGameSeconds, { timeout: 240000, polling: 100 });
  const samples = await page.evaluate(() => window.__HOW_FOX_OBSERVATION__.samples.filter(sample => sample.stage === 'natural' && sample.scenePreset === null && sample.loop === 'simulation'));
  assert.ok(samples.every(sample => sample.shaderErrors === 0));
  assert.ok(samples.every(sample => sample.encounters.every(encounter => encounter.definitionId !== 'wildlife.hare')));
  const blinks = samples.flatMap(sample => sample.expressions.map(expression => expression.blink));
  flow.natural = { source: 'Unmodified main-game clock; no sample or advanceSimulation call', samples,
    blinkRange: [Math.min(...blinks), Math.max(...blinks)], elapsedGameSeconds: samples.at(-1).gameTime - samples[0].gameTime,
    elapsedWallSeconds: (samples.at(-1).wallMs - samples[0].wallMs) / 1000 };
  await held(page, flow.name + ': natural capture freeze', async () => {
    const image = await page.evaluate(selector => {
      window.__HOW_RENDER_REVIEW__.set({}); // Existing zero-dt render, with no camera/material override.
      return document.querySelector(selector).toDataURL('image/png');
    }, canvasSelector);
    await page.waitForFunction(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.loop.mode === 'stopped', undefined, { polling: 100 });
    const before = await stats(page);
    await delay(350);
    assert.deepEqual(poseState(await stats(page)), poseState(before), 'Natural expressions and all animal/player poses freeze during capture hold');
    await saveFrame(page, flow, `fox-${flow.name}-natural-camp`, image, before);
  });
}

async function inspect(page) {
  await page.evaluate(() => { window.__HOW_FOX_OBSERVATION__.stage = 'sampled'; });
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = ''; element.open = true; });
  await page.getByLabel('场景观察位置').selectOption('fox');
  await page.waitForFunction(() => {
    const state = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    return state.scenePreset === 'fox' && state.wildlife.expressions.some(expression => expression.id.includes('inspect:wildlife.fox')) &&
      state.wildlife.inFrame > 0 && state.frameWork.pending === 0 && window.__HOW_CAPTURE_HOLD__.read().loop.mode === 'stopped';
  }, undefined, { timeout: 180000, polling: 100 });
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
}

async function captureSample(page, flow, label, requested, reference = null) {
  const name = `fox-${flow.name}-sampled-${label}`; phase = name;
  return held(page, name, async () => {
    await page.evaluate(pose => window.__HOW_FOX_REVIEW__.sample(pose), requested);
    await page.waitForFunction(pose => {
      const expression = JSON.parse(document.querySelector('#runtime-stats').textContent).current.wildlife.expressions.find(value => value.id.includes('inspect:wildlife.fox'));
      return expression && expression.clip === pose.motion && Math.abs(expression.blink - pose.blink) < 1e-6 &&
        expression.gaze.every((value, index) => Math.abs(value - pose.gaze[index]) < 1e-6) &&
        expression.head.every((value, index) => Math.abs(value - pose.head[index]) < 1e-6);
    }, requested, { polling: 100 });
    let timer, resolveCapture;
    const captured = new Promise((resolve, reject) => {
      resolveCapture = resolve; timer = setTimeout(() => reject(Error('Main-game scene capture request did not arrive')), 30000);
    });
    const handler = async route => {
      const payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Captured by fox review' });
      resolveCapture(payload);
    };
    await page.route('**/__scene-capture', handler);
    try {
      await page.locator('.scene-inspector button').filter({ hasText: /^保存场景画面$/ }).evaluate(button => {
        if (button.disabled) throw Error('The real scene inspector capture control is disabled'); button.click();
      });
      const payload = await captured;
      assert.equal(payload.stats.scenePreset, 'fox');
      return await saveFrame(page, flow, name, payload.image, payload.stats, requested, reference);
    } finally { clearTimeout(timer); await page.unroute('**/__scene-capture', handler); }
  });
}

async function sampled(page, flow) {
  phase = flow.name + ': select fox inspector'; await inspect(page);
  const frozen = await stats(page), baseline = { seconds: .25, blink: 0, gaze: [0, 0], head: [0, 0], motion: 'idle' };
  const open = await captureSample(page, flow, 'open', baseline);
  await delay(350);
  const repeated = await captureSample(page, flow, 'open-repeat', baseline, open.image);
  assert.deepEqual(poseState(repeated.state), poseState(open.state), 'Two held samples have exactly the same pose/world diagnostic values');
  flow.samePose = { equivalent: true, stateSha256: digest(JSON.stringify(poseState(open.state))), pixelDifference: repeated.pixels };
  const closed = await captureSample(page, flow, 'closed', { ...baseline, blink: 1 }, open.image);
  assert.ok(closed.pixels.changedPixels > 8, 'Closing the original lids must visibly change the canvas');
  const left = await captureSample(page, flow, 'gaze-model-minus-x', { ...baseline, gaze: [-1, 0] }, open.image);
  const right = await captureSample(page, flow, 'gaze-model-plus-x', { ...baseline, gaze: [1, 0] }, left.image);
  assert.ok(right.pixels.changedPixels > 8, 'Opposite eye directions must visibly change the canvas');
  const headLeft = await captureSample(page, flow, 'head-model-minus-x', { ...baseline, head: [-.24, .06] });
  const headRight = await captureSample(page, flow, 'head-model-plus-x', { ...baseline, head: [.24, .06] }, headLeft.image);
  assert.ok(headRight.pixels.changedPixels > 8, 'Opposite head turns must visibly change the canvas');
  for (const [motion, first, second] of [['walk', .08, .43], ['run', .04, .29]]) {
    const a = await captureSample(page, flow, `${motion}-phase-a`, { ...baseline, motion, seconds: first });
    const b = await captureSample(page, flow, `${motion}-phase-b`, { ...baseline, motion, seconds: second }, a.image);
    assert.ok(b.pixels.changedPixels > 20, `${motion}: authored locomotion phases must visibly differ`);
  }
  const after = await stats(page);
  assert.equal(after.gameTime, frozen.gameTime, 'Absolute fox samples never advance game time');
  assert.deepEqual(after.worldState, frozen.worldState, 'Sampling leaves all animals, player and world state unchanged');
  assert.deepEqual(after.wildlifeViews, frozen.wildlifeViews, 'Sampling never wanders the original common animals away');
  flow.sampled = { worldSha256: digest(JSON.stringify(frozen.worldState)), gameTime: frozen.gameTime,
    inspectedId: inspectedFox(after).id, captureCount: 11 };
}

try {
  report.builtEntrySha256 = digest(await fs.readFile(path.join(root, 'dist/index.html')));
  report.foxAssetSha256 = digest(await fs.readFile(path.join(root, 'public/assets/wildlife/fox.glb')));
  await startServer(); phase = 'launch one Chromium';
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=9333'] });
  report.browser = await browser.version(); phase = 'WebGL2 doctor'; await doctor();
  for (const viewport of report.captureInputs.viewports) {
    const flow = { name: viewport.width < 600 ? 'phone' : 'desktop', viewport }; report.flows.push(flow);
    try {
      phase = flow.name + ': load starter'; const page = await fresh(flow);
      // Produce the requested full-size eye/rig images first. A slow optional
      // live observation must never discard those already reviewable frames.
      await page.setViewportSize(flow.viewport);
      await sampled(page, flow);
      if (flow.name === 'desktop') {
        await page.setViewportSize(report.captureInputs.naturalViewport);
        await page.getByRole('button', { name: '结束场景检视', exact: true }).evaluate(button => button.click());
        await natural(page, flow);
      }
      assert.ok(report.assetResponses.some(response => response.flow === flow.name && response.url.endsWith('/assets/wildlife/fox.glb') && response.status === 200), 'The actual fox GLB request succeeds');
    } catch (error) {
      flow.failure = { phase, message: String(error.stack ?? error), stats: activePage ? await stats(activePage).catch(() => null) : null };
      if (activePage) {
        flow.failure.observations = await activePage.evaluate(() => window.__HOW_FOX_OBSERVATION__?.samples).catch(() => null);
        const cdp = await flow.context.newCDPSession(activePage).catch(() => null);
        if (cdp) {
          try {
            const image = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
            flow.failure.screenshot = `${flow.name}-failure-ui.png`;
            await fs.writeFile(path.join(out, flow.failure.screenshot), Buffer.from(image.data, 'base64'));
          } catch { /* Keep the original failure even if Chromium cannot capture it. */ }
          finally { await cdp.detach().catch(() => {}); }
        }
      }
      throw error;
    } finally { flow.closing = true; await flow.context?.close().catch(() => {}); delete flow.context; activePage = undefined; }
  }
  assert.deepEqual(report.errors, [], 'Browser and shader errors');
  assert.deepEqual(report.failedRequests, [], 'Runtime requests must succeed');
  report.status = 'passed-automated'; console.log('FOX_REVIEW_PASS');
} catch (error) {
  report.status = 'failed'; report.failure = { phase, message: String(error.stack ?? error) };
  console.error('FOX_REVIEW_FAIL', phase, error); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); server?.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(out, 'vite.log'), serverLog);
  const gallery = report.frames.map(frame => `<figure><img src="${frame.name}.png" alt="${frame.name}" loading="lazy"><figcaption>${frame.name}<br>gameTime ${frame.gameTime}; ${frame.sampled ? 'sampled pose (world paused)' : 'natural game pose'}</figcaption></figure>`).join('\n');
  await fs.writeFile(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Fox review evidence</title><style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}figure{margin:0}img{width:100%;height:auto}figcaption{overflow-wrap:anywhere;padding:8px 0}</style><h1>Fox review: ${report.status}</h1><p>Real main-game canvas. “sampled” images use the paused inspector, not natural gameplay. See report.json for natural blink observations and capture-hold checks.</p><main>${gallery}</main>`);
}
