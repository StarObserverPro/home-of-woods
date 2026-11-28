// Exercise the real main runtime in CI. Evidence belongs in a temporary directory.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const out = path.resolve(process.env.EVIDENCE_DIR ?? path.join(os.tmpdir(), 'how-frame-budget-review'));
assert.ok(out !== root && !out.startsWith(root + path.sep), 'Screenshots must stay outside the repository');
fs.mkdirSync(out, {recursive:true});
const origin = 'http://127.0.0.1:5191';
const requiresCamera = fs.existsSync(path.join(root, 'src/scene/anchored-overlook.ts'));
const digest = value => createHash('sha256').update(value).digest('hex');
const report = {
  sourceRevision:process.env.SOURCE_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim(),
  result:'running', startedAt:new Date().toISOString(), origin,
  rendererNote:'Headless Chromium with SwiftShader: functional rendering evidence, not a physical-device frame-rate benchmark.',
  advancement:'The existing DEV inspection stepper advances the normal fixed-step owner; navigation comes from the route UI.',
  requiresCamera, flows:[], frames:[], errors:[], failedRequests:[],
};
let server, serverExit, browser, context, page, flow;
const readStats = () => page.evaluate(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current);
const camera = s => s.sceneSpace?.outdoorCamera?.overlook;
const readWorld = async () => JSON.stringify((await readStats()).worldState);

function checkScene(s, label) {
  assert.equal(s.shaderErrors, 0, `${label}: shaders compile`);
  assert.equal(s.contextLost, false, `${label}: WebGL context remains live`);
  assert.ok(Number.isFinite(s.drawCalls) && s.drawCalls > 0, `${label}: draws were submitted`);
  assert.ok(Number.isFinite(s.triangles) && s.triangles > 0, `${label}: scene geometry was rendered`);
  assert.ok(s.streaming.detailTrees > 0 && s.streaming.sceneryInstances > 0, `${label}: both forest representations are present`);
  assert.equal(s.characters?.disposed, false, `${label}: the actual character asset is mounted`);
  assert.ok(s.frameWork.lastSteps <= 12, `${label}: per-frame work respects the step cap`);
  assert.equal(s.frameWork.lastBudgetMs, flow.viewport.width < 600 ? 1.5 : 3);
  if (requiresCamera) {
    assert.ok(camera(s), `${label}: this revision must expose its anchored camera`);
    assert.equal(s.streaming.viewEnabled, true, `${label}: the real scene consumes its view plan`);
    assert.ok(s.streaming.maxViewStepTrees <= 8, `${label}: each visibility slice stays bounded`);
    assert.ok(s.forestView.current > 0 && s.forestView.wanted >= s.forestView.current, `${label}: current and predicted sets are populated`);
  }
}

async function waitFor(predicate, timeout=120000) {
  await page.waitForFunction(predicate, undefined, {timeout, polling:100});
}

async function settledPause() {
  await waitFor(() => {
    const s = JSON.parse(document.querySelector('#runtime-stats')?.textContent ?? '{}').current;
    return s?.frameWork?.pending === 0 && s.loop.mode === 'stopped';
  });
  const s = await readStats();
  assert.equal(s.streaming.pendingChunks, 0);
  assert.equal((await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.read())).owners.manualPause, true);
  checkScene(s, flow.name + ': paused');
  if (requiresCamera) assert.equal(s.forestView.ready, true, 'Paused view preparation converges');
  return s;
}

async function resume() {
  await page.getByRole('button', {name:'回到山谷', exact:true}).click();
  await waitFor(() => window.__HOW_CAPTURE_HOLD__?.read().loop.mode === 'simulation');
}

