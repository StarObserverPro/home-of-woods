// Real main-scene review. Run after baking the optional impostor asset:
// EVIDENCE_DIR=/tmp/how-rainier-review node tools/verification/rainier-optics-review.mjs
// TEST_ORIGIN reuses Vite; CHROMIUM_EXECUTABLE overrides Playwright's CI browser.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const out = path.resolve(process.env.EVIDENCE_DIR ?? path.join(os.tmpdir(), 'how-rainier-optics-review'));
assert.ok(out !== root && !out.startsWith(root + path.sep), 'Keep review images outside the source tree');
const origin = process.env.TEST_ORIGIN ?? 'http://127.0.0.1:5195';
const hour = Number(process.env.REVIEW_HOUR ?? 12);
const weather = process.env.REVIEW_WEATHER ?? 'sunny';
assert.ok(Number.isFinite(hour) && hour >= 0 && hour <= 24, 'REVIEW_HOUR must be in [0, 24]');
assert.ok(['sunny', 'cloudy', 'rain', 'snow'].includes(weather), 'Unknown REVIEW_WEATHER');
const digest = value => createHash('sha256').update(value).digest('hex');
const report = {
  sourceRevision:process.env.SOURCE_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim(),
  result:'running', startedAt:new Date().toISOString(), origin, hour, weather,
  rendererNote:'Headless Chromium/SwiftShader provides functional WebGL evidence, not physical-device GPU timings.',
  comparisonNote:'Each mode group holds the same world, camera and animation clock. Direct rendering has canvas MSAA; the HDR capture does not. Whole-scene differences therefore include coverage changes. The separate overlook-optics-probe checks exact zero-effect output and focused color transfer.',
  captureNote:'Every PNG is read synchronously from the real game canvas immediately after the held zero-dt review render. UI panels are excluded. The JSON does not substitute for inspecting these images.',
  flows:[], frames:[], holds:[], errors:[], failedRequests:[], assetResponses:[],
};
let server, browser, context, page, flow, serverLog = '';
const readStats = () => page.evaluate(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current);
const orbit = s => s.sceneSpace?.outdoorCamera?.overlook;
const pose = s => {
  const c = s.sceneSpace.outdoorCamera;
  return {owner:c.owner, position:c.position, target:c.target, fov:c.fov, aspect:c.aspect,
    current:c.overlook.current, desired:c.overlook.desired, anchor:c.overlook.anchor};
};

function checkScene(s, label) {
  assert.equal(s.shaderErrors, 0, `${label}: real scene shaders compile`);
  assert.equal(s.contextLost, false, `${label}: context remains live`);
  assert.ok(s.drawCalls > 0 && s.triangles > 0, `${label}: actual geometry is drawn`);
  assert.equal(s.sceneSpace.active, 'outdoor');
  assert.equal(s.sceneSpace.outdoorCamera.owner, 'navigation');
  assert.ok(s.streaming.detailTrees > 0 && s.streaming.sceneryInstances > 0, `${label}: main forest is populated`);
  assert.equal(s.characters.disposed, false);
  assert.equal(s.atmosphere.disposed, false);
  assert.ok(s.atmosphere.materials > 0 && s.atmosphere.lutUpdates > 0, `${label}: atmospheric materials and LUT are live`);
  assert.equal(s.atmosphere.extraDraws, 0);
  assert.equal(s.optics.supported, true, `${label}: CI must actually exercise the HDR path`);
  assert.equal(s.optics.disposed, false);
  assert.equal(s.optics.depthPrepass, false);
  assert.equal(s.horizon.forest.requestedMode, 'impostor');
  if (flow.missingAtlas) {
    assert.equal(s.horizon.forest.effectiveMode, 'mass', `${label}: missing atlas keeps the actual geometry forest`);
    assert.equal(s.horizon.forest.impostor.status, 'fallback');
    assert.equal(s.horizon.forest.impostor.atlasLoaded, false);
    assert.equal(s.horizon.forest.impostor.cards, 0);
    assert.match(s.horizon.impostorLoadError, /HTTP 404/);
    assert.ok(s.horizon.forest.geometryMasses > 0);
  } else {
    assert.equal(s.horizon.forest.effectiveMode, 'impostor', `${label}: geometry fallback is not an impostor success`);
    assert.equal(s.horizon.forest.impostor.status, 'ready');
    assert.equal(s.horizon.forest.impostor.atlasLoaded, true);
    assert.ok(s.horizon.forest.impostor.cards > 0);
  }
  assert.equal(s.horizon.forest.impostor.triangles, s.horizon.forest.impostor.cards * 2);
  assert.equal(s.horizon.forest.geometryTriangles + s.horizon.forest.impostor.triangles, s.horizon.forest.triangles);
}

