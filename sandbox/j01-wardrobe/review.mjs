import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const url = process.env.J01_WARDROBE_REVIEW_URL ?? 'http://127.0.0.1:5296/';
const directory = fileURLToPath(new URL('./.cache/review/', import.meta.url));
const styles = ['yard', 'town', 'trail'];
const names = ['林场工装', '镇上便服', '林地巡游'];
const slots = ['top', 'legs', 'feet', 'head', 'back', 'hands', 'waist', 'neck'];
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const report = { variants: 0, fittingCombinations: 0, checkedSlots: [], angles: [], poses: [], errors: [], mobile: false };

function control(page, command, value) {
  return page.locator(`[data-command="${command}"][data-value="${value}"]`);
}
const click = (page, command, value) => control(page, command, value).click();
const activate = (page, command, value) => control(page, command, value).evaluate(button => {
  if (button.disabled || button.hidden) throw new Error(`Unavailable control ${button.dataset.command}/${button.dataset.value}`);
  button.click();
});
const stats = page => page.evaluate(() => window.wardrobePreview.stats());
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function createPage(viewport, touch, grid = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
  page.on('requestfailed', req => report.errors.push(`${req.url()} ${req.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) report.errors.push(`${response.url()} HTTP ${response.status()}`);
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(new URL('?verify=1' + (grid ? '&uiGrid=1' : ''), url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('main').dataset.ready === 'true' && window.wardrobePreview?.stats().samples > 0);
  return page;
}

async function screenshot(page, name, canvasOnly = false) {
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await frames(page);
  const path = join(directory, `${name}.png`);
  if (!canvasOnly) return page.screenshot({ path, fullPage: true, animations: 'disabled' });
  const { x, y, width, height } = await page.locator('#stage').boundingBox();
  const crop = Math.min(width, Math.round(height * .73));
  return page.screenshot({ path, clip: { x: x + (width - crop) / 2, y, width: crop, height }, animations: 'disabled' });
}

async function layout(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#outfit-panel');
    const root = panel.getBoundingClientRect();
    const rows = [...panel.querySelectorAll('[data-ui-grid="row"]')].filter(row => row.getClientRects().length);
    const unit = document.querySelector('.wardrobe-panel').dataset.timberPaint;
    let controlGridError = 0;
    for (const row of rows) {
      const css = getComputedStyle(row);
      const columns = css.gridTemplateColumns.trim().split(/\s+/).length;
      const bounds = row.getBoundingClientRect();
      const gap = parseFloat(css.columnGap);
      const rects = [...row.querySelectorAll('button:not([hidden])')].map(button => button.getBoundingClientRect());
      for (let index = 0; index < rects.length; index += columns) {
        const line = rects.slice(index, index + columns);
        const first = line[0];
        const last = line.at(-1);
        controlGridError = Math.max(controlGridError, Math.abs(first.left - bounds.left));
        if (line.length === columns) controlGridError = Math.max(controlGridError, Math.abs(last.right - bounds.right));
        for (let col = 1; col < line.length; col++) {
          const current = line[col];
          controlGridError = Math.max(controlGridError, Math.abs(current.top - first.top),
            Math.abs(current.bottom - first.bottom), Math.abs(current.left - line[col - 1].right - gap));
        }
      }
    }
    return {
      outside: document.documentElement.scrollWidth > window.innerWidth,
      themed: unit === 'ready',
      alignment: Math.max(...rows.map(row => {
        const rect = row.getBoundingClientRect();
        return Math.max(Math.abs(rect.left - root.left), Math.abs(rect.right - root.right));
      })),
      controlGridError,
      minControl: Math.min(...[...document.querySelectorAll('button,select')].filter(control => control.getClientRects().length).flatMap(btn => {
        const rect = btn.getBoundingClientRect();
        return [rect.width, rect.height];
      })),
    };
  });
}

async function showAngles(page) {
  for (const style of styles) {
    await click(page, 'outfit', style);
    await frames(page);
    const s = await stats(page);
    assert.equal(s.joints, 50);
    assert.equal(s.active.filter(p => p.layer === 'base').length, slots.length);
    for (const angle of ['front', 'quarter', 'side', 'back']) {
      await click(page, 'camera', angle);
      await screenshot(page, `${style}-${angle}`, true);
      report.angles.push(`${style}/${angle}`);
    }
    await click(page, 'camera', 'quarter');
    await click(page, 'pose', 'walk');
    await page.evaluate(() => window.wardrobePreview.phase(.16));
    const first = await screenshot(page, `${style}-walk-a`, true);
    await page.evaluate(() => window.wardrobePreview.phase(.62));
    const second = await screenshot(page, `${style}-walk-b`, true);
    assert.notEqual(digest(first), digest(second), 'the native gait must change the rendered silhouette');
    report.poses.push(`${style}/walk`);
    for (const pose of ['reach', 'squat']) {
      await click(page, 'pose', pose);
      await screenshot(page, `${style}-${pose}`, true);
      assert.equal((await stats(page)).pose, pose);
      report.poses.push(`${style}/${pose}`);
    }
    await click(page, 'pose', 'stand');
    await frames(page);
    assert.deepEqual((await stats(page)).poseValues, s.poseValues, 'stress poses must restore native idle even at unchanged clip time');
  }
}

async function checkParts(page) {
  for (const slot of slots) {
    await activate(page, 'slot', slot);
    for (const style of styles) {
      await activate(page, 'pattern', style);
      await activate(page, 'dye', 'ink');
      await activate(page, 'upgrade', 'upgrade');
      await activate(page, 'attachment', 'attachment');
      const s = await stats(page);
      const selected = s.active.filter(part => part.slot === slot);
      assert.deepEqual(s.outfit[slot], { style, dye: 'ink', upgraded: true, attached: true });
      assert.ok(selected.every(part => part.style === style));
      assert.ok(selected.find(part => part.layer === 'base').dyes.includes('#455978'));
      assert.ok(selected.find(part => part.layer === 'upgrade'));
      assert.ok(selected.find(part => part.layer === 'attachment').anchor.startsWith(`${slot}.`));
      await activate(page, 'dye', 'original');
      assert.ok(!(await stats(page)).active.find(p => p.slot === slot && p.layer === 'base').dyes.includes('#455978'));
      await activate(page, 'upgrade', 'upgrade');
      await activate(page, 'attachment', 'attachment');
      assert.ok((await stats(page)).active.filter(p => p.slot === slot).every(part => !['upgrade', 'attachment'].includes(part.layer)));
      report.variants++;
    }
    if (['head', 'back', 'hands', 'waist', 'neck'].includes(slot)) {
      await activate(page, 'pattern', 'none');
      assert.equal((await stats(page)).active.filter(part => part.slot === slot).length, 0);
      assert.ok(await control(page, 'dye', 'ink').isDisabled());
      await activate(page, 'pattern', 'yard');
    }
    report.checkedSlots.push(slot);
  }
  for (const top of styles) {
    await activate(page, 'outfit', top);
    for (const slot of ['back', 'waist', 'neck']) {
      await activate(page, 'slot', slot);
      for (const style of styles) {
        await activate(page, 'pattern', style);
        const parts = (await stats(page)).active.filter(part => part.slot === slot && part.fit);
        assert.equal(parts.length, 1);
        assert.equal(parts[0].fit, top);
        assert.equal(parts[0].style, style);
        report.fittingCombinations++;
      }
    }
  }
}

async function showUpgrade(page) {
  await click(page, 'outfit', 'town');
  await click(page, 'slot', 'back');
  await click(page, 'pattern', 'none');
  await click(page, 'slot', 'top');
  await click(page, 'camera', 'front');
  await click(page, 'detail', 'detail');
  const normal = await screenshot(page, 'vest-base', true);
  await click(page, 'dye', 'ink');
  await click(page, 'upgrade', 'upgrade');
  await click(page, 'attachment', 'attachment');
  const refined = await screenshot(page, 'vest-ink-watch-chain', true);
  assert.notEqual(digest(normal), digest(refined));
  await click(page, 'detail', 'detail');
  await click(page, 'slot', 'feet');
  await click(page, 'pattern', 'trail');
  await click(page, 'slot', 'back');
  await click(page, 'pattern', 'yard');
  await click(page, 'camera', 'quarter');
  await screenshot(page, 'mixed-outfit', true);
  await click(page, 'outfit', 'yard');
  await click(page, 'slot', 'top');
  await click(page, 'camera', 'quarter');
  await screenshot(page, 'desktop');
}

async function showMobileMix(page) {
  await control(page, 'outfit', 'trail').tap();
  await control(page, 'camera', 'side').tap();
  await control(page, 'slot', 'back').tap();
  await control(page, 'pattern', 'town').tap();
  await control(page, 'attachment', 'attachment').tap();
  assert.ok((await stats(page)).active.some(p => p.slot === 'back' && p.style === 'town' && p.layer === 'attachment'));
  await control(page, 'camera', 'quarter').tap();
}

async function board() {
  const page = await browser.newPage({ viewport: { width: 990, height: 564 }, deviceScaleFactor: 1 });
  const imgs = await Promise.all(styles.map(async (style, index) => {
    const png = (await readFile(join(directory, `${style}-quarter.png`))).toString('base64');
    return `<figure><figcaption>${names[index]}</figcaption><img src="data:image/png;base64,${png}" /></figure>`;
  }));
  await page.setContent(`<!doctype html><html lang="zh-CN"><style>
    * { box-sizing: border-box } body { margin: 0; padding: 24px; background: #1b2a22; color: #f4e3c5;
    font: 16px 'Microsoft YaHei',sans-serif } h1 { margin: 0 0 16px; font: bold 30px SimSun, serif }
    main { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px } figure { margin: 0; border-radius: 8px;
    background: #34473b; overflow: hidden } figcaption { padding: 12px 14px; font-weight: bold } img { display: block; width: 100% }
    </style><h1>林工 J01 · 首批样衣</h1><main>${imgs.join('')}</main></html>`);
  await page.screenshot({ path: join(directory, 'outfit-board.png'), fullPage: true });
  await page.close();
}

try {
  const desktop = await createPage({ width: 1360, height: 880 }, false);
  report.desktopLayout = await layout(desktop);
  assert.ok(!report.desktopLayout.outside && report.desktopLayout.themed && report.desktopLayout.alignment <= 1 &&
    report.desktopLayout.controlGridError <= 1 && report.desktopLayout.minControl >= 44);
  await showAngles(desktop);
  await checkParts(desktop);
  await showUpgrade(desktop);
  const grid = await createPage({ width: 1360, height: 880 }, false, true);
  await click(grid, 'camera', 'quarter');
  await screenshot(grid, 'desktop-grid');

  const mobile = await createPage({ width: 390, height: 844 }, true);
  report.mobileLayout = await layout(mobile);
  assert.ok(!report.mobileLayout.outside && report.mobileLayout.themed && report.mobileLayout.alignment <= 1 &&
    report.mobileLayout.controlGridError <= 1 && report.mobileLayout.minControl >= 44);
  await showMobileMix(mobile);
  await screenshot(mobile, 'mobile');
  const mobileGrid = await createPage({ width: 390, height: 844 }, true, true);
  await showMobileMix(mobileGrid);
  await screenshot(mobileGrid, 'mobile-grid');
  report.mobile = true;
  await board();
  assert.deepEqual(report.errors, []);
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  report.failure = error.message;
  await writeFile(join(directory, 'incomplete.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser.close();
}