async function capture(name) {
  // Borrow the existing capture hold; do not introduce another loop or let a
  // screenshot advance gameplay while the renderer is being read back.
  const hold = await page.evaluate(() => window.__HOW_CAPTURE_HOLD__.begin());
  try {
    await page.locator('.diagnostics').evaluate(element => { element.style.visibility = 'hidden'; });
    const cdp = await context.newCDPSession(page);
    try {
      const image = await cdp.send('Page.captureScreenshot', {format:'png', fromSurface:true});
      const bytes = Buffer.from(image.data, 'base64');
      assert.ok(bytes.length > 10000, `${name}: screenshot contains a rendered scene`);
      fs.writeFileSync(path.join(out, name + '.png'), bytes);
      const s = await readStats(); checkScene(s, name);
      report.frames.push({name, viewport:flow.viewport, dpr:1, seed:s.seed, gameTime:s.gameTime,
        player:s.player, camera:s.sceneSpace.outdoorCamera, drawCalls:s.drawCalls, triangles:s.triangles,
        shaderErrors:s.shaderErrors, graphicsBackend:s.graphicsBackend, gpu:s.gpu,
        frameWork:s.frameWork, streaming:s.streaming, understory:s.understory, forestView:s.forestView,
        pngBytes:bytes.length, pngSha256:digest(bytes)});
      console.log('FRAME', name, JSON.stringify({drawCalls:s.drawCalls, triangles:s.triangles, pending:s.frameWork.pending}));
    } finally { await cdp.detach(); }
  } finally {
    await page.locator('.diagnostics').evaluate(element => { element.style.visibility = ''; });
    const release = await page.evaluate(token => window.__HOW_CAPTURE_HOLD__.end(token), hold.token);
    assert.equal(release.released, true);
    assert.equal(release.held.world, hold.before.world, `${name}: capture never advances the world`);
  }
}

async function fresh(viewport) {
  flow = {name:viewport.width < 600 ? 'mobile' : 'desktop', viewport, steps:[]};
  report.flows.push(flow);
  console.log('FLOW', flow.name, JSON.stringify(viewport));
  context = await browser.newContext({viewport, deviceScaleFactor:1, hasTouch:viewport.width < 600});
  page = await context.newPage(); page.setDefaultTimeout(60000);
  page.on('pageerror', error => report.errors.push({flow:flow.name, message:error.message}));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({flow:flow.name, message:message.text()}); });
  page.on('requestfailed', request => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) report.failedRequests.push({flow:flow.name, url:request.url(), failure:request.failure()});
  });
  await context.addInitScript(() => {
    // Observe published runtime diagnostics, including the first paused frames.
    // This observer neither changes state nor schedules a rendering frame.
    const review = window.__HOW_FRAME_REVIEW__ = {samples:[], previousText:'', frozen:null, pauseSegment:0};
    new MutationObserver(() => {
      const text = document.querySelector('#runtime-stats')?.textContent;
      if (!text || text === review.previousText) return;
      review.previousText = text;
      let s; try { s = JSON.parse(text).current; } catch { return; }
      if (!s?.frameWork || !s.worldState) return;
      const paused = window.__HOW_CAPTURE_HOLD__?.read().owners.manualPause === true;
      const world = paused ? JSON.stringify(s.worldState) : null;
      if (paused && review.frozen === null) { review.frozen = world; review.pauseSegment++; }
      if (!paused) review.frozen = null;
      review.samples.push({at:performance.now(), paused, pauseSegment:review.pauseSegment,
        worldUnchanged:!paused || world === review.frozen, gameTime:s.gameTime, player:s.player,
        loop:s.loop, frameWork:s.frameWork, streaming:s.streaming,
        camera:s.sceneSpace?.outdoorCamera?.overlook ?? null});
      if (review.samples.length > 1000) review.samples.shift();
    }).observe(document, {childList:true, subtree:true, characterData:true});
  });
  await page.route('**/__frame-budget-fixture', route => route.fulfill({contentType:'text/html', body:'<!doctype html><link rel="icon" href="data:,"><title>Starter save fixture</title>'}));
  await page.goto(origin + '/__frame-budget-fixture', {waitUntil:'domcontentloaded'});
  flow.fixture = await page.evaluate(async () => {
    const {createStarterState} = await import('/src/domain/state.ts');
    const {createSaveContext} = await import('/src/domain/save-context.ts');
    const {serializeWorldSave} = await import('/src/domain/world-save.ts');
    const {createBrowserWorldSaveStore} = await import('/src/app/world-save-store.ts');
    const state = createStarterState(), store = createBrowserWorldSaveStore();
    const raw = await serializeWorldSave(state, createSaveContext(), {sequence:1, savedAt:0});
    if (!await store.compareAndSwap(await store.read(), {primary:raw, backup:raw})) throw new Error('Starter save was not committed');
    return {seed:state.seed, player:state.player};
  });
  await page.goto(origin + '/?inspect=1', {waitUntil:'domcontentloaded'});
  await page.locator('.loading').waitFor({state:'hidden', timeout:120000});
  await waitFor(() => !!window.__HOW_CAPTURE_HOLD__ && !!document.querySelector('#runtime-stats'));
  const initial = await settledPause();
  assert.equal(initial.seed, flow.fixture.seed);
  const samples = await page.evaluate(() => window.__HOW_FRAME_REVIEW__.samples);
  const preparing = samples.filter(s => s.paused && s.loop.mode === 'presentation' && s.frameWork.pending > 0);
  assert.ok(preparing.length > 0, 'Restoring the actual world must show queued work progressing while paused');
  assert.ok(initial.frameWork.totalSteps > preparing[0].frameWork.totalSteps, 'Paused frames actually execute queued steps');
  assert.ok(samples.filter(s => s.paused).every(s => s.worldUnchanged), 'Paused preparation never changes the world');
  flow.pausedStartup = {samples:preparing.length, from:preparing[0].frameWork, to:initial.frameWork, worldSha256:digest(await readWorld())};
  console.log('PAUSED_CONVERGED', flow.name, JSON.stringify(flow.pausedStartup));
  await resume();
  await capture(flow.name + '-camp');
}

