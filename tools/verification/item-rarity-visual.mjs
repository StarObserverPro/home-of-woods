import fs from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=process.env.EVIDENCE_DIR??'evidence/item-rarity';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5174';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});
page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>{errors.push(String(e));console.log('pageerror',String(e));});
try {
 await page.goto(`${origin}/tools/fixtures/rarity-lab.html`);
 await page.waitForFunction(()=>window.rarityReady===true);
 const frames=[];
 for(const [name,hour,angle,elevation] of [['day',14,-.75,.34],['dusk',18,-.75,.34],['night',23,-.75,.34],['orbit',14,.1,.66]]) {
  const stats=await page.evaluate(([h,a,e])=>window.rarityHarness.set(h,a,e),[hour,angle,elevation]);
  assert.equal(stats.shaderErrors,0);assert.equal(stats.workshop.surfaces.variants,4);
  await page.screenshot({path:`${out}/surface-${name}.jpg`,type:'jpeg',quality:82,timeout:60000});
  frames.push({name,hour,angle,elevation,stats});console.log(name,'captured',stats.drawCalls,stats.graphicsBackend);
 }
 await page.evaluate(()=>{window.rarityHarness.set(23,-.75,.34);for(const i of window.rarityHarness.state.inventory.instances)i.rarityId='common';window.rarityHarness.view.render(window.rarityHarness.state,0);});
 await page.screenshot({path:`${out}/surface-night-baseline.jpg`,type:'jpeg',quality:82,timeout:60000});
 assert.equal(errors.length,0);fs.writeFileSync(`${out}/visual-stats.json`,JSON.stringify({browser:await browser.version(),viewport:{width:900,height:600},frames,errors},null,2));
 console.log('VISUAL_CAPTURE_PASS');
} finally {await browser.close();}
