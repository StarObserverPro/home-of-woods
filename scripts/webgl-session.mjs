import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, open } from 'node:fs/promises';
import { resolve } from 'node:path';

// All visual checks attach to this one browser. An explicit executable also
// supports CI images which already provide Chromium instead of Playwright's CDN.
export const endpoint = process.env.HOW_CDP_URL ?? 'http://127.0.0.1:9333';
const cache = resolve('.cache');
const statePath = resolve(cache, 'webgl-session.json');

async function available() {
  try { return (await fetch(`${endpoint}/json/version`)).ok; } catch { return false; }
}

export async function ensureBrowser() {
  if (!await available()) {
    await mkdir(cache, { recursive: true });
    const log = await open(resolve(cache, 'chromium.log'), 'a');
    const child = spawn(process.env.HOW_CHROME ?? chromium.executablePath(), [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
      '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${new URL(endpoint).port || 9333}`,
      `--user-data-dir=${resolve(cache, 'chromium-profile')}`, 'about:blank',
    ], { detached: true, stdio: ['ignore', log.fd, log.fd] });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.unref();
    await log.close();
    if (child.pid) await writeFile(statePath, JSON.stringify({ pid: child.pid, endpoint }));
    const deadline = Date.now() + 15000;
    while (!await available()) {
      if (spawnError) throw spawnError;
      if (Date.now() > deadline) throw new Error(`Chromium did not open CDP. Inspect ${resolve(cache, 'chromium.log')}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  return chromium.connectOverCDP(endpoint);
}

export async function doctor() {
  const browser = await ensureBrowser();
  const context = await browser.newContext({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent('<!doctype html><title>WebGL doctor</title><canvas width="320" height="240"></canvas>');
  const result = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is unavailable');
    gl.clearColor(0.15, 0.7, 0.35, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4);
    gl.readPixels(160, 120, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (pixel[1] < 100) throw new Error(`WebGL probe returned an invalid pixel ${pixel}`);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl: gl.getParameter(gl.VERSION), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), pixel: Array.from(pixel) };
  });
  await mkdir(cache, { recursive: true });
  await page.screenshot({ path: resolve(cache, 'webgl-doctor.png') });
  await context.close();
  return { ok: true, endpoint, browser: browser.version(), ...result };
}

async function stop() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    process.kill(state.pid, 'SIGTERM');
    await rm(statePath, { force: true });
  } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    if (process.argv[2] === 'stop') await stop();
    else console.log(JSON.stringify(await doctor(), null, 2));
    process.exit(0);
  } catch (error) { console.error(error); process.exit(1); }
}
