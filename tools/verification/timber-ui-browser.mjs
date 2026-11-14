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
const guidedFrames=new Set(['01-desktop-hud','02-desktop-items','06-desktop-pause','game-390x844-items','game-844x390-items','game-390x844-items-notice','gallery-desktop','cabin-844x390-initial','woodworking-offline-390x844']);
const report={
  result:'running',startedAt:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  scope,origin,browser:null,buildEntrySha256:null,woodworkingEntrySha256:null,frames:[],flows:[],focusChecks:[],journeys:[],gridChecks:[],noticeChecks:[],layoutIssues:[],errors:[],failedRequests:[],warnings:[],failures:[],
  captureMethod:{viewport:'CDP Page.captureScreenshot: PNG, fromSurface=true, captureBeyondViewport=false',fullPage:'Playwright page.screenshot: fullPage=true, animations=disabled'},
  inputs:{seed:104729,clock:'time=0, speed=0; 14:00 production calendar',save:'isolated in-memory WorldSaveStore',persistentNotice:'gridNotice=1 deliberately fails isolated store.read; the production save controller creates the warning',stock:'ten active production item IDs granted through inventoryTransaction',dpr:1},
  limits:[
    'The main UI uses the real App/runtime through a Vite review entry; npm run build is a separate required gate.',
    'Mobile checks synthesize touch in Chromium; they are not physical-device or GPU-performance certification.',
    'Screenshots require visual review. Bounds and target checks do not certify the artistic result.',
    'Guide captures enable the shared diagnostic overlay only after the clean frame, then remove it before interaction resumes; guides never change player layout.',
    'Grid checks compare declared UI relationships within 1 CSS px; world labels and drag-following previews are not screen-aligned notices.',
    'The game clock is fixed; decorative animation phases depend on elapsed rendering time.',
    'Story travel uses the existing DEV fixed-step owner in bounded 2-second steps after real UI commands; recorded steps are simulation advancement, not travel performance.',
    'The woodworking package is opened from its built single HTML file in an offline browser context; its full craft progression is outside this UI review.',
  ],
};
let server,browser,activePage,phase='initialise',serverLog='';
await fs.mkdir(out,{recursive:true});
const saveReport=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
const frames=(page,count=3)=>page.evaluate(count=>new Promise(resolve=>{
  const step=()=>count-->0?requestAnimationFrame(step):resolve();step();
}),count);

async function takeScreenshot(page,{path:filename,fullPage=false,timeout=60000}){
  if(fullPage)return page.screenshot({path:filename,fullPage:true,animations:'disabled',timeout});
  // The game canvas has a fixed viewport. Use the repository's existing CDP path
  // so software-rendered frames do not enter Playwright's screenshot stability wait.
  const session=await page.context().newCDPSession(page);
  let timer;
  try{
    const frame=await Promise.race([
      session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`CDP Page.captureScreenshot timed out after ${timeout}ms`)),timeout);}),
    ]);
    await fs.writeFile(filename,Buffer.from(frame.data,'base64'));
  }finally{clearTimeout(timer);await session.detach().catch(()=>{});}
}

async function recordFailure(name,page,error,{kind='interaction',frame,measured,screenshot=true}={}){
  const failure={name,phase,kind,...(frame?{frame}:{}),message:String(error),stack:error.stack};
  report.failures.push(failure);console.error(`FAIL ${name}: ${error}`);
  if(!page.isClosed()){
    if(screenshot){
      const fullPage=await page.locator('main.game-shell').count()===0;
      await takeScreenshot(page,{path:path.join(out,`failure-${name}.png`),fullPage,timeout:15000}).catch(captureError=>{
        failure.screenshotError=String(captureError);
      });
    }
    failure.dom=await page.locator('body').innerText({timeout:3000}).catch(()=>null);
    failure.layout=measured??await layout(page,{fitViewport:false}).catch(()=>null);
    const html=await page.content().catch(()=>null);
    if(html){failure.html=`failure-${name}.html`;await fs.writeFile(path.join(out,failure.html),html);}
  }
  await saveReport();
}