async function aerialIfPresent() {
  const s = await readStats();
  if (!camera(s)) { flow.camera = {status:'not-in-this-revision'}; return; }
  await page.getByRole('button', {name:'镜头', exact:true}).click();
  await page.getByRole('button', {name:'抬高镜头', exact:true}).click();
  // Queue visible UI intents then pause in the same task, before the next RAF.
  // The pause dialog is never bypassed to operate hidden camera controls.
  const paused = await page.evaluate(() => {
    const click = label => {
      const button = document.querySelector(`button[aria-label="${label}"]`);
      if (!button || button.disabled || !button.getClientRects().length) throw new Error(`Unavailable visible control: ${label}`);
      button.click();
    };
    for (let i=0; i<3; i++) click('抬高镜头');
    click('缩小'); click('镜头右转'); click('暂停');
    const hold = window.__HOW_CAPTURE_HOLD__.begin();
    window.__HOW_CAPTURE_HOLD__.end(hold.token);
    return {world:hold.before.world, loop:hold.before.loop};
  });
  assert.equal(paused.loop.mode, 'presentation', 'Pending camera motion wakes the same paused presentation owner');
  const settled = await settledPause();
  assert.equal(await readWorld(), paused.world, 'Completing a paused camera transition never mutates GameState');
  const overview = camera(settled);
  assert.equal(overview.mode, 'overlook'); assert.equal(overview.pending, false);
  assert.ok(overview.current.elevation > .24 && overview.current.elevation <= 1.15);
  assert.ok(overview.current.zoom >= .48 && overview.current.zoom < .76);
  assert.equal(overview.groundReady, false);
  flow.camera = {status:'passed', pausedWorldSha256:digest(paused.world), overview};
  await resume(); await capture(flow.name + '-overlook');
  await page.getByRole('button', {name:'镜头', exact:true}).click();
}

