import fs from 'node:fs';import assert from 'node:assert/strict';const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const out=process.env.EVIDENCE_DIR??'evidence/item-vfx-r3';fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1000,height:650},deviceScaleFactor:1});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))console.log('CONSOLE',m.text());});
function save(name,uri){fs.writeFileSync(`${out}/${name}.png`,Buffer.from(uri.split(',')[1],'base64'));}
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5174',baseline=process.env.BASELINE_ORIGIN??'http://127.0.0.1:5175';
const captures={};const reports=[];
async function capture(name){const r=await page.evaluate(()=>({image:window.rarityHarness.capture(),stats:window.rarityHarness.view.stats()}));assert.equal(r.stats.shaderErrors,0);save(name,r.image);captures[name]=r.image;console.log('CAPTURE',name,r.stats.workshop.surfaces);return r;}
try{
 for(const base of [true,false]){
  const url=base?baseline:origin;await page.goto(`${url}/tools/fixtures/rarity-vfx-${base?'r2':'r3'}.html`);await page.waitForFunction(()=>window.rarityReady===true);
  await page.evaluate(()=>window.rarityHarness.view.setReducedMotion(true));
  for(const [label,hour] of [['day',14],['night',23]]){await page.evaluate(h=>window.rarityHarness.set(h),hour);await capture(`${base?'before':'full'}-${label}`);}
  if(!base){
   for(const mode of ['simple','off']){await page.evaluate(mode=>window.rarityHarness.mode(mode),mode);for(const [label,hour]of [['day',14],['night',23]]){await page.evaluate(h=>window.rarityHarness.set(h),hour);const r=await capture(`${mode}-${label}`);assert.equal(r.stats.workshop.surfaces.glintDraws,0);assert.equal(r.stats.workshop.surfaces.emblemDraws,mode==='simple'?2:0);}}
  }
 }
 // Compute separate object crops from actual camera projection (not handpicked pixel coordinates).
 const boxes=await page.evaluate(async()=>{const THREE=await import('/node_modules/.vite/deps/three.js');const {heightAt}=await import('/src/world/surface.ts');const h=window.rarityHarness;return h.state.inventory.instances.map(i=>{const p=new THREE.Vector3(i.location.x,heightAt(i.location.x,i.location.z)+.35,i.location.z).project(h.view.camera);return{id:i.rarityId,x:Math.round((p.x+1)*500),y:Math.round((1-p.y)*325)};});});
 for(const label of ['day','night']){const diff=await page.evaluate(async({a,b,boxes})=>{const im1=new Image(),im2=new Image();im1.src=a;im2.src=b;await Promise.all([im1.decode(),im2.decode()]);return boxes.filter(o=>['epic','legendary'].includes(o.id)).map(o=>{const c=document.createElement('canvas');c.width=74;c.height=90;const ctx=c.getContext('2d');ctx.drawImage(im1,o.x-37,o.y-50,74,90,0,0,74,90);const p=ctx.getImageData(0,0,74,90).data;ctx.clearRect(0,0,74,90);ctx.drawImage(im2,o.x-37,o.y-50,74,90,0,0,74,90);const q=ctx.getImageData(0,0,74,90).data;let changed=0,max=0,delta=0;for(let i=0;i<p.length;i+=4){let d=0;for(let j=0;j<3;j++){d=Math.max(d,Math.abs(p[i+j]-q[i+j]));delta+=q[i+j]-p[i+j];}if(d)changed++;max=Math.max(max,d);}return {...o,changed,max,delta};});},{a:captures[`before-${label}`],b:captures[`full-${label}`],boxes});console.log('COMPARE',label,diff);assert.equal(diff.find(d=>d.id==='epic').changed,0);assert.ok(diff.find(d=>d.id==='legendary').delta<0);reports.push({label,diff});}
 await page.evaluate(()=>{const h=window.rarityHarness;h.mode('simple');h.set(14);h.view.setReducedMotion(false);});
 const stillA=await page.evaluate(()=>window.rarityHarness.capture());for(let i=0;i<10;i++)await page.evaluate(()=>window.rarityHarness.step(.1));const stillB=await page.evaluate(()=>window.rarityHarness.capture());assert.equal(stillA,stillB);console.log('SIMPLE_STATIC_PASS');
 await page.evaluate(()=>window.rarityHarness.set(14,.1,.66));await capture('simple-orbit');
 await page.evaluate(()=>window.rarityHarness.set(14,-.75,.34,38,1.5));await capture('simple-map');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.rarityHarness.set(14,-.75,.6,12,1));await capture('simple-mobile');
 await page.goto(`${origin}/tools/fixtures/rarity-vfx-r3-depth.html`);await page.waitForFunction(()=>window.ready);
 const blocked=await page.evaluate(()=>{const h=window.depthTest;return ['full','simple','off'].map(mode=>h.render('legendary',true,0,mode));});assert.equal(blocked[0].image,blocked[1].image);assert.equal(blocked[1].image,blocked[2].image);
 const open=await page.evaluate(()=>['full','simple','off'].map(mode=>window.depthTest.render('legendary',false,0,mode)));assert.notEqual(open[1].image,open[2].image);assert.ok(open.every(r=>r.errors===0));save('simple-depth',open[1].image);console.log('OCCLUSION_PASS');
 fs.writeFileSync(`${out}/visual-verification.json`,JSON.stringify({browser:await browser.version(),epicUnchanged:true,legendaryLower:true,simpleStatic:true,occlusion:true,reports,errors},null,2));assert.deepEqual(errors,[]);console.log('VISUAL_PASS');
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