async function settledPause() {
  await page.waitForFunction(() => {
    const s = JSON.parse(document.querySelector('#runtime-stats')?.textContent ?? '{}').current;
    return s?.frameWork?.pending === 0 && s.loop.mode === 'stopped' &&
      s.sceneSpace?.outdoorCamera?.overlook?.pending === false;
  }, undefined, {timeout:180000, polling:100});
  const s = await readStats();
  assert.equal((await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.read())).owners.manualPause, true);
  assert.equal(s.streaming.pendingChunks, 0);
  checkScene(s, flow.name + ': settled');
  return s;
}

async function releaseHold(hold, label) {
  const release = await page.evaluate(token => window.__HOW_CAPTURE_HOLD__.end(token), hold.token);
  assert.equal(release.released, true, `${label}: capture owner was released`);
  assert.equal(release.held.world, hold.before.world, `${label}: no world/time/weather mutation while capturing`);
  assert.equal(release.held.accumulator, hold.before.accumulator, `${label}: fixed-step remainder is preserved`);
  assert.deepEqual(release.held.input, hold.before.input, `${label}: capture preserves navigation input`);
  assert.equal(release.held.loop.mode, 'stopped');
  report.holds.push({label, worldSha256:digest(hold.before.world), beforeLoop:hold.before.loop,
    heldLoop:release.held.loop, afterLoop:release.after.loop, owners:release.after.owners});
}

async function held(label, run) {
  const hold = await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.begin());
  try { return await run(hold); }
  finally { await releaseHold(hold, label); }
}

