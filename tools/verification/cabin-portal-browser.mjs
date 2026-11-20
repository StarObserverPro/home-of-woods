import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PerspectiveCamera, Vector3 } from 'three';

const stats = async page => JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const button = (page, name) => page.getByRole('button', { name, exact: true });
const act = (locator, touch) => touch ? locator.tap() : locator.click();
const waitForSpace = async (page, expected) => page.waitForFunction(space => {
  const source = document.querySelector('#runtime-stats');
  const active = source && JSON.parse(source.textContent).current?.sceneSpace;
  return active?.active === space && active.fade === 0;
}, expected);

async function capture(page, out, name) {
  const state = await stats(page);
  assert.equal(state.shaderErrors, 0);
  assert.ok(state.drawCalls > 10);
  assert.equal(state.contextLost, false);
  const session = await page.context().newCDPSession(page);
  try {
    const screenshot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(join(out, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  } finally {
    await session.detach();
  }
  return { name, sceneSpace: state.sceneSpace, cabinVisit: state.cabinVisit, drawCalls: state.drawCalls, graphicsBackend: state.graphicsBackend };
}

async function approachCabin(page, touch) {
  await act(button(page, '路线'), touch);
  const route = page.getByRole('dialog', { name: '路线', exact: true });
  await act(button(route, '营地'), touch);
  const cabin = button(route, '旧木屋');
  if (!(await cabin.isVisible())) await act(button(route, '下一页'), touch);
  await act(cabin, touch);
  await act(button(route, '查看'), touch);
  await act(button(page, '走到木屋门前'), touch);
  await button(page, '进屋').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const value = JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    return value.routeNodes === 0 && !value.player.moving;
  });
}

function project(size, cameraPose, point) {
  const camera = new PerspectiveCamera(38, size.width / size.height, .1, 110);
  camera.position.fromArray(cameraPose.position);
  camera.lookAt(new Vector3().fromArray(cameraPose.target));
  camera.updateMatrixWorld(true);
  const ndc = new Vector3(...point).project(camera);
  return { x: (ndc.x + 1) * size.width / 2, y: (1 - ndc.y) * size.height / 2 };
}

