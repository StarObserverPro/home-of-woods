/** Focused main-game tent verification. Screenshots/videos stay in CI artifacts. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { captureTentFrame, observeTentPage, tentReady, tentStats, verifyTentPortal } from './tent-portal-browser.mjs';

const cwd = process.cwd(), out = path.resolve(process.env.TENT_EVIDENCE_DIR ?? '/tmp/how-tent-evidence');
const suite = process.env.TENT_REVIEW_SUITE ?? 'all';
assert.ok(['all', 'portal', 'desktop', 'phone', 'material'].includes(suite), 'Unknown tent review suite');
const origin = process.env.TENT_REVIEW_ORIGIN ?? 'http://127.0.0.1:4189';
const port = new URL(origin).port;
await fs.mkdir(out, { recursive: true });
const entry = await fs.readFile(path.join(cwd, 'dist/index.html'));
const report = {
  startedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  builtEntrySha256: createHash('sha256').update(entry).digest('hex'), status: 'running', suite, origin, node: process.version,
  captureInputs: { seed: 104729, dpr: 1, hours: [14, 1], bookmarks: ['tentNear', 'tentSide', 'tentFar'],
    diagnosticWindTimes: [0, 2.5], materialModes: ['final', 'clay', 'normals', 'wireframe'] },
  frames: [], flows: [], errors: [], consoleWarnings: [], networkFailures: [],
  limits: [
    'Software Chromium WebGL and touch emulation are not physical mobile GPU performance.',
    'Portal recordings use live gameplay time; material captures fix only the tent wind phase and sun hour.',
    'Human review of screenshots and recordings is required for silhouette, material feel and temporal shimmer.',
    'Reported CPU frame timings are not GPU timings.',
  ],
};
let previewLog = '', browser, phase = 'start preview';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'],
  { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { previewLog = (previewLog + chunk).slice(-80000); });
async function ready() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw Error(`Preview exited (${server.exitCode}): ${previewLog}`);
    try { if ((await fetch(origin, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* startup retry */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(`Preview did not become ready: ${previewLog}`);
}

async function inspect(page, preset) {
  const diagnostics = page.locator('details.diagnostics');
  await diagnostics.evaluate(element => { element.style.display = ''; element.open = true; });
  await page.getByLabel('场景观察位置').selectOption(preset);
  await page.waitForFunction(expected => JSON.parse(document.querySelector('#runtime-stats').textContent).current.scenePreset === expected, preset);
  await diagnostics.evaluate(element => { element.style.display = 'none'; });
}

async function materialCaptures() {
  for (const mode of ['final', 'clay', 'normals', 'wireframe']) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    observeTentPage(page, origin, report, `material-${mode}`);
    let sideAtZero;
    try {
      await page.goto(`${origin}/?inspect=1&hour=14&optics=off&tentMaterial=${mode}&tentWindTime=0`);
      await tentReady(page);
      for (const preset of mode === 'final' ? ['tentNear', 'tentSide', 'tentFar'] : ['tentSide']) {
        await inspect(page, preset);
        const captured = await captureTentFrame(page, out, report, `tent-${mode}-${preset}`);
        assert.equal(captured.tentExterior.debugMode, mode, 'The material diagnostic must change the actual tent');
        assert.equal(captured.tentExterior.hangingSlots.length, 3);
        assert.equal(captured.tentExterior.furnishings.length, 3);
        assert.ok(captured.tentExterior.windDisplacement <= captured.tentExterior.maxWindDisplacement);
        if (preset === 'tentSide') sideAtZero = captured;
      }
      if (mode === 'final') {
        // Same authored camera and material, another fixed fabric phase. The
        // exterior's diagnostic vertex samples also accompany these captures.
        await page.goto(`${origin}/?inspect=1&hour=14&optics=off&tentMaterial=final&tentWindTime=2.5`);
        await tentReady(page);
        const resume = page.locator('.pause-dialog .primary-button');
        if (await resume.isVisible()) await resume.click();
        await inspect(page, 'tentSide');
        const later = await captureTentFrame(page, out, report, 'tent-final-tentSide-wind-2_5');
        assert.notEqual(later.tentExterior.windDisplacement, sideAtZero.tentExterior.windDisplacement, 'Fixed wind phases must actually deform the cloth');
        report.flows.push({ name: 'tent-fixed-wind-phases', phases: [0, 2.5],
          localDisplacements: [sideAtZero.tentExterior.windDisplacement, later.tentExterior.windDisplacement],
          maxLocalDisplacement: later.tentExterior.maxWindDisplacement });
      }
    } catch (error) {
      report.materialFailure = { mode, state: await tentStats(page).catch(() => null) };
      await captureTentFrame(page, out, report, `tent-material-${mode}-failure`).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
}

try {
  await ready(); phase = 'launch Chromium';
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browser = await browser.version();
  if (suite === 'all' || suite === 'material') { phase = 'material and fixed-view captures'; await materialCaptures(); }
  if (suite !== 'material') { phase = 'actual tent portal'; await verifyTentPortal(browser, origin, out, report, suite); }
  assert.deepEqual(report.errors, [], 'Browser or shader errors');
  assert.deepEqual(report.networkFailures, [], 'Runtime requests failed');
  report.status = 'passed-automated'; console.log('TENT_REVIEW_PASS');
} catch (error) {
  report.status = 'failed'; report.failure = { phase, message: String(error.stack ?? error) };
  console.error(`TENT_REVIEW_FAIL (${phase})`, error); process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {}); server.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(out, 'preview.log'), previewLog);
}
