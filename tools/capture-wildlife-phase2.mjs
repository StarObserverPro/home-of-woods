/** Real browser review of distant wildlife in the playable Three.js scene. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const output='evidence/wildlife-phase2/browser';
await fs.mkdir(output,{recursive:true});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  renderer:'GitHub-hosted Chromium / SwiftShader', deviceLimit:'Mobile screenshots use viewport simulation, not a physical GPU.',
  frames:{},reentries:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const extract=async(page)=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
async function ready(page){
  await page.waitForFunction(()=>{
    try{const a=JSON.parse(document.querySelector('#runtime-stats')?.textContent||'{}').current;
      return a?.wildlife?.active===2 && a.wildlife.available.includes('wildlife.stag') && a.wildlife.available.includes('wildlife.goat') && a.gameTime>2;}
    catch{return false;}
  },null,{timeout:120000});
}
async function take(page,name,preset){
  await page.locator('details.diagnostics').evaluate(e=>e.open=true);
  await page.getByLabel('场景观察位置').selectOption(preset);
  await page.getByRole('button',{name:'白昼',exact:true}).click();
  await page.waitForTimeout(600);
  const data=await extract(page);
  assert.equal(data.shaderErrors,0,'WebGL shaders should compile');
  const species=preset==='stagVista'?'wildlife.stag':'wildlife.goat';
  assert.ok(data.wildlife.available.includes(species),'Expected admitted model');
  assert.ok(data.wildlife.inFrame>=1,'Expected model center inside actual viewport');
  assert.ok(data.wildlife.observed.some(x=>x.includes('inspect:'+species)),
    'Expected sight projection of the inspection animal');
  const oldTime=data.gameTime, viewState=JSON.stringify(data.wildlifeViews);
  await page.waitForTimeout(200);
  const frozen=await extract(page);
  assert.equal(frozen.gameTime,oldTime,'Inspection must not progress encounter time');
  assert.equal(JSON.stringify(frozen.wildlifeViews),viewState,'Inspection must not change active encounters');
  await page.locator('details.diagnostics').evaluate(e=>e.style.visibility='hidden');
  await page.screenshot({path:output+'/'+name+'.png'});
  await page.locator('details.diagnostics').evaluate(e=>e.style.visibility='');
  report.frames[name]={preset,sourceTime:data.gameTime,wildlife:data.wildlife,
    animals:data.wildlifeViews,drawCalls:data.drawCalls,triangles:data.triangles,
    graphicsBackend:data.graphicsBackend,gpu:data.gpu,shaderErrors:data.shaderErrors,canvas:data.canvas};
}
try{
  for(const v of [{w:1365,h:900,name:'desktop',mobile:false},{w:390,h:844,name:'mobile',mobile:true}]){
    const context=await browser.newContext({viewport:{width:v.w,height:v.h},isMobile:v.mobile,hasTouch:v.mobile});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/?inspect=1',{waitUntil:'domcontentloaded'});
    await ready(page);
    if(!v.mobile) await page.screenshot({path:output+'/desktop-normal.png'});
    await take(page,v.name+'-stag','stagVista');
    await take(page,v.name+'-goat','goatVista');
    // Retain the prior two small animals while the distant models are admitted.
    if(!v.mobile){
      for(let i=0;i<2;i++){
        const old=Number(await page.locator('#runtime-stats').getAttribute('data-runtime-version'));
        await page.getByRole('button',{name:'卸载并重入',exact:true}).click();
        await page.waitForFunction(v=>Number(document.querySelector('#runtime-stats')?.getAttribute('data-runtime-version'))>v,old,{timeout:120000});
        await ready(page);
        const result=JSON.parse(await page.locator('#runtime-stats').textContent()),released=result.audit.at(-1);
        assert.equal(released.destroyed,true);assert.equal(released.wildlife.active,0);
        assert.equal(released.wildlife.bones,0);assert.equal(released.resources.extras,0);
        report.reentries.push({destroyed:released.destroyed,resources:released.resources,wildlife:released.wildlife});
      }
    }
    await context.close();
  }
  assert.deepEqual(report.errors,[]);
  report.result='passed';
}catch(e){report.result='failed';report.failure=String(e?.stack||e);throw e;}
finally{await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