async function frame(name, modes, {reference = false, compare = true} = {}) {
  const result = await page.evaluate(({modes, reference, compare}) => {
    const before = JSON.parse(document.querySelector('#runtime-stats').textContent).current.sceneSpace.outsideFrames;
    window.__HOW_RENDER_REVIEW__.set(modes);
    const canvas = document.querySelector('canvas[aria-label="森林之家可玩山谷"]');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('The outdoor renderer canvas is missing');
    // Capture and read back in the same task as render: preserveDrawingBuffer is
    // intentionally not enabled on the game renderer merely to support tests.
    const png = canvas.toDataURL('image/png');
    const gl = canvas.getContext('webgl2');
    if (!gl || gl.isContextLost()) throw new Error('A live WebGL2 context is required');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const previous = window.__HOW_RAINIER_PIXELS__;
    let changedPixels = 0, absoluteTotal = 0, maximum = 0, opaque = 0;
    let sum = 0, squareSum = 0, samples = 0;
    const bins = new Set();
    const canCompare = compare && previous?.width === canvas.width && previous?.height === canvas.height;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 255) opaque++;
      if (canCompare) {
        let changed = false;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(pixels[i + c] - previous.pixels[i + c]);
          absoluteTotal += d; maximum = Math.max(maximum, d); changed ||= d !== 0;
        }
        if (changed) changedPixels++;
      }
      if (i % 64 === 0) {
        const luminance = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
        sum += luminance; squareSum += luminance * luminance; samples++;
        bins.add((pixels[i] >> 4) * 256 + (pixels[i + 1] >> 4) * 16 + (pixels[i + 2] >> 4));
      }
    }
    if (reference) window.__HOW_RAINIER_PIXELS__ = {width:canvas.width, height:canvas.height, pixels};
    const count = canvas.width * canvas.height;
    return {png, before, canvas:{width:canvas.width, height:canvas.height}, glError:gl.getError(),
      image:{opaqueFraction:opaque / count, colorBins:bins.size, meanLuminance:sum / samples,
        luminanceDeviation:Math.sqrt(Math.max(0, squareSum / samples - (sum / samples) ** 2))},
      differenceFromReference:canCompare ? {changedPixels, maximum, meanAbsolute:absoluteTotal / (count * 3)} : null};
  }, {modes, reference, compare});
  // publishSnapshot notifies React; wait for that publication rather than
  // mistaking the previous DOM diagnostics for the frame just captured.
  await page.waitForFunction(({before, modes}) => {
    const s = JSON.parse(document.querySelector('#runtime-stats')?.textContent ?? '{}').current;
    return s?.sceneSpace?.outsideFrames > before && s.atmosphere.mode === modes.atmosphere && s.optics.mode === modes.optics;
  }, {before:result.before, modes}, {timeout:30000});
  const s = await readStats(); checkScene(s, name);
  assert.equal(result.glError, 0, `${name}: no WebGL error after readback`);
  assert.equal(result.image.opaqueFraction, 1, `${name}: complete opaque RGBA output`);
  // A view that lies entirely inside the broad focus band can legitimately
  // produce a black CoC mask. Keep that real mask for visual review.
  if (modes.optics !== 'coc') assert.ok(result.image.colorBins > 8, `${name}: the actual color image is not a blank canvas`);
  const bytes = Buffer.from(result.png.split(',')[1], 'base64');
  assert.ok(bytes.length > (modes.optics === 'coc' ? 500 : 4000), `${name}: PNG contains scene detail`);
  assert.deepEqual(result.canvas, s.canvas);
  if (s.optics.active) {
    assert.deepEqual(s.optics.sceneResolution, [s.canvas.width, s.canvas.height]);
    assert.deepEqual(s.optics.blurResolution, [Math.ceil(s.canvas.width / 2), Math.ceil(s.canvas.height / 2)]);
    assert.equal(s.optics.targets, 2);
  }
  await fs.writeFile(path.join(out, name + '.png'), bytes);
  const metadata = {name, file:name + '.png', viewport:page.viewportSize(), dpr:1, modes,
    seed:s.seed, gameTime:s.gameTime, worldSha256:digest(JSON.stringify(s.worldState)), player:s.player,
    camera:pose(s), overlook:orbit(s), canvas:s.canvas, appearance:s.appearance,
    drawCalls:s.drawCalls, triangles:s.triangles, shaderErrors:s.shaderErrors, graphicsBackend:s.graphicsBackend,
    gpu:s.gpu, atmosphere:s.atmosphere, optics:s.optics, horizon:s.horizon,
    frameWork:s.frameWork, streaming:s.streaming, forestView:s.forestView,
    image:result.image, differenceFromReference:result.differenceFromReference,
    pngBytes:bytes.length, pngSha256:digest(bytes)};
  report.frames.push(metadata);
  console.log('FRAME', name, JSON.stringify({canvas:s.canvas, amount:s.optics.amount, passes:s.optics.extraFullscreenPasses,
    pngBytes:bytes.length, image:result.image}));
  return {stats:s, metadata};
}

async function modeGroup(label, full = true) {
  return held(label, async () => {
    const first = await frame(label + '-final', {atmosphere:'final', optics:'final'}, {reference:true, compare:false});
    const repeated = await frame(label + '-frozen-repeat', {atmosphere:'final', optics:'final'});
    assert.equal(repeated.metadata.differenceFromReference.changedPixels, 0, `${label}: the frozen color frame is repeatable`);
    const cases = full ? [
      ['off', 'off', 'off'],
      ['atmosphere-only', 'final', 'off'],
      ['optics-only', 'off', 'final'],
      ['depth', 'off', 'depth'],
      ['coc', 'off', 'coc'],
      ['transmittance', 'transmittance', 'off'],
      ['inscatter', 'inscatter', 'off'],
    ] : [['off', 'off', 'off']];
    for (const [suffix, atmosphere, optics] of cases) {
      const captured = await frame(label + '-' + suffix, {atmosphere, optics});
      assert.deepEqual(pose(captured.stats), pose(first.stats), `${label}: mode changes preserve the same camera`);
      assert.equal(captured.metadata.worldSha256, first.metadata.worldSha256);
      if (suffix === 'off') assert.equal(captured.stats.optics.active, false);
      if (suffix === 'depth' || suffix === 'coc') assert.equal(captured.stats.optics.extraFullscreenPasses, 1);
    }
    await page.evaluate(() => { window.__HOW_RENDER_REVIEW__.set({atmosphere:'final', optics:'final'}); delete window.__HOW_RAINIER_PIXELS__; });
    return first.stats;
  });
}

