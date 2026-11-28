import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('../', import.meta.url))
const out = process.env.QA_EVIDENCE_DIR || '/tmp/woodworking-stage-evidence'
await mkdir(out, { recursive: true })
const source = await readFile(resolve(root, 'dist/woodworking.js'), 'utf8')
const standalone = await readFile(resolve(root, 'dist/woodworking.html'), 'utf8')
for (const text of [source, standalone]) {
  assert.ok(text.includes('Permission is hereby granted'), 'Full MIT notice must travel with each bundle')
  assert.ok(text.includes('CC0'), 'Asset notices must travel with each bundle')
}
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const errors = [], unexpectedRequests = []
  // An isolated consumer serves the actual ESM bytes; no production debug hooks or CDN.
  await context.route('http://woodworking.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/woodworking.js') return route.fulfill({ contentType: 'text/javascript', body: source })
    if (path !== '/') { unexpectedRequests.push(path); return route.abort() }
    await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="UTF-8"><style>body{margin:0;background:#182b21}</style></head><body><main id="host"></main><script type="module">
      import { mountWoodworking } from '/woodworking.js';
      const host=document.querySelector('#host');
      window.remount=(draft)=>{ window.handle=mountWoodworking(host,{draft,onDraftChange:d=>window.lastDraft=d}); };
      window.remount(null);
    </script></body></html>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('requestfailed', r => unexpectedRequests.push(r.url()))
  await page.goto('http://woodworking.test/')
  const ready = () => page.waitForFunction(() => document.querySelector('#host')?.firstElementChild?.shadowRoot?.querySelector('canvas')?.dataset.assets === 'ready')
  await ready()
  await page.locator('[data-a=start]').click()
  await page.locator('[data-a=suggest-face]').click()
  await page.locator('[data-stage=depth]').click()
  await page.locator('#depth-number').fill('10')
  await page.locator('#depth-number').dispatchEvent('input')
  await page.locator('[data-a=cut]').click()
  await page.evaluate(() => window.handle.setPaused(true))
  await page.waitForTimeout(250)
  const draft = await page.evaluate(() => window.handle.getDraft())
  assert.equal(draft.job.operations.length, 1)
  const frozen = await page.locator('canvas').getAttribute('data-draws')
  await page.waitForTimeout(200)
  assert.equal(await page.locator('canvas').getAttribute('data-draws'), frozen)
  assert.equal(await page.locator('.shell').evaluate(s => s.inert), true)
  await page.evaluate(() => window.handle.setPaused(false))
  await page.waitForTimeout(750)
  assert.equal(await page.locator('.shell').evaluate(s => s.inert), false)
  assert.deepEqual(await page.evaluate(() => window.handle.getDraft()), draft)
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const d=window.handle.getDraft(); window.handle.destroy(); window.remount(d) })
    await ready()
    assert.deepEqual(await page.evaluate(() => window.handle.getDraft()), draft)
    assert.equal(await page.locator('canvas').count(), 1)
  }
  await page.locator('[data-a=paper]').click()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#paper-dialog').evaluate(d => d.open), false)
  assert.equal(await page.locator('[data-a=paper]').evaluate(b => b.getRootNode().activeElement === b), true)
  for (const [width, height] of [[1280,800],[390,844],[320,720],[844,390]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(250)
    const small = await page.locator('.shell').evaluate(s => [...s.querySelectorAll('button')].filter(b => b.getClientRects().length).filter(b => {const r=b.getBoundingClientRect(); return r.width<43.9 || r.height<43.9}).map(b => b.dataset.a || b.textContent))
    assert.deepEqual(small, [], `44px targets at ${width}x${height}`)
  }
  await page.evaluate(() => window.handle.destroy())
  await page.waitForTimeout(150)
  assert.equal(await page.locator('canvas').count(), 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedRequests, [])
  const result = { status: 'passed', pauseStopsFrames: true, resumeKeepsDraft: true, remounts: 3, escapeReturnsFocus: true, controlTargets44px: true, fullNotices: true, unexpectedRequests, errors }
  await writeFile(resolve(out, 'mount.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  await context.close()
} catch (error) {
  await writeFile(resolve(out, 'mount-failure.txt'), String(error.stack || error))
  throw error
} finally {
  await browser.close()
}
