import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const directory = fileURLToPath(new URL('./.cache/affix-fitting/effects/', import.meta.url));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const url = process.env.J01_WARDROBE_REVIEW_URL ?? 'http://127.0.0.1:5296/';
const report = { candidates: [], swatches: [], duos: [], glyphs: [], layouts: [], triggers: [], targets: [], views: {}, errors: [] };

async function open(options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.goto(new URL('?verify=1&affix=1', url).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.wardrobePreview?.stats().samples > 0);
  return page;
}

const select = (page, entries) => page.evaluate(changes => {
  for (const [id, value] of Object.entries(changes)) {
    const node = document.querySelector(`#affix-${id}`);
    node.value = value;
    if (node.value !== String(value)) throw new Error(`Unavailable option ${id}/${value}`);
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, entries);
const values = (page, selector) => page.locator(`${selector} option`).evaluateAll(options => options.map(option => option.value));
const stats = page => page.evaluate(() => window.wardrobePreview.stats());

async function inspectLayout(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#affix-panel').getBoundingClientRect();
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const toolbar = document.querySelector('#affix-toolbar').getBoundingClientRect();
    const rows = [...document.querySelectorAll('#affix-panel [data-ui-grid="row"]')].filter(node => node.getClientRects().length);
    const controls = [...document.querySelectorAll('button,select')].filter(node => node.getClientRects().length);
    return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      minimum: Math.min(...controls.flatMap(node => [node.getBoundingClientRect().width, node.getBoundingClientRect().height])),
      railError: Math.max(Math.abs(stage.left - toolbar.left), Math.abs(stage.right - toolbar.right), ...rows.flatMap(node => {
        const r = node.getBoundingClientRect();
        return [Math.abs(r.left - panel.left), Math.abs(r.right - panel.right)];
      })) };
  });
}

async function seek(page, seconds) {
  const stamped = (await stats(page)).samples;
  await page.evaluate(time => window.wardrobePreview.affixTime(time), seconds);
  await page.waitForFunction(({ seconds, stamped }) => {
    const state = window.wardrobePreview.stats();
    return state.samples > stamped && Math.abs(state.affix.elapsed - seconds) < .0001;
  }, { seconds, stamped });
  return stats(page);
}

async function replay(page, seconds = 1.62) {
  await page.locator('#affix-play').evaluate(button => button.click());
  const state = await seek(page, seconds);
  assert.equal(state.affix.events, 1, JSON.stringify(state.affix));
  return state;
}

async function capture(page, filename, full = false) {
  const path = join(directory, `${filename}.png`);
  if (full) return page.screenshot({ path, fullPage: true });
  const { x, y, width, height } = await page.locator('#stage').boundingBox();
  const crop = Math.min(width, height * .69);
  await page.screenshot({ path, clip: { x: Math.round(x + (width - crop) / 2), y: Math.round(y), width: Math.floor(crop), height: Math.floor(height) } });
}

