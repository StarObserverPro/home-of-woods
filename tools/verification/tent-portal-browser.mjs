import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const act = (locator, touch) => touch ? locator.tap() : locator.click();
export const tentStats = async page => JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const waitForSpace = (page, space, timeout = 90000) => page.waitForFunction(expected => {
  const text = document.querySelector('#runtime-stats')?.textContent;
  if (!text) return false;
  const value = JSON.parse(text).current?.sceneSpace;
  return value?.active === expected && value.fade === 0;
}, space, { timeout });
const waitForCurtain = (page, open) => page.waitForFunction(expected => {
  const text = document.querySelector('#runtime-stats')?.textContent;
  return text && JSON.parse(text).current?.tent?.doorOpen === expected;
}, open);

export function observeTentPage(page, origin, report, phase) {
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', error => report.errors.push({ phase, message: String(error) }));
  page.on('crash', () => report.errors.push({ phase, message: 'Browser page crashed' }));
  page.on('console', entry => {
    if (entry.type() === 'error') report.errors.push({ phase, message: entry.text() });
    if (entry.type() === 'warning') report.consoleWarnings.push({ phase, message: entry.text() });
  });
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      report.networkFailures.push({ phase, url: response.url(), status: response.status() });
    }
  });
}

export async function tentReady(page) {
  await page.locator('.scene-host canvas').waitFor();
  await waitForSpace(page, 'outdoor');
  await page.locator('details.diagnostics').evaluate(element => { element.style.display = 'none'; });
}

export async function captureTentFrame(page, out, report, name) {
  const value = await tentStats(page);
  assert.equal(value.shaderErrors, 0, `${name}: shader errors`);
  assert.equal(value.contextLost, false, `${name}: lost WebGL context`);
  assert.ok(value.drawCalls > 0 && value.triangles > 0, `${name}: no rendered geometry`);
  assert.equal(value.tentExterior.doorOpen, value.tent.doorOpen, `${name}: exterior curtain disagrees with runtime`);
  if (value.tent.inside) assert.equal(value.sceneSpace.tent.doorOpen, value.tent.doorOpen, `${name}: indoor curtain disagrees with runtime`);
  const cdp = await page.context().newCDPSession(page);
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(join(out, `${name}.png`), Buffer.from(shot.data, 'base64'));
  } finally { await cdp.detach(); }
  report.frames.push({ name, viewport: page.viewportSize(), seed: value.seed, gameTime: value.gameTime,
    sceneSpace: value.sceneSpace, tentExterior: value.tentExterior, tentVisit: value.tentVisit,
    tent: value.tent, scenePreset: value.scenePreset, shaderErrors: value.shaderErrors,
    drawCalls: value.drawCalls, triangles: value.triangles, gpu: value.gpu, resources: value.resources,
    frameMsP50: value.frameMsP50, frameMsP95: value.frameMsP95, graphicsBackend: value.graphicsBackend });
  return value;
}

async function selectTent(page, touch) {
  await act(button(page, '路线'), touch);
  const route = page.getByRole('dialog', { name: '路线', exact: true });
  await act(button(route, '营地'), touch);
  // The tent is a first-page camp destination, including the four-slot phone UI.
  await act(button(route, '帐篷'), touch);
  await act(button(route, '查看'), touch);
  await page.getByRole('dialog', { name: '当前目标', exact: true }).waitFor();
}

