/** Fixed-camera, zero-time A/B and instance-lifecycle checks on the built game. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const cwd=process.cwd(),out=process.env.LIGHTING_EVIDENCE_DIR??'/tmp/how-lighting-evidence';
const origin='http://127.0.0.1:4181';
await fs.mkdir(out,{recursive:true});
const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'running',frames:[],pairs:[],flows:[],errors:[],warnings:[],limits:['Software Chromium WebGL is not physical mobile GPU performance.','This is authored ambient attenuation, not ray-traced AO or GI.','Forest detailed near-field occlusion remains deferred.']};
let serverLog='',phase='startup',browser,page;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4181','--strictPort'],{cwd,stdio:['ignore','pipe','pipe']});
for(const s of [server.stdout,server.stderr])s.on('data',b=>serverLog=(serverLog+b).slice(-80000));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)return;}catch{}if(server.exitCode!==null)throw Error(serverLog);await delay(300);}throw Error('Preview unavailable');}
async function newPage(viewport,mobile=false){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 page=await context.newPage();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(120000);
 page.on('pageerror',e=>report.errors.push({phase,message:String(e)}));
 page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,message:m.text()});else if(m.type()==='warning')report.warnings.push({phase,message:m.text()});});
 page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)report.errors.push({phase,url:r.url(),status:r.status()});});
 return context;
}
async function difference(off,on){
 return page.evaluate(async({off,on})=>{
   const load=async src=>{const bitmap=await createImageBitmap(await(await fetch(src)).blob());const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext('2d');x.drawImage(bitmap,0,0);bitmap.close();return x.getImageData(0,0,c.width,c.height);};
   const a=await load(off),b=await load(on);if(a.width!==b.width||a.height!==b.height)throw Error('A/B dimensions differ');
   let sum=0,changed=0,darker=0,brighter=0,max=0;
   for(let i=0;i<a.data.length;i+=4){let d=0,s=0;for(let k=0;k<3;k++){const v=b.data[i+k]-a.data[i+k];d+=Math.abs(v);s+=v;}sum+=d/3;max=Math.max(max,d/3);if(d>3){changed++;if(s<0)darker++;else brighter++;}}
   return {width:a.width,height:a.height,meanAbsoluteDifference:sum/(a.width*a.height),changedPixels:changed,darkerPixels:darker,brighterPixels:brighter,maxDifference:max};
 },{off,on});
}
async function cabinCapture(name,enabled){
 const result=await page.evaluate(enabled=>{const a=window.__CABIN_AUDIT__;a.pause();a.settings({occlusion:enabled});return {stats:a.stats(),state:a.getSnapshot(),audit:a.audit(),image:a.capture()};},enabled);
 assert.equal(result.stats.occlusion.enabled,enabled);assert.equal(result.audit.ok,true);
 assert.ok(result.stats.drawCalls>10);assert.ok(result.stats.occlusion.regions.length<=40);
 const bytes=Buffer.from(result.image.split(',')[1],'base64');await fs.writeFile(path.join(out,`${name}.png`),bytes);
 const {image,...details}=result;report.frames.push({name,...details});return result;
}
async function cabinPair(name,camera='room',light='day',cut='stage'){
 phase=name;await page.evaluate(({camera,light,cut})=>{const a=window.__CABIN_AUDIT__;a.pause();a.camera(camera);a.settings({light,cut});},{camera,light,cut});
 const off=await cabinCapture(`${name}-off`,false),on=await cabinCapture(`${name}-on`,true);
 assert.deepEqual(off.stats.cameraPosition,on.stats.cameraPosition);assert.deepEqual(off.state,on.state);
 assert.equal(off.stats.drawCalls,on.stats.drawCalls);assert.equal(off.stats.triangles,on.stats.triangles);
 const diff=await difference(off.image,on.image);assert.ok(diff.changedPixels>100,`${name}: no visible AO difference`);
 report.pairs.push({name,...diff,extraDrawCalls:on.stats.drawCalls-off.stats.drawCalls});
}
async function mainStats(){return JSON.parse(await page.locator('#runtime-stats').textContent()).current;}
async function mainPair(name,view,time='白昼'){
 phase=name;const diag=page.locator('details.diagnostics');if(!await diag.evaluate(e=>e.open))await diag.locator('summary').click();
 await page.getByLabel('场景观察位置').selectOption(view);await page.locator('.scene-inspector').getByRole('button',{name:time,exact:true}).click();
 await page.waitForFunction(view=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.scenePreset===view,view);
 const captures=[];
 for(const enabled of [false,true]){
   if((await mainStats()).occlusion.enabled!==enabled)await page.locator('#toggle-ambient-occlusion').click();
   await page.waitForFunction(enabled=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.occlusion.enabled===enabled,enabled);
   await page.evaluate(()=>document.querySelector('.game-shell').classList.add('lighting-capture'));
   const buffer=await page.locator('.scene-host canvas').screenshot({animations:'disabled'});
   await page.evaluate(()=>document.querySelector('.game-shell').classList.remove('lighting-capture'));
   const stats=await mainStats();assert.equal(stats.shaderErrors,0);assert.ok(stats.occlusion.forestBakes>0);assert.deepEqual(stats.occlusion.canopyFields,[192,128]);
   const label=`${name}-${enabled?'on':'off'}`;await fs.writeFile(path.join(out,`${label}.png`),buffer);report.frames.push({name:label,stats});captures.push(`data:image/png;base64,${buffer.toString('base64')}`);
 }
 const diff=await difference(...captures);assert.ok(diff.changedPixels>100,`${name}: no visible AO difference`);report.pairs.push({name,...diff});
}
try{
 await ready();browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});report.browser=await browser.version();
 let context=await newPage({width:1440,height:960});
 phase='cabin load';await page.goto(`${origin}/sandbox/cabin-interior/`);await page.waitForFunction(()=>window.__VISUAL_READY__===true,null,{timeout:120000});
 await page.evaluate(()=>{window.__CABIN_AUDIT__.preset('full');window.__CABIN_AUDIT__.pause();});
 await cabinPair('cabin-room');await cabinPair('cabin-inside','inside');
 await page.evaluate(()=>window.__CABIN_AUDIT__.select('audit:table'));await cabinPair('cabin-table','detail');
 await cabinPair('cabin-evening','room','evening');await cabinPair('cabin-exterior','room','day','closed');
 phase='cut invariance';const closed=await page.evaluate(()=>window.__CABIN_AUDIT__.stats().occlusion.regions);
 await page.evaluate(()=>window.__CABIN_AUDIT__.settings({cut:'stage'}));assert.deepEqual(await page.evaluate(()=>window.__CABIN_AUDIT__.stats().occlusion.regions),closed);report.flows.push({name:'camera cut preserves physical occlusion regions',passed:true});
 phase='table move';await page.locator('[data-select="audit:table"]').click();const before=await cabinCapture('table-before',true);
 await page.locator('[data-action="move"]').click();await page.locator('[data-nudge="right"]').click();
 assert.equal(await page.locator('#place-confirm').isEnabled(),true,await page.locator('#placement-reason').innerText());await page.locator('#place-confirm').click();
 const after=await cabinCapture('table-moved',true);
 const region=(r,id)=>r.stats.occlusion.regions.find(v=>v.id===id);
 assert.notDeepEqual(region(before,'audit:table').center,region(after,'audit:table').center);
 assert.equal(after.stats.occlusion.regions.filter(v=>v.id==='audit:table').length,1);
 for(const id of ['lantern','bowl'])assert.deepEqual(after.state.items.find(i=>i.definitionId===id),before.state.items.find(i=>i.definitionId===id));
 await page.locator('[data-action="store"]').click();const stored=await cabinCapture('table-stored',true);
 assert.ok(!stored.stats.occlusion.regions.some(v=>/audit:(table|lantern|bowl)/.test(v.id)));
 for(const id of ['table','lantern','bowl'])await page.locator(`[data-restore="audit:${id}"]`).click();
 const restored=await cabinCapture('table-restored',true);assert.equal(restored.state.items.length,before.state.items.length);assert.equal(restored.stats.occlusion.regions.length,before.stats.occlusion.regions.length);
 report.flows.push({name:'move/store/restore host and dependents without stale or duplicate occluders',passed:true});
 const updates=restored.stats.occlusion.updates;await cabinCapture('same-state-no-rebuild',true);assert.equal((await page.evaluate(()=>window.__CABIN_AUDIT__.stats())).occlusion.updates,updates);
 await context.close();
 context=await newPage({width:390,height:844},true);phase='mobile cabin';await page.goto(`${origin}/sandbox/cabin-interior/`);await page.waitForFunction(()=>window.__VISUAL_READY__===true,null,{timeout:120000});await page.locator('[data-preset="full"]').tap();
 await cabinPair('mobile-cabin');await cabinPair('mobile-evening','room','evening');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await context.close();
 context=await newPage({width:1440,height:960});phase='main load';await page.goto(`${origin}/?inspect=1&hour=14`);await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#runtime-stats')?.textContent??'{}').current?.occlusion?.forestBakes>0;}catch{return false;}},null,{timeout:180000});
 await page.addStyleTag({content:'.game-shell.lighting-capture > :not(.scene-host){visibility:hidden!important}'});
 for(const [name,view,time] of [['camp','camp','白昼'],['work-area','woodcraft','白昼'],['forest','understory','白昼'],['distant','overview','白昼'],['camp-night','camp','夜晚']])await mainPair(name,view,time);
 report.flows.push({name:'main production scene, canopy textures and fixed-view AO toggle',passed:true});await context.close();
 assert.deepEqual(report.errors,[]);report.status='passed-automated';console.log('LIGHTING_BROWSER_PASS');
}catch(error){report.status='failed';report.failure={phase,message:String(error.stack??error)};if(page&&!page.isClosed()){report.body=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}console.error(error);process.exitCode=1;
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM');await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'preview.log'),serverLog);}