async function installFixture(viewport, {missingAtlas = false, captureGround = true} = {}) {
  flow = {name:missingAtlas ? 'mass-fallback' : viewport.width < 600 ? 'mobile' : 'desktop', viewport, hour, weather, missingAtlas};
  report.flows.push(flow);
  console.log('FLOW', flow.name, JSON.stringify(viewport));
  context = await browser.newContext({viewport, deviceScaleFactor:1, hasTouch:viewport.width < 600});
  page = await context.newPage(); page.setDefaultTimeout(60000);
  const flowName = flow.name;
  page.on('pageerror', error => report.errors.push({flow:flowName, message:error.message}));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const entry = {flow:flowName, message:message.text(), location:message.location()};
    if (missingAtlas && /rainier-conifer-cluster\.json/.test(entry.location.url) && /404/.test(entry.message)) {
      (flow.expectedMissingAssetErrors ??= []).push(entry);
    } else report.errors.push(entry);
  });
  page.on('requestfailed', request => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) report.failedRequests.push({flow:flowName, url:request.url(), failure:request.failure()});
  });
  page.on('response', response => {
    if (/impostor/i.test(response.url()) && /\.(png|json)(\?|$)/i.test(response.url()))
      report.assetResponses.push({flow:flowName, url:response.url(), status:response.status()});
  });
  if (missingAtlas) await page.route('**/assets/forest-impostors/rainier-conifer-cluster.json', route =>
    route.fulfill({status:404, contentType:'text/plain', body:'Intentionally missing atlas for the geometry fallback review'}));
  await context.addInitScript(() => {
    const review = window.__HOW_RAINIER_REVIEW__ = {stage:'startup', samples:[], previousText:'', pausedWorld:null, pauseSegment:0};
    new MutationObserver(() => {
      const text = document.querySelector('#runtime-stats')?.textContent;
      if (!text || text === review.previousText) return;
      review.previousText = text;
      let s; try { s = JSON.parse(text).current; } catch { return; }
      if (!s?.worldState || !s.sceneSpace?.outdoorCamera?.overlook) return;
      const paused = window.__HOW_CAPTURE_HOLD__?.read().owners.manualPause === true;
      const world = paused ? JSON.stringify(s.worldState) : null;
      if (paused && review.pausedWorld === null) { review.pausedWorld = world; review.pauseSegment++; }
      if (!paused) review.pausedWorld = null;
      review.samples.push({at:performance.now(), stage:review.stage, paused, pauseSegment:review.pauseSegment,
        worldUnchanged:!paused || world === review.pausedWorld, gameTime:s.gameTime, loop:s.loop,
        camera:s.sceneSpace.outdoorCamera, frameWork:s.frameWork, optics:s.optics, shaderErrors:s.shaderErrors});
      if (review.samples.length > 1200) review.samples.shift();
    }).observe(document, {childList:true, subtree:true, characterData:true});
  });
  await page.route('**/__rainier-fixture', route => route.fulfill({contentType:'text/html',
    body:'<!doctype html><link rel="icon" href="data:,"><title>Deterministic Rainier starter fixture</title>'}));
  await page.goto(origin + '/__rainier-fixture', {waitUntil:'domcontentloaded'});
  flow.fixture = await page.evaluate(async weather => {
    const {createStarterState} = await import('/src/domain/state.ts');
    const {createWeather} = await import('/src/domain/weather.ts');
    const {createSaveContext} = await import('/src/domain/save-context.ts');
    const {serializeWorldSave} = await import('/src/domain/world-save.ts');
    const {createBrowserWorldSaveStore} = await import('/src/app/world-save-store.ts');
    const state = createStarterState(), store = createBrowserWorldSaveStore();
    state.weather = {...createWeather(state.time), kind:weather, auto:false};
    const raw = await serializeWorldSave(state, createSaveContext(), {sequence:1, savedAt:0});
    if (!await store.compareAndSwap(await store.read(), {primary:raw, backup:raw})) throw new Error('Starter save could not be committed');
    return {seed:state.seed, time:state.time, player:state.player, weather:state.weather};
  }, weather);
  await page.goto(`${origin}/?inspect=1&hour=${hour}&farForest=impostor`, {waitUntil:'domcontentloaded'});
  await page.locator('.loading').waitFor({state:'hidden', timeout:180000});
  await page.waitForFunction(() => !!window.__HOW_CAPTURE_HOLD__ && !!window.__HOW_RENDER_REVIEW__ && !!document.querySelector('#runtime-stats'),
    undefined, {timeout:180000});
  const initial = await settledPause();
  assert.equal(initial.seed, flow.fixture.seed);
  assert.equal(initial.appearance.hour, hour);
  assert.equal(initial.worldState.weather.auto, false);
  assert.equal(initial.worldState.weather.kind, weather);
  assert.equal(orbit(initial).groundReady, true);
  assert.equal(initial.optics.active, false);
  assert.equal(initial.optics.targets, 0, 'Ground startup does not allocate the aerial HDR buffers');
  flow.initial = {worldSha256:digest(JSON.stringify(initial.worldState)), optics:initial.optics,
    atmosphere:initial.atmosphere, horizon:initial.horizon};
  if (captureGround) await modeGroup(flow.name + '-ground', false);
}

