import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ensureBrowser } from './webgl-session.mjs';

const output = resolve(process.env.HOW_EVIDENCE_DIR ?? '.cache/evidence-lifecycle');
const url = process.env.HOW_QA_URL ?? 'http://127.0.0.1:5173/?qa=1';
await mkdir(output, { recursive: true });
const browser = await ensureBrowser(), contexts = [];
const report = { url, cases: [], screenshots: [], errors: [], ok: false };
const SAVE_KEY = 'home-of-woods-save-v1';
async function create(viewport, mobile = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile }); contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__VISUAL_READY__);
  return page;
}
async function check(name, fn) {
  process.stdout.write(`${name} ... `); const detail = await fn();
  report.cases.push({ name, result: 'pass', detail }); process.stdout.write('PASS\n');
}
async function shot(page, name) {
  await page.evaluate(() => window.__HOW__.freeze(true));
  const state = await page.evaluate(() => window.__HOW__.state());
  const camera = { x: state.player.x, z: state.player.z - 1.6, zoom: 1 };
  await page.evaluate(camera => window.__HOW__.camera(camera), camera);
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = join(output, `${name}.png`); await writeFile(path, Buffer.from(data, 'base64'));
  const statePath = join(output, `${name}.state.json`); await writeFile(statePath, JSON.stringify(state, null, 2));
  report.screenshots.push({ name, path, statePath, viewport: page.viewportSize(), camera: { target: { x: camera.x, y: 0.3, z: camera.z }, offset: { x: 18, y: 24, z: 24 }, zoom: 1 }, state: { time: state.time, seed: state.seed }, metrics: await page.evaluate(() => window.__HOW__.metrics()) });
  await cdp.detach(); await page.evaluate(() => window.__HOW__.freeze(false));
}
try {
  if (!process.argv.includes('--build-only')) {
  const page = await create({ width: 1440, height: 900 });
  await check('warmed preview and same-state reload resources converge', async () => {
    await page.evaluate(() => window.__HOW__.freeze(true));
    const cycle = async () => {
      await page.locator('[data-tool="build"]').click();
      await page.getByTestId('build-fence').click(); await page.getByTestId('build-cabin').click();
      await page.locator('[data-tool="axe"]').click();
      await page.evaluate(() => window.__HOW__.load(window.__HOW__.state()));
    };
    await cycle(); await cycle();
    const before = await page.evaluate(() => window.__HOW__.metrics());
    for (let i = 0; i < 6; i++) await cycle();
    const after = await page.evaluate(() => window.__HOW__.metrics());
    assert.equal(after.geometries, before.geometries); assert.equal(after.textures, before.textures);
    assert.deepEqual(after.resources, before.resources); assert.equal(after.interactions, before.interactions);
    await page.evaluate(() => window.__HOW__.freeze(false)); return { before, after, cyclesAfterWarmup: 6 };
  });
  await check('destroy is idempotent and removes the canvas, UI and runtime', async () => {
    await page.evaluate(() => { window.__HOW__.destroy(); window.__HOW__.destroy(); window.__HOW__.resume(); });
    assert.equal(await page.locator('canvas').count(), 0); assert.equal(await page.locator('.game-hud').count(), 0);
    const before = await page.evaluate(() => window.__HOW__.metrics());
    await page.waitForTimeout(200); const after = await page.evaluate(() => window.__HOW__.metrics());
    assert.equal(after.destroyed, true); assert.equal(after.running, false); assert.equal(after.steps, before.steps);
    assert.equal(after.interactions, 0); assert.equal(after.visualUpdates, 0); return { before, after };
  });

  const invalid = await create({ width: 1100, height: 800 });
  await check('invalid local save is preserved after reload and gameplay', async () => {
    const original = '{"schemaVersion":999,"precious":"keep-original"}';
    // Stop the previous writer before injecting the startup fixture. Otherwise
    // its legitimate pagehide save would replace the injected bytes on reload.
    await invalid.evaluate(() => window.__HOW__.destroy());
    await invalid.evaluate(({ key, original }) => localStorage.setItem(key, original), { key: SAVE_KEY, original });
    await invalid.reload(); await invalid.waitForFunction(() => window.__VISUAL_READY__);
    const metadata = await invalid.evaluate(() => window.__HOW__.metrics());
    assert(String(metadata.saveStatus).includes('保留'));
    await invalid.keyboard.down('d'); await invalid.waitForTimeout(200); await invalid.keyboard.up('d');
    await invalid.getByTestId('pause').click();
    assert.equal(await invalid.evaluate(key => localStorage.getItem(key), SAVE_KEY), original);
    return { originalPreserved: true, status: metadata.saveStatus };
  });
  }

  for (const [name, viewport] of [['mobile-build', { width: 390, height: 844 }], ['mobile-landscape-build', { width: 844, height: 390 }]]) {
    if (process.env.HOW_QA_VIEWPORT && process.env.HOW_QA_VIEWPORT !== name) continue;
    const phone = await create(viewport, true);
    await check(`${name} submenu fits its viewport`, async () => {
      await phone.locator('[data-tool="build"]').tap();
      await phone.evaluate(() => window.__HOW__.target({ x: 5, z: -4 }));
      const invalid = await phone.evaluate(() => [...document.querySelectorAll('.build-menu button')].map(b => {
        const r = b.getBoundingClientRect(); return { label: b.textContent, width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }).filter(r => r.width < 44 || r.height < 44 || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight));
      assert.deepEqual(invalid, []); await shot(phone, name);
    });
    await phone.context().close();
  }
  assert.deepEqual(report.errors, []); report.ok = true;
} catch (error) { report.failure = { message: error.message, stack: error.stack }; console.error(error); }
finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  for (const c of contexts) await c.close().catch(() => {});
  console.log(`Lifecycle evidence: ${output}`); process.exit(report.ok ? 0 : 1);
}
