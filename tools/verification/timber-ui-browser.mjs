/** Targeted UI evidence: production App/runtime and actual sandbox entry points. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer,createLogger} from 'vite';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.resolve(process.env.TIMBER_EVIDENCE_DIR??'/tmp/how-timber-evidence');
const scope=process.env.TIMBER_REVIEW_SCOPE??'all';
const origin='http://127.0.0.1:5193';
const fixturePath='/__timber-review';
const desktop={width:1280,height:800};
const smallViews=[{width:390,height:844},{width:320,height:720},{width:844,height:390}];
const report={
  result:'running',startedAt:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  scope,origin,browser:null,buildEntrySha256:null,woodworkingEntrySha256:null,frames:[],flows:[],focusChecks:[],layoutIssues:[],errors:[],failedRequests:[],warnings:[],failures:[],
  inputs:{seed:104729,clock:'time=0, speed=0; 14:00 production calendar',save:'isolated in-memory WorldSaveStore',stock:'ten active production item IDs granted through inventoryTransaction',dpr:1},
  limits:[
    'The main UI uses the real App/runtime through a Vite review entry; npm run build is a separate required gate.',
    'Mobile checks synthesize touch in Chromium; they are not physical-device or GPU-performance certification.',
    'Screenshots require visual review. Bounds and target checks do not certify the artistic result.',
    'The game clock is fixed; decorative animation phases depend on elapsed rendering time.',
    'The woodworking package is opened from its built single HTML file in an offline browser context; its full craft progression is outside this UI review.',
  ],
};
let server,browser,activePage,phase='initialise',serverLog='';
await fs.mkdir(out,{recursive:true});
const saveReport=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
const frames=(page,count=3)=>page.evaluate(count=>new Promise(resolve=>{
  const step=()=>count-->0?requestAnimationFrame(step):resolve();step();
}),count);

async function scenario(name,page,operation,cleanup){
  phase=name;activePage=page;
  let passed=true;
  try{await operation();report.flows.push({name,result:'passed'});console.log(`PASS ${name}`);}
  catch(error){
    passed=false;
    const failure={name,message:String(error),stack:error.stack};
    report.failures.push(failure);report.flows.push({name,result:'failed'});
    console.error(`FAIL ${name}: ${error}`);
    if(!page.isClosed()){
      await page.screenshot({path:path.join(out,`failure-${name}.png`),fullPage:true,timeout:15000}).catch(()=>{});
      failure.dom=await page.locator('body').innerText({timeout:3000}).catch(()=>null);
      failure.layout=await layout(page,{fitViewport:false}).catch(()=>null);
      const html=await page.content().catch(()=>null);
      if(html){failure.html=`failure-${name}.html`;await fs.writeFile(path.join(out,failure.html),html);}
    }
  }finally{
    // Preserve the failed UI before recovering it for the next independent scenario.
    if(cleanup)passed=await scenario(`${name}-cleanup`,page,cleanup)&&passed;
  }
  await saveReport();
  return passed;
}

async function newPage(viewport,touch=false){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:touch,hasTouch:touch,locale:'zh-CN'});
  const page=await context.newPage();activePage=page;
  page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(90000);
  let closing=false;
  const record=()=>({phase,viewport:page.viewportSize(),url:page.url()});
  page.on('pageerror',error=>report.errors.push({...record(),type:'pageerror',message:String(error)}));
  page.on('console',message=>{
    if(message.type()==='error'||/shader error|GL_INVALID|VALIDATE_STATUS.*false/i.test(message.text()))report.errors.push({...record(),type:message.type(),message:message.text()});
    else if(message.type()==='warning')report.warnings.push({...record(),message:message.text()});
  });
  page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)report.failedRequests.push({...record(),url:response.url(),status:response.status()});});
  page.on('requestfailed',request=>{
    if(!closing&&request.url().startsWith(origin)&&!request.failure()?.errorText.includes('ERR_ABORTED'))report.failedRequests.push({...record(),url:request.url(),message:request.failure()?.errorText});
  });
  return {page,close:async()=>{closing=true;await context.close();}};
}

async function gameState(page){
  return page.evaluate(()=>JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState);
}
async function loadGame(page){
  await page.goto(`${origin}${fixturePath}?inspect=1`);
  await page.waitForFunction(()=>{
    const data=document.querySelector('#runtime-stats')?.textContent;
    if(!data||document.querySelector('.loading'))return false;
    try{return !!JSON.parse(data).current.worldState;}catch{return false;}
  },null,{timeout:180000});
  await page.locator('[data-how-ui="timber"]').waitFor();
  // Only the development diagnostic overlay is hidden from player-facing evidence.
  // Player windows and overflow remain untouched.
  await page.addStyleTag({content:'.diagnostics,.build-mark{display:none!important}'});
  await page.evaluate(()=>document.fonts.ready);
  await frames(page,4);
  assert.equal((await gameState(page)).seed,report.inputs.seed);
}

async function assertFocusIn(page,selector,stage){
  const focus=await page.evaluate(selector=>{
    const owner=document.querySelector(selector),active=document.activeElement;
    const box=active?.getBoundingClientRect();
    return {
      owner:selector,inside:!!owner?.contains(active),tag:active?.tagName.toLowerCase(),
      label:active?.getAttribute('aria-label')||active?.textContent?.trim().replace(/\s+/g,' ').slice(0,100),
      visible:!!active?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&!!active?.getClientRects().length,
      inert:!!active?.closest('[inert]'),
      rect:box?{x:box.x,y:box.y,width:box.width,height:box.height}:null,
    };
  },selector);
  report.focusChecks.push({phase,stage,...focus});
  assert.ok(focus.inside&&focus.visible&&!focus.inert,`${stage}: focus must stay in a visible, active control or panel: ${JSON.stringify(focus)}`);
}

async function layout(page,{fitViewport=true}={}){
  return page.evaluate(({fitViewport})=>{
    const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const description=element=>({tag:element.tagName.toLowerCase(),id:element.id,classes:typeof element.className==='string'?element.className:'',label:element.getAttribute('aria-label')||element.textContent?.trim().replace(/\s+/g,' ').slice(0,90)||'',rect:rect(element)});
    const visible=element=>element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&element.getClientRects().length>0;
    const domScopes=[document];
    for(let index=0;index<domScopes.length;index++){
      for(const element of domScopes[index].querySelectorAll('*'))if(element.shadowRoot)domScopes.push(element.shadowRoot);
    }
    const roots=domScopes.flatMap(scope=>[...scope.querySelectorAll('[data-how-ui="timber"]')]);
    const issues=[];
    if(!roots.length)return {issues:[{kind:'missing-theme-root'}],viewport:{width:innerWidth,height:innerHeight}};
    const query=(scopes,selector)=>[...new Set(scopes.flatMap(scope=>[...scope.querySelectorAll(selector)]))];
    const modal=query(roots,'dialog[open],[role="dialog"][aria-modal="true"]').filter(visible).at(-1);
    const foreground=query(roots,'.warehouse-dialog,.route-sheet,.help-sheet,.weather-panel,.target-card').filter(visible).at(-1);
    const scopes=modal?[modal]:foreground?[foreground]:roots;
    const controls=[];const seen=new Set();
    for(const element of query(scopes,'button,summary,select,input:not([type="hidden"]),[role="button"]')){
      if(!visible(element))continue;
      const target=element.matches('input[type="checkbox"],input[type="radio"]')?(element.labels?.[0]||element):element;
      if(seen.has(target))continue;seen.add(target);
      const info=description(target);controls.push(info);
      if(info.rect.width<43.5||info.rect.height<43.5)issues.push({kind:'target-smaller-than-project-44px',...info});
      if(fitViewport&&(info.rect.x<-.5||info.rect.y<-.5||info.rect.right>innerWidth+.5||info.rect.bottom>innerHeight+.5))issues.push({kind:'control-outside-viewport',...info});
    }
    const panels=query(roots,'.warehouse-dialog,.route-sheet,.help-sheet,.weather-panel,.pause-dialog[open],.target-card,.forest-reader').filter(visible);
    const content=query(scopes,'.item-browser,.browser-body,.wood-detail,.wood-tabs,.rarity-vfx-controls').filter(visible);
    for(const element of [...panels,...content]){
      const info=description(element);
      if(element.scrollWidth>element.clientWidth+2)issues.push({kind:'content-horizontal-overflow',...info,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth});
      if(fitViewport&&panels.includes(element)){
        if(info.rect.x<-.5||info.rect.y<-.5||info.rect.right>innerWidth+.5||info.rect.bottom>innerHeight+.5)issues.push({kind:'window-outside-viewport',...info});
        if(element.scrollHeight>element.clientHeight+2)issues.push({kind:'window-content-overflow',...info,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight});
      }
    }
    if(document.documentElement.scrollWidth>innerWidth+2)issues.push({kind:'page-horizontal-overflow',width:innerWidth,scrollWidth:document.documentElement.scrollWidth});
    const brokenImages=query(domScopes,'img').filter(image=>image.complete&&image.naturalWidth===0).map(image=>({src:image.currentSrc||image.src,...description(image)}));
    issues.push(...brokenImages.map(image=>({kind:'unloaded-image',...image})));
    const surfaces=query(roots,'[data-timber-surface]').filter(visible).map(element=>({role:element.dataset.timberSurface,paint:element.dataset.timberPaint,hasGeneratedImage:getComputedStyle(element).getPropertyValue('--how-surface-image').includes('data:image/svg+xml'),...description(element)}));
    if(!surfaces.length)issues.push({kind:'no-shared-timber-surfaces'});
    for(const themeRoot of roots){
      const ownSurfaces=query([themeRoot],'[data-timber-surface]').filter(visible);
      if(ownSurfaces.length&&!ownSurfaces.some(element=>element.dataset.timberPaint==='ready'))issues.push({kind:'shared-surface-painter-not-ready',...description(themeRoot)});
    }
    for(const surface of surfaces)if(surface.paint==='ready'&&!surface.hasGeneratedImage)issues.push({kind:'shared-surface-image-missing',...surface});
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},themeRoots:roots.length,shadowRoots:domScopes.length-1,controls,panels:panels.map(description),surfaces:surfaces.length,paintedSurfaces:surfaces.filter(surface=>surface.paint==='ready').length,issues};
  },{fitViewport});
}

async function capture(page,name,options={}){
  await page.waitForFunction(()=>{
    const scopes=[document];
    for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
    return scopes.every(scope=>[...scope.querySelectorAll('img')].every(image=>image.complete));
  },null,{timeout:30000});
  await frames(page,4);
  const measured=await layout(page,options);
  const stats=await page.evaluate(()=>{
    const text=document.querySelector('#runtime-stats')?.textContent;
    if(text){const s=JSON.parse(text).current;return {seed:s.seed,gameTime:s.gameTime,shaderErrors:s.shaderErrors,contextLost:s.contextLost,drawCalls:s.drawCalls,triangles:s.triangles,graphicsBackend:s.graphicsBackend};}
    const api=window.__CABIN_AUDIT__;return api?api.stats():null;
  });
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:options.fitViewport===false,animations:'disabled',timeout:60000});
  report.frames.push({name,file:`${name}.png`,...measured,stats});
  report.layoutIssues.push(...measured.issues.map(issue=>({frame:name,...issue})));
  if(stats?.shaderErrors)report.errors.push({phase,name,message:`${stats.shaderErrors} shader errors`});
  if(stats?.contextLost)report.errors.push({phase,name,message:'WebGL context lost'});
  await saveReport();console.log(`CAPTURE ${name}: ${measured.issues.length} layout issue(s)`);
}

async function openItems(page,touch=false){
  const button=page.locator('.bottom-toolbar').getByRole('button',{name:'打开仓库',exact:true});
  if(touch)await button.tap();else{await button.focus();await page.keyboard.press('Enter');}
  await page.getByRole('dialog',{name:'物品与仓库',exact:true}).waitFor();
  await page.getByRole('navigation',{name:'物品位置',exact:true}).getByRole('button',{name:'营地',exact:true}).click();
  await page.getByRole('group',{name:'营地材料图标',exact:true}).getByRole('button').first().waitFor();
}
async function openSettings(page,touch=false){
  const button=page.locator('.bottom-toolbar').getByRole('button',{name:'操作',exact:true});
  if(touch)await button.tap();else await button.click();
  await page.getByRole('navigation',{name:'操作分类',exact:true}).getByRole('button',{name:'显示',exact:true}).click();
  await page.getByRole('radio',{name:'简化',exact:true}).check();
  assert.equal(await page.getByRole('radio',{name:'简化',exact:true}).isChecked(),true);
}

async function desktopGame(){
  const session=await newPage(desktop),page=session.page;
  try{
    if(!await scenario('desktop-load',page,()=>loadGame(page)))return;
    await scenario('desktop-hud',page,()=>capture(page,'01-desktop-hud'));
    await scenario('desktop-items-keyboard-focus',page,async()=>{
      await openItems(page);
      const slots=page.getByRole('group',{name:'营地材料图标',exact:true}).getByRole('button');
      await slots.nth(1).click();assert.equal(await slots.nth(1).getAttribute('aria-pressed'),'true');
      await capture(page,'02-desktop-items');
      const pager=page.getByRole('navigation',{name:'物品分页',exact:true});
      if(await pager.count()){
        await pager.getByRole('button',{name:'下一页',exact:true}).click();
        await capture(page,'03-desktop-items-next-page');
      }
      await page.keyboard.press('Escape');await page.locator('.warehouse-dialog').waitFor({state:'hidden'});
      await frames(page,2);
      assert.equal(await page.locator('.bottom-toolbar').getByRole('button',{name:'打开仓库',exact:true}).evaluate(element=>element===document.activeElement),true,'Closing the inventory must return focus to its opener');
      await page.keyboard.press('b');await page.locator('.warehouse-dialog').waitFor();
      await page.keyboard.press('Escape');await page.locator('.warehouse-dialog').waitFor({state:'hidden'});
    });
    await scenario('desktop-route-and-outside-dismiss',page,async()=>{
      await page.locator('.bottom-toolbar').getByRole('button',{name:'路线',exact:true}).click();
      await page.locator('.route-sheet').waitFor();
      const before=await gameState(page);
      await page.getByRole('group',{name:'路线图标',exact:true}).getByRole('button').nth(1).click();
      await capture(page,'04-desktop-route');
      const selected=await gameState(page);
      assert.deepEqual(selected.route,before.route,'Choosing a route row must not start walking');
      const point=await page.evaluate(()=>{
        const shell=document.querySelector('main.game-shell');
        const host=shell?.querySelector('.scene-host'),canvas=host?.querySelector('canvas');
        const scene=canvas?.getBoundingClientRect(),panel=document.querySelector('.route-sheet')?.getBoundingClientRect();
        if(!scene||!panel)return null;
        const left=Math.max(0,scene.left),top=Math.max(0,scene.top);
        const width=Math.min(innerWidth,scene.right)-left,height=Math.min(innerHeight,scene.bottom)-top;
        if(width<=0||height<=0)return null;
        for(const y of [.3,.5,.7])for(const x of [.08,.25,.5,.75,.92]){
          const p={x:left+width*x,y:top+height*y};
          if(p.x>=panel.left&&p.x<=panel.right&&p.y>=panel.top&&p.y<=panel.bottom)continue;
          const hit=document.elementFromPoint(p.x,p.y);
          // Open menus intentionally disable scene pointer events; the visible scene
          // can therefore hit the game shell while its capture handler dismisses UI.
          if(hit===shell||hit===host||hit instanceof HTMLCanvasElement&&host.contains(hit))return p;
        }
        return null;
      });
      assert.ok(point,'The open window must leave a non-interactive point inside the scene rectangle for an outside click');
      await page.mouse.click(point.x,point.y);await page.locator('.route-sheet').waitFor({state:'hidden'});
      await page.waitForTimeout(350); // Allow the normal runtime snapshot publication interval.
      const after=await gameState(page);
      assert.deepEqual(after.player,before.player,'An outside-dismiss click must not move the player');
      assert.deepEqual(after.route,before.route,'An outside-dismiss click must not add a route');
      assert.equal(after.selected,before.selected,'An outside-dismiss click must not select a world object');
    },async()=>{
      const route=page.locator('.route-sheet');
      if(await route.isVisible()){
        await route.getByRole('button',{name:'收起路线',exact:true}).click({timeout:10000});
        await route.waitFor({state:'hidden',timeout:10000});
      }
    });
    await scenario('desktop-weather-keyboard',page,async()=>{
      const summary=page.locator('summary[aria-label="天气与木料湿度"]');
      await summary.focus();await page.keyboard.press('Enter');await page.locator('.weather-panel').waitFor();
      await page.getByRole('button',{name:'切换到阴天',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'切换到阴天',exact:true}).getAttribute('aria-pressed'),'true');
      await capture(page,'05-desktop-weather');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.weather-menu').evaluate(element=>element.open),false);
      assert.equal(await summary.evaluate(element=>element===document.activeElement),true);
    });
    await scenario('desktop-pause-focus',page,async()=>{
      const opener=page.getByRole('button',{name:'暂停',exact:true});
      await opener.focus();await page.keyboard.press('Enter');await page.locator('.pause-dialog[open]').waitFor();
      await capture(page,'06-desktop-pause');
      await page.getByRole('navigation',{name:'暂停选项',exact:true}).getByRole('button',{name:'显示',exact:true}).click();
      await capture(page,'07-desktop-pause-display');
      await page.keyboard.press('Escape');await page.locator('.pause-dialog[open]').waitFor({state:'hidden'});
      assert.equal(await opener.evaluate(element=>element===document.activeElement),true);
    });
    await scenario('desktop-settings',page,async()=>{
      await openSettings(page);await capture(page,'08-desktop-settings');
      await page.keyboard.press('Escape');await page.locator('.help-sheet').waitFor({state:'hidden'});
    });
    await scenario('route-selection-survives-narrow-layout',page,async()=>{
      await page.locator('.bottom-toolbar').getByRole('button',{name:'路线',exact:true}).click();
      const route=page.locator('.route-sheet');await route.waitFor();
      const slots=page.getByRole('group',{name:'路线图标',exact:true}).getByRole('button');
      assert.ok(await slots.count()>=6,'The desktop first page must contain the sixth route item used by this resize regression');
      const selected=slots.nth(5);
      await selected.focus();await page.keyboard.press('Enter');
      const label=await selected.getAttribute('aria-label');
      const heading=await route.locator('.wood-detail h3').innerText();
      assert.equal(await selected.getAttribute('aria-pressed'),'true');
      assert.equal(await selected.evaluate(element=>element===document.activeElement),true,'The selected desktop slot must own focus before resizing');
      await capture(page,'09-route-selected-desktop');
      await page.setViewportSize(smallViews[0]);await frames(page,4);
      assert.equal(await route.locator('.browser-slots button[aria-pressed="true"]').getAttribute('aria-label'),label,'Shrinking the page capacity must preserve the selected route');
      assert.equal(await route.locator('.wood-detail h3').innerText(),heading,'The detail panel must still describe the same route');
      await assertFocusIn(page,'.route-sheet','after 1280 to 390 resize');
      await page.keyboard.press('Tab');await assertFocusIn(page,'.route-sheet','Tab after resize');
      await page.keyboard.press('Shift+Tab');await assertFocusIn(page,'.route-sheet','Shift+Tab after resize');
      await capture(page,'10-route-selected-390x844');
    });
    // Restore the test viewport and close the actual panel even when its assertions failed.
    await scenario('restore-desktop-after-route-resize',page,async()=>{
      await page.setViewportSize(desktop);await frames(page,2);
      if(await page.locator('.route-sheet').isVisible()){
        await page.keyboard.press('Escape');await page.locator('.route-sheet').waitFor({state:'hidden'});
      }
    });
    await scenario('warehouse-drag-skips-hidden-tab-targets',page,async()=>{
      await openItems(page);
      const before=await gameState(page);
      const source=page.locator('.warehouse-dock .wood-slot.is-draggable').first();
      await source.waitFor();await source.focus();
      const box=await source.boundingBox();assert.ok(box);
      const from={x:box.x+box.width/2,y:box.y+box.height/2};
      await page.mouse.move(from.x,from.y);await page.mouse.down();
      await page.mouse.move(from.x-18,from.y-18,{steps:3});
      await page.locator('.warehouse-dock.is-dragging').waitFor();
      await page.locator('.item-drag-ghost').waitFor();await frames(page,2);
      for(const key of ['Tab','Tab','Shift+Tab']){
        await page.keyboard.press(key);await assertFocusIn(page,'.warehouse-dock',`${key} while item content is hidden by dragging`);
      }
      await capture(page,'11-warehouse-drag-keyboard');
      await page.keyboard.press('Escape');await page.locator('.item-drag-ghost').waitFor({state:'hidden'});
      await page.mouse.up();
      assert.equal(await page.locator('.warehouse-dock').isVisible(),true,'Escape must cancel the drag before closing the warehouse');
      assert.deepEqual((await gameState(page)).inventory,before.inventory,'Cancelled drag and keyboard traversal must preserve inventory');
    });
    // Failure evidence above is captured while the drag is still active, before this recovery.
    await scenario('restore-after-warehouse-drag',page,async()=>{
      try{if(await page.locator('.item-drag-ghost').isVisible())await page.keyboard.press('Escape');}
      finally{await page.mouse.up();}
      if(await page.locator('.warehouse-dock').isVisible()){
        await page.keyboard.press('Escape');await page.locator('.warehouse-dock').waitFor({state:'hidden'});
      }
    });
    await scenario('story-reader-focus-pages-and-return',page,async()=>{
      // Use the real route list and approach command; no injected target or test-only button.
      await page.locator('.bottom-toolbar').getByRole('button',{name:'路线',exact:true}).click();
      const route=page.locator('.route-sheet');await route.waitFor();
      await page.getByRole('group',{name:'路线图标',exact:true}).getByRole('button',{name:'火塘',exact:true}).click();
      await route.getByRole('button',{name:'查看',exact:true}).click();
      const target=page.locator('.target-card');await target.waitFor();
      const fireItems=page.getByRole('group',{name:'火塘图标',exact:true});
      if(!await fireItems.isVisible()){
        await target.getByRole('button',{name:'走近',exact:true}).first().click();
        await fireItems.waitFor({timeout:45000});
      }
      await fireItems.getByRole('button',{name:'森林故事',exact:true}).click();
      const read=target.getByRole('button',{name:'坐下阅读',exact:true});
      await read.click();await frames(page,2);
      // Sitting may first queue an ordinary walk to the clear front of the stump.
      if(!await page.locator('.forest-reader').isVisible()){
        await page.waitForFunction(()=>{
          const state=JSON.parse(document.querySelector('#runtime-stats').textContent).current.worldState;
          return state.route.length===0&&!state.player.moving;
        },null,{timeout:45000});
        await read.click();
      }
      const reader=page.locator('.forest-reader');await reader.waitFor();
      await frames(page,2);await assertFocusIn(page,'.forest-reader','two frames after opening the story');
      const firstText=await reader.locator('.forest-reader-paper p').innerText();
      const firstPage=await reader.locator('.forest-reader-page').innerText();
      assert.ok(Number(firstPage.split('/')[1])>1,'The normal story must have another page for the keyboard regression');
      await page.keyboard.press('ArrowRight');await frames(page,2);
      assert.notEqual(await reader.locator('.forest-reader-paper p').innerText(),firstText,'ArrowRight must turn the story page');
      assert.equal(Number((await reader.locator('.forest-reader-page').innerText()).split('/')[0]),2);
      await assertFocusIn(page,'.forest-reader','after turning right');
      await page.keyboard.press('ArrowLeft');await frames(page,2);
      assert.equal(await reader.locator('.forest-reader-paper p').innerText(),firstText,'ArrowLeft must return to the first story page');
      assert.equal(await reader.locator('.forest-reader-page').innerText(),firstPage);
      await capture(page,'12-story-reader-keyboard');
      await page.keyboard.press('Escape');await reader.waitFor({state:'hidden'});
      await frames(page,2);await assertFocusIn(page,'.target-card','after closing the story');
    });
  }finally{await session.close();}
}

async function mobileGame(){
  const session=await newPage(smallViews[0],true),page=session.page;
  try{
    if(!await scenario('mobile-load',page,()=>loadGame(page)))return;
    for(const viewport of smallViews){
      await page.setViewportSize(viewport);await frames(page,4);
      const label=`${viewport.width}x${viewport.height}`;
      await scenario(`game-${label}-touch-items`,page,async()=>{
        await openItems(page,true);await capture(page,`game-${label}-items`);
        await page.getByRole('button',{name:'关闭仓库',exact:true}).tap();
        await page.locator('.warehouse-dialog').waitFor({state:'hidden'});
      });
      await scenario(`game-${label}-touch-settings`,page,async()=>{
        await openSettings(page,true);await capture(page,`game-${label}-settings`);
        await page.getByRole('button',{name:'关闭操作说明',exact:true}).tap();
        await page.locator('.help-sheet').waitFor({state:'hidden'});
      });
    }
  }finally{await session.close();}
}

async function cabin(viewport,touch=false){
  const session=await newPage(viewport,touch),page=session.page;
  const label=`cabin-${viewport.width}x${viewport.height}`;
  try{
    if(!await scenario(`${label}-load`,page,async()=>{
      await page.goto(`${origin}/sandbox/cabin-interior/`);
      await page.waitForFunction(()=>window.__VISUAL_READY__===true&&!!window.__CABIN_AUDIT__,null,{timeout:150000});
    }))return;
    await scenario(`${label}-move-cancel`,page,async()=>{
      await capture(page,`${label}-initial`,{fitViewport:false});
      // Discover a real, already placed item. No fixture-only furniture command.
      const item=page.locator('[data-select]:enabled').first();
      if(touch)await item.tap();else await item.click();
      const before=await page.evaluate(()=>window.__CABIN_AUDIT__.getSnapshot());
      await page.locator('[data-action="move"]').click();
      await page.locator('#placement-panel').waitFor();
      await capture(page,`${label}-placement`,{fitViewport:false});
      await page.locator('#place-cancel').click();
      assert.deepEqual(await page.evaluate(()=>window.__CABIN_AUDIT__.getSnapshot()),before,'Cancel must preserve the committed cabin state');
    });
    await scenario(`${label}-empty-restore`,page,async()=>{
      await page.locator('[data-preset="empty"]').click();
      const before=await page.evaluate(()=>window.__CABIN_AUDIT__.getSnapshot());
      await page.locator('[data-restore]').first().click();
      const after=await page.evaluate(()=>window.__CABIN_AUDIT__.getSnapshot());
      assert.equal(after.items.filter(item=>item.location.kind!=='stored').length,before.items.filter(item=>item.location.kind!=='stored').length+1);
      await capture(page,`${label}-restored`,{fitViewport:false});
    });
  }finally{await session.close();}
}

async function gallery(){
  const session=await newPage(desktop),page=session.page;
  try{
    if(!await scenario('gallery-load',page,async()=>{
      await page.goto(`${origin}/sandbox/timber-ui/`);
      await page.locator('#timber-lab[data-how-ui="timber"]').waitFor();
    }))return;
    await scenario('gallery-real-controls',page,async()=>{
      assert.equal(await page.locator('.game-shell').count(),0,'The gallery URL must resolve its own entry, not the game fallback');
      await capture(page,'gallery-desktop',{fitViewport:false});
      assert.equal(await page.locator('#material-count').innerText(),'3');
      await page.getByRole('button',{name:'取出一根',exact:true}).click();
      assert.equal(await page.locator('#material-count').innerText(),'4');
      await page.getByRole('button',{name:'制作',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#craft-status')?.textContent.includes('完成了木凳'));
      assert.equal(await page.locator('#material-count').innerText(),'0');
      await page.locator('#shadow-light').click();
      assert.equal(await page.locator('#shadow-status').innerText(),'灯火已点亮');
      await capture(page,'gallery-after-interaction',{fitViewport:false});
      await page.getByRole('button',{name:'长文字',exact:true}).click();
      await page.setViewportSize(smallViews[0]);await capture(page,'gallery-390x844-long-text',{fitViewport:false});
      await page.getByRole('button',{name:'纯色回退',exact:true}).click();
      await capture(page,'gallery-390x844-fallback',{fitViewport:false});
    });
  }finally{await session.close();}
}

async function woodworking(){
  const entry=path.join(root,'sandbox/woodworking/dist/woodworking.html');
  report.woodworkingEntrySha256=createHash('sha256').update(await fs.readFile(entry)).digest('hex');
  const session=await newPage(desktop),page=session.page;
  try{
    await page.context().setOffline(true);
    page.on('request',request=>{
      if(/^https?:/.test(request.url()))report.failedRequests.push({phase,url:request.url(),message:'The standalone woodworking file requested a network resource while offline'});
    });
    if(!await scenario('woodworking-offline-load',page,async()=>{
      await page.goto(pathToFileURL(entry).href);
      await page.locator('#workshop [data-how-ui="timber"]').waitFor();
      await page.locator('#workshop [data-timber-paint="ready"]').first().waitFor();
    }))return;
    await scenario('woodworking-offline-shadow-controls',page,async()=>{
      await capture(page,'woodworking-offline-desktop',{fitViewport:false});
      await page.locator('[data-a="start"]').click();
      await page.locator('#operations').waitFor();
      await page.locator('[data-a="mark"]').click();
      assert.equal(await page.locator('[data-a="mark"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-a="rotate"]').getAttribute('aria-pressed'),'false');
      await page.locator('[data-a="rotate"]').click();
      assert.equal(await page.locator('[data-a="rotate"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-a="mark"]').getAttribute('aria-pressed'),'false');
      await capture(page,'woodworking-offline-started',{fitViewport:false});
    });
    await scenario('woodworking-offline-390x844',page,async()=>{
      await page.setViewportSize(smallViews[0]);
      await capture(page,'woodworking-offline-390x844',{fitViewport:false});
    });
  }finally{await session.close();}
}

try{
  if(!['desktop','mobile','modules','all'].includes(scope))throw new Error(`Unknown TIMBER_REVIEW_SCOPE: ${scope}`);
  report.buildEntrySha256=createHash('sha256').update(await fs.readFile(path.join(root,'dist/index.html'))).digest('hex');
  const logger=createLogger();
  const baseInfo=logger.info.bind(logger),baseWarn=logger.warn.bind(logger),baseError=logger.error.bind(logger);
  logger.info=(message,options)=>{serverLog+=`${message}\n`;baseInfo(message,options);};
  logger.warn=(message,options)=>{serverLog+=`${message}\n`;baseWarn(message,options);};
  logger.error=(message,options)=>{serverLog+=`${message}\n`;baseError(message,options);};
  const fixtureHtml='<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><link rel="icon" href="/assets/ui-r1/icons/cabin-64.png"><title>森林之家 · 木质界面检视</title></head><body><div id="root"></div><script type="module" src="/tools/verification/timber-ui-fixture.ts"></script></body></html>';
  server=await createServer({root,customLogger:logger,server:{host:'127.0.0.1',port:5193,strictPort:true},plugins:[{
    name:'timber-review-entry',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      if(req.url?.split('?')[0]!==fixturePath)return next();
      try{const html=await vite.transformIndexHtml(fixturePath,fixtureHtml,req.originalUrl);res.statusCode=200;res.setHeader('Content-Type','text/html');res.end(html);}
      catch(error){next(error);}
    });},
  }]});
  await server.listen();phase='launch Chromium';
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  report.browser=await browser.version();
  if(scope==='all'||scope==='desktop')await desktopGame();
  if(scope==='all'||scope==='mobile')await mobileGame();
  if(scope==='all'||scope==='modules'){
    await gallery();
    for(const viewport of [desktop,...smallViews])await cabin(viewport,viewport!==desktop);
    await woodworking();
  }
  assert.deepEqual(report.errors,[],'Unexpected browser console/page errors');
  assert.deepEqual(report.failedRequests,[],'Assets or modules failed to load');
  assert.deepEqual(report.layoutIssues,[],'UI target/bounds failures; see each frame and rectangle in report.json');
  assert.deepEqual(report.failures,[],'One or more interaction scenarios failed');
  report.result='passed';console.log(`Timber UI review passed (${scope}): ${report.frames.length} frames / ${report.flows.length} flows`);
}catch(error){
  report.result='failed';report.failure={phase,message:String(error),stack:error.stack};
  console.error(error);process.exitCode=1;
  if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(out,'failure.png'),timeout:15000,fullPage:true}).catch(()=>{});
}finally{
  await browser?.close().catch(()=>{});await server?.close();
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(path.join(out,'server.log'),serverLog);await saveReport();
}
