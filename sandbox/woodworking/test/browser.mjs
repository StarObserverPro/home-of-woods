// Optional UI regression. Install playwright-core separately and set CHROME_PATH.
// Run after npm run build. QA_EVIDENCE_DIR optionally captures full-page PNGs.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const url = new URL('../dist/woodworking.html', import.meta.url).href
const evidence = process.env.QA_EVIDENCE_DIR
if (evidence) await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH })

// Measure the unpainted visible wood in an axis-aligned inspection view. Input
// coordinates come from rendered pixels and the dimensions on the drawing.
async function woodBounds(canvas) {
  await canvas.scrollIntoViewIfNeeded()
  return canvas.evaluate((c) => {
    const { width, height } = c
    const data = c.getContext('2d').getImageData(0, 0, width, height).data
    let left = width,
      right = 0,
      top = height,
      bottom = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (data[i + 3] < 205 || data[i] < 100 || data[i] - data[i + 2] < 27) continue
        left = Math.min(left, x)
        right = Math.max(right, x + 1)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y + 1)
      }
    if (right <= left || bottom <= top) throw Error('Wood missing from canvas')
    const r = c.getBoundingClientRect()
    return {
      x: r.x + (left * r.width) / width,
      y: r.y + (top * r.height) / height,
      width: ((right - left) * r.width) / width,
      height: ((bottom - top) * r.height) / height,
    }
  })
}

async function scenario(mobile) {
  const label = mobile ? 'mobile' : 'desktop'
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  })
  const page = await context.newPage()
  const cdp = mobile ? await context.newCDPSession(page) : null
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('requestfailed', (r) => errors.push(`${r.url()} ${r.failure()?.errorText}`))
  page.setDefaultTimeout(4000)
  const canvas = page.locator('.stage canvas')
  const button = (id) => page.locator(`[data-a="${id}"]`)
  async function press(el) {
    if (!mobile) return el.click()
    // Let the previous touch gesture end before issuing another physical tap.
    await new Promise((resolve) => setTimeout(resolve, 380))
    await el.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    const r = await el.boundingBox(),
      point = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  async function capture(state) {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${label}: horizontal overflow at ${state}`,
    )
    if (evidence) await page.screenshot({ path: join(evidence, `${label}-${state}.png`), fullPage: true })
  }
  async function draw(from, to) {
    if (!cdp) {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 8 })
      await page.mouse.up()
    } else {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
      for (let i = 1; i <= 8; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x: from.x + ((to.x - from.x) * i) / 8,
              y: from.y + ((to.y - from.y) * i) / 8,
            },
          ],
        })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
  }
  try {
    await page.goto(url)
    await button('start').waitFor()
    await capture('initial')
    const length = 78,
      width = 30,
      blankLength = 90,
      shoulder = 58
    await page.locator('[name=length]').fill(String(length))
    const materials = page.locator('#stocks'),
      maple = materials.locator('option', { hasText: '枫木方料' })
    await materials.selectOption(await maple.getAttribute('value'))
    await press(button('start'))
    assert.equal(await button('ruler').isEnabled(),false)
    const mode = page.locator('#modeLabel')
    assert.match(await mode.textContent(), /虚影/)
    await capture('ghost')
    await mode.filter({ hasText: '虚影' }).waitFor({ state: 'hidden', timeout: 7000 })
    const guide = page.locator('#note')
    const cuts = [
      ['trim', length / blankLength],
      ['cheekNear', 7.5 / width],
      ['cheekFar', 22 / width],
      ['shoulderNear', shoulder / length],
      ['shoulderFar', 1 - shoulder / length],
    ]
    for (const [id, fraction] of cuts) {
      assert.equal(await page.locator('#cuts').inputValue(), id, `${label}: ${await guide.textContent()}`)
      await press(button('face'))
      await press(button('mark'))
      const r = await woodBounds(canvas)
      const x = r.x + r.width * fraction
      // Leave a small taper and stock for a real near-side fitting correction.
      const offset = id === 'cheekNear' ? (r.width * 0.15) / width : 0
      await draw({ x: x - offset, y: r.y + 0.15 * r.height }, { x: x + offset, y: r.y + 0.85 * r.height })
      assert.ok(await button('cut').isEnabled(), `${label}/${id}: ${await guide.textContent()}`)
      if (id === 'cheekNear') await capture('mark')
      await press(button('cut'))
      if (id === 'trim') {
        await page.getByText('锯切完成', { exact: false }).waitFor()
        await page.reload()
        await button('face').waitFor()
        assert.doesNotMatch(await mode.textContent(), /虚影/)
        assert.match(await guide.textContent(), /续接/)
      }
    }
    await press(button('trial'))
    assert.match(await page.locator('#fit').textContent(), /榫颊抵住槽壁/)
    assert.equal(await button('finish').isEnabled(), false)
    await capture('trial')
    let pares = 0
    while (!(await button('finish').isEnabled()) && pares < 3) {
      await press(button('near'))
      await press(button('trial'))
      pares++
    }
    assert.match(await page.locator('#fit').textContent(), /试配合格/)
    await press(page.getByRole('button', { name: '面漆：松绿' }))
    await press(button('finish'))
    assert.match(await guide.textContent(), /已收件/)
    assert.equal(await page.locator('#count').textContent(), '1')
    await capture('finished')
    await press(button('restart'))
    await press(button('start'))
    assert.equal(await button('ruler').isEnabled(),true)
    await page.reload()
    await press(page.locator('#gallery summary'))
    const ledger = page.locator('#ledger > div')
    assert.equal(await ledger.count(), 1)
    assert.match(await ledger.textContent(), /枫木方料.*工艺/)
    assert.equal(
      await ledger.locator('i').evaluate((i) => getComputedStyle(i).backgroundColor),
      'rgb(71, 107, 83)',
    )
    assert.deepEqual(errors, [])
    console.log(
      `${label}: 5 surface strokes, ${pares} near pare(s), ${await ledger.textContent()}, no errors`,
    )
  } finally {
    await context.close()
  }
}
try {
  await scenario(false)
  await scenario(true)
} finally {
  await browser.close()
}
