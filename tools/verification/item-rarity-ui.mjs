import fs from 'node:fs';import assert from 'node:assert/strict';const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=process.env.EVIDENCE_DIR??'evidence/item-rarity';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5174';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1000,height:760},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const stats=async()=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
const waitWorld=async(predicate)=>page.waitForFunction(predicate,{}, {timeout:60000});
try {
 await page.goto(`${origin}/`);await page.evaluate(async raw=>{const {createBrowserWorldSaveStore}=await import('/src/app/world-save-store.ts');const store=createBrowserWorldSaveStore();await store.compareAndSwap(await store.read(),{primary:raw,backup:raw});},fs.readFileSync(process.env.FIXTURE_PATH??'/tmp/rarity-fixture.json','utf8'));
 await page.goto(`${origin}/?inspect=1`);await page.getByRole('button',{name:'回到山谷',exact:true}).click({timeout:60000});console.log('loaded');
 await page.keyboard.press('KeyB');await page.locator('.owned-card').first().waitFor();assert.equal(await page.locator('.owned-card').count(),5);
 const palette=await page.locator('.owned-card').evaluateAll(cards=>cards.map(c=>({grade:c.dataset.rarity,label:c.querySelector('.rarity-label').textContent,color:getComputedStyle(c.querySelector('.rarity-name')).color,border:getComputedStyle(c).borderColor})));
 assert.equal(new Set(palette.map(p=>p.color)).size,5);console.log('palette',JSON.stringify(palette));
 await page.locator('.owned-furniture').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/inventory-desktop.jpg`,type:'jpeg',quality:83});
 await page.locator('.owned-card[data-rarity="legendary"]').getByRole('button',{name:'摆放到地上',exact:true}).click();await page.locator('.placement-panel').waitFor();console.log('placement started');
 let placed=false,placedPixel;
 for(const [x,y] of [[490,480],[370,510],[560,560],[400,390],[620,440],[320,450],[540,340],[250,530]]) {
  await page.mouse.click(x,y);await page.waitForTimeout(150);
  if(await page.getByRole('button',{name:'确认摆放',exact:true}).isEnabled()){await page.getByRole('button',{name:'转 45°',exact:true}).click();await page.getByRole('button',{name:'确认摆放',exact:true}).click();placed=true;placedPixel=[x,y];console.log('placed at screen',x,y);break;}
 }
 assert.equal(placed,true,'No valid ground point in candidate screen locations');
 await waitWorld(()=>{const s=JSON.parse(document.querySelector('#runtime-stats').textContent).current;return s.worldState.inventory.instances.find(i=>i.instanceId==='visual-legendary').location.kind==='world';});
 const placedState=await stats();const item=placedState.worldState.inventory.instances.find(i=>i.instanceId==='visual-legendary');assert.equal(item.rarityId,'legendary');assert.deepEqual(item.futureFinish,{decal:'fern',version:7});
 console.log('location',JSON.stringify(item.location));
 await page.screenshot({path:`${out}/after-placement.jpg`,type:'jpeg',quality:83});
 await page.keyboard.press('KeyB');await page.locator('.owned-card[data-rarity="legendary"]').getByRole('button',{name:'收回',exact:true}).click();
 await waitWorld(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.inventory.instances.find(i=>i.instanceId==='visual-legendary').location.kind==='inventory');
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:'保存世界',exact:true}).click();await page.waitForTimeout(500);
 await page.reload();await page.getByRole('button',{name:'回到山谷',exact:true}).click({timeout:60000});await page.keyboard.press('KeyB');
 assert.equal(await page.locator('.owned-card').count(),5);const restored=await stats();assert.equal(restored.shaderErrors,0);
 const restoredItem=restored.worldState.inventory.instances.find(i=>i.instanceId==='visual-legendary');assert.equal(restoredItem.rarityId,'legendary');assert.deepEqual(restoredItem.futureFinish,{decal:'fern',version:7});assert.equal(restoredItem.location.kind,'inventory');
 await page.setViewportSize({width:390,height:844});await page.locator('.owned-card[data-rarity="legendary"]').scrollIntoViewIfNeeded();
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.owned-card button')].map(b=>b.getBoundingClientRect().height)}));assert.ok(dimensions.scroll<=dimensions.width);assert.ok(dimensions.buttons.every(h=>h>=44));
 await page.screenshot({path:`${out}/inventory-mobile.jpg`,type:'jpeg',quality:83});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/ui-check.json`,JSON.stringify({browser:await browser.version(),palette,placedItem:item,restoredItem,dimensions,shaderErrors:restored.shaderErrors,errors},null,2));console.log('UI_FLOW_PASS');
} catch(e){console.error(e);await page.screenshot({path:`${out}/ui-debug.jpg`,type:'jpeg',quality:70}).catch(()=>{});console.log((await page.locator('body').innerText()).slice(-5000));process.exitCode=1;}finally{await browser.close();}
