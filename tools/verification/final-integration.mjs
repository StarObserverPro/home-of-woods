/** Isolated current-format fixture; DOM UI handlers avoid software-WebGL actionability stalls. Not a pointer-performance benchmark. */
import fs from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=process.env.EVIDENCE_DIR??'/tmp/how-final-integration',origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5174';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={browser:await browser.version(),frames:[],errors:[],rejectedRequests:[],flows:[]};
let currentPage;
const stats=async p=>JSON.parse(await p.locator('#runtime-stats').textContent()).current;
async function seed(p){
 await p.goto(`${origin}/tools/fixtures/rarity-vfx-r3-depth.html`);
 await p.evaluate(async()=>{
  const {createState}=await import('/src/domain/state.ts'),{createSaveContext}=await import('/src/domain/save-context.ts'),{serializeWorldSave}=await import('/src/domain/world-save.ts');
  const {inventoryTransaction}=await import('/src/domain/inventory.ts'),{WOODCRAFT}=await import('/src/content/woodcraft.ts'),{BLUEPRINTS,SEAT_DEFINITION}=await import('/src/content/workshop.ts');
  const s=createState();s.player={...WOODCRAFT.stand,facing:0,moving:false};
  s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',futureBatch:{tag:'fern'},delta:6},{itemId:'branch',qualityId:'ordinary',delta:2}]);
  s.inventory.instances=['epic','legendary'].map((rarityId,i)=>({instanceId:'final-'+rarityId,definitionId:SEAT_DEFINITION,blueprintId:BLUEPRINTS[0].id,createdAt:0,rarityId,traits:[{id:'comfort',value:2}],futureFinish:{retained:true},location:{kind:'world',x:-40+i*2,z:15,rotation:0}}));
  const raw=await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:0});const {createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');const store=createBrowserWorldSaveStore();await store.compareAndSwap(await store.read(),{primary:raw,backup:raw});
 });
 console.log('SEEDED');await p.goto(`${origin}/?inspect=1`);console.log('APP_LOADED');await p.getByRole('button',{name:'回到山谷',exact:true}).evaluate(e=>e.click());
 await p.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.gameTime>1;}catch{return false;}});
}
async function capture(p,preset,name){
 await p.locator('details.diagnostics').evaluate(e=>e.open=true);
 await p.getByLabel('场景观察位置').selectOption(preset);
 await p.waitForFunction(preset=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.scenePreset===preset;}catch{return false;}},preset);
 let image,record;
 await p.route('**/__scene-capture',async route=>{const payload=route.request().postDataJSON();image=payload.image;record=payload.stats;await route.fulfill({status:200,body:'OK'});});
 await p.getByRole('button',{name:'保存场景画面'}).evaluate(b=>b.click());
 for(let i=0;i<30&&!image;i++)await p.waitForTimeout(100);
 assert.ok(image);fs.writeFileSync(`${out}/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
 await p.unroute('**/__scene-capture');assert.equal(record.shaderErrors,0);
 const id=preset==='goatVista'?'wildlife.goat':preset==='stagVista'?'wildlife.stag':null;
 if(id)assert.ok(record.wildlife.observed.some(s=>s.includes('inspect:'+id)),name);
 report.frames.push({name,shaderErrors:record.shaderErrors,available:record.wildlife.available,observed:record.wildlife.observed,active:record.wildlife.active,rarityMode:record.rarityVfx?.mode});console.log('CAPTURE',name);
}
try{
 for(const viewport of [{width:900,height:650},{width:390,height:844}]){
  const ctx=await browser.newContext({viewport});const p=await ctx.newPage();currentPage=p;p.setDefaultTimeout(60000);p.on('pageerror',e=>report.errors.push(String(e)));p.on('request',r=>{if(r.url().endsWith('/wildlife/goat.glb'))report.rejectedRequests.push(r.url());});
  await seed(p);const initial=await stats(p);assert.deepEqual(initial.wildlife.available.sort(),['wildlife.goat','wildlife.hare','wildlife.squirrel','wildlife.stag']);
  assert.equal(initial.wildlifeState.encounters.filter(e=>e.definitionId==='wildlife.hare'||e.definitionId==='wildlife.squirrel').length,2);console.log('NATURAL_SMALL_ANIMALS',viewport.width);await p.locator('details.diagnostics').evaluate(e=>e.open=false);
  if(viewport.width>600){
   await p.getByRole('button',{name:'打开仓库'}).evaluate(e=>e.click());await p.getByRole('button',{name:'去木料堆',exact:true}).evaluate(e=>e.click());console.log('WOODCRAFT_OPEN');
   await p.waitForFunction(()=>{try{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.worldState.woodcraft.pieces.length===7&&s.worldState.woodcraft.pieces.every(p=>p.phase==='loose');}catch{return false;}});
   console.log('WOODCRAFT_PREPARED');const prepared=await stats(p);assert.equal(prepared.worldState.inventory.stacks.reduce((n,s)=>n+s.quantity,0),1);
   await p.getByRole('button',{name:'拿一根 · 点击投放',exact:true}).evaluate(e=>e.click());await p.getByRole('button',{name:'取消投放',exact:true}).evaluate(e=>e.click());
   await p.getByRole('button',{name:'暂停',exact:true}).evaluate(e=>e.click());const frozen=await stats(p);await p.waitForTimeout(500);assert.deepEqual((await stats(p)).worldState,frozen.worldState);
   await p.getByRole('button',{name:'保存世界',exact:true}).evaluate(e=>e.click());await p.waitForTimeout(400);
   const saved=await p.evaluate(async()=>{const {createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');return JSON.parse((await createBrowserWorldSaveStore().read()).primary);});
   assert.equal('wildlife' in saved.world,false);assert.equal(saved.world.inventory.schemaVersion,4);assert.equal(saved.rulesetVersion,5);assert.equal(saved.world.woodcraft.pieces.length,7);
   assert.deepEqual(saved.world.inventory.instances.map(i=>i.rarityId).sort(),['epic','legendary']);assert.ok(saved.world.inventory.instances.every(i=>i.futureFinish.retained));
   await p.reload();await p.getByRole('button',{name:'回到山谷',exact:true}).evaluate(e=>e.click());
   await p.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.woodcraft.pieces.length===7;}catch{return false;}});
   report.flows.push({woodcraftLeaveOne:true,cancelUncharged:true,pauseStable:true,saveRestored:true,optionalPropertiesRetained:true});console.log('INTEGRATED_PHYSICS_SAVE_PASS');
  }
  await capture(p,'wildlife',`${viewport.width}-small-animals`);
  await capture(p,'stagVista',`${viewport.width}-stag`);
  await capture(p,'goatVista',`${viewport.width}-mountain-goat`);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.rejectedRequests,[]);report.result='passed';console.log('FINAL_BROWSER_PASS');
}catch(e){if(currentPage){report.lastState=await stats(currentPage).catch(()=>null);report.lastBody=await currentPage.locator('body').innerText().catch(()=>null);}report.result='failed';report.failure=String(e.stack??e);throw e;}
finally{fs.writeFileSync(out+'/integration-browser.json',JSON.stringify(report,null,2));await browser.close();}