async function scenario(name,page,operation,cleanup){
  phase=name;activePage=page;
  const failureCount=report.failures.length;
  let passed=true;
  try{await operation();passed=report.failures.length===failureCount;}
  catch(error){
    passed=false;
    await recordFailure(name,page,error);
  }finally{
    report.flows.push({name,result:passed?'passed':'failed'});
    console.log(`${passed?'PASS':'FAIL'} ${name}`);
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
async function loadGame(page,parameters={}){
  const query=new URLSearchParams({inspect:'1',...parameters});
  await page.goto(`${origin}${fixturePath}?${query}`);
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

async function gridGeometry(page){
  return page.evaluate(()=>{
    const tolerance=1,issues=[],checks=[];
    const scopes=[document];
    for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
    const query=selector=>[...new Set(scopes.flatMap(scope=>[...scope.querySelectorAll(selector)]))];
    const visible=element=>element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&element.getClientRects().length>0;
    const box=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const label=element=>element.id||element.getAttribute('aria-label')||(typeof element.className==='string'?element.className:'')||element.tagName.toLowerCase();
    const compare=(kind,element,actual,expected,reference)=>{
      const check={kind,element:label(element),reference,actual,expected,delta:actual-expected};checks.push(check);
      if(!Number.isFinite(actual)||!Number.isFinite(expected)||Math.abs(actual-expected)>tolerance)issues.push({...check,rect:box(element)});
    };
    const roots=query('[data-how-ui="timber"]'),regions=query('[data-ui-grid]').filter(visible);
    const rootInfo=roots.map(root=>{
      const style=getComputedStyle(root),unit=parseFloat(style.getPropertyValue('--how-grid-unit'));
      // Resolve env()/max() through CSS without assuming safe-area insets are zero.
      const probe=document.createElement('i');
      probe.dataset.uiGridProbe='true';
      probe.style.cssText='position:fixed;inset:var(--how-safe-top,0px) var(--how-safe-right,0px) var(--how-safe-bottom,0px) var(--how-safe-left,0px);visibility:hidden;pointer-events:none';
      root.append(probe);const resolved=getComputedStyle(probe);
      const safe=Object.fromEntries(['left','right','top','bottom'].map(edge=>[edge,parseFloat(resolved[edge])]));probe.remove();
      if(!['viewport','module'].includes(root.dataset.uiGridRoot))issues.push({kind:'missing-grid-root',element:label(root)});
      compare('shared-grid-unit',root,unit,4,'4 CSS px grid');
      return {element:label(root),kind:root.dataset.uiGridRoot,rect:box(root),unit,safe};
    });
    if(!regions.length)issues.push({kind:'missing-grid-regions'});
    const overlays=query('[data-ui-grid-overlay]');
    if(overlays.length)issues.push({kind:'guides-visible-in-normal-mode',count:overlays.length});
    const standard=query('.game-shell :is(.warehouse-dock,.route-sheet,.help-sheet,.target-card)').filter(visible);
    const windows=standard.map(panel=>({element:label(panel),rect:box(panel)}));
    const game=roots.find(root=>root.matches('.game-shell'));
    if(game){
      const safe=rootInfo[roots.indexOf(game)].safe;
      for(const hud of [...game.querySelectorAll('.topbar,.hud-dock,.minimap-card,.hud-notices')].filter(visible)){
        const r=box(hud);
        if(hud.matches('.topbar,.hud-notices'))compare('hud-safe-left',hud,r.left,safe.left,'viewport left rail');
        if(hud.matches('.topbar,.hud-dock,.minimap-card'))compare('hud-safe-right',hud,r.right,innerWidth-safe.right,'viewport right rail');
        if(hud.matches('.topbar'))compare('hud-safe-top',hud,r.top,safe.top,'viewport top rail');
        if(hud.matches('.hud-dock'))compare('hud-safe-bottom',hud,r.bottom,innerHeight-safe.bottom,'viewport bottom rail');
        if(hud.matches('.hud-notices')&&r.right>innerWidth-safe.right+tolerance)issues.push({kind:'notice-stack-outside-safe-rail',element:label(hud),rect:r,safe});
      }
      for(const notice of [...game.querySelectorAll('.hud-notices > [data-ui-grid="notice"]')].filter(visible)){
        const n=box(notice);compare('notice-safe-left',notice,n.left,safe.left,'viewport left rail');
        if(n.right>innerWidth-safe.right+tolerance)issues.push({kind:'notice-outside-safe-rail',element:label(notice),rect:n,safe});
        for(const panel of standard){const p=box(panel);if(Math.min(n.right,p.right)-Math.max(n.left,p.left)>tolerance&&Math.min(n.bottom,p.bottom)-Math.max(n.top,p.top)>tolerance)issues.push({kind:'notice-overlaps-window',element:label(notice),rect:n,window:label(panel),windowRect:p});}
      }
    }
    for(const panel of standard){
      const root=panel.closest('[data-how-ui="timber"]'),rootIndex=roots.indexOf(root),safe=rootInfo[rootIndex]?.safe;
      const r=box(panel),style=getComputedStyle(panel);
      if(panel.dataset.uiGrid!=='window')issues.push({kind:'missing-window-grid-role',element:label(panel)});
      if(safe){compare('window-safe-top',panel,r.top,safe.top,'viewport top rail');compare('window-safe-right',panel,r.right,innerWidth-safe.right,'viewport right rail');}
      const left=r.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft),right=r.right-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight);
      const spans=[...panel.querySelectorAll(':scope > .wood-heading,:scope > .target-top,:scope > .panel-heading,:scope > .wood-tabs,:scope > .warehouse-tools,:scope > footer.wood-status,:scope > .action-message,:scope > .item-browser,:scope > .item-browser > .browser-toolbar,:scope > .item-browser > .browser-toolbar > .wood-tabs,:scope > .item-browser > .browser-body')].filter(visible);
      for(const element of spans){const child=box(element);compare('window-content-left',element,child.left,left,label(panel));compare('window-content-right',element,child.right,right,label(panel));}
    }
    for(const body of query('.game-shell .browser-body').filter(visible)){
      const catalog=body.querySelector(':scope > .browser-catalog'),detail=body.querySelector(':scope > .wood-detail');
      if(!catalog||!visible(catalog))continue;
      const r=box(body),c=box(catalog);
      compare('catalog-content-left',catalog,c.left,r.left,label(body));
      if(detail&&visible(detail)){
        const d=box(detail);compare('detail-content-right',detail,d.right,r.right,label(body));
        if(d.top>=c.bottom-tolerance){compare('stacked-catalog-right',catalog,c.right,r.right,label(body));compare('stacked-detail-left',detail,d.left,r.left,label(body));}
      }else compare('catalog-content-right',catalog,c.right,r.right,label(body));
      const cells=[...catalog.querySelectorAll('.browser-slots > .wood-slot')].filter(visible),rows=[];
      for(const cell of cells){const r=box(cell);let row=rows.find(row=>Math.abs(row[0].rect.top-r.top)<=tolerance);if(!row)rows.push(row=[]);row.push({element:cell,rect:r});}
      for(const row of rows){
        row.sort((a,b)=>a.rect.left-b.rect.left);
        compare('slot-row-left',row[0].element,row[0].rect.left,c.left,label(catalog));compare('slot-row-right',row.at(-1).element,row.at(-1).rect.right,c.right,label(catalog));
        for(const [index,cell] of row.entries()){
          compare('slot-equal-width',cell.element,cell.rect.width,rows[0][0].rect.width,label(rows[0][0].element));
          if(rows[0][index])compare('slot-column-alignment',cell.element,cell.rect.left,rows[0][index].rect.left,label(rows[0][index].element));
        }
      }
    }
    for(const row of regions.filter(element=>element.dataset.uiGrid==='row')){
      const children=[...row.children].filter(visible),controls=children.flatMap(child=>{
        const fields=child.matches('label')?[...child.querySelectorAll('select,input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])')].filter(visible):[];
        const targets=fields.length?fields:child.matches('button,summary,select,input:not([type="hidden"]),[role="button"]')||child.matches('label:has(input[type="checkbox"],input[type="radio"])')?[child]:[];
        return targets.map(element=>({element,rect:box(element),groupRect:box(child)}));
      });
      const lines=[];
      for(const control of controls){const r=control.groupRect;let line=lines.find(line=>Math.min(line[0].groupRect.bottom,r.bottom)-Math.max(line[0].groupRect.top,r.top)>Math.min(line[0].groupRect.height,r.height)/2);if(!line)lines.push(line=[]);line.push(control);}
      for(const line of lines){
        line.sort((a,b)=>a.rect.left-b.rect.left);const first=line[0];
        for(const member of line){compare('control-row-top',member.element,member.rect.top,first.rect.top,label(row));compare('control-row-bottom',member.element,member.rect.bottom,first.rect.bottom,label(row));}
        if(controls.length===children.length&&line.length>2){
          const gap=line[1].rect.left-first.rect.right;
          for(let index=2;index<line.length;index++)compare('control-row-gap',line[index].element,line[index].rect.left-line[index-1].rect.right,gap,label(row));
        }
      }
    }
    const modal=query('dialog:modal,[aria-modal="true"]').filter(visible).at(-1),foreground=standard.at(-1);
    const active=element=>{
      if(modal)return modal.contains(element);
      const window=element.closest('.game-shell [data-ui-grid="window"]');
      return !foreground||!window||window===foreground;
    };
    const notices=regions.filter(element=>element.dataset.uiGrid==='notice'&&active(element));
    const controls=query('[data-how-ui="timber"] :is(button,summary,select,input:not([type="hidden"]))').filter(element=>visible(element)&&active(element));
    for(const notice of notices){
      const n=box(notice);
      for(const control of controls){
        if(notice.contains(control)||control.contains(notice)||notice.getRootNode()!==control.getRootNode())continue;
        const c=box(control),width=Math.min(n.right,c.right)-Math.max(n.left,c.left),height=Math.min(n.bottom,c.bottom)-Math.max(n.top,c.top);
        if(width>tolerance&&height>tolerance)issues.push({kind:'notice-overlaps-control',element:label(notice),rect:n,control:label(control),controlRect:c,overlap:{width,height}});
      }
    }
    return {viewport:{width:innerWidth,height:innerHeight},roots:rootInfo,regions:regions.map(element=>({role:element.dataset.uiGrid,element:label(element),rect:box(element)})),windows,checks,issues};
  });
}

async function captureGuides(page,name,frame){
  const key='__HOW_REVIEW_GRID_ROOTS__';
  frame.guides={file:null,capture:'viewport',overlays:0,layout:[]};
  const unchanged=async stage=>{
    const checks=await page.evaluate(key=>(window[key]?.anchors??[]).map(({element,label,before})=>{
      const r=element.getBoundingClientRect(),after={x:r.x,y:r.y,width:r.width,height:r.height};
      return {element:label,connected:element.isConnected,before,after,maxDelta:Math.max(...Object.keys(before).map(axis=>Math.abs(after[axis]-before[axis])))};
    }),key);
    frame.guides.layout.push({stage,checks});
    assert.ok(checks.length&&checks.every(check=>check.connected&&check.maxDelta<=1),`${stage}: alignment guides must preserve existing window/control geometry: ${JSON.stringify(checks)}`);
  };
  try{
    const expectedRoots=await page.evaluate(key=>{
      const scopes=[document];
      for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
      const roots=[...new Set(scopes.flatMap(scope=>[...scope.querySelectorAll('[data-how-ui="timber"]')]))];
      const visible=element=>element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&element.getClientRects().length>0;
      const anchors=[...new Set(roots.flatMap(root=>{
        const windows=[...root.querySelectorAll('[data-ui-grid="window"]')].filter(visible);
        const control=[...root.querySelectorAll('button,summary,select')].find(visible);
        return control?[...windows,control]:windows;
      }))].map(element=>{const r=element.getBoundingClientRect();return {element,label:element.id||element.getAttribute('aria-label')||element.className,before:{x:r.x,y:r.y,width:r.width,height:r.height}};});
      window[key]={roots:roots.map(root=>({root,value:root.getAttribute('data-ui-grid-debug')})),active:document.activeElement,anchors};
      for(const root of roots)root.setAttribute('data-ui-grid-debug','true');
      return roots.length;
    },key);
    await page.waitForFunction(expectedRoots=>{
      const scopes=[document];
      for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
      const overlays=scopes.flatMap(scope=>[...scope.querySelectorAll('[data-ui-grid-overlay]')]);
      return overlays.length===expectedRoots&&overlays.every(element=>element.querySelector('svg')&&Number(element.dataset.uiGridBoxes)>0);
    },expectedRoots,{polling:100,timeout:30000});
    const overlays=await page.evaluate(()=>{
      const scopes=[document];
      for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
      return scopes.flatMap(scope=>[...scope.querySelectorAll('[data-ui-grid-overlay]')].map(element=>({hidden:element.getAttribute('aria-hidden'),inert:element.inert,pointerEvents:getComputedStyle(element).pointerEvents,boxes:Number(element.dataset.uiGridBoxes),drawn:!!element.querySelector('svg'),topLayer:element.matches(':popover-open'),visible:element.checkVisibility()})));
    });
    assert.ok(overlays.length&&overlays.every(overlay=>overlay.hidden==='true'&&overlay.inert&&overlay.pointerEvents==='none'&&overlay.drawn&&overlay.boxes>0),'Shared guides must be drawn, hidden from accessibility, and transparent to pointer input');
    if(await page.locator('dialog:modal').count())assert.ok(overlays.every(overlay=>overlay.topLayer&&overlay.visible),'Guides over a native modal must enter the visible top layer');
    assert.equal(await page.evaluate(key=>window[key].active===document.activeElement,key),true,'Enabling alignment guides must preserve keyboard focus');
    await unchanged('enabled');
    await takeScreenshot(page,{path:path.join(out,`${name}-guides.png`),timeout:60000});
    Object.assign(frame.guides,{file:`${name}-guides.png`,expectedRoots,overlays});
  }catch(error){await recordFailure(`guides-${name}`,page,error,{kind:'grid-guides',frame:name,screenshot:false});}
  finally{
    await page.evaluate(key=>{
      for(const {root,value} of window[key]?.roots??[]){if(value===null)root.removeAttribute('data-ui-grid-debug');else root.setAttribute('data-ui-grid-debug',value);}
    },key);
    await page.waitForFunction(()=>{
      const scopes=[document];
      for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
      return scopes.every(scope=>!scope.querySelector('[data-ui-grid-overlay]'));
    },null,{polling:100,timeout:30000});
    try{await unchanged('disabled');}finally{await page.evaluate(key=>{delete window[key];},key);}
  }
}

async function capture(page,name,options={}){
  await page.waitForFunction(()=>{
    const scopes=[document];
    for(let index=0;index<scopes.length;index++)for(const element of scopes[index].querySelectorAll('*'))if(element.shadowRoot)scopes.push(element.shadowRoot);
    return scopes.every(scope=>[...scope.querySelectorAll('img')].every(image=>image.complete));
  },null,{timeout:30000});
  await frames(page,4);
  const measured=await layout(page,options);
  const grid=await gridGeometry(page);
  const previous=report.gridChecks.find(check=>check.viewport.width===grid.viewport.width&&check.viewport.height===grid.viewport.height&&check.windows.length);
  if(previous)for(const window of grid.windows){
    const expected=previous.windows[0];
    for(const edge of ['left','right'])if(Math.abs(window.rect[edge]-expected.rect[edge])>1)grid.issues.push({kind:'main-windows-share-rails',element:window.element,edge,actual:window.rect[edge],expected:expected.rect[edge],referenceFrame:previous.frame,referenceWindow:expected.element});
  }
  report.gridChecks.push({frame:name,...grid});
  measured.issues.push(...grid.issues);
  const stats=await page.evaluate(()=>{
    const text=document.querySelector('#runtime-stats')?.textContent;
    if(text){const s=JSON.parse(text).current;return {seed:s.seed,gameTime:s.gameTime,shaderErrors:s.shaderErrors,contextLost:s.contextLost,drawCalls:s.drawCalls,triangles:s.triangles,graphicsBackend:s.graphicsBackend};}
    const api=window.__CABIN_AUDIT__;return api?api.stats():null;
  });
  const frame={name,file:null,screenshotStatus:'pending',...measured,stats};
  report.frames.push(frame);
  report.layoutIssues.push(...measured.issues.map(issue=>({frame:name,...issue})));
  if(stats?.shaderErrors)report.errors.push({phase,name,message:`${stats.shaderErrors} shader errors`});
  if(stats?.contextLost)report.errors.push({phase,name,message:'WebGL context lost'});
  await saveReport();
  try{
    await takeScreenshot(page,{path:path.join(out,`${name}.png`),fullPage:options.fitViewport===false,timeout:60000});
    frame.file=`${name}.png`;frame.screenshotStatus='passed';
  }catch(error){
    frame.screenshotStatus='failed';
    // Keep the flow failed, but still run its keyboard assertions and real UI close.
    // Do not retry a failed screenshot while the same renderer is still busy.
    await recordFailure(`capture-${name}`,page,error,{kind:'screenshot',frame:name,measured,screenshot:false});
  }
  if(frame.screenshotStatus==='passed'&&guidedFrames.has(name))await captureGuides(page,name,frame);
  await saveReport();console.log(`CAPTURE ${name}: ${frame.screenshotStatus}; ${measured.issues.length} layout issue(s)`);
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

async function restoreGameUi(page,{viewport,releasePointer=false}={}){
  try{
    if(releasePointer){
      try{
        if(await page.locator('.item-drag-ghost').isVisible()||await page.locator('.warehouse-dock.is-dragging').isVisible()){
          await page.keyboard.press('Escape');
          await page.locator('.item-drag-ghost').waitFor({state:'hidden',timeout:10000});
        }
      }finally{await page.mouse.up();}
    }
    for(const selector of ['.forest-reader','.pause-dialog[open]']){
      const panel=page.locator(selector);
      if(await panel.isVisible()){
        await page.keyboard.press('Escape');await panel.waitFor({state:'hidden',timeout:10000});
      }
    }
    for(const [selector,label] of [
      ['.warehouse-dialog','关闭仓库'],['.route-sheet','收起路线'],
      ['.help-sheet','关闭操作说明'],['.target-card','关闭目标详情'],
    ]){
      const panel=page.locator(selector);
      if(await panel.isVisible()){
        await panel.getByRole('button',{name:label,exact:true}).click({timeout:10000});
        await panel.waitFor({state:'hidden',timeout:10000});
      }
    }
    const weather=page.locator('.weather-menu[open]');
    if(await weather.isVisible()){
      await weather.locator('summary').click({timeout:10000});
      await page.locator('.weather-panel').waitFor({state:'hidden',timeout:10000});
    }
  }finally{
    if(viewport){await page.setViewportSize(viewport);await frames(page,2);}
  }
}

async function advanceJourney(page,name,ready,maxSteps=30){
  const snapshot=state=>({player:state.player,route:state.route,selected:state.selected});
  const before=await gameState(page);
  const journey={phase,name,advance:'existing DEV fixed-step owner',secondsPerStep:2,maxSteps,before:snapshot(before),steps:[],result:'running'};
  report.journeys.push(journey);
  try{
    assert.ok(before.route.length>0,`${name}: the real UI command must create a route before fixed-step advancement`);
    let previous=before,stalled=0;
    for(let step=0;step<=maxSteps;step++){
      if(await ready()){journey.result='passed';return;}
      assert.ok(step<maxSteps,`${name}: did not arrive within ${maxSteps} fixed 2-second steps`);
      await page.evaluate(async()=>{
        if(typeof window.__HOW_ADVANCE_SIMULATION__!=='function')throw new Error('The existing DEV fixed-step inspection hook is unavailable');
        window.__HOW_ADVANCE_SIMULATION__(2);
        // Yield one task for React's published snapshot, independent of slow GL RAFs.
        await new Promise(resolve=>setTimeout(resolve,0));
      });
      const current=await gameState(page);
      journey.steps.push({step:step+1,...snapshot(current)});
      const distance=Math.hypot(current.player.x-previous.player.x,current.player.z-previous.player.z);
      stalled=current.route.length&&distance<1e-6?stalled+1:0;
      assert.ok(stalled<2,`${name}: an active route made no movement for two fixed steps: ${JSON.stringify(snapshot(current))}`);
      previous=current;
    }
  }catch(error){journey.result='failed';throw error;}
  finally{journey.after=snapshot(await gameState(page));await saveReport();}
}

async function desktopGame(){
  const session=await newPage(desktop),page=session.page;
  try{
    if(!await scenario('desktop-load',page,()=>loadGame(page)))return;
    await scenario('desktop-hud',page,()=>capture(page,'01-desktop-hud'),()=>restoreGameUi(page));
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
    },()=>restoreGameUi(page));
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
    },()=>restoreGameUi(page));
    await scenario('desktop-weather-keyboard',page,async()=>{
      const summary=page.locator('summary[aria-label="天气与木料湿度"]');
      await summary.focus();await page.keyboard.press('Enter');await page.locator('.weather-panel').waitFor();
      await page.getByRole('button',{name:'切换到阴天',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'切换到阴天',exact:true}).getAttribute('aria-pressed'),'true');
      await capture(page,'05-desktop-weather');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.weather-menu').evaluate(element=>element.open),false);
      assert.equal(await summary.evaluate(element=>element===document.activeElement),true);
    },()=>restoreGameUi(page));
    await scenario('desktop-pause-focus',page,async()=>{
      const opener=page.getByRole('button',{name:'暂停',exact:true});
      await opener.focus();await page.keyboard.press('Enter');await page.locator('.pause-dialog[open]').waitFor();
      await capture(page,'06-desktop-pause');
      await page.getByRole('navigation',{name:'暂停选项',exact:true}).getByRole('button',{name:'显示',exact:true}).click();
      await capture(page,'07-desktop-pause-display');
      await page.keyboard.press('Escape');await page.locator('.pause-dialog[open]').waitFor({state:'hidden'});
      assert.equal(await opener.evaluate(element=>element===document.activeElement),true);
    },()=>restoreGameUi(page));
    await scenario('desktop-settings',page,async()=>{
      await openSettings(page);await capture(page,'08-desktop-settings');
      await page.keyboard.press('Escape');await page.locator('.help-sheet').waitFor({state:'hidden'});
    },()=>restoreGameUi(page));
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
    },()=>restoreGameUi(page,{viewport:desktop}));
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
    },()=>restoreGameUi(page,{releasePointer:true}));
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
        await advanceJourney(page,'approach-fire-through-route',()=>fireItems.isVisible());
      }
      await fireItems.getByRole('button',{name:'森林故事',exact:true}).click();
      const read=target.getByRole('button',{name:'坐下阅读',exact:true});
      await read.click();await frames(page,2);
      // Sitting may first queue an ordinary walk to the clear front of the stump.
      if(!await page.locator('.forest-reader').isVisible()){
        const walking=await gameState(page);
        if(walking.route.length){
          await advanceJourney(page,'approach-reading-seat-through-route',async()=>{
            const state=await gameState(page);return state.route.length===0&&!state.player.moving;
          });
        }else assert.equal(walking.player.moving,false,'A reading attempt without a route must have completed its approach');
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
    },()=>restoreGameUi(page));
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
      },()=>restoreGameUi(page));
      await scenario(`game-${label}-touch-settings`,page,async()=>{
        await openSettings(page,true);await capture(page,`game-${label}-settings`);
        await page.getByRole('button',{name:'关闭操作说明',exact:true}).tap();
        await page.locator('.help-sheet').waitFor({state:'hidden'});
      },()=>restoreGameUi(page));
    }
    await scenario('game-390x844-persistent-notice',page,async()=>{
      await page.setViewportSize(smallViews[0]);
      await loadGame(page,{gridNotice:'1'});
      const warning=page.locator('.save-warning');await warning.waitFor();
      await capture(page,'game-390x844-notice');
      await openItems(page,true);
      assert.equal(await warning.isVisible(),true,'The real save warning must remain visible while the inventory is open');
      const notice=await page.evaluate(()=>{
        const shell=document.querySelector('.game-shell'),stack=document.querySelector('.hud-notices'),warning=document.querySelector('.save-warning'),panel=document.querySelector('.warehouse-dock');
        const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
        const style=getComputedStyle(stack);
        return {display:getComputedStyle(shell).display,row:style.gridRowStart,position:style.position,inStack:warning.parentElement===stack,stack:rect(stack),warning:rect(warning),window:rect(panel)};
      });
      report.noticeChecks.push({phase,viewport:page.viewportSize(),...notice});
      assert.equal(notice.display,'grid','The shared viewport must reserve normal layout space for notices');
      assert.equal(notice.row,'2','Persistent notices must occupy the second viewport grid row');
      assert.ok(notice.inStack&&!['absolute','fixed'].includes(notice.position),'The warning must participate in the normal notice stack');
      assert.ok(notice.window.bottom<=notice.stack.top+1,'The inventory must finish above the reserved notice row');
      await capture(page,'game-390x844-items-notice');
      await page.getByRole('button',{name:'关闭仓库',exact:true}).tap();
      await page.locator('.warehouse-dialog').waitFor({state:'hidden'});
    },()=>restoreGameUi(page));
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
    },async()=>{
      const cancel=page.locator('#place-cancel');
      if(await cancel.isVisible()){
        await cancel.click({timeout:10000});
        await page.locator('#placement-panel').waitFor({state:'hidden',timeout:10000});
      }
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
      await page.setViewportSize(smallViews[1]);await capture(page,'gallery-320x720-long-text',{fitViewport:false});
      await page.setViewportSize(smallViews[0]);
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
    for(const viewport of smallViews){
      const name=`woodworking-offline-${viewport.width}x${viewport.height}`;
      await scenario(name,page,async()=>{
        await page.setViewportSize(viewport);
        await capture(page,name,{fitViewport:false});
      });
    }
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
  if(activePage&&!activePage.isClosed()){
    const fullPage=await activePage.locator('main.game-shell').count()===0;
    await takeScreenshot(activePage,{path:path.join(out,'failure.png'),timeout:15000,fullPage}).catch(()=>{});
  }
}finally{
  await browser?.close().catch(()=>{});await server?.close();
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(path.join(out,'server.log'),serverLog);await saveReport();
}
