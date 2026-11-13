// Real pointer/control tests; Chromium is external to the shipped runtime.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright')
const url = new URL('../dist/woodworking.html', import.meta.url).href
const inline = process.env.INLINE_ONLY === '1' // Local managed browsers may forbid URL navigation. CI uses actual file reloads.
const html = inline ? await readFile(new URL('../dist/woodworking.html', import.meta.url),'utf8') : ''
const evidence = process.env.QA_EVIDENCE_DIR
if(evidence) await mkdir(evidence,{recursive:true})
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']})
const results=[]
async function scenario(mobile) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  const label=mobile?'mobile':'desktop', canvas=page.locator('canvas')
  const click=async locator=>{if(mobile)await locator.tap();else await locator.click()}
  const button=a=>page.locator(`[data-a="${a}"]`).first()
  const shot=async name=>{if(evidence)await page.screenshot({path:join(evidence,`${label}-${name}.png`)})}
  const load=async()=>{if(inline)await page.setContent(html);else await page.goto(url)}
  await load(); await click(button('start'))
  // Choose a visible face from actual rendered wood pixels; selection must not become a cut.
  const point=await canvas.evaluate(c=>{
    const {width:w,height:h}=c, pixels=c.getContext('2d').getImageData(0,0,w,h).data,r=c.getBoundingClientRect()
    let sumX=0,sumY=0,count=0
    for(let y=Math.floor(h*.23);y<h*.75;y++)for(let x=Math.floor(w*.2);x<w*.8;x++){
      const i=(y*w+x)*4
      if(pixels[i]>145&&pixels[i+1]>90&&pixels[i]-pixels[i+2]>35){sumX+=x;sumY+=y;count++}
    }
    if(!count)throw Error('No visible workpiece')
    return {x:r.x+sumX/count*r.width/w,y:r.y+sumY/count*r.height/h}
  })
  if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y)
  assert.notEqual(await canvas.getAttribute('data-surface'),'')
  assert.equal(await canvas.getAttribute('data-operations'),'0')
  const chosen=await canvas.getAttribute('data-surface')
  if(!mobile){await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+45,point.y+14,{steps:5});await page.mouse.up();assert.equal(await canvas.getAttribute('data-surface'),chosen)}
  async function configure(task,pos,depth){
    await click(page.locator(`[data-task="${task}"]`));await click(button('suggest-face'))
    await page.locator('#offset-number').fill(String(pos));await page.locator('#depth-number').fill(String(depth))
    assert.equal(await button('cut').isEnabled(),true,await page.locator('#cut-hint').innerText())
  }
  await configure('trim',80,10)
  // Range, keyboard and fine-step buttons all move the same measured line without cutting.
  await page.locator('#offset-range').focus();await page.keyboard.press('ArrowRight')
  assert.equal(await page.locator('#offset-number').inputValue(),'80.1')
  await click(page.locator('[data-step="offset:-1"]'));assert.equal(await page.locator('#offset-number').inputValue(),'80')
  assert.equal(await canvas.getAttribute('data-operations'),'0')
  await click(button('depth-view'));await shot('depth-preview')
  const before=Number(await canvas.getAttribute('data-volume'))
  await click(button('cut'));assert.equal(Number(await canvas.getAttribute('data-volume')),before-300)
  assert.match(await page.locator('#message').innerText(),/仍相连/)
  assert.equal(await button('cut').isEnabled(),false)
  await shot('partial-kerf')
  if(!inline){await page.reload();assert.equal(await canvas.getAttribute('data-operations'),'1');assert.equal(await page.locator('#depth-number').inputValue(),'10')}
  await page.locator('#depth-number').fill('30');await click(button('cut'))
  await configure('shoulderFar',60,8);await click(button('cut'))
  await configure('cheekNear',8,20);await click(button('cut'))
  await configure('shoulderNear',60,8);await click(button('cut'))
  await configure('cheekFar',22,20);await click(button('cut'))
  await click(button('trial'));assert.match(await page.locator('#score').innerText(),/100/)
  await shot('fit')
  await page.locator('#paint').selectOption('#476b53');await click(button('finish'))
  assert.equal(await page.locator('#count').innerText(),'1');await shot('collected')
  assert.equal(await canvas.getAttribute('data-volume'),'62400')
  if(!inline){await page.reload();assert.equal(await page.locator('#count').innerText(),'1')}
  else await click(button('new'))
  await click(button('start'))
  // Leave half a millimetre of excess on the near cheek and stop its shoulder at that actual cheek.
  for(const [task,pos,depth]of [['trim',80,30],['cheekNear',7.5,20],['shoulderNear',60,7.5],['cheekFar',22,20],['shoulderFar',60,8]]){
    await configure(task,pos,depth);await click(button('cut'))
  }
  await click(button('trial'));assert.equal(await button('repair').isVisible(),true);await shot('interference')
  await click(button('repair'));assert.match(await page.locator('#score').innerText(),/94/)
  assert.equal(await button('repair').isVisible(),false);await click(button('finish'))
  assert.equal(await page.locator('#count').innerText(),'2')
  await click(button('new'));await click(button('start'))
  await configure('trim',80,30);await click(button('cut'))
  await configure('cheekNear',8,23);await click(button('cut'))
  for(const [task,pos,depth]of [['shoulderNear',60,8],['cheekFar',22,20],['shoulderFar',60,8]]){await configure(task,pos,depth);await click(button('cut'))}
  await click(button('trial'));assert.match(await page.locator('#issues').innerText(),/内部损伤/)
  assert.equal(await button('finish').isVisible(),false);assert.equal(await button('repair').isVisible(),false);await shot('scrap')
  await click(button('discard'));await click(page.locator('dialog button[value="discard"]'))
  assert.equal(await page.locator('#count').innerText(),'2')
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
  assert.equal(overflow,false);assert.deepEqual(errors,[])
  results.push({label,realReload:!inline,pointerSelection:true,partialAndContinuedSaw:true,shoulderFirst:true,automaticFinishScore:94,irreparableSawDamage:true,collectibles:2,errors})
  await context.close()
}
async function mountLifecycle() {
  const page=await browser.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.setContent('<main id="mount"></main>')
  const source=await readFile(new URL('../dist/woodworking.js',import.meta.url),'utf8')
  await page.evaluate(async uri=>{
    const api=await import(uri)
    window.testApi=api
    window.testMount=()=>{window.testView=api.mountWoodworking(document.querySelector('#mount'),{draft:window.testDraft,onDraftChange:d=>window.testDraft=d})}
    window.testMount()
  },'data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
  await page.locator('[data-a="start"]').click();await page.locator('[data-a="suggest-face"]').click()
  await page.locator('#offset-number').fill('80');await page.locator('#depth-number').fill('9');await page.locator('[data-a="cut"]').click()
  assert.equal(await page.locator('canvas').getAttribute('data-operations'),'1')
  await page.evaluate(()=>window.testView.setPaused(true))
  assert.equal(await page.locator('.shell').evaluate(e=>e.inert),true)
  const before=await page.evaluate(()=>JSON.stringify(window.testView.getDraft()))
  await page.locator('#depth-number').evaluate(e=>{e.value='20';e.dispatchEvent(new Event('input',{bubbles:true}))})
  assert.equal(await page.evaluate(()=>JSON.stringify(window.testView.getDraft())),before)
  await page.evaluate(()=>{window.testView.destroy();window.testMount()})
  assert.equal(await page.locator('canvas').count(),1)
  assert.equal(await page.locator('canvas').getAttribute('data-operations'),'1')
  assert.equal(await page.locator('#depth-number').inputValue(),'9')
  await page.evaluate(()=>window.testView.destroy())
  assert.equal(await page.locator('canvas').count(),0)
  assert.deepEqual(errors,[])
  results.push({label:'esm-host',pause:true,resumePartial:true,destroyRemount:true,errors})
  await page.close()
}
try {await scenario(false);await scenario(true);await mountLifecycle();console.log(JSON.stringify({status:'passed',mode:inline?'inline-local':'file-navigation',results},null,2));if(evidence)await writeFile(join(evidence,'browser.json'),JSON.stringify({status:'passed',mode:inline?'inline-local':'file-navigation',results},null,2))} finally {await browser.close()}
