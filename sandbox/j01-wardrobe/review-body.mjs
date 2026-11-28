import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const directory = fileURLToPath(new URL('./.cache/affix-fitting/body/', import.meta.url));
const url = process.env.J01_WARDROBE_REVIEW_URL ?? 'http://127.0.0.1:5296/';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { source: {}, fitted: {}, motions: [], errors: [] };
const angles = ['front', 'side', 'quarter', 'back'];
const looks = ['yard', 'town', 'trail'];
const viewport = { width: 1320, height: 900 };
const go = (page, command, value) => page.locator(`[data-command="${command}"][data-value="${value}"]`).evaluate(button => {
  if (button.disabled || !button.getClientRects().length) throw new Error(`Unavailable ${button.dataset.command}/${button.dataset.value}`);
  button.click();
});
const state = page => page.evaluate(() => window.wardrobePreview.stats());
const measure = page => page.evaluate(() => window.wardrobePreview.measureBody());
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function capture(page, filename, angle) {
  await go(page, 'camera', angle);
  await settle(page);
  const { x, y, width, height } = await page.locator('#stage').boundingBox();
  const crop = Math.floor(Math.min(width, height * .65));
  await page.screenshot({ path: join(directory, `${filename}-${angle}.png`),
    clip: { x: Math.round(x + (width - crop) / 2), y: Math.round(y), width: crop, height: Math.floor(height) } });
}

async function open(beforeFit = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(new URL(`?verify=1${beforeFit ? '&fit=before' : ''}`, url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.wardrobePreview?.stats().samples > 0);
  return page;
}

try {
  for (const label of ['source', 'fitted']) {
    const page = await open(label === 'source');
    const available = await state(page);
    assert.equal(available.clips.stand, 'J01_Stand_v2');
    assert.equal(available.clips.walk, 'J01_Walk_v2');
    assert.equal(available.clips.run, 'J01_Run_v2');
    assert.equal(available.joints, 50);
    await page.selectOption('#body-display', label === 'source' ? 'source' : 'fitted');
    await settle(page);
    report[label].body = await measure(page);
    for (const angle of angles) await capture(page, `${label}-body`, angle);
    await page.selectOption('#body-display', 'outfit');
    for (const look of looks) {
      await go(page, 'outfit', look);
      await settle(page);
      report[label][look] = await measure(page);
      const selected = label === 'fitted' ? angles : ['front', 'side'];
      for (const angle of selected) await capture(page, `${label}-${look}`, angle);
    }
    if (label === 'fitted') {
      await go(page, 'outfit', 'yard');
      for (const [pose, phase] of [['walk', .05], ['walk', .34], ['walk', .55], ['walk', .84],
        ['run', .08], ['run', .32], ['run', .57], ['run', .82], ['reach', null], ['squat', null]]) {
        await go(page, 'pose', pose);
        await page.evaluate(at => window.wardrobePreview.phase(at), phase);
        await settle(page);
        const stamp = await state(page);
        assert.equal(stamp.pose, pose);
        if (pose === 'squat') assert.equal(stamp.contact.activeFeet, 2, 'The locked soles must project contact shadows on the stand');
        const suffix = phase === null ? pose : `${pose}-${Math.round(phase * 100)}`;
        await capture(page, `motion-${suffix}`, 'side');
        if (phase === null || [.34, .55, .32, .57].includes(phase)) await capture(page, `motion-${suffix}`, 'quarter');
        report.motions.push({ pose, phase, joints: stamp.poseValues, contact: stamp.contact });
      }
      await go(page, 'pose', 'stand');
      await settle(page);
      assert.deepEqual((await state(page)).poseValues, available.poseValues, 'The fixed stand pose must recover after the last posture');
    }
    await page.context().close();
  }
  const a = report.source.body, b = report.fitted.body;
  for (const key of ['heightMm', 'eyePlaneWidthMm', 'pelvisJointSpanMm', 'shoulderJointSpanMm', 'waistWidthMm',
    'hipsWidthMm', 'neckBaseToPelvisMm', 'extremities']) assert.deepEqual(a[key], b[key], key);
  assert.ok(b.sideCutsMm['778'].front < a.sideCutsMm['778'].front - 12);
  assert.ok(Math.abs(b.sideCutsMm['715'].depth - a.sideCutsMm['715'].depth) < 2);
  assert.ok(b.shoulderDropMm.every((drop, side) => drop > a.shoulderDropMm[side] + 5));
  assert.ok(b.extremities.every(side => side.bootCuffWidthMm > 0 && side.footLengthMm > side.footWidthMm && side.handLengthMm > 0));
  report.comparison = { upperChestBeforeMm: a.sideCutsMm['778'], upperChestAfterMm: b.sideCutsMm['778'],
    shoulderDropBeforeMm: a.shoulderDropMm, shoulderDropAfterMm: b.shoulderDropMm,
    standHeightMm: b.heightMm, eyePlaneWidthMm: b.eyePlaneWidthMm, stance: b.extremities };
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report.comparison));
} finally {
  await writeFile(join(directory, 'dimensions.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
