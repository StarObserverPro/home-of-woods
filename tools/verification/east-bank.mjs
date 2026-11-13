// Connect every flow to one existing WebGL browser. Captures stay outside the repository.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5187';
const baseline=process.env.BASELINE_ORIGIN;
const out=process.env.EVIDENCE_DIR??'/tmp/how-east-evidence';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.connectOverCDP(process.env.CHROME_CDP_URL??'http://127.0.0.1:9333');
const report={sourceRevision:process.env.SOURCE_REVISION??'working-tree',advancement:'DEV inspection uses the existing fixed-step owner for the loaded return trip',origin,browser:browser.version(),flows:[],frames:[],errors:[],failedRequests:[]};
const flow=process.env.TEST_FLOW??'all';
let context,page;
const stats=async()=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const world=async()=>(await stats()).worldState;
async function waitFor(predicate,timeout=90000){
  const timer=setInterval(async()=>{try{const s=await stats();console.log('PROGRESS',JSON.stringify({player:s.player,route:s.routeNodes,message:documentMessage(s),speed:s.carrying?.speed,time:s.gameTime,loop:s.loop,save:s.save?.state}));}catch{}},20000);
  try{await page.waitForFunction(predicate,undefined,{timeout});}catch(error){const s=await stats();console.log('WAIT_FAILED',JSON.stringify({player:s.player,route:s.routeNodes,message:documentMessage(s),speed:s.carrying?.speed,world:s.worldState?.route,loop:s.loop,save:s.save}));throw error;}finally{clearInterval(timer);}
}
function documentMessage(s){return s.worldState?.selected??null;}
async function drive(predicate,maxSteps=120){
  for(let i=0;i<maxSteps;i++){
    if(await page.evaluate(predicate))return;
    await page.evaluate(()=>window.__HOW_ADVANCE_SIMULATION__(2));
    if(i%10===0){const s=await stats();console.log('FIXED_STEP',i,s.player,s.routeNodes,s.carrying.speed);}
  }
  throw new Error('Fixed-step journey did not reach its target');
}
async function fresh(kind,viewport={width:1280,height:800},url=origin){
  if(context)await context.close();context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:viewport.width<500});page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});
  page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))report.failedRequests.push(r.url())});
  await page.route('**/__east-fixture',r=>r.fulfill({body:'<!doctype html><title>East bank fixture</title>',contentType:'text/html'}));
  if(kind!=='camp'){
    await page.goto(url+'/__east-fixture',{waitUntil:'domcontentloaded'});
    await page.evaluate(async kind=>{
      const {createStarterState}=await import('/src/domain/state.ts'),{createSaveContext}=await import('/src/domain/save-context.ts'),{serializeWorldSave}=await import('/src/domain/world-save.ts'),{createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');
      const {inventoryTransaction}=await import('/src/domain/inventory.ts'),{CREEK_BRIDGE}=await import('/src/content/regions.ts'),{beginUpgrade}=await import('/src/domain/upgrades.ts'),{advanceWorkshop}=await import('/src/domain/workshop.ts');
      const s=createStarterState();s.clock.speed=12;s.player={...CREEK_BRIDGE.stand,facing:0,moving:false};s.selected=CREEK_BRIDGE.id;
      s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',delta:4},{itemId:'branch',qualityId:'ordinary',delta:3}]);
      if(kind!=='bridge'){
        beginUpgrade(s,CREEK_BRIDGE.id);s.time=6;advanceWorkshop(s);
        const {makeTrees,makeColliders}=await import('/src/world/layout.ts'),{canStand}=await import('/src/domain/navigation.ts'),{travelAccess}=await import('/src/world/regions.ts');const trees=makeTrees(),colliders=makeColliders(trees);
        if(kind==='gather'){
          const {createGatheringRegistry}=await import('/src/domain/gathering-registry.ts'),{RUNTIME_MODELS}=await import('/src/content/assets.ts'),{interactionRoute}=await import('/src/domain/gathering.ts');
          const registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(a=>a.assetId)}),source=[...registry.sources.values()].find(source=>source.region==='east-woodland'&&source.definitionId==='forage.mushroom-cluster');
          const route=interactionRoute(s,source,registry,colliders);if(!route.reachable)throw Error('Eastern source unreachable');Object.assign(s.player,route.route.at(-1));s.selected=source.sourceId;
        }else if(kind==='felling'){
          const {chopRange,startChop}=await import('/src/domain/forestry.ts'),tree=trees.find(t=>t.id==='tree-slot-18-20');
          for(let i=0;i<48;i++){const r=chopRange(tree)-.08,p={x:tree.x+Math.cos(i*Math.PI/24)*r,z:tree.z+Math.sin(i*Math.PI/24)*r};
            if(!canStand(p,colliders,undefined,travelAccess(s)))continue;const trial=structuredClone(s);trial.player={...p,facing:0,moving:false};trial.selected=tree.id;if(!startChop(trial,tree,colliders).ok)continue;s.player=trial.player;s.selected=tree.id;break;
          }
        }
      }
      const raw=await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:0}),store=createBrowserWorldSaveStore();await store.compareAndSwap(await store.read(),{primary:raw,backup:raw});
    },kind);
  }
  await page.goto(url+'/?inspect=1',{waitUntil:'domcontentloaded'});
  await page.locator('.loading').waitFor({state:'hidden'});
  const resume=page.getByRole('button',{name:'回到山谷',exact:true});if(await resume.count())await resume.click();
  await waitFor(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.loop.running}catch{return false}});
  await page.evaluate(()=>document.fonts.ready);
  console.log('READY',kind,viewport.width);
}
async function shot(name){
  await page.locator('.diagnostics').evaluate(e=>e.style.visibility='hidden');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const cdp=await context.newCDPSession(page),capture=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(capture.data,'base64'));await cdp.detach();await page.locator('.diagnostics').evaluate(e=>e.style.visibility='');
  const s=await stats();report.frames.push({name,viewport:page.viewportSize(),dpr:1,seed:s.seed,time:s.gameTime,player:s.player,renderer:s.graphicsBackend,camera:{yaw:s.yaw,elevation:s.elevation,zoom:s.zoom},drawCalls:s.drawCalls,triangles:s.triangles,gpu:s.gpu,streaming:s.streaming,shaderErrors:s.shaderErrors});
  console.log('FRAME',name,s.streaming??'',s.drawCalls,s.triangles);
}
try{
  if(flow==='all'||flow==='travel'){
  if(baseline){await fresh('camp',{width:1280,height:800},baseline);await shot('baseline-camp');}
  await fresh('camp');await shot('expanded-camp');
  await fresh('bridge');assert.equal((await world()).workshop.upgrades['creek-bridge'],undefined);
  await shot('desktop-bridge-unbuilt');await page.getByRole('button',{name:'修建木桥',exact:true}).click();
  await waitFor(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.workshop.upgrades['creek-bridge']?.level===1);
  assert.equal((await world()).inventory.stacks.length,0);await shot('desktop-bridge-built');report.flows.push('actual blueprint construction debits 4 logs and 3 branches, then enables crossing');
  await page.getByRole('button',{name:'关闭目标详情',exact:true}).click();await page.getByRole('button',{name:'路线',exact:true}).click();
  const routes=page.locator('.route-sheet');await routes.getByRole('button',{name:'风景',exact:true}).click();await routes.getByRole('button',{name:'溪流东岸林',exact:true}).click();await routes.getByRole('button',{name:'前往',exact:true}).click();
  await waitFor(()=>{const p=JSON.parse(document.querySelector('#runtime-stats').textContent).current.player;return p.x>20&&p.x<36;});await shot('desktop-on-bridge');
  await waitFor(()=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.player.x>44&&s.routeNodes===0;});
  assert.ok((await world()).visited.includes('east-bank'));await shot('desktop-east-bank');report.flows.push('scene UI navigation walks across the constructed deck, loads eastern chunks and discovers the east bank');
  await fresh('gather');await page.getByRole('button',{name:'采集',exact:true}).click();
  await waitFor(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.gathering.action?.phase==='completed');
  assert.equal((await stats()).carrying.items.find(s=>s.name.includes('蘑菇'))?.quantity,2);await shot('desktop-east-gathered');report.flows.push('eastern mushrooms collect through the live action and carried inventory');
  }
  if(flow==='all'||flow==='haul'||flow==='haul-mobile'){
  await fresh('felling');await page.getByRole('button',{name:'砍树',exact:true}).click();
  await waitFor(()=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState;return !s.forestry.active&&s.forestry.slots['tree-slot-18-20'].status==='stump';});
  const yieldCount=(await world()).inventory.stacks.filter(s=>s.harvest).reduce((n,s)=>n+s.quantity,0);assert.ok(yieldCount>1);
  await page.getByRole('button',{name:'打开仓库',exact:true}).click();const carrying=page.locator('.carrying-panel');await carrying.getByRole('button',{name:'地上材料',exact:true}).click();
  await carrying.getByLabel('搬运数量',{exact:true}).selectOption('1');await carrying.getByRole('group',{name:'地上材料图标',exact:true}).getByRole('button',{name:/^原木，/}).click();
  await carrying.getByRole('button',{name:'拿起所选数量',exact:true}).click();assert.equal((await stats()).carrying.weight,30);await shot('desktop-east-carrying');
  await page.setViewportSize({width:640,height:480});
  await carrying.getByRole('button',{name:'走近仓库',exact:true}).click();console.log('HAULING_HOME');
  await drive(()=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.player.x>13&&s.player.x<35&&Math.abs(s.player.z-38)<2.5;});await shot('desktop-hauling-over-bridge');
  await drive(()=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.carrying.storageNear&&s.routeNodes===0;});
  await page.setViewportSize({width:1280,height:800});
  await page.locator('.target-card').getByRole('button',{name:'打开仓库',exact:true}).click();await carrying.getByRole('button',{name:'全部存入',exact:true}).click();
  const after=await world();assert.equal(after.inventory.stacks.filter(s=>s.harvest).reduce((n,s)=>n+s.quantity,0),yieldCount-1);assert.equal((await stats()).carrying.items.length,0);
  await shot('desktop-home-partial-delivery');report.flows.push('live eastern felling, one-log pickup, slowed physical haul across the bridge, and partial camp delivery preserve the remaining eastern batch');
  await page.getByRole('button',{name:'关闭仓库',exact:true}).click();await waitFor(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.save.state==='saved');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('.loading').waitFor({state:'hidden'});await page.getByRole('button',{name:'回到山谷',exact:true}).click();
  const restored=await world();assert.equal(restored.inventory.stacks.filter(s=>s.harvest).reduce((n,s)=>n+s.quantity,0),yieldCount-1);assert.equal(restored.workshop.upgrades['creek-bridge'].level,1);report.flows.push('browser refresh restores bridge construction and undelivered eastern timber');
  }
  if(flow==='all'||flow==='mobile'||flow==='haul-mobile'){
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    await fresh('bridge',viewport);const button=page.getByRole('button',{name:'修建木桥',exact:true}),bounds=await button.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.height>=44);
    assert.ok(await button.isEnabled());await shot('mobile-'+viewport.width+'-bridge-unbuilt');await button.click();
    await waitFor(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.workshop.upgrades['creek-bridge']?.level===1);await shot('mobile-'+viewport.width+'-bridge-built');
  }
  report.flows.push('390×844 touch and 844×390 landscape layouts expose the same construction action with a 44px target');
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.result='passed';
}catch(error){
  report.result='failed';report.failure=String(error);report.stack=error.stack;
  if(page){
    try{report.failureState=JSON.parse(await page.locator('#runtime-stats').textContent({timeout:5000})).current;}catch{}
    try{report.failureUi=await page.locator('.target-card, .route-sheet, .warehouse-dialog, .loading').allTextContents();}catch{}
    try{await page.screenshot({path:out+'/failure.png',timeout:10000});}catch(captureError){report.screenshotError=String(captureError);}
  }
  throw error;
}finally{
  if(page)try{const s=await stats();report.lastState={player:s.player,route:s.worldState?.route,selected:s.worldState?.selected,inventory:s.worldState?.inventory,streaming:s.streaming,loop:s.loop};}catch{}
  fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log('REPORT',JSON.stringify({flows:report.flows,errors:report.errors,failedRequests:report.failedRequests,frames:report.frames.length}));if(context)await context.close();await browser.close();
}
