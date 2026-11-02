/** Capture actual rig poses plus the live forest, never an image-generation mock-up. */
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const out=process.env.EVIDENCE_DIR??'/tmp/how-wildlife-capture';
await fs.mkdir(out,{recursive:true});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  rig:[],game:[],errors:[],renderer:'Chromium SwiftShader (not physical mobile GPU)'};
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const save=(result,path)=>{
  assert.match(result.png,/^data:image\/png;base64,/);
  const bytes=Buffer.from(result.png.split(',')[1],'base64');
  assert.ok(bytes.length>10000);
  return fs.writeFile(path,bytes);
};
async function sceneShot(page,preset,name){
  await page.locator('details.diagnostics').evaluate(e=>e.open=true);
  await page.getByLabel('场景观察位置').selectOption(preset);
  // Inspector defaults to day; avoid waiting for an already-active button to become stable under software WebGL.
  await page.waitForTimeout(200);
  const stat=JSON.parse(await page.locator('#runtime-stats').textContent()).current;
  assert.equal(stat.shaderErrors,0);
  assert.ok(stat.wildlife?.available?.includes('wildlife.goat'));
  assert.ok(stat.wildlife?.observed?.some(s=>s.includes('inspect:wildlife.goat')),'goat must be framed in real game');
  const capture=new Promise((resolve,reject)=>{
    const fail=setTimeout(()=>reject(Error('Native scene capture stalled')),80000);
    page.route('**/__scene-capture',async route=>{
      const payload=route.request().postDataJSON(),bytes=Buffer.from(payload.image.split(',')[1],'base64');
      await fs.writeFile(out+'/'+name+'.png',bytes);
      await route.fulfill({status:200,body:'OK'});
      clearTimeout(fail);resolve(bytes.length);
    }).catch(reject);
  });
  await page.getByRole('button',{name:'保存场景画面'}).evaluate(e=>e.click());
  const size=await capture;
  report.game.push({name,size,drawCalls:stat.drawCalls,triangles:stat.triangles,renderer:stat.graphicsBackend,
    animals:stat.wildlife,bones:stat.wildlife.bones});
  await page.unroute('**/__scene-capture');
}
try{
  const p=await browser.newPage({viewport:{width:960,height:660}});
  p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto('http://127.0.0.1:5173/tools/goat-rig-review.html',{waitUntil:'domcontentloaded'});
  await p.waitForFunction(()=>window.goatReview?.ready||window.goatReview?.error,null,{timeout:60000});
  const error=await p.evaluate(()=>window.goatReview.error);if(error)throw Error(error);
  const poses=[
    ['rig-side-idle','idle',0,'side'],['rig-3q-idle','idle',.1,'threequarter'],
    ['rig-lifted-hoof','lift_front',1.1,'threequarter'],
    ['rig-two-step-1','walk',.55,'side'],['rig-two-step-2','walk',1.55,'side'],
    ['rig-head-turn','survey',1.45,'threequarter']];
  for(const [name,clip,time,angle] of poses){
    const result=await p.evaluate(({clip,time,angle})=>window.goatReview.pose(clip,time,angle),{clip,time,angle});
    await save(result,out+'/'+name+'.png');
    delete result.png;report.rig.push({name,...result});
  }
  const ground=report.rig.find(p=>p.name==='rig-side-idle').leftForehoofY;
  const lifted=report.rig.find(p=>p.name==='rig-lifted-hoof').leftForehoofY;
  assert.ok(lifted-ground>.045,'Lifted hoof must clear ground, measured difference='+String(lifted-ground));
  await p.close();
  for(const v of [{width:1365,height:900,mobile:false,name:'desktop'},{width:390,height:844,mobile:true,name:'mobile'}]){
    const ctx=await browser.newContext({viewport:{width:v.width,height:v.height},isMobile:v.mobile,hasTouch:v.mobile});
    const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto('http://127.0.0.1:5173/?inspect=1',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      try{const a=JSON.parse(document.querySelector('#runtime-stats')?.textContent||'{}').current;
        return a?.wildlife?.available?.includes('wildlife.goat')&&a.gameTime>1;}
      catch{return false;}
    },null,{timeout:100000});
    await sceneShot(page,'goatVista',v.name+'-game');
    await ctx.close();
  }
  assert.deepEqual(report.errors,[]);
  report.result='passed';
}catch(error){report.result='failed';report.failure=String(error?.stack||error);throw error;}
finally{await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