async function raiseAndPause({captureStages = true, fullModes = true} = {}) {
  await page.getByRole('button', {name:'回到山谷', exact:true}).click();
  await page.getByRole('button', {name:'镜头', exact:true}).click();
  const hold = await page.evaluate(() => {
    window.__HOW_RAINIER_REVIEW__.stage = 'raising';
    const click = label => {
      const button = document.querySelector(`button[aria-label="${label}"]`);
      if (!button || button.disabled || !button.getClientRects().length) throw new Error(`Unavailable visible camera control: ${label}`);
      button.click();
    };
    for (let i = 0; i < 4; i++) click('抬高镜头');
    for (let i = 0; i < 3; i++) click('缩小');
    click('镜头右转'); click('暂停');
    return window.__HOW_CAPTURE_HOLD__.begin();
  });
  try {
    assert.equal(hold.before.loop.mode, 'presentation', 'The existing paused presentation loop owns the lift');
    if (captureStages) await frame(flow.name + '-lift-start', {atmosphere:'final', optics:'final'}, {compare:false});
  } finally { await releaseHold(hold, flow.name + '-lift-start'); }
  if (captureStages) {
    await page.waitForFunction(() => {
      const c = JSON.parse(document.querySelector('#runtime-stats').textContent).current.sceneSpace.outdoorCamera.overlook;
      return c.pending && c.current.elevation > .42 && c.current.elevation < .82;
    }, undefined, {timeout:180000, polling:100});
    await held(flow.name + '-lift-transition', () => frame(flow.name + '-lift-transition', {atmosphere:'final', optics:'final'}, {compare:false}));
  }
  const s = await settledPause();
  assert.equal(JSON.stringify(s.worldState), hold.before.world, 'Paused lift never advances gameplay');
  assert.equal(orbit(s).mode, 'overlook');
  assert.equal(orbit(s).groundReady, false);
  assert.ok(orbit(s).current.elevation >= .86 && orbit(s).current.zoom <= .50);
  assert.equal(s.optics.amount, 1);
  assert.equal(s.optics.active, true);
  const c = s.sceneSpace.outdoorCamera;
  const longAxisFov = c.aspect < 1 ? c.fov : 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) * c.aspect) * 180 / Math.PI;
  assert.ok(longAxisFov >= 65 && longAxisFov <= 75, 'The aerial long-axis field is a 24–28 mm full-frame equivalent');
  assert.ok(c.fov < 80, 'Portrait view does not gain an unbounded vertical FOV');
  flow.lift = {pausedWorldSha256:digest(hold.before.world), camera:pose(s), longAxisFov, optics:s.optics};
  await page.evaluate(() => { window.__HOW_RAINIER_REVIEW__.stage = 'overlook'; });
  await modeGroup(flow.name + '-overlook', fullModes);
}