try {
  const desktop = await open({ viewport: { width: 1360, height: 880 }, deviceScaleFactor: 1 });
  await desktop.selectOption('#affix-candidate', 'apparel.gold-meets-lake');
  await desktop.selectOption('#affix-clock', '12');
  await desktop.locator('#affix-play').click();
  await desktop.waitForFunction(() => window.wardrobePreview.stats().affix.events === 1);
  await desktop.waitForFunction(() => window.wardrobePreview.stats().affix.phase === 'finished');
  assert.equal((await stats(desktop)).affix.events, 1);
  assert.equal((await stats(desktop)).affix.instances, 0);
  const timeEdges = await desktop.evaluate(async () => {
    const { observeAffixTrigger, replayAffixCondition } = await import('/affix-events.ts');
    const initial = replayAffixCondition('time.midnight', 12).sample();
    const advance = observeAffixTrigger('time.midnight', initial);
    const after = { ...initial, time: initial.time + 23 };
    return [advance(after), advance(after), advance(initial), advance(after), advance({ ...after, time: after.time + 1200 })];
  });
  assert.deepEqual(timeEdges, [true, false, false, false, true]);
  report.timeEdges = timeEdges;

  for (const id of await values(desktop, '#affix-candidate')) {
    await select(desktop, { candidate: id });
    const active = await replay(desktop);
    assert.equal(active.affix.phase, 'fired', id);
    assert.ok(active.affix.instances > 0 || active.affix.tint > .7, id);
    report.candidates.push({ id, ...active.affix });
    await capture(desktop, id.replace('apparel.', 'example-'));
  }
  assert.equal(report.candidates.length, 13);
  const before = await seek(desktop, .2);
  const after = await seek(desktop, 4.4);
  assert.deepEqual(after.active, before.active, 'Finish restores the outfit');
  await select(desktop, { candidate: 'apparel.stream-glimmer', quality: 'off' });
  await replay(desktop);
  await capture(desktop, 'example-stream-glimmer-off');
  await select(desktop, { quality: 'full' });

  await desktop.locator('[data-affix-edit="lab"]').click();
  await select(desktop, { light: 'day', trigger: 'time.noon', layout: 'shoulder-rise', palette: 'tone-159' });
  for (const glyph of await values(desktop, '#affix-glyph')) {
    await select(desktop, { glyph });
    const state = await replay(desktop);
    assert.equal(state.affix.visual.shapeId, glyph);
    assert.ok(state.affix.instances > 0 && state.affix.instances <= 12);
    report.glyphs.push(glyph);
    await capture(desktop, `glyph-${glyph}`);
  }
  assert.equal(report.glyphs.length, 11);

  await select(desktop, { glyph: 'soft-disc', palette: 'tone-217' });
  for (const layout of await values(desktop, '#affix-layout')) {
    await select(desktop, { layout, trigger: layout === 'short-trail' ? 'player.walk-start' : 'time.noon' });
    const state = await replay(desktop);
    assert.equal(state.affix.visual.patternId, layout);
    assert.ok(state.affix.instances > 0);
    report.layouts.push(layout);
    await capture(desktop, `layout-${layout}`);
  }
  assert.equal(report.layouts.length, 8);

  await select(desktop, { layout: 'shoulder-rise', light: 'condition' });
  for (const trigger of await values(desktop, '#affix-trigger')) {
    await select(desktop, { trigger });
    await desktop.locator('#affix-play').evaluate(button => button.click());
    const before = await seek(desktop, .22);
    const active = await seek(desktop, 1.47);
    assert.equal(before.affix.events, 0, trigger);
    assert.equal(active.affix.events, 1, trigger);
    assert.ok(active.affix.instances > 0, trigger);
    report.triggers.push({ id: trigger, before: before.affix.input, after: active.affix.input });
    if (['place.riverside', 'place.campfire', 'weather.rain-stops', 'weather.fog-enters', 'action.gather-done', 'action.craft-done'].includes(trigger))
      await capture(desktop, `condition-${trigger}`);
  }
  assert.equal(report.triggers.length, 14);

  await select(desktop, { kind: 'tint', trigger: 'time.noon', light: 'day' });
  const mono = await values(desktop, '#affix-palette optgroup:not(#affix-duos)');
  const hexes = new Set();
  for (const palette of mono) {
    await select(desktop, { palette });
    const state = await replay(desktop);
    assert.ok(state.affix.tint > .8, palette);
    hexes.add(state.affix.colors[0]);
    report.swatches.push({ palette, hex: state.affix.colors[0] });
  }
  assert.equal(hexes.size, 48);
  await select(desktop, { palette: 'tone-79' });
  const slots = { 'upper-body': 'top', 'lower-body': 'legs', headwear: 'head', footwear: 'feet' };
  for (const [target, slot] of Object.entries(slots)) {
    await select(desktop, { target });
    await desktop.locator('#affix-play').evaluate(button => button.click());
    const before = await seek(desktop, .12);
    const during = await seek(desktop, 1.8);
    const after = await seek(desktop, 4.4);
    function tints(state, match) { return state.active.filter(piece => (piece.slot === slot) === match).map(piece => piece.dyes); }
    assert.notDeepEqual(tints(during, true), tints(before, true));
    assert.deepEqual(tints(during, false), tints(before, false));
    assert.deepEqual(after.active, before.active);
    report.targets.push(target);
  }

  await select(desktop, { kind: 'particles', layout: 'body-orbit', glyph: 'four-star' });
  for (const palette of await values(desktop, '#affix-duos')) {
    await select(desktop, { palette });
    const state = await replay(desktop);
    assert.equal(new Set(state.affix.colors).size, 2);
    report.duos.push({ palette, colors: state.affix.colors });
  }
  assert.equal(report.duos.length, 8);

  await select(desktop, { palette: 'late-gold-lake', light: 'night', view: 'near' });
  const full = await replay(desktop);
  assert.equal(full.affix.instances, 12);
  await capture(desktop, 'near-night', true);
  await select(desktop, { quality: 'quiet' });
  const quiet = await replay(desktop);
  assert.equal(quiet.affix.instances, 6);
  await select(desktop, { quality: 'off' });
  const off = await replay(desktop);
  assert.equal(off.affix.instances, 0);
  assert.equal(off.affix.phase, 'finished');
  assert.equal(full.render.calls - off.render.calls, 1);
  report.batch = { full: full.render, quiet: quiet.render, off: off.render };

  await select(desktop, { quality: 'full', light: 'day', view: 'game' });
  const game = await replay(desktop);
  await capture(desktop, 'game-day', true);
  await select(desktop, { quality: 'off' });
  await replay(desktop);
  await capture(desktop, 'game-day-off', true);
  const desktopLayout = await inspectLayout(desktop);
  assert.ok(!desktopLayout.horizontalOverflow && desktopLayout.minimum >= 44 && desktopLayout.railError <= 1);
  await select(desktop, { quality: 'full', view: 'fitting' });
  await replay(desktop);
  await desktop.evaluate(() => { document.querySelector('main').dataset.uiGridDebug = 'true'; });
  await capture(desktop, 'desktop-grid', true);
  report.views.desktop = { ...desktopLayout, game: game.affix.view, lighting: game.lights, viewport: desktop.viewportSize() };
  await desktop.context().close();

  const mobile = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await mobile.selectOption('#affix-candidate', 'apparel.lavender-dawn');
  await mobile.locator('#affix-play').tap();
  const mobileState = await seek(mobile, 1.49);
  assert.equal(mobileState.affix.events, 1);
  assert.equal(mobileState.affix.instances, 4);
  const sizes = await inspectLayout(mobile);
  assert.equal(sizes.horizontalOverflow, false);
  assert.ok(sizes.minimum >= 44, JSON.stringify(sizes));
  assert.ok(sizes.railError <= 1, JSON.stringify(sizes));
  await capture(mobile, 'mobile-reduced-dawn', true);
  await mobile.selectOption('#affix-view', 'game');
  await mobile.selectOption('#affix-light', 'night');
  await replay(mobile);
  await capture(mobile, 'mobile-game-night', true);
  await mobile.evaluate(() => { document.querySelector('main').dataset.uiGridDebug = 'true'; });
  await capture(mobile, 'mobile-grid', true);
  report.views.mobile = { ...sizes, active: mobileState.affix.instances, viewport: mobile.viewportSize() };
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ candidates: report.candidates.length, mono: hexes.size, duos: report.duos.length,
    glyphs: report.glyphs.length, layouts: report.layouts.length, triggers: report.triggers.length, targets: report.targets.length,
    batch: report.batch, mobile: report.views.mobile }));
} finally {
  await writeFile(join(directory, 'verification.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
