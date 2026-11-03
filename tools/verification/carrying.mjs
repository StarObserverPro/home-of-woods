/** Browser-level carrying checks. Install Playwright outside the runtime dependency tree. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5173';
const out=process.env.EVIDENCE_DIR??'/tmp/how-carrying';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext();let page=await context.newPage();page.setDefaultTimeout(20000);
const flow=process.env.TEST_FLOW??'all';
const report={flow,browser:await browser.version(),flows:[],errors:[],screens:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
const stats=async()=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const world=async()=>(await stats()).worldState;
const wait=async predicate=>{await page.waitForFunction(predicate);};
async function seed(kind='normal',viewport={width:1100,height:780}){
  console.log('fixture',kind,viewport);
  await page.close();page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(String(e)));
  await page.setViewportSize(viewport);
  await page.route('**/__carry-fixture',r=>r.fulfill({body:'<!doctype html><title>Carry fixture</title>',contentType:'text/html'}));
  await page.goto(origin+'/__carry-fixture',{waitUntil:'domcontentloaded'});
  await page.evaluate(async kind=>{
    const {createState}=await import('/src/domain/state.ts'),{createSaveContext}=await import('/src/domain/save-context.ts'),{serializeWorldSave}=await import('/src/domain/world-save.ts');
    const {awardCarried,awardGround}=await import('/src/domain/carrying.ts'),{inventoryTransaction}=await import('/src/domain/inventory.ts'),{CAMP_PROPS}=await import('/src/content/scene-props.ts');
    const s=createState(),item=itemId=>({itemId,qualityId:'ordinary'});
    if(kind==='normal'){
      s.player={x:CAMP_PROPS.logs.x-3.3,z:CAMP_PROPS.logs.z+1,facing:0,moving:false};
      s.inventory=awardCarried(s.inventory,item('branch'),3);s.inventory=awardCarried(s.inventory,item('mushroom'),1);
      s.inventory=awardGround(s.inventory,item('branch'),3,s.player);s.inventory=awardGround(s.inventory,item('wood'),2,s.player);
      s.inventory=inventoryTransaction(s.inventory,[{...item('wood'),delta:2}]);
    }else if(kind.startsWith('walk')){
      if(kind!=='walk-empty')s.inventory=awardCarried(s.inventory,item('wood'),1);
      s.clock.speed=kind==='walk-12'?12:1;
    }else if(kind==='gather'||kind==='gather-full'){
      s.clock.speed=12;
      const {createGatheringRegistry}=await import('/src/domain/gathering-registry.ts'),{RUNTIME_MODELS}=await import('/src/content/assets.ts');
      const {interactionRoute}=await import('/src/domain/gathering.ts'),{makeTrees,makeColliders}=await import('/src/world/layout.ts');
      const registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(a=>a.assetId)});
      const source=[...registry.sources.values()].find(x=>registry.definitions.get(x.definitionId).itemId==='mushroom');
      const route=interactionRoute(s,source,registry,makeColliders(makeTrees())).route;
      Object.assign(s.player,route.at(-1));s.selected=source.sourceId;
      if(kind==='gather-full')s.inventory=awardCarried(s.inventory,item('mushroom'),10);
    }
    const raw=await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:0});
    const {createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');const store=createBrowserWorldSaveStore();await store.compareAndSwap(await store.read(),{primary:raw,backup:raw});
  },kind);
  await page.goto(origin+'/?inspect=1',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'回到山谷',exact:true}).click({force:true});
  await wait(()=>{try{return JSON.parse(document.querySelector('#runtime-stats').textContent).current.gameTime>.02}catch{return false}});
}
async function shot(name){if(process.env.SKIP_SCREENSHOTS)return;await page.screenshot({path:out+'/'+name+'.png',timeout:15000});report.screens.push(name);}
try{
  if(flow==='all'||flow==='desktop'){
  await seed();await page.getByRole('button',{name:'打开仓库',exact:true}).click({force:true});
  await page.getByLabel('随身与搬运').waitFor();assert.equal((await stats()).carrying.bulk,10);
  await page.getByRole('button',{name:'整理打捆',exact:true}).click({force:true});assert.ok((await stats()).carrying.bulk<6);assert.equal((await stats()).carrying.weight,12.2);
  await shot('desktop-carry-bundle');
  await page.getByRole('button',{name:'全部存入营地',exact:true}).click({force:true});assert.equal((await stats()).carrying.items.length,0,'camp deposit must work with live colliders');
  await page.getByText('从营地取出材料',{exact:true}).click({force:true});
  const logRow=page.locator('.carrying-panel details .carrying-list>div').filter({hasText:'原木'});
  await logRow.getByRole('button',{name:'取出一份',exact:true}).click({force:true});await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.carrying.weight===30);assert.equal((await stats()).carrying.weight,30);
  const before=JSON.stringify((await world()).inventory);await logRow.getByRole('button',{name:'取出一份',exact:true}).click({force:true});assert.equal(JSON.stringify((await world()).inventory),before);
  assert.match(await page.locator('.carrying-notice').innerText(),/太重/);
  await page.getByRole('button',{name:'放下一份',exact:true}).click({force:true});await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.carrying.items.length===0);assert.equal((await stats()).carrying.items.length,0);
  const groundWood=page.locator('.carrying-panel>.carrying-list').last().locator(':scope>div').filter({hasText:'原木'});
  await groundWood.getByRole('button',{name:'拿起一份',exact:true}).click({force:true});await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.carrying.weight===30);assert.equal((await stats()).carrying.weight,30);
  report.flows.push('bundle/deposit/withdraw/atomic-full/drop/pickup with real UI and colliders');
  }
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){
    if(flow!=='all'&&flow!=='mobile-'+viewport.width)continue;
    await seed('normal',viewport);await page.getByRole('button',{name:'打开仓库',exact:true}).click({force:true});
    console.log('scroll-area',await page.locator('.warehouse-scroll').boundingBox());
    await page.getByRole('button',{name:'整理打捆',exact:true}).click({force:true});
    const bounds=await page.locator('.warehouse-dialog').boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=viewport.width+1);assert.ok(bounds.y>=-1&&bounds.y+bounds.height<=viewport.height+1);
    console.log('bundle-state',(await stats()).carrying.method);
    await page.getByRole('button',{name:'全部存入营地',exact:true}).click({force:true});await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.carrying.items.length===0);assert.equal((await stats()).carrying.items.length,0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await shot(`mobile-${viewport.width}`);report.flows.push(`mobile viewport ${viewport.width}x${viewport.height} bundle/deposit/no-overflow`);
  }
  if(flow==='all'||flow==='gather'){
  await seed('gather');await page.getByRole('button',{name:'采集',exact:true}).click({force:true});
  await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.carrying.items.length>0);
  assert.equal((await stats()).warehouse.total,0);assert.equal((await stats()).carrying.items[0].quantity,2);report.flows.push('actual gathering yields carried mushrooms, not warehouse stock');
  await seed('gather-full');assert.equal(await page.getByRole('button',{name:'采集',exact:true}).isDisabled(),true);report.flows.push('full hands disable gathering without debiting source');
  }
  if(flow==='all'||flow==='walking'){
  const walking=[];
  for(const kind of ['walk-empty','walk-loaded','walk-12']){
    await seed(kind);await page.keyboard.down('KeyW');await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.player.moving);const a=await world();await page.waitForFunction(start=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.gameTime>=start.time+.45*start.speed,{time:a.time,speed:a.clock.speed},{polling:100});const b=await world();await page.keyboard.up('KeyW');
    const distance=Math.hypot(a.player.x-b.player.x,a.player.z-b.player.z),seconds=(b.time-a.time)/a.clock.speed;
    walking.push({kind,distance,seconds,velocity:distance/seconds});
  }
  report.walking=walking;const [empty,loaded,fast]=walking;assert.ok(empty.velocity>loaded.velocity*2.5);assert.ok(Math.abs(loaded.velocity-fast.velocity)<.5);report.flows.push('runtime loaded speed remains one-third at 1x and 12x');
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'回到山谷',exact:true}).click({force:true});await wait(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.carrying.weight===30);report.flows.push('loaded state restores after browser reload');
  }
  assert.equal(report.errors.length,0);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);report.stack=error.stack;try{report.lastCarry=(await stats()).carrying;report.lastGather=(await stats()).gathering;report.lastTime=(await stats()).gameTime;report.lastLoop=(await stats()).loop;report.lastMessage=(await stats()).message;report.ui=await page.locator('.carrying-panel').innerText({timeout:1000});}catch{};try{await shot('failure');}catch(e){report.screenshotError=String(e);}process.exitCode=1;}finally{fs.writeFileSync(out+'/report-'+flow+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);}
