/** Optional before-images. This script never gates the current branch's UI review. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceRevision='14992fb7da4152af3b9c5a554c853dbf6a1e365c';
const out=path.join(path.resolve(process.env.TIMBER_EVIDENCE_DIR??'/tmp/how-timber-evidence'),'baseline');
const origin='http://127.0.0.1:5194',fixturePath='/__timber-review';
const fixtureRelative='tools/verification/timber-ui-fixture.ts';
const viewport={width:1280,height:800};
const report={
  result:'running',optional:true,startedAt:new Date().toISOString(),sourceRevision,
  testedRevision:null,fixtureSha256:null,dependencyLocks:null,browser:null,
  captureMethod:'Chromium Page.captureScreenshot, fromSurface; unchanged viewport and renderer',
  viewport,dpr:1,frames:[],failures:[],errors:[],failedRequests:[],warnings:[],serverMessages:[],
  inputs:{seed:104729,clock:'time=0, speed=0; 14:00 production calendar',save:'same in-memory fixture copied byte for byte from the candidate checkout'},
  limits:[
    'These are source-level Vite captures of the pinned main commit, not production-build certification.',
    'Only the development diagnostic overlay is hidden. Historical layout defects remain visible.',
    'The candidate node_modules directory is shared; package-lock equality is required before capture.',
    'The settings frame uses cloudy weather and simplified rarity effects, matching the current desktop review sequence.',
    'Decoration and renderer warm-up depend on elapsed time. Compare the UI rather than treating every scene pixel as a regression.',
    'Failure is recorded here and intentionally leaves this optional script with exit status zero.',
  ],
};
let temporary,checkout,server,browser,page,closing=false,worktreeAdded=false,phase='prepare';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const append=(list,value)=>{if(list.length<40)list.push(value);};
const git=args=>{
  try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();}
  catch(error){throw new Error(`git ${args[0]} failed (${error.code??error.status??'unknown status'})`);}
};
const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
const frames=()=>page.evaluate(()=>new Promise(resolve=>{
  let count=4;const step=()=>count-->0?requestAnimationFrame(step):resolve();step();
}));

async function screenshot(file,timeout=90000){
  // Match the repository's east-bank review: read the composited viewport directly.
  // Playwright's screenshot preparation can wait on RAF stability in the slow software renderer.
  const session=await page.context().newCDPSession(page);
  let timer;
  try{
    const frame=await Promise.race([
      session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`Viewport screenshot timed out after ${timeout}ms`)),timeout);}),
    ]);
    await fs.writeFile(file,Buffer.from(frame.data,'base64'));
  }finally{clearTimeout(timer);await session.detach().catch(()=>{});}
}

async function failure(name,error){
  const entry={name,message:String(error),stack:error.stack?.slice(0,5000)};
  report.failures.push(entry);
  if(page&&!page.isClosed()){
    entry.image=`failure-${name}.png`;
    await screenshot(path.join(out,entry.image),15000).catch(()=>{delete entry.image;});
    entry.dom=await page.locator('body').innerText({timeout:3000}).catch(()=>null);
    const html=await page.content().catch(()=>null);
    if(html){entry.html=`failure-${name}.html`;await fs.writeFile(path.join(out,entry.html),html);}
  }
  await save();
}

async function loadGame(){
  await page.goto(`${origin}${fixturePath}?inspect=1`);
  await page.waitForFunction(()=>{
    const text=document.querySelector('#runtime-stats')?.textContent;
    if(!text||document.querySelector('.loading'))return false;
    try{return !!JSON.parse(text).current.worldState;}catch{return false;}
  },null,{timeout:180000});
  // The old UI has no shared-theme marker; its real runtime state is the readiness signal.
  await page.addStyleTag({content:'.diagnostics,.build-mark{display:none!important}'});
  await page.evaluate(()=>document.fonts.ready);
  await frames();
  const seed=await page.evaluate(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState.seed);
  assert.equal(seed,report.inputs.seed);
}

async function capture(name){
  await page.waitForFunction(()=>[...document.images].every(image=>image.complete),null,{timeout:30000});
  await frames();
  const state=await page.evaluate(()=>{
    const current=JSON.parse(document.querySelector('#runtime-stats').textContent).current;
    return {
      seed:current.worldState.seed,time:current.worldState.time,clock:current.worldState.clock,
      shaderErrors:current.shaderErrors,contextLost:current.contextLost,
      brokenImages:[...document.images].filter(image=>!image.naturalWidth).map(image=>image.currentSrc||image.src),
    };
  });
  await screenshot(path.join(out,`${name}.png`));
  report.frames.push({name,file:`${name}.png`,comparesTo:`../${name}.png`,viewport,...state});
  if(state.shaderErrors||state.contextLost)append(report.errors,{phase,message:'Renderer reported an error or lost context',...state});
  for(const url of state.brokenImages)append(report.failedRequests,{phase,url,message:'Image did not decode'});
  await save();
}

async function scene(name,operation){
  phase=name;
  try{await operation();}
  catch(error){await failure(name,error);}
}

try{
  await fs.mkdir(out,{recursive:true});
  await save();
  phase='resolve-pinned-main';
  try{git(['cat-file','-e',`${sourceRevision}^{commit}`]);}
  catch{git(['fetch','--no-tags','--depth=1','origin',sourceRevision]);}
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'how-timber-baseline-'));
  checkout=path.join(temporary,'checkout');
  git(['worktree','add','--detach',checkout,sourceRevision]);worktreeAdded=true;
  report.testedRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim();
  assert.equal(report.testedRevision,sourceRevision);
  const [fixture,candidateLock,baselineLock]=await Promise.all([
    fs.readFile(path.join(root,fixtureRelative)),
    fs.readFile(path.join(root,'package-lock.json')),
    fs.readFile(path.join(checkout,'package-lock.json')),
  ]);
  report.fixtureSha256=hash(fixture);
  report.dependencyLocks={candidate:hash(candidateLock),baseline:hash(baselineLock)};
  assert.equal(report.dependencyLocks.candidate,report.dependencyLocks.baseline,'Shared dependencies require the same lockfile; baseline capture was skipped');
  await fs.access(path.join(root,'node_modules'));
  await fs.symlink(path.join(root,'node_modules'),path.join(checkout,'node_modules'),'dir');
  await fs.mkdir(path.dirname(path.join(checkout,fixtureRelative)),{recursive:true});
  await fs.writeFile(path.join(checkout,fixtureRelative),fixture);

  phase='start-baseline-server';
  const {createServer,createLogger}=await import('vite');
  const {chromium}=await import('playwright');
  const logger=createLogger('silent');
  for(const level of ['info','warn','error'])logger[level]=message=>append(report.serverMessages,{level,message:String(message).slice(0,1500)});
  const html='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="icon" href="/assets/ui-r1/icons/cabin-64.png"><title>森林之家 · main 界面对照</title></head><body><div id="root"></div><script type="module" src="/tools/verification/timber-ui-fixture.ts"></script></body></html>';
  server=await createServer({
    root:checkout,cacheDir:path.join(temporary,'vite-cache'),customLogger:logger,
    server:{host:'127.0.0.1',port:5194,strictPort:true,fs:{allow:[checkout,path.join(root,'node_modules')]}},
    plugins:[{name:'timber-baseline-entry',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(req.url?.split('?')[0]!==fixturePath)return next();
      try{
        const transformed=await vite.transformIndexHtml(fixturePath,html,req.originalUrl);
        res.statusCode=200;res.setHeader('Content-Type','text/html');res.end(transformed);
      }catch(error){next(error);}
    });}}],
  });
  await server.listen();
  phase='launch-baseline-browser';
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  report.browser=browser.version();
  const context=await browser.newContext({viewport,deviceScaleFactor:1,locale:'zh-CN'});
  page=await context.newPage();
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  page.on('pageerror',error=>append(report.errors,{phase,type:'pageerror',message:String(error)}));
  page.on('console',message=>{
    if(message.type()==='error'||/shader error|GL_INVALID|VALIDATE_STATUS.*false/i.test(message.text()))append(report.errors,{phase,type:message.type(),message:message.text()});
    else if(message.type()==='warning')append(report.warnings,{phase,message:message.text().slice(0,1000)});
  });
  page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)append(report.failedRequests,{phase,url:response.url(),status:response.status()});});
  page.on('requestfailed',request=>{
    if(!closing&&request.url().startsWith(origin)&&!request.failure()?.errorText.includes('ERR_ABORTED'))append(report.failedRequests,{phase,url:request.url(),message:request.failure()?.errorText});
  });
  phase='baseline-load';await loadGame();
  await scene('01-desktop-hud',()=>capture('01-desktop-hud'));
  await scene('02-desktop-items',async()=>{
    const opener=page.locator('.bottom-toolbar').getByRole('button',{name:'打开仓库',exact:true});
    await opener.focus();await page.keyboard.press('Enter');
    await page.getByRole('dialog',{name:'物品与仓库',exact:true}).waitFor();
    await page.getByRole('navigation',{name:'物品位置',exact:true}).getByRole('button',{name:'营地',exact:true}).click();
    await page.getByRole('group',{name:'营地材料图标',exact:true}).getByRole('button').nth(1).click();
    await capture('02-desktop-items');
  });
  await scene('08-desktop-settings',async()=>{
    // Fresh runtime avoids carrying a failed inventory interaction into this independent frame.
    await loadGame();
    const weather=page.locator('summary[aria-label="天气与木料湿度"]');
    await weather.focus();await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'切换到阴天',exact:true}).click();
    await page.keyboard.press('Escape');
    await page.locator('.bottom-toolbar').getByRole('button',{name:'操作',exact:true}).click();
    await page.getByRole('navigation',{name:'操作分类',exact:true}).getByRole('button',{name:'显示',exact:true}).click();
    await page.getByRole('radio',{name:'简化',exact:true}).check();
    await capture('08-desktop-settings');
  });
  report.result=report.failures.length?'partial':report.errors.length||report.failedRequests.length?'captured-with-errors':'captured';
}catch(error){
  report.result='failed';
  await failure(phase,error).catch(()=>{});
}finally{
  closing=true;
  await browser?.close().catch(()=>{});
  await server?.close().catch(error=>append(report.warnings,{message:`Server cleanup: ${error}`}));
  if(worktreeAdded){
    try{git(['worktree','remove','--force',checkout]);}
    catch(error){append(report.warnings,{message:`Temporary worktree cleanup: ${error}`});}
  }
  if(temporary)await fs.rm(temporary,{recursive:true,force:true}).catch(error=>append(report.warnings,{message:`Temporary directory cleanup: ${error}`}));
  report.finishedAt=new Date().toISOString();
  await save().catch(error=>console.warn(`Could not save baseline report: ${error}`));
  console.log(`Optional timber baseline: ${report.result}; ${report.frames.length}/3 frames; ${out}`);
  process.exitCode=0;
}
