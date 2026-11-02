import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const {default:gifenc}=await import(process.env.GIFENC_MODULE??'gifenc');const {GIFEncoder,quantize,applyPalette}=gifenc;
const out=process.env.EVIDENCE_DIR??'evidence/item-vfx-r2',origin=process.env.TEST_ORIGIN??'http://127.0.0.1:5174';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,channel:'chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await b.newPage({viewport:{width:800,height:520},deviceScaleFactor:1});page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const save=(name,data)=>fs.writeFileSync(`${out}/${name}`,Buffer.from(data.split(',')[1],'base64'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
try{
 await page.goto(`${origin}/tools/fixtures/rarity-vfx-occlusion.html`);await page.waitForFunction(()=>window.ready);
 const occludedA=await page.evaluate(()=>window.depthTest.render('legendary',true));const occludedB=await page.evaluate(()=>window.depthTest.render('common',true));
 assert.equal(occludedA.errors,0);assert.equal(occludedA.image,occludedB.image,'no surface or glints may leak through opaque wall');
 const visibleA=await page.evaluate(()=>window.depthTest.render('legendary',false,.1)),visibleB=await page.evaluate(()=>window.depthTest.render('common',false));assert.notEqual(visibleA.image,visibleB.image);save('occlusion.png',occludedA.image);
 console.log('OCCLUSION_PASS');
 await page.goto(`${origin}/tools/fixtures/rarity-vfx-r2.html`);await page.waitForFunction(()=>window.rarityReady);
 const base=await page.evaluate(()=>{window.rarityHarness.set(14,-.75,.34,10,1);return window.rarityHarness.view.stats();});
 const gif=GIFEncoder();const frames=[];
 for(let i=0;i<36;i++){
  const v=await page.evaluate(()=>{const h=window.rarityHarness;h.step(.1);const c=document.createElement('canvas');c.width=640;c.height=155;const ctx=c.getContext('2d');ctx.drawImage(h.view.canvas,80,195,640,155,0,0,640,155);const data=ctx.getImageData(0,0,640,155).data;let binary='';for(let k=0;k<data.length;k+=8192)binary+=String.fromCharCode(...data.subarray(k,k+8192));return {rgba:btoa(binary),image:c.toDataURL('image/webp',.82)};});
  const rgba=Buffer.from(v.rgba,'base64'),palette=quantize(rgba,128);gif.writeFrame(applyPalette(rgba,palette),640,155,{palette,delay:100});frames.push(hash(v.rgba));
  if([0,11,23,35].includes(i))save(`motion-${i}.webp`,v.image);
  if(i%12===11)console.log('MOTION_FRAME',i+1);
 }
 gif.finish();fs.writeFileSync(`${out}/surface-motion.gif`,gif.bytes());assert.equal(new Set(frames).size,36);
 const reduced=await page.evaluate(()=>{const h=window.rarityHarness;h.view.setReducedMotion(true);h.step(.1);const a=h.capture();h.step(.1);const z=h.capture();return{a,z,stats:h.view.stats()};});assert.equal(reduced.a,reduced.z,'reduced motion must freeze presentation');save('reduced-motion.png',reduced.a);
 const still=await page.evaluate(()=>{const h=window.rarityHarness;h.view.setReducedMotion(false);const a=h.capture();const z=h.capture();return{a,z};});assert.equal(still.a,still.z,'zero-delta capture must not move effect');
 const variants=await page.evaluate(()=>window.rarityHarness.view.stats().workshop.surfaces.variants);assert.equal(variants,4);
 const shots=[];
 for(const [name,hour,angle,elevation,distance,zoom] of [['dusk',18,-.75,.34,10,1],['night',23,-.75,.34,10,1],['orbit',14,.1,.62,10,1],['map',14,-.75,.34,38,1.5],['default-distance',14,-.75,.24,110,.76]]){
  const result=await page.evaluate(([h,a,e,d,z])=>{const k=window.rarityHarness;k.set(h,a,e,d,z);return{image:k.capture(),stats:k.view.stats()};},[hour,angle,elevation,distance,zoom]);assert.equal(result.stats.shaderErrors,0);save(`${name}-verified.png`,result.image);shots.push({name,hour,angle,elevation,distance,zoom,drawCalls:result.stats.drawCalls,surfaces:result.stats.workshop.surfaces});console.log('SHOT',name);
 }
 await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>{const h=window.rarityHarness;h.set(14,-.75,.34,16,1);return{image:h.capture(),stats:h.view.stats()};});save('mobile-verified.png',mobile.image);assert.equal(mobile.stats.shaderErrors,0);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/verification.json`,JSON.stringify({browser:await b.version(),backend:base.graphicsBackend,viewport:{width:800,height:520},frameCount:36,sampleDelta:.1,playbackFPS:10,frameHashes:frames,occlusion:{identicalOpaqueFrames:true,visibleRarityDifference:true},pause:{zeroDeltaIdentical:true,reducedMotionIdentical:true},shots,mobile:{canvas:mobile.stats.canvas,surfaces:mobile.stats.workshop.surfaces},errors},null,2));console.log('VFX_VERIFICATION_PASS');
}finally{await b.close();}
