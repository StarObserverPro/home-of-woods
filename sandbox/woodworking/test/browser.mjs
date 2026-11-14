import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const root=fileURLToPath(new URL('../',import.meta.url)), out=process.env.QA_EVIDENCE_DIR||'/tmp/woodworking-stage-evidence'
await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']})
const results=[]
try {
 for(const [label,width,height,mobile]of [['desktop',1280,800,false],['mobile',390,844,true],['narrow',320,720,true],['landscape',844,390,true]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile})
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000)
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  const tap=async selector=>{const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();if(mobile)await el.tap();else await el.click()}
  const shot=async name=>{await page.waitForTimeout(120);await page.screenshot({path:resolve(out,`${label}-${name}.png`),timeout:20000})}
  const session=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('home-of-woods.handwork.sandbox.v2')||'null'))
  const scale=()=>page.locator('canvas').evaluate(c=>JSON.stringify([c.dataset.viewScale,c.dataset.viewProjection,c.dataset.objectScale]))
  const measure=async(id,v)=>{await page.locator(`#${id}-number`).fill(String(v));await page.locator(`#${id}-number`).dispatchEvent('input')}
  const choose=async(id,pos,depth)=>{await tap(`[data-task=${id}]`);await tap('[data-a=suggest-face]');await tap('[data-stage=line]');await page.locator('#reference').selectOption('low');await measure('offset',pos);await tap('[data-stage=depth]');await measure('depth',depth)}
  const cut=async(id,pos,depth)=>{await choose(id,pos,depth);await tap('[data-a=cut]');await page.waitForTimeout(700)}
  const enter=async()=>{await page.goto(pathToFileURL(resolve(root,'dist/woodworking.html')).href);await page.waitForFunction(()=>document.querySelector('#workshop')?.firstElementChild?.shadowRoot?.querySelector('canvas')?.dataset.assets==='ready');await page.waitForTimeout(200)}
  await enter(); await shot('setup');await tap('[data-a=start]');
  const initialScale=await scale(),initial=await session()
  await page.waitForTimeout(200);const idle=await page.locator('canvas').getAttribute('data-draws');await page.waitForTimeout(150);assert.equal(await page.locator('canvas').getAttribute('data-draws'),idle,'idle workbench must not keep rendering')
  for(const a of ['turn-left','turn-up','turn-right','turn-down','iso'])await tap(`[data-a=${a}]`)
  assert.equal(await scale(),initialScale);assert.equal((await session()).draft.job.operations.length,initial.draft.job.operations.length)
  if(!mobile){const r=await page.locator('canvas').boundingBox();await page.mouse.move(r.x+r.width*.53,r.y+r.height*.4);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*.35,{steps:12});await page.mouse.up();assert.equal(await scale(),initialScale);assert.equal((await session()).draft.job.operations.length,0);await tap('[data-a=iso]')}
  await tap('[data-a=zoom-in]');await page.waitForTimeout(80);const enlarged=await scale();assert.notEqual(enlarged,initialScale);await tap('[data-a=iso]');await page.waitForTimeout(80);assert.equal(await scale(),enlarged,'reset angle must preserve explicit zoom');await tap('[data-a=zoom-out]');await page.waitForTimeout(80)
  await choose('trim',80,10);for(const a of ['face','depth-view','iso'])await tap(`[data-a=${a}]`);assert.equal(await scale(),initialScale)
  await page.evaluate(()=>window.scrollTo(0,0));await shot('depth')
  await tap('[data-a=paper]');await shot('drawing');await tap('[data-a=close-paper]');assert.equal(await scale(),initialScale)
  if(label==='desktop'||label==='mobile'){
   await tap('[data-a=cut]');await page.waitForTimeout(750);assert.equal((await session()).draft.job.operations.length,1);await shot('partial')
   await page.reload();await page.waitForFunction(()=>document.querySelector('#workshop')?.firstElementChild?.shadowRoot?.querySelector('canvas')?.dataset.assets==='ready');assert.equal((await session()).draft.job.operations.length,1)
   await choose('trim',80,30);await tap('[data-a=cut]');await page.waitForTimeout(700)
   await cut('shoulderNear',60,8);await cut('cheekNear',8,20);await cut('cheekFar',22,20);await cut('shoulderFar',60,8)
   const beforeFit=await scale();await tap('[data-a=trial]');assert.equal(await scale(),beforeFit);assert.match(await page.locator('#score').innerText(),/100/);await shot('fit')
   await tap('[data-a=finish]');await shot('collected');assert.equal((await session()).inventory.instances.length,1)
   await page.reload();await page.waitForFunction(()=>document.querySelector('#workshop')?.firstElementChild?.shadowRoot?.querySelector('canvas')?.dataset.assets==='ready');assert.equal((await session()).inventory.instances.length,1)
   await tap('[data-a=start]');await cut('trim',80,30);await cut('cheekNear',7.6,20);await cut('cheekFar',22,20);await cut('shoulderNear',60,8);await cut('shoulderFar',60,8);await tap('[data-a=trial]');await shot('interference');assert.equal(await page.locator('[data-a=repair]').isVisible(),true);await tap('[data-a=repair]');assert.match(await page.locator('#score').innerText(),/94/);await tap('[data-a=finish]');assert.equal((await session()).inventory.instances.length,2)
   await tap('[data-a=new]');await tap('[data-a=start]');await cut('trim',80,30);await cut('cheekNear',8,24);await cut('cheekFar',22,20);await cut('shoulderNear',60,8);await cut('shoulderFar',60,8);await tap('[data-a=trial]');assert.equal(await page.locator('[data-a=repair]').isVisible(),false);assert.equal(await page.locator('[data-a=finish]').isVisible(),false);await shot('scrap');await tap('[data-a=discard]');await tap('button[value=discard]');await page.waitForTimeout(200);assert.equal((await session()).inventory.instances.length,2)
  }
  const metrics=await page.locator('canvas').evaluate(c=>({...c.dataset}))
  const layout=await page.locator('.shell').evaluate(s=>({scroll:s.scrollWidth,width:s.clientWidth,small:[...s.querySelectorAll('button')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().width<43.9).map(e=>e.dataset.a||e.textContent)}))
  assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));assert.deepEqual(layout.small,[])
  const controlsRect=await page.locator('.controls').boundingBox(),canvasRect=await page.locator('canvas').boundingBox();assert.ok(controlsRect.y>=canvasRect.y+canvasRect.height-1 || controlsRect.x>=canvasRect.x+canvasRect.width-1,'controls must not cover the workpiece canvas');
  assert.deepEqual(errors,[])
  results.push({label,errors,metrics,layout,viewScalePreserved:true,cameraActionsDoNotCut:true,realReload:label==='desktop'||label==='mobile'})
  await context.close()
 }
 await writeFile(resolve(out,'browser.json'),JSON.stringify({status:'passed',results},null,2));console.log(JSON.stringify({status:'passed',results},null,2))
} catch(e) {await writeFile(resolve(out,'failure.txt'),String(e.stack||e));throw e} finally{await browser.close()}