async function walkAcrossChunks() {
  const before = await readStats();
  await page.getByRole('button', {name:'路线', exact:true}).click();
  const routes = page.locator('.route-sheet');
  await routes.getByRole('button', {name:'风景', exact:true}).click();
  await routes.getByRole('button', {name:'宅后望台', exact:true}).click();
  await routes.getByRole('button', {name:'前往', exact:true}).click();
  await waitFor(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.routeNodes > 0);
  for (let step=0; step<16; step++) {
    const s = await readStats();
    if (s.routeNodes === 0) break;
    if (camera(s) && !camera(s).groundReady) {
      const position = s.player, route = s.worldState.route;
      await page.evaluate(() => window.__HOW_ADVANCE_SIMULATION__(.25));
      const returning = await readStats();
      assert.ok(Math.hypot(returning.player.x-position.x, returning.player.z-position.z) < .001, 'High camera returns before walking');
      assert.deepEqual(returning.worldState.route, route, 'Returning preserves the navigation intent');
      await waitFor(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.sceneSpace.outdoorCamera.overlook.groundReady);
      flow.camera.returnedForMovement = true;
    }
    // Advance normal navigation, then use the visible pause control to expose
    // any remaining presentation work without another simulation frame.
    const paused = await page.evaluate(() => {
      const preparationBefore = JSON.parse(document.querySelector('#runtime-stats').textContent).current.frameWork.frame;
      window.__HOW_ADVANCE_SIMULATION__(5);
      const preparationAfter = JSON.parse(document.querySelector('#runtime-stats').textContent).current.frameWork.frame;
      document.querySelector('button[aria-label="暂停"]').click();
      const hold = window.__HOW_CAPTURE_HOLD__.begin();
      window.__HOW_CAPTURE_HOLD__.end(hold.token);
      return {world:hold.before.world, loop:hold.before.loop, preparationBefore, preparationAfter};
    });
    assert.equal(paused.preparationAfter, paused.preparationBefore, 'Immediate redraws never grant a second preparation slice');
    const after = await settledPause();
    assert.equal(await readWorld(), paused.world, 'Queued residency commits leave the paused world untouched');
    flow.steps.push({step, player:after.player, routeNodes:after.routeNodes, pausedMode:paused.loop.mode,
      frameWork:after.frameWork, streaming:after.streaming, worldSha256:digest(paused.world)});
    await resume();
  }
  const after = await readStats(), size = after.streaming.chunkSize;
  assert.equal(after.routeNodes, 0, 'The actual route completes');
  assert.ok(Math.hypot(after.player.x+27, after.player.z+70) < 1, 'Player reaches the authored lookout waypoint');
  assert.notEqual(`${Math.floor(before.player.x/size)}:${Math.floor(before.player.z/size)}`, `${Math.floor(after.player.x/size)}:${Math.floor(after.player.z/size)}`, 'Player crosses a streaming chunk boundary');
  assert.ok(after.streaming.commits > before.streaming.commits, 'Walking changes committed forest residency');
  assert.ok(after.streaming.loads > before.streaming.loads, 'Walking prepares and commits detailed trees');
  if (requiresCamera) assert.equal(camera(after).groundReady, true);
  flow.walk = {from:before.player, to:after.player, fromStreaming:before.streaming, toStreaming:after.streaming};
  await capture(flow.name + '-lookout');
}

try {
  const log = fs.createWriteStream(path.join(out, 'vite.log'));
  server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5191', '--strictPort'], {cwd:root, stdio:['ignore','pipe','pipe'], detached:process.platform !== 'win32'});
  server.stdout.pipe(log, {end:false}); server.stderr.pipe(log, {end:false});
  server.once('close', () => log.end());
  server.on('error', error => { serverExit = String(error); });
  server.on('exit', (code, signal) => { serverExit = {code, signal}; });
  const deadline = Date.now() + 45000;
  while (true) {
    assert.ok(!serverExit, 'Vite exited before readiness: ' + JSON.stringify(serverExit));
    try { if ((await fetch(origin, {signal:AbortSignal.timeout(1500)})).ok) break; } catch {}
    assert.ok(Date.now() < deadline, 'Vite did not become ready'); await delay(250);
  }
  browser = await chromium.launch({headless:true, args:['--no-sandbox','--disable-dev-shm-usage', '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  report.browser = browser.version();
  for (const viewport of [{width:1280,height:800}, {width:390,height:844}]) {
    await fresh(viewport); await aerialIfPresent(); await walkAcrossChunks();
    flow.samples = await page.evaluate(() => window.__HOW_FRAME_REVIEW__.samples);
    assert.ok(flow.samples.every(s => s.frameWork.lastSteps <= 12 && s.worldUnchanged), 'All sampled slices respect the cap and frozen-world invariant');
    flow.result = 'passed'; await context.close(); context = null; page = null;
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.failedRequests, []);
  report.result = 'passed';
  console.log(`Frame budget review passed: ${report.flows.length} viewports, ${report.frames.length} real frames at ${report.sourceRevision}`);
} catch (error) {
  report.result = 'failed'; report.failure = String(error); report.stack = error.stack; process.exitCode = 1; console.error(error);
  if (page) {
    try { report.failureState = await readStats(); flow.samples = await page.evaluate(() => window.__HOW_FRAME_REVIEW__?.samples); } catch {}
    try { const cdp = await context.newCDPSession(page); const shot = await cdp.send('Page.captureScreenshot', {format:'png', fromSurface:true}); fs.writeFileSync(path.join(out, 'failure.png'), Buffer.from(shot.data, 'base64')); await cdp.detach(); } catch {}
  }
} finally {
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  if (server?.pid) {
    try { if (process.platform === 'win32') server.kill('SIGTERM'); else process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') report.cleanupError = String(error); }
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