async function resizeAndReturn() {
  const original = flow.viewport;
  const resized = original.width < 600 ? {width:844, height:390} : {width:960, height:640};
  const before = await readStats();
  await page.evaluate(() => { window.__HOW_RAINIER_REVIEW__.stage = 'resize'; });
  await held(flow.name + '-resize', async () => {
    await page.setViewportSize(resized);
    await page.waitForFunction(({width, height}) => {
      const c = document.querySelector('canvas[aria-label="森林之家可玩山谷"]');
      return c?.width === width && c?.height === height;
    }, resized);
    const s = (await frame(flow.name + '-resized-final', {atmosphere:'final', optics:'final'}, {compare:false})).stats;
    assert.deepEqual(orbit(s).current, orbit(before).current, 'Resize preserves the orbit pose');
    assert.deepEqual(s.sceneSpace.outdoorCamera.position, before.sceneSpace.outdoorCamera.position);
    assert.ok(Math.abs(s.sceneSpace.outdoorCamera.aspect - resized.width / resized.height) < 1e-10);
    await frame(flow.name + '-resized-depth', {atmosphere:'off', optics:'depth'}, {compare:false});
    await page.setViewportSize(original);
    await page.waitForFunction(({width, height}) => {
      const c = document.querySelector('canvas[aria-label="森林之家可玩山谷"]');
      return c?.width === width && c?.height === height;
    }, original);
    const restored = (await frame(flow.name + '-resize-restored', {atmosphere:'final', optics:'final'}, {compare:false})).stats;
    assert.deepEqual(pose(restored), pose(before), 'Returning the viewport restores the same camera projection');
  });
  await settledPause();
  await page.evaluate(() => { window.__HOW_RAINIER_REVIEW__.stage = 'returning'; });
  // Use the actual pause dialog's reset/resume action, then pause again through
  // its visible HUD control. Camera recovery continues on presentation frames.
  await page.getByRole('button', {name:'复位镜头并继续', exact:true}).click();
  await page.getByRole('button', {name:'暂停', exact:true}).click();
  const pausedWorld = await page.evaluate(() => {
    const hold = window.__HOW_CAPTURE_HOLD__.begin(); window.__HOW_CAPTURE_HOLD__.end(hold.token); return hold.before.world;
  });
  const ground = await settledPause();
  assert.equal(JSON.stringify(ground.worldState), pausedWorld, 'Paused recovery preserves world state');
  assert.equal(orbit(ground).groundReady, true);
  assert.equal(orbit(ground).mode, 'follow');
  assert.equal(ground.optics.active, false);
  assert.equal(ground.optics.amount, 0);
  assert.equal(ground.optics.extraFullscreenPasses, 0);
  flow.returned = {camera:pose(ground), optics:ground.optics, worldSha256:digest(pausedWorld)};
  await page.evaluate(() => { window.__HOW_RAINIER_REVIEW__.stage = 'returned'; });
  await modeGroup(flow.name + '-returned', false);
  flow.samples = await page.evaluate(() => window.__HOW_RAINIER_REVIEW__.samples);
  assert.ok(flow.samples.some(s => s.stage === 'raising' && s.paused && s.camera.overlook.pending), 'The real lift produced paused presentation frames');
  assert.ok(flow.samples.filter(s => s.paused).every(s => s.worldUnchanged), 'Every observed pause segment preserves the world');
  assert.ok(flow.samples.every(s => s.shaderErrors === 0));
  await context.close(); context = null; page = null;
}

