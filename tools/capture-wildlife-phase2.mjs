/** Real game review after the rejected goat was withdrawn; preserve the original evidence. */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const output='evidence/wildlife-goat-withdrawal/browser';
await fs.mkdir(output,{recursive:true});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  renderer:'Chromium / backend recorded per frame', deviceLimit:'Mobile screenshots use viewport simulation, not a physical GPU.',
  withdrawnModels:['goat'],requestedGoat:false,frames:{},reentries:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const extract=async(page)=>JSON.parse(await page.locator('#runtime-stats').textContent()).current;
async function ready(page){
  await page.waitForFunction(()=>{
    try{const a=JSON.parse(document.querySelector('#runtime-stats')?.textContent||'{}').current;
      return a?.wildlife?.active===2 && a.wildlife.available.includes('wildlife.stag') && !a.wildlife.available.includes('wildlife.goat') && a.gameTime>2;}
    catch{return false;}
  },null,{timeout:120000});
  assert.equal(await page.locator('select[aria-label="场景观察位置"] option[value="goatVista"]').count(),0,'Rejected goat preview must not be offered');
}
async function take(page,name,preset){
  await page.locator('details.diagnostics').evaluate(e=>e.open=true);
  await page.getByLabel('场景观察位置').selectOption(preset);
  await page.getByRole('button',{name:'白昼',exact:true}).click();
  await page.waitForTimeout(600);
  const data=await extract(page);
  assert.equal(data.shaderErrors,0,'WebGL shaders should compile');
  assert.ok(data.wildlife.available.includes('wildlife.stag'),'The accepted stag remains available');
  assert.equal(data.wildlife.available.includes('wildlife.goat'),false,'The rejected goat is unavailable');
  assert.ok(data.wildlife.inFrame>=1,'Expected model center inside actual viewport');
  assert.ok(data.wildlife.observed.some(x=>x.includes('inspect:wildlife.stag')),'Expected sight projection of the inspection deer');
  const oldTime=data.gameTime, viewState=JSON.stringify(data.wildlifeViews);
  await page.waitForTimeout(200);
  const frozen=await extract(page);
  assert.equal(frozen.gameTime,oldTime,'Inspection must not progress encounter time');
  assert.equal(JSON.stringify(frozen.wildlifeViews),viewState,'Inspection must not change active encounters');
  let captured=false, resolveCapture;
  let timer;
  const finished=new Promise((resolve,reject)=>{resolveCapture=resolve;timer=setTimeout(()=>reject(new Error('Native capture timed out')),120000);});
  await page.route('**/__scene-capture',async route=>{
    const body=route.request().postDataJSON();
    assert.ok(body.image.startsWith('data:image/png;base64,'));
    const png=Buffer.from(body.image.slice('data:image/png;base64,'.length),'base64');
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.ok(png.length>1000,'Capture must contain rendered pixels');
    await fs.writeFile(output+'/'+name+'.png',png);
    captured=true;
    await route.fulfill({status:200,body:'Saved'});
    resolveCapture();
  });
  try{
    await page.getByRole('button',{name:'保存场景画面'}).click({timeout:120000});
    await finished;
    assert.ok(captured,'Scene screenshot must complete');
  }finally{
    clearTimeout(timer);
    await page.unroute('**/__scene-capture');
  }
  report.frames[name]={preset,sourceTime:data.gameTime,wildlife:data.wildlife,
    animals:data.wildlifeViews,drawCalls:data.drawCalls,triangles:data.triangles,
    graphicsBackend:data.graphicsBackend,gpu:data.gpu,shaderErrors:data.shaderErrors,canvas:data.canvas};
}
try{
  for(const v of [{w:1365,h:900,name:'desktop',mobile:false},{w:390,h:844,name:'mobile',mobile:true}]){
    const context=await browser.newContext({viewport:{width:v.w,height:v.h},isMobile:v.mobile,hasTouch:v.mobile});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    page.on('request',request=>{if(new URL(request.url()).pathname==='/assets/wildlife/goat.glb')report.requestedGoat=true;});
    await page.goto('http://127.0.0.1:5173/?inspect=1',{waitUntil:'domcontentloaded'});
    await ready(page);
    await take(page,v.name+'-stag','stagVista');
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
  assert.equal(report.requestedGoat,false,'No rejected goat network request is permitted');
  report.result='passed';
}catch(e){report.result='failed';report.failure=String(e?.stack||e);throw e;}
finally{await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