/** Exercise the real game UI, page and one WebGL canvas across repeated door crossings. */
export async function verifyCabinPortal(browser, origin, out, report) {
  const frames = [];
  report.portal = { frames, flows: [] };
  for (const touch of [false, true]) {
    const viewport = touch ? { width: 390, height: 844 } : { width: 1000, height: 740 };
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const platform = touch ? 'phone-night' : 'desktop-day';
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => report.errors.push({ phase: platform, message: String(error) }));
    page.on('console', entry => {
      if (entry.type() === 'error') report.errors.push({ phase: platform, message: entry.text() });
      if (entry.type() === 'warning') report.consoleWarnings.push({ phase: platform, message: entry.text() });
    });
    page.on('response', response => {
      if (response.url().startsWith(origin) && response.status() >= 400) {
        report.networkFailures.push({ phase: platform, url: response.url(), status: response.status() });
      }
    });
    try {
      await page.goto(`${origin}/?inspect=1&hour=${touch ? 1 : 14}`, { timeout: 120000 });
      await page.locator('.scene-host canvas').waitFor();
      // Keep diagnostic data readable without putting its development controls
      // over the game UI at a phone viewport.
      await page.locator('details.diagnostics').evaluate(details => { details.style.display = 'none'; });
      await waitForSpace(page, 'outdoor');
      await approachCabin(page, touch);
      const before = await stats(page);
      frames.push(await capture(page, out, `portal-${platform}-entrance`));
      await act(button(page, '进屋'), touch);
      await waitForSpace(page, 'cabin');
      const entered = await stats(page);
      assert.equal(await page.locator('.scene-host canvas').count(), 1);
      assert.equal(entered.cabinVisit.player.facing, Math.PI);
      assert.equal(entered.cabinVisit.player.y, 0);
      assert.ok(Math.abs(entered.cabinVisit.player.x + .96) < .001);
      assert.ok(entered.cabinVisit.player.z > 3);
      const { cabin, outsideFrames, outdoorCamera } = entered.sceneSpace;
      assert.ok(cabin.shell.cutWalls.length >= 1);
      assert.equal(cabin.light.skyNight, touch ? 1 : 0);
      assert.equal(cabin.light.shadowSize, 1024);
      assert.equal(cabin.light.lamp, 0);
      assert.deepEqual(outdoorCamera.yaw, before.sceneSpace.outdoorCamera.yaw);
      frames.push(await capture(page, out, `portal-${platform}-inside`));

      const point = project(viewport, cabin.camera, [-2.1, 0, -1.9]);
      if (touch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => {
        const pose = JSON.parse(document.querySelector('#runtime-stats').textContent).current.cabinVisit?.player;
        return pose && pose.z < -1.5 && !pose.moving;
      });
      await act(button(page, '点亮壁灯'), touch);
      await button(page, '熄灭壁灯').waitFor();
      const lit = await stats(page);
      assert.equal(lit.sceneSpace.outsideFrames, outsideFrames);
      assert.ok(lit.sceneSpace.cabin.frames > cabin.frames);
      assert.ok(lit.gameTime > entered.gameTime);
      assert.ok(lit.sceneSpace.cabin.light.lamp > 0);
      assert.deepEqual(lit.worldState.inventory, before.worldState.inventory);
      assert.deepEqual(lit.sceneSpace.outdoorCamera, outdoorCamera);
      frames.push(await capture(page, out, `portal-${platform}-lamp-on`));

      if (!touch) {
        await page.keyboard.press('Escape');
        await button(page, '继续').waitFor();
        await act(button(page, '继续'), false);
        await page.keyboard.press('KeyR');
      }
      await act(button(page, '出门'), touch);
      await waitForSpace(page, 'outdoor');
      const exited = await stats(page);
      assert.equal(exited.cabinVisit, null);
      assert.ok(exited.sceneSpace.outsideFrames > outsideFrames);
      assert.equal(exited.player.facing, 0);
      assert.ok(Math.abs(exited.player.x + 31.96) < 1e-5 && Math.abs(exited.player.z + 6.62) < 1e-5);
      for (const key of ['yaw', 'elevation', 'zoom']) assert.equal(exited.sceneSpace.outdoorCamera[key], outdoorCamera[key]);
      frames.push(await capture(page, out, `portal-${platform}-returned`));
      report.portal.flows.push({ platform, walkedToDoor: true, localMovement: true, externalFramesUnchanged: true, lamp: true, walkBackToDoor: true });

      if (!touch) {
        await page.keyboard.press('KeyE');
        await waitForSpace(page, 'cabin');
        const revisit = await stats(page);
        assert.deepEqual(revisit.sceneSpace.cabin.resources, entered.sceneSpace.cabin.resources);
        assert.equal(revisit.sceneSpace.cabin.light.lamp, lit.sceneSpace.cabin.light.lamp);
        await page.keyboard.press('Escape');
        await button(page, '继续').waitFor();
        await page.waitForFunction(() => JSON.parse(document.querySelector('#runtime-stats').textContent).current.save.state === 'saved');
        await page.reload();
        await waitForSpace(page, 'outdoor');
        const loaded = await stats(page);
        assert.equal(loaded.cabinVisit, null);
        assert.equal(loaded.player.x, exited.player.x);
        assert.equal(loaded.player.z, exited.player.z);
        assert.deepEqual(loaded.worldState.inventory, before.worldState.inventory);
        report.portal.flows.push({ platform, reentry: true, safeReloadExit: true });
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      console.log(`CABIN_PORTAL_PASS ${platform}`);
    } catch (error) {
      report.portal.failure = { platform, state: await stats(page).catch(() => null) };
      await page.screenshot({ path: join(out, `portal-${platform}-failure.png`), timeout: 12000 }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
}