function gallery() {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Rainier optics review</title>
<style>body{margin:2rem;background:#141918;color:#e6ece6;font:16px system-ui;line-height:1.5}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1.2rem}figure{margin:0;background:#252e2b;padding:1rem}img{display:block;max-width:100%;height:auto;max-height:80vh;margin:auto}figcaption{margin-top:.8rem}code{overflow-wrap:anywhere}</style>
<h1>Rainier optics review — ${escape(report.result)}</h1><p>Revision <code>${escape(report.sourceRevision)}</code>; hour ${hour}; weather ${escape(weather)}.</p>
<p>${escape(report.comparisonNote)}</p><p>${escape(report.captureNote)}</p><p><a href="rainier-optics-review.json">Complete measurements and transition samples</a></p>
<main>${report.frames.map(f => `<figure><a href="${escape(f.file)}"><img loading="lazy" src="${escape(f.file)}" alt="${escape(f.name)}"></a><figcaption><strong>${escape(f.name)}</strong><br>${f.canvas.width}×${f.canvas.height}; atmosphere ${escape(f.modes.atmosphere)}; optics ${escape(f.modes.optics)}; ${f.optics.extraFullscreenPasses} additional passes<br>World <code>${f.worldSha256.slice(0, 16)}</code>; focus ${f.optics.focusDistance.toFixed(2)}</figcaption></figure>`).join('\n')}</main>`;
}

await fs.mkdir(out, {recursive:true});
try {
  if (!process.env.TEST_ORIGIN) {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1',
      '--port', new URL(origin).port || '80', '--strictPort'], {cwd:root, stdio:['ignore', 'pipe', 'pipe']});
    for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog = (serverLog + data.toString()).slice(-16000); });
  }
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(origin, {signal:AbortSignal.timeout(1000)})).ok) { ready = true; break; } } catch {}
    if (server && server.exitCode !== null) throw new Error(`Vite exited: ${serverLog}`);
    await delay(250);
  }
  assert.ok(ready, `Vite unavailable at ${origin}: ${serverLog}`);
  browser = await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {}),
    args:['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  for (const viewport of [{width:1280, height:800}, {width:390, height:844}]) {
    await installFixture(viewport); await raiseAndPause(); await resizeAndReturn();
  }
  // Missing optional files must still produce the default mass geometry. One
  // additional high view gives that representation its own final/off evidence.
  await installFixture({width:1280, height:800}, {missingAtlas:true, captureGround:false});
  await raiseAndPause({captureStages:false, fullModes:false});
  flow.samples = await page.evaluate(() => window.__HOW_RAINIER_REVIEW__.samples);
  report.fallbackNote = 'The deliberately missing atlas renders the same mass geometry used by default; this flow is explicitly fallback, not a successful impostor load.';
  await context.close(); context = null; page = null;
  assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []);
  assert.ok(report.assetResponses.some(r => /\.json(\?|$)/i.test(r.url) && r.status === 200), 'An actual atlas manifest was fetched');
  assert.ok(report.assetResponses.filter(r => /\.png(\?|$)/i.test(r.url) && r.status === 200).length >= 2, 'Both atlas textures were fetched');
  report.result = 'passed';
  console.log(`Rainier optics review passed: two viewports plus the missing-atlas fallback, ${report.frames.length} real PNG frames`);
} catch (error) {
  report.result = 'failed'; report.failure = String(error); report.stack = error.stack; process.exitCode = 1;
  console.error(error);
  if (page) {
    try { report.failureState = await readStats(); flow.samples = await page.evaluate(() => window.__HOW_RAINIER_REVIEW__?.samples); } catch {}
    try { await page.screenshot({path:path.join(out, 'failure.png'), timeout:15000}); } catch {}
  }
} finally {
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  if (server?.pid) server.kill('SIGTERM');
  report.finishedAt = new Date().toISOString(); report.serverLog = serverLog;
  await fs.writeFile(path.join(out, 'rainier-optics-review.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(out, 'index.html'), gallery());
}
