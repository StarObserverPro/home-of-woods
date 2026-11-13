/** In-repository browser review of production factories, not illustrative mockups. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
const origin=process.env.WOOD_REVIEW_ORIGIN??'http://127.0.0.1:4182';
const out=process.env.WOOD_EVIDENCE_DIR??'/tmp/how-wood-tone-evidence';
await fs.mkdir(out,{recursive:true});
const server=process.env.WOOD_REVIEW_ORIGIN?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4182','--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';
for(const stream of [server?.stdout,server?.stderr])stream?.on('data',b=>serverLog=(serverLog+b).slice(-60000));
async function ready(){for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)return;}catch{}if(server?.exitCode!=null)throw Error(serverLog);await new Promise(r=>setTimeout(r,200));}throw Error('Wood review server unavailable');}
await ready();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),frames:[],errors:[],warnings:[],checks:[],limits:['Software WebGL and mobile viewport simulation; not physical GPU profiling.']};
async function frame(page,name){
 const result=await page.evaluate(()=>{const a=window.__CABIN_AUDIT__;a.pause();return {image:a.capture(),stats:a.stats(),audit:a.audit()};});
 assert.ok(result.audit.ok);await fs.writeFile(`${out}/${name}.png`,Buffer.from(result.image.split(',')[1],'base64'));report.frames.push({name,stats:result.stats});return result;
}
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning')report.warnings.push(m.text());});
  await page.goto(`${origin}/sandbox/cabin-interior/`);await page.waitForFunction(()=>window.__VISUAL_READY__===true,null,{timeout:120000});
  await page.evaluate(()=>{const a=window.__CABIN_AUDIT__;a.preset('full');a.pause();a.camera('room');a.settings({light:'day',cut:'stage'});});
  const day=await frame(page,mobile?'mobile-day':'cabin-day');
  await page.evaluate(()=>window.__CABIN_AUDIT__.settings({light:'evening'}));await frame(page,mobile?'mobile-evening':'cabin-evening');
  if(!mobile){
   await page.evaluate(()=>{const a=window.__CABIN_AUDIT__;a.settings({light:'day'});a.select('audit:table');a.camera('detail');});await frame(page,'cabin-table');
   await page.evaluate(()=>window.__CABIN_AUDIT__.camera('room'));const one=await frame(page,'reload-before');
   await page.reload();await page.waitForFunction(()=>window.__VISUAL_READY__===true,null,{timeout:120000});
   await page.evaluate(()=>{const a=window.__CABIN_AUDIT__;a.pause();a.camera('room');a.settings({light:'day',cut:'stage'});});const two=await frame(page,'reload-after');
   assert.deepEqual(one.stats.assets,two.stats.assets);assert.equal(one.stats.drawCalls,two.stats.drawCalls);
   report.checks.push('Reload preserves furniture assets and draw counts; deterministic color attributes unit-tested.');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await context.close();
 }
 // Actual main scene, using its existing diagnostic view controls.
 {
  const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(`${origin}/?inspect=1&hour=14`);
  await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#runtime-stats')?.textContent??'{}').current?.occlusion?.forestBakes>0;}catch{return false;}},null,{timeout:180000});
  const diagnostics=page.locator('details.diagnostics');if(!await diagnostics.evaluate(e=>e.open))await diagnostics.locator('summary').click();
  await page.addStyleTag({content:'.game-shell.wood-capture > :not(.scene-host){visibility:hidden!important}'});
  for(const [name,view] of [['camp-stock','camp'],['work-zone','woodcraft']]){
   await page.getByLabel('场景观察位置').selectOption(view);
   await page.locator('.scene-inspector').getByRole('button',{name:'白昼',exact:true}).click();
   await page.waitForFunction(view=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.scenePreset===view,view);
   const stats=await page.evaluate(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current);assert.equal(stats.shaderErrors,0);
   await page.evaluate(()=>document.querySelector('.game-shell').classList.add('wood-capture'));
   await page.screenshot({path:`${out}/${name}.png`,clip:{x:0,y:0,width:960,height:640},animations:'disabled',timeout:90000});
   await page.evaluate(()=>document.querySelector('.game-shell').classList.remove('wood-capture'));report.frames.push({name,stats});
  }
  await page.close();
 }
 // Small neutral-lit sample uses exactly the runtime wood grain / scrap factories.
 const page=await browser.newPage({viewport:{width:1200,height:700},deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto(`${origin}/sandbox/cabin-interior/`);await page.waitForFunction(()=>window.__VISUAL_READY__===true,null,{timeout:120000});
 const sample=await page.evaluate(async()=>{
  window.__CABIN_AUDIT__.pause();
  const {THREE,Resources,WOOD_TONES,woodCoordinates,woodMaterial,scrapGeometry,scrapMaterial,createAmbientOcclusion}=await import('/tools/verification/wood-tone-fixture.ts');
  const r=new Resources(),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,700);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#c9c8b9');scene.add(new THREE.HemisphereLight('#fff6e5','#727f73',2.0));
  const sun=new THREE.DirectionalLight('#ffefd7',2.4);sun.position.set(-4,8,5);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(36,1200/700,.1,100);camera.position.set(8,10,14);camera.lookAt(0,0,0);
  const floor=new THREE.Mesh(r.own(new THREE.PlaneGeometry(22,13)),r.material('#a8b1a0',1));floor.rotation.x=-Math.PI/2;floor.position.y=-.03;scene.add(floor);
  const tones=['light','warm','neutral','dark','scrap'];
  for(const [col,tone] of tones.entries())for(let row=0;row<4;row++){
   const x=(col-2)*2.6,z=(row-1.5)*1.1;
   const g=r.own(tone==='scrap'?scrapGeometry(`sample:${row}`):woodCoordinates(new THREE.BoxGeometry(2.05,.18,.74),'board','x',`sample:${row}`));
   const m=tone==='scrap'?scrapMaterial(r):woodMaterial(r,WOOD_TONES[tone].face);
   const mesh=new THREE.Mesh(g,m);if(tone==='scrap')mesh.rotation.z=Math.PI/2;
   mesh.position.set(x,.2,z);scene.add(mesh);
  }
  for(let i=0;i<5;i++){
   const tones=WOOD_TONES.neutral;
   const g=r.own(woodCoordinates(new THREE.CylinderGeometry(.27,.30,1.9,9),'raw','y',`log:${i}`));
   const log=new THREE.Mesh(g,[woodMaterial(r,tones.bark),woodMaterial(r,tones.end),woodMaterial(r,tones.end)]);
   log.rotation.z=Math.PI/2;log.position.set((i-2)*2.6,.34,3.3);scene.add(log);
  }
  const ao=createAmbientOcclusion(r);ao.bind(scene);renderer.render(scene,camera);
  const image=renderer.domElement.toDataURL();const stats={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,materials:r.stats(),tones};
  ao.dispose();r.dispose();renderer.dispose();return {image,stats};
 });
 await fs.writeFile(`${out}/wood-tones.png`,Buffer.from(sample.image.split(',')[1],'base64'));report.frames.push({name:'wood-tones',stats:sample.stats});
 assert.deepEqual(report.errors,[]);report.status='passed';console.log(JSON.stringify({status:report.status,frames:report.frames.map(f=>f.name),warnings:report.warnings}));
}catch(error){report.status='failed';report.failure=String(error.stack??error);console.error(error);process.exitCode=1;}
finally{await browser.close();server?.kill('SIGTERM');await fs.writeFile(`${out}/server.log`,serverLog);await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));}
