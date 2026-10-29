import assert from 'node:assert/strict';

// Software WebGL can present a frame long after input was dispatched. A wall
// clock delay cannot prove that the fixed-step simulation consumed that input.
const simulationWait = { timeout: 15000, polling: 50 };

export const runtimeSnapshot = page => page.evaluate(() => {
  const { player, time } = window.__HOW__.state();
  const { steps, running } = window.__HOW__.metrics();
  return { player, time, steps, running };
});

export async function waitForMovement(page, before, minimumDistance = 0.1) {
  await page.waitForFunction(({ before, minimumDistance }) => {
    const { player } = window.__HOW__.state();
    return window.__HOW__.metrics().steps > before.steps
      && Math.hypot(player.x - before.player.x, player.z - before.player.z) > minimumDistance;
  }, { before, minimumDistance }, simulationWait);
  const after = await runtimeSnapshot(page);
  assert(after.steps > before.steps, 'Movement must consume actual simulation steps');
  assert(Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z) > minimumDistance,
    `Input must move the player more than ${minimumDistance} world units`);
  return after;
}

export async function waitForSteps(page, before, count = 5) {
  await page.waitForFunction(({ steps, time, count }) => {
    const metrics = window.__HOW__.metrics();
    return metrics.running && metrics.steps >= steps + count && window.__HOW__.state().time > time;
  }, { steps: before.steps, time: before.time, count }, simulationWait);
  const after = await runtimeSnapshot(page);
  assert(after.running && after.steps >= before.steps + count && after.time > before.time,
    `The game must advance at least ${count} actual simulation steps`);
  return after;
}

export async function waitForTool(page, tool) {
  await page.waitForFunction(tool => document.querySelector(`[data-tool="${tool}"]`)?.getAttribute('aria-pressed') === 'true',
    tool, simulationWait);
  assert.equal(await page.locator(`[data-tool="${tool}"]`).getAttribute('aria-pressed'), 'true');
}
