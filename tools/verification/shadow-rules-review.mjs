/** Small fixed-input GPU review of shared rules; not a whole-game or physical-device benchmark. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const cwd=process.cwd(),out=process.env.SHADOW_RULES_EVIDENCE_DIR??'/tmp/how-shadow-rules-evidence';
const origin='http://127.0.0.1:4189';
await fs.mkdir(out,{recursive:true});
const report={status:'running',commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceHashes:{},frames:[],pairs:[],checks:[],errors:[],warnings:[],
  limits:['Software Chromium WebGL is not physical mobile GPU timing.','This review exercises shared modules in a fixed fixture; it does not replace main-game or expedition navigation checks.','Crown shade is the shared ellipsoid projection approximation, not leaf-level PCSS.','drawMillisecondsCPU includes CPU submission and may include driver stalls; it is not GPU time.']};
for(const file of ['src/content/shadows.ts','src/content/occlusion.ts','src/world/shadow-field.ts','src/world/shadow-field-worker.ts','src/world/shadow-field-worker-protocol.ts','src/scene/lighting/outdoor-shadows.ts','src/scene/lighting/ambient-occlusion.ts','src/scene/lighting/character-contact-shadows.ts','src/scene/lighting/foot-contact-anchors.ts','src/scene/lighting/camp-shadows.ts','src/scene/create-scene.ts','src/scene/characters.ts','src/scene/models.ts','tools/fixtures/shared-shadow-rules.html','public/assets/characters/player.glb','public/assets/characters/motions.glb']){
  report.sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
let phase='startup',serverLog='',browser,page,context;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4189','--strictPort'],{cwd,stdio:['ignore','pipe','pipe']});
for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>serverLog=(serverLog+chunk).slice(-60000));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error(`Vite exited: ${serverLog}`);
    try{if((await fetch(`${origin}/tools/fixtures/shared-shadow-rules.html`)).ok)return;}catch{}
    await delay(200);
  }
  throw Error('Shadow fixture server did not become ready');
}
async function newPage(viewport,mobile=false){
  context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  page=await context.newPage();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',error=>report.errors.push({phase,message:String(error)}));
  page.on('crash',()=>report.errors.push({phase,message:'Review page crashed'}));
  page.on('console',message=>{
    if(message.type()==='error')report.errors.push({phase,message:message.text()});
    else if(message.type()==='warning')report.warnings.push({phase,message:message.text()});
  });
  page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)report.errors.push({phase,url:response.url(),status:response.status()});});
}
async function load(viewport,mobile=false){
  await newPage(viewport,mobile);
  await page.goto(`${origin}/tools/fixtures/shared-shadow-rules.html`);
  await page.waitForFunction(()=>window.__SHADOW_REVIEW_READY__||window.__SHADOW_REVIEW_ERROR__,null,{timeout:90000});
  const failure=await page.evaluate(()=>window.__SHADOW_REVIEW_ERROR__);assert.equal(failure,undefined,failure);
}
async function capture(name,controls={},save=true){
  phase=name;
  const result=await page.evaluate(controls=>window.__SHADOW_RULES_REVIEW__.render(controls),controls);
  const {stats,image}=result;
  assert.deepEqual(stats.shaderErrors,[],`${name}: GPU shader compilation failed`);
  assertShadowStable(stats.shadow);
  assert.equal(stats.profile,'shared-shadow-rules-v1');assert.equal(stats.shadow.mapCount,1);
  assert.equal(stats.shadow.sourceCount,3);assert.equal(stats.anchor.feet,2);assert.ok(stats.anchor.inspectedVertices>0);
  assert.equal(stats.ambient.detailMode,'projected-footprint');assert.equal(stats.postProcessing,false);
  assert.ok(stats.drawCalls>0&&stats.triangles>0);assert.ok(stats.contact.activeFeet<=4);
  const bytes=Buffer.from(image.split(',')[1],'base64'),sha256=createHash('sha256').update(bytes).digest('hex');
  if(save)await fs.writeFile(path.join(out,`${name}.png`),bytes);
  report.frames.push({name,saved:save,sha256,...stats});
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  return result;
}
function assertShadowStable(shadows){
  assert.equal(shadows.inflight,0);assert.equal(shadows.pending,0);assert.equal(shadows.ready,false);
  assert.ok(Number.isInteger(shadows.revision));assert.equal(shadows.revision,shadows.committedRevision);
  assert.equal(shadows.workerErrors,0,'The browser worker failed and fell back unexpectedly');
}
async function difference(a,b){
  return page.evaluate(async([before,after])=>{
    async function pixels(url){
      const image=await createImageBitmap(await(await fetch(url)).blob()),canvas=document.createElement('canvas');
      canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);image.close();return context.getImageData(0,0,canvas.width,canvas.height);
    }
    const a=await pixels(before),b=await pixels(after);if(a.width!==b.width||a.height!==b.height)throw Error('Image dimensions differ');
    let changedPixels=0,darkerPixels=0,brighterPixels=0,sum=0,maxDifference=0;
    for(let i=0;i<a.data.length;i+=4){
      let difference=0,signed=0;for(let channel=0;channel<3;channel++){const delta=b.data[i+channel]-a.data[i+channel];difference+=Math.abs(delta);signed+=delta;}
      sum+=difference/3;maxDifference=Math.max(maxDifference,difference/3);
      if(difference>3){changedPixels++;if(signed<0)darkerPixels++;else if(signed>0)brighterPixels++;}
    }
    return {width:a.width,height:a.height,changedPixels,darkerPixels,brighterPixels,meanAbsoluteDifference:sum/(a.width*a.height),maxDifference};
  },[a.image,b.image]);
}
async function compare(name,a,b,{minimum=10,darker=false,sameDraws=true}={}){
  assert.deepEqual(a.stats.cameraPosition,b.stats.cameraPosition,`${name}: camera changed`);
  assert.deepEqual(a.stats.cameraProjection,b.stats.cameraProjection,`${name}: projection changed`);
  if(sameDraws){assert.equal(a.stats.drawCalls,b.stats.drawCalls,`${name}: extra draws`);assert.equal(a.stats.triangles,b.stats.triangles);}
  const diff=await difference(a,b);report.pairs.push({name,...diff,extraDrawCalls:b.stats.drawCalls-a.stats.drawCalls});
  assert.ok(diff.changedPixels>=minimum,`${name}: effect not visible (${diff.changedPixels} changed pixels)`);
  if(darker)assert.ok(diff.darkerPixels>=minimum,`${name}: attenuation did not darken its receivers`);
  return diff;
}
async function repeat(name,a,b){
  const diff=await difference(a,b);report.checks.push({name,...diff});
  assert.equal(diff.maxDifference,0,`${name}: fixed inputs changed image`);
  assert.equal(a.stats.shadow.bakes,b.stats.shadow.bakes,`${name}: unchanged input rebaked canopy`);
}
async function workerRoundtrip(){
  phase='real browser worker roundtrip';
  const probe=await page.evaluate(()=>window.__SHADOW_RULES_REVIEW__.workerRoundtrip());
  const {frames,...details}=probe;
  for(const [name,frame] of Object.entries(frames)){
    assertShadowStable(frame.stats.shadow);assert.equal(frame.stats.shadow.worker,true);
    assert.deepEqual(frame.stats.shaderErrors,[],`Worker ${name}: GPU shader error`);
    assert.deepEqual(frame.stats.cameraPosition,frames.before.stats.cameraPosition);
    assert.deepEqual(frame.stats.cameraProjection,frames.before.stats.cameraProjection);
    assert.equal(frame.stats.drawCalls,frames.before.stats.drawCalls);
  }
  assert.equal(details.submittedDelta,3,'The probe must complete exactly three actual background request/return sequences');
  assert.equal(frames.shifted.stats.shadow.sourceCount,3);assert.equal(frames.removed.stats.shadow.sourceCount,2);assert.equal(frames.restored.stats.shadow.sourceCount,3);
  const directionChange=await difference(frames.before,frames.shifted);
  const canopyRemoval=await difference(frames.shifted,frames.removed);
  const restoration=await difference(frames.before,frames.restored);
  const imageHashes=Object.fromEntries(Object.entries(frames).map(([name,frame])=>[name,createHash('sha256').update(Buffer.from(frame.image.split(',')[1],'base64')).digest('hex')]));
  report.checks.push({name:'real browser worker request, staged result, atomic field/sun commit and GPU texture upload',...details,
    sourceCounts:{before:frames.before.stats.shadow.sourceCount,removed:frames.removed.stats.shadow.sourceCount,restored:frames.restored.stats.shadow.sourceCount},
    differences:{directionChange,canopyRemoval,restoration},imageHashes});
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  assert.ok(directionChange.changedPixels>=100,`The committed solar direction did not change the rendered scene (${directionChange.changedPixels} pixels)`);
  assert.ok(canopyRemoval.changedPixels>=20&&canopyRemoval.brighterPixels>=20,`The transferred crown removal did not change rendered transmittance (${canopyRemoval.changedPixels} changed, ${canopyRemoval.brighterPixels} brighter pixels)`);
  assert.equal(restoration.maxDifference,0,'Restoring original sun/crowns did not restore the fixed image');
}
async function treeHeightFadeProbe(){
  phase='tree solid height coverage';
  const {frames,...details}=await page.evaluate(()=>window.__SHADOW_RULES_REVIEW__.treeHeightFadeProbe());
  const reference=frames.faded.stats;
  for(const [name,frame] of Object.entries(frames)){
    const stats=frame.stats;
    assertShadowStable(stats.shadow);assert.deepEqual(stats.shaderErrors,[],`Tree depth ${name}: GPU shader error`);
    assert.deepEqual(stats.cameraPosition,reference.cameraPosition);assert.deepEqual(stats.cameraProjection,reference.cameraProjection);
    assert.deepEqual(stats.appliedSunDirection,reference.appliedSunDirection);
    assert.equal(stats.drawCalls,reference.drawCalls);assert.equal(stats.triangles,reference.triangles);
    assert.equal(stats.shadow.bakes,reference.shadow.bakes,'Changing only tree depth must not rebake the crown field');
    assert.equal(stats.shadow.submitted,reference.shadow.submitted);assert.equal(stats.shadow.sourceCount,3);
    assert.deepEqual(stats.solePoints,reference.solePoints,'Tree depth changed actual animated foot anchors');
    assert.deepEqual(stats.contact.feet,reference.contact.feet,'Tree depth changed protagonist contact strength or support');
    assert.equal(stats.contact.activeFeet,2);
  }
  assert.equal(details.trunks.length,3);
  for(const trunk of details.trunks)assert.ok(Math.abs(trunk.localMinY)<1e-5,`${trunk.name}: model origin is not at the root`);
  assert.ok(details.trunks.some(trunk=>trunk.localMaxY>details.profile.start+8),'The fixed scene does not reach the tree-height fade range');
  const heightFade=await difference(frames.solid,frames.faded),restoration=await difference(frames.faded,frames.restored);
  const imageHashes=Object.fromEntries(Object.entries(frames).map(([name,frame])=>[name,createHash('sha256').update(Buffer.from(frame.image.split(',')[1],'base64')).digest('hex')]));
  report.checks.push({name:'shared upper-tree depth coverage changes GPU shadow; ordinary actor and contacts remain fixed',...details,
    differences:{heightFade,restoration},imageHashes,drawCalls:reference.drawCalls,triangles:reference.triangles,
    fieldBakes:reference.shadow.bakes,contactFeet:reference.contact.feet});
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  assert.ok(heightFade.changedPixels>=20&&heightFade.brighterPixels>=20,`Tree-height coverage did not lighten its actual shadow (${heightFade.changedPixels} changed, ${heightFade.brighterPixels} brighter pixels)`);
  assert.equal(restoration.maxDifference,0,'Restoring shared tree depth did not restore the fixed image');
}
async function release(){
  const state=await page.evaluate(()=>window.__SHADOW_RULES_REVIEW__.dispose());
  assert.equal(state.resources.disposed,true);assert.equal(state.resources.extras,0);
  assert.equal(state.ambient.materials,0);assert.equal(state.shadow.materials,0);assert.equal(state.contact.activeFeet,0);
  report.checks.push({name:'scene owner released shared resources',state});
  await context.close();context=null;page=null;
}
async function mainSmoke(){
  phase='main game smoke';await newPage({width:960,height:640});
  await page.goto(`${origin}/?inspect=1&hour=14`);
  await page.waitForFunction(()=>{
    try{
      const stats=JSON.parse(document.querySelector('#runtime-stats')?.textContent??'{}').current;
      const shadows=stats?.shadows;
      return stats?.shaderErrors>0||(shadows?.sourceCount>0&&stats?.characterContacts?.activeFeet>0&&stats?.loop?.frames>=2
        &&!shadows.inflight&&!shadows.pending&&!shadows.ready&&shadows.revision===shadows.committedRevision);
    }catch{return false;}
  },null,{timeout:180000});
  const stats=await page.locator('#runtime-stats').textContent().then(text=>JSON.parse(text).current);
  assert.equal(stats.shaderErrors,0);assert.ok(stats.shadows.sourceCount>0);assert.equal(stats.shadows.mapCount,1);
  assertShadowStable(stats.shadows);
  assert.ok(stats.shadows.treeDepthBindings>0);assert.ok(stats.characterContacts.activeFeet>0);
  assert.equal(stats.characters.footAnchors.walking.feet,2);assert.equal(stats.occlusion.detailMode,'projected-footprint');
  assert.ok(stats.drawCalls>0&&stats.triangles>0);
  const hold=await page.evaluate(()=>window.__HOW_CAPTURE_HOLD__?.begin());
  assert.ok(hold,'Main DEV inspection capture hold is missing');
  const session=await context.newCDPSession(page);
  try{
    const capture=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const bytes=Buffer.from(capture.data,'base64');await fs.writeFile(path.join(out,'normal-main.png'),bytes);
    report.frames.push({name:'normal-main',saved:true,sha256:createHash('sha256').update(bytes).digest('hex'),stats});
  }finally{
    await session.detach();
    const released=await page.evaluate(token=>window.__HOW_CAPTURE_HOLD__.end(token),hold.token);
    assert.equal(released.released,true);assert.equal(released.held.world,hold.before.world);
  }
  report.checks.push({name:'production main renderer, material chains and real skin anchors',shaderErrors:stats.shaderErrors,
    shadows:stats.shadows,contacts:stats.characterContacts,anchor:stats.characters.footAnchors,render:{drawCalls:stats.drawCalls,triangles:stats.triangles}});
  await context.close();context=null;page=null;
}
async function forestSmoke(){
  if(!existsSync(path.join(cwd,'sandbox/forest-expedition/index.html'))){
    report.checks.push({name:'production forest expedition smoke',status:'skipped',reason:'This branch has no forest-expedition entry; the same review runs it automatically when that entry is integrated.'});
    return;
  }
  phase='forest expedition smoke';await newPage({width:960,height:640});
  await page.goto(`${origin}/sandbox/forest-expedition/?inspect=1`);
  await page.waitForFunction(()=>{
    const api=window.__forestExpedition;if(!api||document.querySelector('#forest-loading'))return false;
    const scene=api.snapshot().scene;
    const shadows=scene?.lighting?.shadows;
    return scene?.shaderErrors>0||(shadows?.sourceCount>0&&scene?.footAnchors?.feet===2
      &&!shadows.inflight&&!shadows.pending&&!shadows.ready&&shadows.revision===shadows.committedRevision);
  },null,{timeout:180000});
  const snapshot=await page.evaluate(()=>{window.__forestExpedition.camera('near');return window.__forestExpedition.snapshot();});
  const scene=snapshot.scene;
  assert.equal(scene.shaderErrors,0);assert.equal(scene.footAnchors.feet,2);
  assertShadowStable(scene.lighting.shadows);
  assert.ok(scene.lighting.shadows.sourceCount>0);assert.equal(scene.lighting.shadows.mapCount,1);
  assert.ok(scene.lighting.contact.activeFeet>0);assert.equal(scene.lighting.ambient.detailMode,'projected-footprint');
  assert.ok(scene.drawCalls>0&&scene.triangles>0);
  const session=await context.newCDPSession(page);
  try{
    const capture=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const bytes=Buffer.from(capture.data,'base64');await fs.writeFile(path.join(out,'normal-forest-near.png'),bytes);
    report.frames.push({name:'normal-forest-near',saved:true,sha256:createHash('sha256').update(bytes).digest('hex'),scene});
  }finally{await session.detach();}
  report.checks.push({name:'production forest expedition smoke',status:'passed',scene});
  await context.close();context=null;page=null;
}
async function forestProduceSmoke(){
  if(!existsSync(path.join(cwd,'src/scene/expedition-produce.ts'))) return;
  const sites=[
    ['upper','windfall-berries'],['upper','wet-log'],['mixed','maple-shelves'],
    ['mixed','edge-serviceberry'],['lower','hardwood-fungi'],['lower','bank-wood-ear'],['lower','berries'],
  ];
  const {createExpeditionLayout}=await import('../../src/world/forest-expedition.ts');
  const {createForestExpedition,serializeForestExpedition}=await import('../../src/domain/forest-expedition.ts');
  const maps=Object.fromEntries(['upper','mixed','lower'].map(id=>[id,createExpeditionLayout(id)]));
  for(const [index,[id,key]] of sites.entries()){
    const siteId=`expedition.${id}.${key}`;
    const mobile=index===sites.length-1;
    phase=`forest-produce-${key}`;
    const state=createForestExpedition({maps},{initialMapId:id});
    const site=maps[id].resourceSites.find(site=>site.id===siteId);
    state.player={x:site.x,z:site.z};
    await newPage(mobile?{width:390,height:844}:{width:960,height:640},mobile);
    await context.addInitScript(raw=>{
      if(!localStorage.getItem('home-of-woods.forest-expedition.v1')) localStorage.setItem('home-of-woods.forest-expedition.v1',raw);
    },serializeForestExpedition(state));
    await page.goto(`${origin}/sandbox/forest-expedition/?inspect=1`);
    await page.waitForFunction(siteId=>window.__forestExpedition?.snapshot().scene?.sourceVisuals[siteId],siteId);
    const near=await page.evaluate(siteId=>{
      const api=window.__forestExpedition;
      api.camera('near');
      const {scene}=api.snapshot();
      const point=scene.sourceVisuals[siteId];
      const projected=api.project(point),rect=document.querySelector('canvas').getBoundingClientRect();
      return {point, projected, x:projected.x+rect.left, y:projected.y+rect.top, scene};
    },siteId);
    assert.equal(near.scene.shaderErrors,0,phase);
    assert.ok(near.projected.visible,phase);
    const session=await context.newCDPSession(page);
    try{
      const capture=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      await fs.writeFile(path.join(out,`${phase}.png`),Buffer.from(capture.data,'base64'));
    }finally{await session.detach();}
    if(!mobile){
      await page.mouse.click(near.x,near.y);
      const selected=await page.evaluate(()=>window.__forestExpedition.snapshot().selected);
      assert.deepEqual(selected,{kind:'source',id:siteId},phase);
      if(key==='edge-serviceberry'){
        const before=await page.evaluate(siteId=>window.__forestExpedition.snapshot().sources.find(s=>s.id===siteId).remaining,siteId);
        await page.getByRole('button',{name:'采集',exact:true}).click();
        await page.evaluate(()=>window.__forestExpedition.advance(2));
        const after=await page.evaluate(siteId=>{
          const state=window.__forestExpedition.snapshot();
          return {remaining:state.sources.find(s=>s.id===siteId).remaining,items:state.carried};
        },siteId);
        assert.equal(after.remaining,before-1);
        assert.ok(after.items.some(item=>item.itemId==='serviceberry'&&item.quantity===1));
      }
    }
    report.checks.push({name:phase,status:'passed',viewport:near.scene.viewport,point:near.point,projected:near.projected,drawCalls:near.scene.drawCalls,triangles:near.scene.triangles});
    await context.close();context=null;page=null;
  }
}

try{
  await ready();browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  report.browser=await browser.version();
  await load({width:1100,height:800});
  await workerRoundtrip();
  await treeHeightFadeProbe();
  const sunOff=await capture('wide-sun-off',{sunlight:false});
  const canopyOff=await capture('wide-canopy-off',{canopy:false});
  const allOn=await capture('wide-all-on');
  await compare('sun contribution',sunOff,allOn,{minimum:100,sameDraws:false});
  await compare('broad projected canopy',canopyOff,allOn,{minimum:100,darker:true});
  const solidOff=await capture('wide-solid-off',{solid:false});
  await compare('firm near solids',solidOff,allOn,{minimum:20,darker:true,sameDraws:false});
  await repeat('wide fixed-frame repeat',allOn,await capture('wide-repeat',{},false));
  const low=allOn.stats.slices.find(slice=>slice.id==='low-crown'),high=allOn.stats.slices.find(slice=>slice.id==='high-crown');
  assert.ok(high.softness>low.softness&&high.strength<low.strength);
  report.checks.push({name:'shared height-dependent crown projection',low,high});

  const ambientOff=await capture('near-ambient-off',{view:'near',ambient:false,contact:false});
  const contactOff=await capture('near-contact-off',{view:'near',contact:false});
  await compare('range illumination',ambientOff,contactOff,{minimum:100,darker:true});
  const planted=await capture('near-contact-on',{view:'near'});
  await compare('real sole contacts',contactOff,planted,{minimum:10,darker:true});
  assert.equal(planted.stats.contact.activeFeet,2);
  const lifted=await capture('near-lifted-contact-on',{view:'near',pose:'lifted'});
  const liftedOff=await capture('near-lifted-contact-off',{view:'near',pose:'lifted',contact:false});
  await compare('animated sole contacts',liftedOff,lifted,{minimum:5,darker:true});
  const sumStrength=result=>result.stats.contact.feet.reduce((sum,foot)=>sum+foot.strength,0);
  assert.ok(lifted.stats.liftedPhase.heightDifference>.05);
  assert.ok(sumStrength(lifted)<sumStrength(planted)-.005,'Real gait did not weaken its lifted contact');
  report.checks.push({name:'real animation lift changes bounded contact',phase:lifted.stats.liftedPhase,planted:planted.stats.contact.feet,lifted:lifted.stats.contact.feet});
  await repeat('restored pose repeat',planted,await capture('near-restored',{view:'near'},false));
  await release();

  phase='narrow viewport';await load({width:390,height:844},true);
  await capture('mobile-near-on',{view:'near'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await release();
  await mainSmoke();
  await forestSmoke();
  await forestProduceSmoke();
  assert.deepEqual(report.errors,[]);report.status='passed-automated';console.log('SHADOW_RULES_GPU_REVIEW_PASS');
}catch(error){
  report.status='failed';report.failure={phase,message:String(error.stack??error)};process.exitCode=1;console.error(error);
  if(page&&!page.isClosed()){
    report.failureState=await page.evaluate(()=>window.__SHADOW_RULES_REVIEW__?.stats()??window.__SHADOW_REVIEW_ERROR__).catch(()=>null);
    await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});
  }
}finally{
  await browser?.close().catch(()=>{});server.kill('SIGTERM');
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'vite.log'),serverLog);
}
