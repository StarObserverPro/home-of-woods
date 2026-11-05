// Use the existing shared CDP browser; keep images outside the repository.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const testOrigin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
const baselineOrigin=process.env.BASELINE_ORIGIN;
const out=process.env.EVIDENCE_DIR??'/tmp/how-hud-evidence';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CHROME_CDP_URL??'http://127.0.0.1:9333');
let context=await browser.newContext({viewport:{width:1000,height:740},deviceScaleFactor:1});
let page=await context.newPage();page.setDefaultTimeout(60000);
const report={origin:testOrigin,sourceRevision:process.env.SOURCE_REVISION??'working-tree',frames:[],flows:[],errors:[],requests:[]};
const fontRoot=process.env.QA_FONT_PACKAGE;
const fontCss=fontRoot?fs.readFileSync(fontRoot+'/400.css','utf8').replaceAll('./files/','/__qa-font/'):'';
async function configurePage(){
page.on('pageerror',e=>report.errors.push(e.message));page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))report.requests.push(r.url())});
await page.route('**/__qa-empty',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>HUD fixture</title>'}));
if(fontRoot)await page.route('**/__qa-font/*',r=>r.fulfill({path:fontRoot+'/files/'+r.request().url().split('/').pop(),contentType:'font/woff2'}));
}
await configurePage();
const stats=async()=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const state=async()=>(await stats()).worldState;
async function seed(origin,kind,viewport={width:1000,height:740}){
 await context.close();context=await browser.newContext({viewport,deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(60000);await configurePage();await page.goto(origin+'/__qa-empty',{waitUntil:'domcontentloaded',timeout:60000});
 await page.evaluate(async kind=>{
  const {createStarterState}=await import('/src/domain/state.ts');const {createSaveContext}=await import('/src/domain/save-context.ts');const {serializeWorldSave}=await import('/src/domain/world-save.ts');const {createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');
  const {findUpgradeProfile}=await import('/src/content/upgrades.ts');
  const s=createStarterState();s.selected=null;s.clock.speed=1;
  if(kind==='fire'){s.selected='camp-fire';s.player={...findUpgradeProfile('camp-fire:stones').stand,facing:0,moving:false};}
  if(kind==='cabin'){s.selected='cabin';const stand=findUpgradeProfile('cabin').stand;s.player={x:stand.x,z:stand.z+3.2,facing:0,moving:false};}
  const raw=await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:0});const store=createBrowserWorldSaveStore();await store.compareAndSwap(await store.read(),{primary:raw,backup:raw});
 },kind);
 await page.goto(origin+'/?inspect=1',{waitUntil:'domcontentloaded',timeout:60000});await page.locator('.loading').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'回到山谷',exact:true}).click();
 await page.addStyleTag({content:fontCss});await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.gameTime>0);
 assert.equal((await state()).selected,kind==='fire'?'camp-fire':kind==='cabin'?'cabin':null);
 console.log('READY',origin,kind,viewport.width);
}
async function shot(name){
 await page.locator('.diagnostics').evaluate(e=>e.style.visibility='hidden');await page.locator('.build-mark').evaluate(e=>e.style.visibility='hidden');
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const cdp=await context.newCDPSession(page);const capture=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(capture.data,'base64'));await cdp.detach();
 await page.locator('.diagnostics').evaluate(e=>e.style.visibility='');
 const s=await stats();assert.equal(s.shaderErrors,0);assert.equal(s.contextLost,false);
 report.frames.push({name,viewport:page.viewportSize(),dpr:1,seed:s.seed,time:s.gameTime,renderer:s.graphicsBackend,gpu:s.gpu});
 fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('SHOT',name);
}
async function fixedCamera(){await page.locator('.diagnostics').evaluate(e=>e.open=true);await page.getByLabel('场景观察位置').selectOption('camp');await page.getByRole('button',{name:'白昼',exact:true}).click();await page.locator('.diagnostics').evaluate(e=>e.open=false);}
async function bounds(){
 return page.evaluate(()=>{
  const rect=sel=>{const e=document.querySelector(sel);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};};
  const small=[...document.querySelectorAll('.target-card button,.bottom-toolbar button,.warehouse-dock button,.camera-tools button')].filter(e=>e.checkVisibility()).map(e=>({label:e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})).filter(b=>b.w<43.5||b.h<43.5);
  return {target:rect('.target-card'),dock:rect('.hud-dock'),warehouse:rect('.warehouse-dock'),small,overflow:document.documentElement.scrollWidth>innerWidth||[...document.querySelectorAll('.target-card,.warehouse-dock,.warehouse-body')].some(e=>e.scrollWidth>e.clientWidth+1)};
 });
}
try{
 // Doctor uses this same CDP session before the app checks.
 const probe=await context.newPage();await probe.setContent('<canvas width="10" height="10"></canvas>');
 report.doctor=await probe.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');if(!gl)throw Error('No WebGL2');gl.clearColor(.1,.7,.2,1);gl.clear(gl.COLOR_BUFFER_BIT);const p=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return {webgl:gl.getParameter(gl.VERSION),pixel:[...p]};});assert.ok(report.doctor.pixel[1]>100);await probe.screenshot({path:out+'/doctor.png'});await probe.close();await page.bringToFront();
 if(baselineOrigin){await seed(baselineOrigin,'fire');await fixedCamera();await shot('before-desktop-fire');}
 if(baselineOrigin){await seed(baselineOrigin,'idle',{width:390,height:844});await page.locator('.bottom-toolbar').getByRole('button',{name:'打开仓库',exact:true}).click();await shot('before-mobile-items');}
 await seed(testOrigin,'idle');await fixedCamera();await shot('after-desktop-idle');
 await page.getByRole('button',{name:'镜头',exact:true}).click();assert.ok(await page.locator('.camera-tools').isVisible());await page.getByRole('button',{name:'放大',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('.camera-tools').count(),0);
 await page.getByRole('button',{name:'路线',exact:true}).click();const before=await state();await page.getByRole('button',{name:'营地木料堆',exact:true}).click();const after=await state();assert.equal(after.route.length,0);assert.deepEqual(after.player,before.player);assert.deepEqual(after.inventory,before.inventory);report.flows.push('route facility shortcut selects without walking or transferring');
 await page.locator('.bottom-toolbar').getByRole('button',{name:'打开仓库',exact:true}).click();assert.equal(await page.locator('.route-sheet').count(),0);assert.equal(await page.locator('.target-card').count(),0);await page.keyboard.press('Escape');assert.equal(await page.locator('.warehouse-dock').count(),0);report.flows.push('inventory closes foreground panels; Escape returns to target');
 await seed(testOrigin,'fire');await fixedCamera();assert.equal(await page.locator('.upgrade-module:visible').count(),0);await shot('after-desktop-fire');
 await page.getByText('改造与修缮',{exact:true}).click();await page.locator('.upgrade-module summary').first().click();assert.equal(await page.locator('.upgrade-module[open]').count(),1);await page.locator('.upgrade-module summary').nth(1).click();assert.equal(await page.locator('.upgrade-module[open]').count(),1);report.flows.push('upgrade list and part details disclose one part at a time');
 await page.getByRole('button',{name:'镜头',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.camera-tools'));await page.getByRole('button',{name:'复位镜头',exact:true}).click();assert.ok(await page.locator('.camera-tools').isVisible());await page.keyboard.press('Escape');
 await seed(testOrigin,'cabin');const inv=JSON.stringify((await state()).inventory);assert.equal(await page.locator('.facility-approach button').count(),1);assert.equal(await page.getByRole('button',{name:'制作并安装',exact:true}).count(),0);await page.getByRole('button',{name:'走近',exact:true}).click();
 await page.waitForFunction(()=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.workshop.upgradeOptions.some(u=>u.near)&&s.routeNodes===0;},{},{timeout:60000});
 assert.equal(JSON.stringify((await state()).inventory),inv);assert.equal((await state()).workshop.job,null);await page.getByText('改造与修缮',{exact:true}).click();await page.locator('.upgrade-module summary').filter({hasText:'第一阶段'}).click();assert.ok(await page.getByRole('button',{name:'制作并安装',exact:true}).isDisabled());report.flows.push('far cabin has one approach; arrival does not spend; missing materials disable near operation');
 for(const viewport of [{width:390,height:844},{width:320,height:640},{width:844,height:390}]){
  await seed(testOrigin,'fire',viewport);await fixedCamera();const b=await bounds();assert.equal(b.overflow,false);assert.deepEqual(b.small,[]);assert.ok(b.target.y>=60&&b.target.y+b.target.h<=b.dock.y);if(viewport.width!==320)await shot('after-'+viewport.width+'-fire');
  await page.locator('.bottom-toolbar').getByRole('button',{name:'打开仓库',exact:true}).click();assert.equal(await page.locator('.warehouse-categories button').count(),5);assert.equal(await page.locator('.warehouse-categories').evaluate(e=>e.scrollWidth>e.clientWidth),false);await page.getByRole('button',{name:'营地材料',exact:true}).click();await page.getByLabel('材料分类').selectOption('wood');await page.getByRole('button',{name:'穿戴',exact:true}).click();await page.getByRole('button',{name:'随身',exact:true}).click();assert.deepEqual((await bounds()).small,[]);if(viewport.width===390)await shot('after-'+viewport.width+'-items');
  report.flows.push(viewport.width+' viewport: no overlap/overflow, five readable tabs, 44px controls');
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.result='passed';console.log('PASS',JSON.stringify(report.flows));
} catch(e){report.result='failed';report.failure=String(e);report.debug=await stats().catch(()=>null);console.log('FAIL',String(e));await page.screenshot({path:out+'/failure.png',timeout:10000}).catch(()=>{});process.exitCode=1;}finally{fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
