/** Pointer-driven camp checks in one shared CDP browser. Screenshots stay outside the repository. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repoRoot=fileURLToPath(new URL('../../',import.meta.url)),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fingerprint(){
 const files=[];function walk(dir){for(const entry of fs.readdirSync(path.join(repoRoot,dir),{withFileTypes:true})){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(file);else files.push(file);}}
 walk('src');walk('public');files.push('package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html');files.sort();
 const records=files.map(file=>{const bytes=fs.readFileSync(path.join(repoRoot,file));return {file,bytes:bytes.length,sha256:sha(bytes)};});return {runtimeFingerprint:sha(JSON.stringify(records)),files:records};
}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
const out=process.env.EVIDENCE_DIR??'/tmp/how-camp-interactions';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CHROME_CDP_URL??'http://127.0.0.1:9333');
const context=browser.contexts()[0],page=context.pages()[0]??await context.newPage();
page.setDefaultTimeout(60000);
await page.mouse.up();
const report={origin,cdp:process.env.CHROME_CDP_URL??'http://127.0.0.1:9333',browser:await browser.version(),sourceRevision:process.env.SOURCE_REVISION??'working-tree',...fingerprint(),frames:[],flows:[],errors:[],failedRequests:[]};
function recordFlow(flow){report.flows.push(flow);report.result='running';fs.writeFileSync(out+'/camp-interactions.json',JSON.stringify(report,null,2));console.log('FLOW_PASS',flow.name);}
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))report.failedRequests.push({url:r.url(),error:r.failure()});});
const stats=async()=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const world=async()=>(await stats()).worldState;
const click=async locator=>locator.click({force:true});
const count=(state,id,quality)=>state.inventory.stacks.filter(s=>s.itemId===id&&(!quality||s.qualityId===quality)).reduce((n,s)=>n+s.quantity,0);
const waitState=async expression=>page.waitForFunction(expression);
await page.route('**/__qa-empty',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated camp fixture</title>'}));
if(process.env.QA_FONT_PATH)await page.route('**/__qa-font.ttf',route=>route.fulfill({contentType:'font/ttf',path:process.env.QA_FONT_PATH}));
async function loadFont(){if(process.env.QA_FONT_PATH){await page.addStyleTag({content:'@font-face {font-family:"Noto Sans SC";src:url("/__qa-font.ttf") format("truetype");font-weight:100 900;}'});await page.evaluate(()=>document.fonts.ready);}}
async function seed(kind='wood',viewport={width:1000,height:740}){
 await page.setViewportSize(viewport);await page.goto(origin+'/__qa-empty');
 await page.evaluate(async kind=>{
  const {createState}=await import('/src/domain/state.ts'),{createSaveContext}=await import('/src/domain/save-context.ts'),{serializeWorldSave}=await import('/src/domain/world-save.ts'),{inventoryTransaction}=await import('/src/domain/inventory.ts');
  const {WOODCRAFT}=await import('/src/content/woodcraft.ts'),{CABIN_REPAIR_STAND}=await import('/src/content/upgrades.ts'),{CAMP_PROPS}=await import('/src/content/scene-props.ts'),{SEAT_DEFINITION}=await import('/src/content/workshop.ts');
  const s=createState();s.player={...WOODCRAFT.stand,facing:0,moving:false};s.selected=WOODCRAFT.id;
  if(kind!=='empty')s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',futureBatch:{tag:'cedar'},delta:6},{itemId:'wood',qualityId:'fine',futureBatch:{tag:'maple'},delta:2},{itemId:'branch',qualityId:'ordinary',delta:8}]);
  s.inventory.instances=[{instanceId:'qa-camp-seat',definitionId:SEAT_DEFINITION,blueprintId:'blueprint.stump-cozy',createdAt:0,rarityId:'epic',traits:[{id:'comfort',value:2}],location:{kind:'inventory'}}];
  if(kind==='far'){s.player={x:-35,z:18,facing:0,moving:false};}
  if(kind==='rack')s.selected=CAMP_PROPS.logs.id;
  if(kind==='cabin'){s.player={x:CABIN_REPAIR_STAND.x,z:CABIN_REPAIR_STAND.z+3.2,facing:0,moving:false};s.selected='cabin';}
  const raw=await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:0});const {createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');const store=createBrowserWorldSaveStore();await store.compareAndSwap(await store.read(),{primary:raw,backup:raw});
 },kind);
 await page.goto(origin+'/?inspect=1');await click(page.getByRole('button',{name:'回到山谷',exact:true}));await loadFont();
 await waitState(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.gameTime>.1}catch{return false}});
 console.log('READY',kind,viewport.width);
}
async function project(point,preset='woodcraft'){
 return page.evaluate(async({point,preset})=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),{VIEWS}=await import('/src/content/scene-props.ts'),{heightAt}=await import('/src/world/surface.ts'),{makeTrees}=await import('/src/world/layout.ts');
  const v=VIEWS[preset],canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect(),target=new THREE.Vector3(...v.target),camera=new THREE.PerspectiveCamera(40,rect.width/rect.height,.1,1100);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(v.yaw)*Math.cos(v.elevation),Math.sin(v.elevation),Math.cos(v.yaw)*Math.cos(v.elevation)).multiplyScalar(v.distance));
  camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+3);
  for(const tree of makeTrees())if(Math.hypot(camera.position.x-tree.x,camera.position.z-tree.z)<3*tree.scale)camera.position.y=Math.max(camera.position.y,heightAt(tree.x,tree.z)+9*tree.scale);
  camera.zoom=v.zoom;camera.lookAt(target);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const p=new THREE.Vector3(point.x,point.y??heightAt(point.x,point.z),point.z).project(camera);
  return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
 },{point,preset});
}
async function drag(from,to,{touch=false,cancel=false}={}){
 const cdp=touch?await context.newCDPSession(page):null;
 if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,radiusX:1,radiusY:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x-18,y:from.y-18,radiusX:1,radiusY:1}]});}
 else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x-18,from.y-18);}
 await page.locator('.item-drag-ghost').waitFor();
 const target=typeof to==='function'?await to():to;
 if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...target,radiusX:1,radiusY:1}]});
 else await page.mouse.move(target.x,target.y,{steps:4});
 const feedback=await page.locator('.item-drag-ghost').innerText();
 if(cancel){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});else{await page.keyboard.press('Escape');await page.mouse.up();}}
 else if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 else await page.mouse.up();
 if(cdp)await cdp.detach();return feedback;
}
async function center(locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();assert.ok(b);return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function shot(name){await page.screenshot({path:out+'/'+name+'.png'});const s=await stats();assert.equal(s.shaderErrors,0);assert.equal(s.contextLost,false);report.frames.push({name,viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio),seed:s.seed,gameTime:s.gameTime,scenePreset:s.scenePreset,renderer:s.graphicsBackend,drawCalls:s.drawCalls,triangles:s.triangles,gpu:s.gpu,resources:s.resources});console.log('SHOT',name);}
async function campShot(name){
 await page.locator('details.diagnostics').evaluate(e=>e.open=true);await page.getByLabel('场景观察位置').selectOption('camp');await click(page.getByRole('button',{name:'白昼',exact:true}));
 await waitState(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.scenePreset==='camp'}catch{return false}});await page.locator('details.diagnostics').evaluate(e=>e.open=false);await shot(name);
 await page.locator('details.diagnostics').evaluate(e=>e.open=true);await click(page.getByRole('button',{name:'结束场景检视',exact:true}));await page.locator('details.diagnostics').evaluate(e=>e.open=false);
}
async function focusWood(){await click(page.getByRole('button',{name:'看向木料堆',exact:true}));await waitState(()=>{try{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.physics.loaded&&s.scenePreset==='woodcraft'}catch{return false}});}
try{
 await seed();await click(page.getByRole('button',{name:'打开仓库',exact:true}));await focusWood();
 console.log('FOCUSED_WOOD');const before=await world();assert.equal(before.woodcraft.pieces.length,0,'opening storage must not transfer any material');
 const fineCard=page.getByRole('button',{name:'原木 · 精品 2 份',exact:true});const destination=await project({x:-29,z:7});
 console.log('DRAG_DESTINATION',destination);const accepted=await drag(await center(fineCard),destination);console.log('DROP_FEEDBACK',accepted);assert.match(accepted,/放下/);
 await waitState(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.woodcraft.pieces[0]?.phase==='loose'}catch{return false}});
 const dropped=await world();assert.equal(count(dropped,'wood','fine'),1);assert.equal(count(dropped,'wood','ordinary'),6);assert.equal(dropped.woodcraft.pieces.length,1);assert.equal(dropped.woodcraft.pieces[0].source.futureBatch.tag,'maple');assert.equal(dropped.time,before.time);
 await shot('desktop-drag-wood-out');
 const ordinary=page.getByRole('button',{name:'原木 · 普通 6 份',exact:true});await drag(await center(ordinary),destination,{cancel:true});assert.deepEqual((await world()).inventory,dropped.inventory);assert.equal((await world()).woodcraft.pieces.length,1);
 const piece=(await world()).woodcraft.pieces[0],piecePoint=await project(piece.position);
 const returned=await drag(piecePoint,()=>center(page.locator('.warehouse-dock')));assert.match(returned,/收回/);
 await waitState(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.woodcraft.pieces.length===0}catch{return false}});
 const restoredInventory=(await world()).inventory;assert.equal(count(await world(),'wood','fine'),2);assert.deepEqual(restoredInventory.stacks,before.inventory.stacks);assert.deepEqual(restoredInventory.instances,before.inventory.instances);assert.equal(restoredInventory.revision,before.inventory.revision+2);
 recordFlow({name:'desktop pointer transfer',openingNoTransfer:true,exactBatch:true,cancelNoDebit:true,worldToWarehouse:true,clockFrozenWoodSettles:true});console.log('DESKTOP_DRAG_PASS');
 await click(page.getByRole('button',{name:'家具',exact:true}));const furnitureTarget=await project({x:-35,z:8});
 const furnitureFeedback=await drag(await center(page.getByRole('button',{name:'拖动暖木墩',exact:true})),furnitureTarget);assert.match(furnitureFeedback,/摆在这里/);
 let owned=(await world()).inventory.instances.find(i=>i.instanceId==='qa-camp-seat');assert.equal(owned.location.kind,'world');assert.equal(owned.rarityId,'epic');
 const furniturePoint=await project({x:owned.location.x,z:owned.location.z,y:22.05});await drag(furniturePoint,()=>center(page.locator('.warehouse-dock')));
 owned=(await world()).inventory.instances.find(i=>i.instanceId==='qa-camp-seat');assert.equal(owned.location.kind,'inventory');assert.deepEqual(owned,before.inventory.instances[0]);recordFlow({name:'furniture pointer transfer',placedAndReturned:true,identityTraitsRarityRetained:true});
 await click(page.getByRole('button',{name:'全部材料',exact:true}));
 await click(page.getByRole('button',{name:'关闭仓库',exact:true}));await click(page.getByRole('button',{name:'拿一根 · 点击投放',exact:true}));await page.keyboard.press('b');await page.getByRole('dialog',{name:'仓库',exact:true}).waitFor();
 await page.locator('.wood-drop-panel').waitFor({state:'hidden'});
 await drag(await center(page.getByRole('button',{name:'原木 · 普通 6 份',exact:true})),destination,{cancel:true});
 await click(page.getByRole('button',{name:'关闭仓库',exact:true}));await page.getByRole('dialog',{name:'仓库',exact:true}).waitFor({state:'hidden'});
 const walkPoint=await project({x:-35,z:9}),walkBefore=(await world()).player;await page.mouse.click(walkPoint.x,walkPoint.y);
 await page.waitForFunction(p=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.routeNodes>0||Math.hypot(s.player.x-p.x,s.player.z-p.z)>.1},walkBefore);
 assert.equal((await world()).woodcraft.pieces.length,0);recordFlow({name:'click-drop to warehouse and cancel',staleModeCleared:true,nextClickWorks:true,groundWalkingRestored:true});
 await click(page.getByRole('button',{name:'打开仓库',exact:true}));
 await click(page.getByRole('button',{name:'图纸',exact:true}));assert.ok(await page.getByRole('button',{name:'查看木屋修缮',exact:true}).count());await shot('desktop-blueprints');
 // Distant targets expose walking first, independent of the contents of the warehouse.
 await seed('far');const far=page.getByRole('button',{name:'走近木料堆',exact:true});assert.equal(await far.isDisabled(),false);assert.equal(await page.getByRole('button',{name:'拿一根 · 点击投放',exact:true}).count(),0);await shot('desktop-remote-wood');await click(far);
 await page.getByRole('button',{name:'打开仓库 · 拖拽取放',exact:true}).waitFor();assert.equal((await world()).woodcraft.pieces.length,0);
 recordFlow({name:'remote wood',walkOnly:true,arrived:true,noAutomaticTransfer:true});
 await seed('empty');await click(page.getByRole('button',{name:'打开仓库',exact:true}));await focusWood();await click(page.getByRole('button',{name:'关闭仓库',exact:true}));assert.equal(await page.getByRole('button',{name:'拿一根 · 点击投放',exact:true}).isDisabled(),true);
 recordFlow({name:'near empty',takeDisabled:true});
 await seed('rack');const rack=page.getByRole('button',{name:'走近原木架',exact:true});assert.equal(await rack.isDisabled(),false);await click(rack);await page.getByRole('button',{name:'前往木料堆取放',exact:true}).waitFor();recordFlow({name:'large log rack',walkThenOperate:true});
 await seed('cabin');await click(page.getByRole('button',{name:'打开仓库',exact:true}));await click(page.getByRole('button',{name:'图纸',exact:true}));await click(page.getByRole('button',{name:'查看木屋修缮',exact:true}));
 await click(page.getByRole('button',{name:'走近旧木屋',exact:true}));await page.getByRole('button',{name:'开始修缮',exact:true}).waitFor();
 const unrepaired=await world();assert.equal(await page.getByRole('button',{name:'开始修缮',exact:true}).isDisabled(),false);await campShot('cabin-before-repair');await click(page.getByRole('button',{name:'开始修缮',exact:true}));
 await waitState(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.workshop.upgrades?.cabin?.level===1}catch{return false}});
 const repaired=await world();assert.equal(count(unrepaired,'wood')-count(repaired,'wood'),2);assert.equal(count(unrepaired,'branch')-count(repaired,'branch'),3);assert.equal(repaired.workshop.upgrades.cabin.investments.reduce((n,s)=>n+s.quantity,0),5);assert.equal(repaired.workshop.job,null);await campShot('cabin-after-repair');
 await click(page.getByRole('button',{name:'暂停',exact:true}));await click(page.getByRole('button',{name:'保存世界',exact:true}));
 await waitState(()=>document.body.innerText.includes('已保存'));const paid=repaired.workshop.upgrades.cabin;await page.reload();await click(page.getByRole('button',{name:'回到山谷',exact:true}));await loadFont();
 assert.deepEqual((await world()).workshop.upgrades.cabin,paid);assert.equal(count(await world(),'wood'),count(repaired,'wood'));assert.equal(count(await world(),'branch'),count(repaired,'branch'));
 recordFlow({name:'house blueprint repair',knownBlueprint:true,walkThenRepair:true,paidOnce:true,visibleStage:1,saveRestored:true});console.log('REPAIR_PASS');
 await seed('wood',{width:390,height:844});await click(page.getByRole('button',{name:'打开仓库',exact:true}));await focusWood();
 const mobileBefore=await world(),mobilePoint=await project({x:-29,z:7});
 await drag(await center(page.getByRole('button',{name:'原木 · 精品 2 份',exact:true})),mobilePoint,{touch:true});
 await waitState(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.woodcraft.pieces[0]?.phase==='loose'}catch{return false}});
 assert.equal(count(await world(),'wood','fine'),count(mobileBefore,'wood','fine')-1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await shot('mobile-touch-transfer');
 await click(page.getByRole('button',{name:'图纸',exact:true}));await shot('mobile-blueprints');recordFlow({name:'mobile touch',pointerType:'touch',outbound:true,noHorizontalOverflow:true});
 assert.equal(fingerprint().runtimeFingerprint,report.runtimeFingerprint,'runtime source changed during the browser journey');assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.result='passed';console.log('CAMP_INTERACTIONS_PASS');
}catch(error){report.result='failed';report.failure=String(error.stack??error);report.lastState=await stats().catch(()=>null);report.lastBody=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}
finally{fs.writeFileSync(out+'/camp-interactions.json',JSON.stringify(report,null,2));await browser.close();}
