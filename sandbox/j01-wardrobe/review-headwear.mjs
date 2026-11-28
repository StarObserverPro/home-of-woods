import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const version = process.argv.includes('--before') ? 'before' : 'after';
const out = fileURLToPath(new URL('./.cache/hat-fit/', import.meta.url));
const url = process.env.J01_WARDROBE_REVIEW_URL ?? 'http://127.0.0.1:5296/';
const candidate = process.argv.includes('--candidate') ? join(out, 'candidate', 'wearables.glb') : null;
const styles = { yard: '八片短檐帽', town: '偏冠软呢贝雷', trail: '软毡巡林帽' };
const angles = { front: '正面', quarter: '斜侧', side: '侧面', back: '背面' };
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

function control(page, command, value) {
  return page.locator(`[data-command="${command}"][data-value="${value}"]`);
}
const click = (page, command, value) => control(page, command, value).click();
const stats = page => page.evaluate(() => window.wardrobePreview.stats());

async function open(viewport, touch = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', res => { if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  if (candidate) await page.route('**/j01-assets/wearables.glb', route => route.fulfill({ path: candidate, contentType: 'model/gltf-binary' }));
  await page.goto(new URL('?verify=1', url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.wardrobePreview?.stats().samples > 0);
  return page;
}

async function screenshot(page, name, detail = true) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const { x, y, width, height } = await page.locator('#stage').boundingBox();
  const crop = Math.min(width, height);
  await page.screenshot({ path: join(out, `${version}-${name}.png`),
    ...(detail ? { clip: { x: x + (width - crop) / 2, y, width: crop, height } } : {}) });
}

async function compare() {
  const page = await browser.newPage({ viewport: { width: 1152, height: 700 }, deviceScaleFactor: 1 });
  const items = await Promise.all(Object.entries(styles).map(async ([style, name]) => {
    const photos = await Promise.all(['before', 'after'].map(async rev => {
      const src = (await readFile(join(out, `${rev}-${style}-quarter.png`))).toString('base64');
      return `<figure><img alt="${name}" src="data:image/png;base64,${src}"><figcaption>${rev === 'before' ? '原版' : '按头部重做'}</figcaption></figure>`;
    }));
    return `<section><h2>${name}</h2><div>${photos.join('')}</div></section>`;
  }));
  await page.setContent(`<!doctype html><html lang="zh-CN"><style>
    *{box-sizing:border-box}body{background:#1b2a22;color:#f3e5cc;font:15px 'Microsoft YaHei',sans-serif;margin:0;padding:24px}
    h1{font:700 29px SimSun,serif;margin:0 0 16px}main{display:grid;gap:12px;grid-template-columns:repeat(3,1fr)}
    section{border-radius:8px;overflow:hidden;background:#364a3e}h2{font-size:16px;margin:10px 12px}
    section>div{display:grid;grid-template-columns:1fr 1fr;gap:2px}figure{margin:0}
    img{width:100%;display:block}figcaption{padding:8px 10px}
    </style><h1>林工 J01 三款帽型对照</h1><main>${items.join('')}</main>`);
  await page.locator('main').screenshot({ path: join(out, 'comparison.png') });
  await page.close();
}

try {
  const desktop = await open({ width: 1360, height: 880 });
  const evidence = [];
  for (const style of Object.keys(styles)) {
    await click(desktop, 'outfit', style);
    await click(desktop, 'slot', 'head');
    await click(desktop, 'detail', 'detail');
    for (const angle of Object.keys(angles)) {
      await click(desktop, 'camera', angle);
      await screenshot(desktop, `${style}-${angle}`);
      evidence.push(`${style}/${angle}`);
    }
    await click(desktop, 'camera', 'quarter');
    if (version === 'after') {
      await click(desktop, 'upgrade', 'upgrade');
      await click(desktop, 'attachment', 'attachment');
      assert.deepEqual((await stats(desktop)).active.filter(p => p.slot === 'head').map(p => p.layer).sort(),
        ['attachment', 'base', 'hair', 'upgrade']);
      await screenshot(desktop, `${style}-trim`);
      await click(desktop, 'upgrade', 'upgrade');
      await click(desktop, 'attachment', 'attachment');
    }
    await click(desktop, 'pose', 'squat');
    await screenshot(desktop, `${style}-squat`);
    await click(desktop, 'pose', 'walk');
    await desktop.evaluate(() => window.wardrobePreview.phase(.34));
    await screenshot(desktop, `${style}-walk`);
    await click(desktop, 'pose', 'stand');
    await click(desktop, 'detail', 'detail');
  }
  if (version === 'after') {
    const mobile = await open({ width: 390, height: 844 }, true);
    await control(mobile, 'slot', 'head').tap();
    await control(mobile, 'pattern', 'trail').tap();
    assert.equal((await stats(mobile)).active.find(p => p.slot === 'head' && p.layer === 'hair').style, 'trail');
    await control(mobile, 'pattern', 'none').tap();
    const bare = await stats(mobile);
    assert.ok(bare.hair.original && !bare.active.some(p => p.slot === 'head'));
    await screenshot(mobile, 'no-hat', false);
    await control(mobile, 'pattern', 'town').tap();
    assert.ok(!(await stats(mobile)).hair.original);
    await screenshot(mobile, 'mobile', false);
    await compare();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(out, `${version}.json`), JSON.stringify({ evidence, errors, mobile: version === 'after' }, null, 2));
  console.log(`${version}: ${evidence.length} 固定机位，低头与步行通过采样`);
} finally {
  await browser.close();
}