async function clickProjectedPoint(page, point, touch, label) {
  const viewport = page.viewportSize();
  assert.ok(point && point.visible !== false && Number.isFinite(point.x) && Number.isFinite(point.y), `${label}: missing visible projection`);
  assert.ok(point.x >= 0 && point.x < viewport.width && point.y >= 0 && point.y < viewport.height, `${label}: outside viewport`);
  const target = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { canvas: element instanceof HTMLCanvasElement, tag: element?.tagName, className: element?.className };
  }, point);
  assert.ok(target.canvas, `${label}: projected point is covered by ${JSON.stringify(target)}`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function checkControls(page, names) {
  const controls = [];
  for (const name of names) {
    const box = await button(page, name).boundingBox();
    assert.ok(box && box.width >= 43.9 && box.height >= 43.9, `${name}: touch target is smaller than 44px`);
    controls.push({ name, ...box });
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal page overflow');
  return controls;
}

/** The real camp UI, one canvas, and genuine pointer/keyboard input own every transition. */
export async function verifyTentPortal(browser, origin, out, report) {
  for (const touch of [false, true]) {
    const label = touch ? 'phone-night' : 'desktop-day';
    const viewport = touch ? { width: 390, height: 844 } : { width: 1000, height: 740 };
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1,
      reducedMotion: 'no-preference', recordVideo: { dir: join(out, 'videos'), size: { width: 640, height: 480 } } });
    const page = await context.newPage();
    observeTentPage(page, origin, report, label);
    let phase = 'initial camp';
    try {
      await page.goto(`${origin}/?inspect=1&hour=${touch ? 1 : 14}`);
      await tentReady(page);
      const inventory = (await tentStats(page)).worldState.inventory;
      phase = 'approach from route menu';
      await selectTent(page, touch);
      await captureTentFrame(page, out, report, `tent-${label}-selected`);
      await act(button(page, '走到帐篷门前'), touch);
      await page.waitForFunction(() => {
        const current = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
        return current.routeNodes > 0 || current.tent.crossing || current.tent.inside;
      }, null, { timeout: 15000 });
      // SwiftShader renders the full camp at a few frames per second. Keep the
      // production movement owner and allow its fixed steps to complete.
      console.log(`TENT_PORTAL_APPROACH ${label}`);
      await waitForSpace(page, 'tent', 600000);
      console.log(`TENT_PORTAL_ENTERED ${label}`);
      const entered = await captureTentFrame(page, out, report, `tent-${label}-inside`);
      assert.equal(await page.locator('.scene-host canvas').count(), 1);
      assert.equal(entered.tent.inside, true);
      assert.ok(entered.tentVisit && entered.sceneSpace.tent.frames > 0);
      assert.deepEqual(entered.worldState.inventory, inventory);
      const frozenOutside = entered.sceneSpace.outsideFrames;
      const frozenCamera = entered.sceneSpace.outdoorCamera;
      const roomResources = entered.sceneSpace.tent.resources;

      phase = 'indoor curtain';
      await act(button(page, '放下门帘'), touch);
      await waitForCurtain(page, false);
      await captureTentFrame(page, out, report, `tent-${label}-inside-closed`);
      await act(button(page, '掀起门帘'), touch);
      await waitForCurtain(page, true);

      phase = 'local movement';
      const oldPose = (await tentStats(page)).tentVisit.player;
      if (touch) {
        const state = await tentStats(page);
        await clickProjectedPoint(page, state.sceneSpace.tent.floorTapScreenPoint, true, 'tent floor');
      } else {
        await page.locator('.scene-host canvas').focus();
        await page.keyboard.down('KeyW');
      }
      try {
        await page.waitForFunction(before => {
          const pose = JSON.parse(document.querySelector('#runtime-stats').textContent).current.tentVisit?.player;
          return pose && Math.hypot(pose.x - before.x, pose.z - before.z) > .3;
        }, oldPose);
      } finally { if (!touch) await page.keyboard.up('KeyW'); }
      await page.waitForFunction(() => !JSON.parse(document.querySelector('#runtime-stats').textContent).current.tentVisit?.player.moving);

      phase = 'local camera';
      await act(button(page, '镜头'), touch);
      const oldYaw = (await tentStats(page)).sceneSpace.tent.camera.yaw;
      await act(button(page, '镜头左转'), touch);
      await page.waitForFunction(yaw => JSON.parse(document.querySelector('#runtime-stats').textContent).current.sceneSpace.tent.camera.yaw !== yaw, oldYaw);
      await act(button(page, '复位镜头'), touch);
      await act(button(page, '镜头'), touch);
      const afterWalking = await captureTentFrame(page, out, report, `tent-${label}-walked`);
      assert.equal(afterWalking.sceneSpace.outsideFrames, frozenOutside, 'Outdoor rendering must stop while indoors');
      assert.deepEqual(afterWalking.sceneSpace.outdoorCamera, frozenCamera, 'Indoor camera controls must not move the camp camera');
      assert.ok(afterWalking.sceneSpace.tent.frames > entered.sceneSpace.tent.frames);

      phase = 'pause and resume';
      await act(button(page, '暂停'), touch);
      await button(page, '继续').waitFor();
      const paused = await tentStats(page);
      assert.equal(paused.sceneSpace.active, 'tent');
      await act(button(page, '继续'), touch);
      await waitForSpace(page, 'tent');

      if (touch) {
        phase = 'phone resize';
        const beforeResize = (await tentStats(page)).tentVisit.player;
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.sceneSpace.tent.camera.aspect > 2);
        report.flows.push({ name: 'tent-phone-landscape-controls', controls: await checkControls(page, ['出帐篷', '放下门帘', '镜头']) });
        await captureTentFrame(page, out, report, 'tent-phone-landscape');
        assert.deepEqual((await tentStats(page)).tentVisit.player, beforeResize);
        await page.setViewportSize(viewport);
        await page.waitForFunction(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.sceneSpace.tent.camera.aspect < .6);
      }

      phase = 'walk to exit';
      await act(button(page, '出帐篷'), touch);
      await waitForSpace(page, 'outdoor');
      const exited = await captureTentFrame(page, out, report, `tent-${label}-returned`);
      assert.equal(exited.tentVisit, null);
      assert.equal(exited.tent.inside, false);
      assert.equal(exited.tent.atDoor, true);
      assert.ok(exited.sceneSpace.outsideFrames > frozenOutside);
      assert.deepEqual(exited.worldState.inventory, inventory);

      phase = 'outdoor curtain';
      await selectTent(page, touch);
      await button(page, '进帐篷').waitFor();
      await act(button(page, '放下门帘'), touch);
      await waitForCurtain(page, false);
      await captureTentFrame(page, out, report, `tent-${label}-outside-closed`);
      await act(button(page, '掀起门帘'), touch);
      await waitForCurtain(page, true);
      await captureTentFrame(page, out, report, `tent-${label}-outside-open`);
      await act(button(page, '放下门帘'), touch);
      await waitForCurtain(page, false);
      await act(button(page, '关闭目标详情'), touch);
      await page.getByRole('dialog', { name: '当前目标', exact: true }).waitFor({ state: 'hidden' });

      phase = 'actual 3D door hit';
      const beforeDoor = await tentStats(page);
      await clickProjectedPoint(page, beforeDoor.tentExterior.doorScreenPoint, touch, 'actual tent doorway');
      await waitForSpace(page, 'tent');
      const revisited = await captureTentFrame(page, out, report, `tent-${label}-pointer-reentry`);
      assert.equal(revisited.tent.doorOpen, true, 'Entering a closed curtain opens it');
      assert.deepEqual(revisited.sceneSpace.tent.resources, roomResources, 'Reentry must reuse the same room resources');
      assert.deepEqual(revisited.worldState.inventory, inventory);
      const controls = await checkControls(page, ['出帐篷', '放下门帘', '镜头']);

      phase = 'save indoors then refresh';
      await act(button(page, '暂停'), touch);
      await button(page, '继续').waitFor();
      await page.waitForFunction(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.save.state === 'saved');
      await page.reload();
      await tentReady(page);
      const loaded = await tentStats(page);
      assert.equal(loaded.tentVisit, null);
      assert.equal(loaded.tent.inside, false);
      assert.equal(loaded.player.x, exited.player.x);
      assert.equal(loaded.player.z, exited.player.z);
      assert.deepEqual(loaded.worldState.inventory, inventory);
      const resume = page.locator('.pause-dialog .primary-button');
      if (await resume.isVisible()) await act(resume, touch);
      await captureTentFrame(page, out, report, `tent-${label}-reloaded`);
      report.flows.push({ name: label, routeEntry: true, indoorMovement: true, independentCamera: true,
        outdoorRenderingStopped: true, curtainInsideAndOutside: true, actualDoorPointerHit: true,
        resourcesStable: true, savedIndoorReloadAtDoor: true, inventoryUnchanged: true, controls });
      console.log(`TENT_PORTAL_PASS ${label}`);
    } catch (error) {
      report.portalFailure = { label, phase, state: await tentStats(page).catch(() => null),
        body: await page.locator('body').innerText().catch(() => null) };
      await captureTentFrame(page, out, report, `tent-${label}-failure`).catch(() => {});
      throw new Error(`${label} / ${phase}: ${error.stack ?? error}`);
    } finally { await context.close(); }
  }
}
