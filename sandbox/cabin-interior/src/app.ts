import {CABIN,ITEM_DEFINITIONS,definitionFor,ENTRY_POINT,PORCH_POINT} from './content.ts';
import type {CabinState,CabinPreset,CabinItem,FloorLocation,Point} from './content.ts';
import {createCabinState,parseCabinSnapshot,itemPose,approachPoint,findPath,canStand,validatePlacement,moveItem,storeItem,restoreItem,useItem,standUp,setDoorOpen,auditLayout} from './domain.ts';
import type {CommandResult} from './domain.ts';
import {createCabinView} from './scene/view.ts';
import type {ViewSettings,CameraView,PlacementPreview} from './scene/view.ts';
import {mountCabinTimber} from './timber-adapter.ts';

const STORAGE_KEY='home-of-woods:cabin-audit:v1';
// A DOM-owned slot survives HMR and retires an earlier mount before this host is reused.
const MOUNT_OWNER=Symbol.for('home-of-woods:cabin-audit-mount');
type MountOwner={dispose:()=>void};
export type CabinAuditOptions={initialState?:CabinState;persist?:boolean;onChange?:(state:CabinState,event:string)=>void;};
export type CabinAuditHandle={pause:()=>void;resume:()=>void;dispose:()=>void;getSnapshot:()=>CabinState;};
const clone=<T>(value:T):T=>structuredClone(value);
const icons:Record<string,string>={bed:'▱',table:'▤',stool:'◒',chest:'▣',shelf:'▥',stove:'♨',lantern:'◈',bowl:'◡',rug:'▧',plant:'♧'};
const categoryLabels={rest:'休息',work:'料理',storage:'收纳',warmth:'灯火',decoration:'日常'};

/** One scene, one clock and one state writer. The sandbox never imports the production store. */
export async function mountCabinAudit(container:HTMLElement,options:CabinAuditOptions={}):Promise<CabinAuditHandle>{
  const persist=options.persist!==false;
  let state=options.initialState?parseCabinSnapshot(options.initialState):null;
  if(options.initialState&&!state)throw new Error('传入的木屋布置不符合空间或身份约定。');
  let loadMessage='';
  if(!state&&persist){try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){state=parseCabinSnapshot(JSON.parse(raw));if(!state)loadMessage='上次布置无法读取，已打开初住样板。';}}catch{loadMessage='本机保存暂不可用，本次仍可自由查看。';}}
  state=state??createCabinState('starter');
  let selected:string|null=null,previous:CabinState|null=null,placement:PlacementPreview|null=null,placementReason='';
  let settings:ViewSettings={cut:'auto',light:'day',material:'normal',spaces:false,quality:'balanced',occlusion:new URLSearchParams(window.location.search).get('ao')!=='off'};
  let route:Point[]=[],pendingAction:string|null=null,paused=false,manualPause=false,disposed=false,lastTime=0,frameId=0,toastTimer=0,statsTime=0,hoverTime=0;
  const keys=new Set<string>(),abort=new AbortController();
  const mountHost=container as HTMLElement&{[key:symbol]:MountOwner|undefined};
  const globals=window as unknown as Record<string,unknown>;
  let releaseView:(()=>void)|null=null,inspection:Record<string,unknown>|null=null;
  mountHost[MOUNT_OWNER]?.dispose();
  container.className='cabin-app';
  container.innerHTML=`
    <header class="masthead"><a class="brand" href="/" aria-label="返回森林之家"><svg viewBox="0 0 32 36" aria-hidden="true"><path d="M16 1 4 18h6L2 29h12v6h4v-6h12l-8-11h6Z"/></svg><span>森林之家<small>HOME OF WOODS</small></span></a><div class="page-title"><span class="eyebrow">山间营地</span><h1>木屋内装</h1></div><div class="header-tools"><span class="save-note" id="save-note">独立布置展台</span><button class="text-button" id="undo" disabled>撤销</button><button class="text-button" id="export">导出布置</button></div></header>
    <main class="workspace"><section class="stage" aria-label="木屋三维展台"><div class="stage-bar"><div class="presets" aria-label="陈设样板"><button data-preset="starter">初住</button><button data-preset="full">完整陈设</button><button data-preset="empty">空屋</button></div><button id="daylight" class="round-button" aria-label="切换至傍晚">☀ <span>白昼</span></button></div><div class="stage-caption"><span class="overline">一间山林里的家</span><p id="preset-description">先住下来，再慢慢添置。</p></div><div class="viewport" id="viewport"><div class="loading" id="loading"><span></span>正在安置木屋与家具…</div></div><div class="view-dock" aria-label="视角"><button data-camera="room" title="回到三分之四视角">全景</button><button data-camera="opposite" title="从相反一侧检查">背面</button><button data-camera="plan" title="检查俯视布局">俯看</button><button data-camera="inside" title="与角色相近的观察高度">屋内</button><span></span><select id="cut-mode" aria-label="墙面展示"><option value="auto">随视角剖墙</option><option value="stage">舞台半墙</option><option value="closed">完整外壳</option></select></div><div class="walk-controls"><button id="enter">走进木屋</button><button id="leave">走到门前</button><button id="stand" hidden>起身</button><button id="door">关门</button></div><div class="stage-footer"><span id="navigation-hint">拖动看四周 · 滚轮缩放 · 点空地行走</span><span id="stage-count">4 / 10 件</span></div><section class="placement-panel" id="placement-panel" hidden aria-label="调整物品位置"><div><strong id="placement-title"></strong><p id="placement-reason" aria-live="polite"></p></div><div class="move-pad"><button data-nudge="left" aria-label="向左移动">←</button><button data-nudge="back" aria-label="向后移动">↑</button><button data-nudge="front" aria-label="向前移动">↓</button><button data-nudge="right" aria-label="向右移动">→</button><button id="rotate">转 90°</button></div><div class="placement-actions"><button id="place-cancel">取消</button><button class="primary" id="place-confirm">放在这里</button></div></section><div class="toast" id="toast" role="status" hidden></div></section>
    <aside class="collection"><div class="collection-title"><div><span class="eyebrow">添置与摆放</span><h2>屋里的物件</h2></div><span id="collection-total">10</span></div><p class="collection-intro">按需摆出，慢慢住满。点物件可走近使用。</p><div class="item-list" id="item-list"></div><section class="inspector" id="inspector"><div class="empty-selection"><span>⌖</span><p>点选一件家具</p><small>可以近看、使用或重新摆放</small></div></section><details class="audit-panel"><summary>空间与材质检查 <span>＋</span></summary><label class="check-row"><input type="checkbox" id="spaces"/> 显示占地、使用点与支撑面</label><label class="check-row"><input type="checkbox" id="occlusion" checked/> 局部遮蔽与接触暗部</label><label>表面显示<select id="material-mode"><option value="normal">原材质</option><option value="clay">素模</option><option value="wire">线框</option></select></label><label>画面精度<select id="quality"><option value="balanced">均衡</option><option value="fine">精细</option></select></label><p class="audit-result" id="audit-result"></p><p class="metrics" id="metrics">正在准备画面</p><button class="text-button" id="capture">保存当前画面</button></details><p class="sandbox-note">这里的陈设只用于检视；正式游戏中的取得与解锁另行接入。</p></aside></main>`;
  const timber=mountCabinTimber(container);
  const $=<T extends HTMLElement=HTMLElement>(selector:string)=>container.querySelector<T>(selector)!;
  const viewport=$('#viewport');$('#occlusion').toggleAttribute('checked',!!settings.occlusion);
  const owner:MountOwner={dispose:disposeMount};
  mountHost[MOUNT_OWNER]=owner;
  const ownsViewport=()=>mountHost[MOUNT_OWNER]===owner&&container.querySelector('#viewport')===viewport;
  function disposeMount(){
    if(disposed)return;
    const ownsDom=ownsViewport();
    disposed=true;paused=true;manualPause=true;cancelAnimationFrame(frameId);keys.clear();
    abort.abort();clearTimeout(toastTimer);releaseView?.();releaseView=null;timber.dispose();
    if(ownsDom)container.replaceChildren();
    if(inspection&&globals.__CABIN_AUDIT__===inspection){
      delete globals.__CABIN_AUDIT__;delete globals.__VISUAL_READY__;delete globals.__QA_STATE__;
    }
    if(mountHost[MOUNT_OWNER]===owner)delete mountHost[MOUNT_OWNER];
  }
  function toast(message:string){if(disposed||!ownsViewport())return;const element=$('#toast');element.textContent=message;element.hidden=false;window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>element.hidden=true,4200);}
  function save(event:string){
    if(persist){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('#save-note').textContent='布置已保存';}catch{$('#save-note').textContent='本次尚未保存';toast('本机保存失败，可以导出布置保留本次修改。');}}
    options.onChange?.(clone(state!),event);
  }
  function stopRoute(){route=[];pendingAction=null;keys.clear();}
  function commit(result:CommandResult,event:string){
    if(!result.ok){toast(result.reason??'这一步暂时无法完成。');return false;}
    previous=clone(state!);state=result.state;save(event);renderUI();return true;
  }
  const view=await createCabinView(viewport,{pick:id=>select(id),floor:(x,z)=>{if(placement){previewAt(x,z);return;}walkTo({x,z});},hover:(x,z)=>{if(performance.now()-hoverTime>75){hoverTime=performance.now();previewAt(x,z);}}}).catch(error=>{disposeMount();throw error;});
  releaseView=view.dispose;
  // Late asset completion belongs to the retired viewport, never the replacement DOM.
  if(disposed||!ownsViewport()){view.dispose();releaseView=null;disposeMount();throw new DOMException('木屋展台已被替换','AbortError');}
  viewport.querySelector('#loading')?.remove();
  function select(id:string){if(placement)return;selected=id;renderUI();}
  function walkTo(target:Point,action:string|null=null){
    if(placement)return toast('先放好物品，或取消调整。');
    if(state!.player.posture!=='standing'){if(!commit(standUp(state!),'stand'))return;}
    const path=findPath(state!,state!.player,target);
    if(!path){toast('这里没有足够通路。请检查门和家具的位置。');return;}
    route=path.slice(1);pendingAction=action;keys.clear();
    if(!route.length)finishRoute();renderUI();
  }
  function finishRoute(){const id=pendingAction;route=[];pendingAction=null;if(id){const result=useItem(state!,id);if(commit(result,'use')){const item=state!.items.find(i=>i.instanceId===id)!;const action=definitionFor(item.definitionId).action;if(action==='rest')toast('躺下歇一会儿。起身后仍从床边离开。');else if(action==='sit')toast('坐下了，可以近看座面和双脚的位置。');else if(action==='inspect')toast('已走到物件旁。');}}else{save('walk');renderUI();}}
  function interact(){
    if(!selected)return;
    if(selected==='door'){toggleDoor();return;}
    const target=approachPoint(state!,selected);if(target)walkTo(target,selected);
  }
  function toggleDoor(){stopRoute();commit(setDoorOpen(state!,!state!.doorOpen),'door');}
  function preset(next:CabinPreset){stopRoute();placement=null;selected=null;previous=clone(state!);state=createCabinState(next);save('preset');view.setView('room');renderUI();}
  function previewAt(x:number,z:number){if(!placement)return;placement.location={...placement.location,x:Math.round(x*20)/20,z:Math.round(z*20)/20};updatePreview();}
  function updatePreview(){if(!placement)return;const result=validatePlacement(state!,placement.id,placement.location);placement.valid=result.ok;placementReason=result.reason??'位置可用，通路与使用空间均已保留。';renderPlacement();}
  function beginPlacement(){if(!selected||selected==='door')return;stopRoute();const item=state!.items.find(i=>i.instanceId===selected)!;if(item.location.kind!=='floor')return;placement={id:selected,location:{...item.location},valid:true};updatePreview();renderUI();}
  function renderPlacement(){const panel=$('#placement-panel');panel.hidden=!placement;if(!placement)return;const item=state!.items.find(i=>i.instanceId===placement!.id)!;$('#placement-title').textContent=`挪动 · ${definitionFor(item.definitionId).label}`;$('#placement-reason').textContent=placementReason;$('#placement-reason').classList.toggle('invalid',!placement.valid);$('#place-confirm').toggleAttribute('disabled',!placement.valid);}
  function nudge(dx:number,dz:number){if(!placement)return;previewAt(placement.location.x+dx,placement.location.z+dz);}
  function rotate(){if(!placement)return;placement.location.yaw=(placement.location.yaw+Math.PI/2)%(Math.PI*2);updatePreview();}
  function describeAction(item:CabinItem){const action=definitionFor(item.definitionId).action;if(action==='rest')return '走近并休息';if(action==='sit')return '走近并坐下';if(action==='open')return item.open?'走近并合上':'走近并打开';if(action==='light')return item.lit?'走近并熄灭':'走近并点亮';return '走近查看';}
  function renderUI(){
    if(disposed||!ownsViewport())return;
    const s=state!,active=s.items.filter(i=>i.location.kind!=='stored').length;
    $('#stage-count').textContent=`${active} / ${s.items.length} 件`;
    $('#preset-description').textContent=s.preset==='starter'?'先住下来，再慢慢添置。':s.preset==='full'?'一间完整的家，逐件查看与调整。':'空出房间，从你需要的物件开始。';
    container.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(b=>{b.classList.toggle('active',b.dataset.preset===s.preset);b.setAttribute('aria-pressed',String(b.dataset.preset===s.preset));});
    $('#undo').toggleAttribute('disabled',!previous);$('#stand').hidden=s.player.posture==='standing';$('#enter').hidden=s.player.posture!=='standing';$('#leave').hidden=s.player.posture!=='standing';$('#door').textContent=s.doorOpen?'关门':'开门';
    $('#navigation-hint').textContent=route.length?'正在走近 · 点空地可改道':s.player.posture==='resting'?'床边位置已保留 · 点击起身返回':s.player.posture==='seated'?'坐姿检视 · 点击起身返回':'拖动看四周 · 滚轮缩放 · 点空地行走';
    $('#item-list').innerHTML=s.items.map(item=>{const d=definitionFor(item.definitionId),stored=item.location.kind==='stored';return `<div class="item-row ${selected===item.instanceId?'selected':''} ${stored?'stored':''}"><button class="item-select" data-select="${item.instanceId}" ${stored?'disabled':''}><span class="item-symbol">${icons[d.id]}</span><span><strong>${d.label}</strong><small>${categoryLabels[d.category]} · ${stored?'在样品架':item.location.kind==='surface'?'已放在支撑面':'已摆放'}</small></span></button>${stored?`<button class="add-item" data-restore="${item.instanceId}" aria-label="摆出${d.label}">＋</button>`:'<span class="in-room" aria-label="已摆放">•</span>'}</div>`;}).join('');
    const inspected=selected&&s.items.find(i=>i.instanceId===selected);
    if(selected==='door')$('#inspector').innerHTML=`<span class="eyebrow">入口</span><h3>厚木门</h3><p>净宽 ${CABIN.doorWidth.toFixed(2)} · 净高 ${CABIN.doorHeight.toFixed(2)}<br/>向外开启，门前需留出扫掠空间。</p><button class="primary" data-action="use">${s.doorOpen?'合上木门':'打开木门'}</button>`;
    else if(inspected&&inspected.location.kind!=='stored'){
      const d=definitionFor(inspected.definitionId),p=itemPose(s,inspected)!,onFloor=inspected.location.kind==='floor';
      $('#inspector').innerHTML=`<span class="eyebrow">${categoryLabels[d.category]} / ${d.placementKind==='surface'?'支撑面物件':d.movable?'可重新摆放':'固定位置'}</span><h3>${d.label}</h3><p class="item-dimensions">${d.dimensions.map(v=>v.toFixed(2)).join(' × ')} <span>宽 · 高 · 深</span></p><button class="primary" data-action="use" ${s.player.usingId===inspected.instanceId?'disabled':''}>${s.player.usingId===inspected.instanceId?'正在使用':describeAction(inspected)}</button><div class="item-actions">${d.movable&&onFloor?'<button data-action="move">挪动</button>':''}<button data-action="detail">近看</button><button data-action="store">收回</button></div><details class="object-record"><summary>物件记录</summary><dl><dt>位置</dt><dd>${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}</dd><dt>身份</dt><dd>${inspected.instanceId}</dd><dt>支撑</dt><dd>${onFloor?'地板':inspected.location.kind==='surface'?inspected.location.hostId+' / '+inspected.location.slotId:'—'}</dd><dt>资源</dt><dd>${d.source}</dd><dt>后续取得</dt><dd>${d.blueprintId}</dd></dl></details>`;
    }else $('#inspector').innerHTML='<div class="empty-selection"><span>⌖</span><p>点选一件家具</p><small>可以近看、使用或重新摆放</small></div>';
    container.querySelectorAll<HTMLButtonElement>('[data-select]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.select===selected)));
    const report=auditLayout(s);$('#audit-result').textContent=report.ok?`空间检查通过 · ${report.reachableCount} 个使用点可达`:report.issues.join(' ');$('#audit-result').classList.toggle('invalid',!report.ok);renderPlacement();timber.refresh();
  }
  function download(filename:string,href:string,revoke=false){const a=document.createElement('a');a.download=filename;a.href=href;a.click();if(revoke)setTimeout(()=>URL.revokeObjectURL(href),1000);}
  container.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
    if(button.dataset.preset){preset(button.dataset.preset as CabinPreset);return;}
    if(button.dataset.camera){view.setView(button.dataset.camera as CameraView);return;}
    if(button.dataset.select){select(button.dataset.select);return;}
    if(button.dataset.restore){stopRoute();placement=null;if(commit(restoreItem(state!,button.dataset.restore),'restore'))selected=button.dataset.restore;renderUI();return;}
    if(button.dataset.nudge){const delta={left:[-.15,0],right:[.15,0],back:[0,-.15],front:[0,.15]}[button.dataset.nudge as 'left'];nudge(delta[0],delta[1]);return;}
    if(button.dataset.action){
      if(button.dataset.action==='use')interact();
      else if(button.dataset.action==='move')beginPlacement();
      else if(button.dataset.action==='detail')view.setView('detail');
      else if(button.dataset.action==='store'&&selected){stopRoute();placement=null;if(commit(storeItem(state!,selected),'store')){selected=null;renderUI();}}
      return;
    }
    if(button.id==='enter'||button.id==='leave'){
      if(!state!.doorOpen&&!commit(setDoorOpen(state!,true),'door'))return;
      walkTo(button.id==='enter'?ENTRY_POINT:PORCH_POINT);
    }else if(button.id==='stand'){stopRoute();commit(standUp(state!),'stand');}
    else if(button.id==='door')toggleDoor();
    else if(button.id==='daylight'){settings={...settings,light:settings.light==='day'?'evening':'day'};button.innerHTML=settings.light==='day'?'☀ <span>白昼</span>':'☾ <span>傍晚</span>';button.setAttribute('aria-label',settings.light==='day'?'切换至傍晚':'切换至白昼');}
    else if(button.id==='rotate')rotate();
    else if(button.id==='place-cancel'){placement=null;renderUI();}
    else if(button.id==='place-confirm'&&placement){if(commit(moveItem(state!,placement.id,placement.location),'move')){placement=null;renderUI();}}
    else if(button.id==='undo'&&previous){stopRoute();placement=null;const swap=state!;state=previous;previous=swap;save('undo');renderUI();}
    else if(button.id==='export')download('home-of-woods-cabin.json',URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),true);
    else if(button.id==='capture')download('home-of-woods-cabin.png',view.capture());
  },{signal:abort.signal});
  $('#cut-mode').addEventListener('change',event=>settings={...settings,cut:(event.target as HTMLSelectElement).value as ViewSettings['cut']},{signal:abort.signal});
  $('#material-mode').addEventListener('change',event=>settings={...settings,material:(event.target as HTMLSelectElement).value as ViewSettings['material']},{signal:abort.signal});
  $('#quality').addEventListener('change',event=>settings={...settings,quality:(event.target as HTMLSelectElement).value as ViewSettings['quality']},{signal:abort.signal});
  $('#occlusion').addEventListener('change',event=>settings={...settings,occlusion:(event.target as HTMLInputElement).checked},{signal:abort.signal});
  $('#spaces').addEventListener('change',event=>settings={...settings,spaces:(event.target as HTMLInputElement).checked},{signal:abort.signal});
  window.addEventListener('keydown',event=>{
    if((event.target as HTMLElement).matches('input,select,textarea')||event.metaKey||event.ctrlKey||event.altKey)return;
    const key=event.key.toLowerCase();
    if(key==='escape'){placement=null;stopRoute();renderUI();return;}
    if(placement){if(['r','arrowleft','arrowright','arrowup','arrowdown'].includes(key)){event.preventDefault();if(key==='r')rotate();else nudge(key==='arrowleft'?-.15:key==='arrowright'?.15:0,key==='arrowup'?-.15:key==='arrowdown'?.15:0);}return;}
    if(['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown'].includes(key)){event.preventDefault();route=[];pendingAction=null;keys.add(key);}
  },{signal:abort.signal});
  window.addEventListener('keyup',event=>{keys.delete(event.key.toLowerCase());if(keys.size===0&&state!.player.posture==='standing')save('walk');},{signal:abort.signal});
  window.addEventListener('blur',()=>{keys.clear();},{signal:abort.signal});
  function tick(now:number){
    if(disposed||paused)return;if(!ownsViewport()){disposeMount();return;}const dt=lastTime?Math.min(.05,(now-lastTime)/1000):0;lastTime=now;let moving=false;
    if(route.length){
      let step=dt*2.2;
      while(route.length&&step>0){const p=route[0],dx=p.x-state!.player.x,dz=p.z-state!.player.z,d=Math.hypot(dx,dz);if(d<.00001){route.shift();continue;}const travel=Math.min(step,d);state!.player={...state!.player,x:state!.player.x+dx/d*travel,z:state!.player.z+dz/d*travel,facing:Math.atan2(dx,dz)};step-=travel;moving=true;if(travel>=d-.00001)route.shift();}
      if(!route.length)finishRoute();
    }else if(keys.size&&state!.player.posture==='standing'&&!placement){
      const x=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),z=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
      const distance=Math.hypot(x,z),amount=dt*2.2;
      if(distance){const direction=view.movementVector(x/distance,z/distance),target={x:state!.player.x+direction.x*amount,z:state!.player.z+direction.z*amount};if(canStand(state!,target)){state!.player={...state!.player,...target,facing:Math.atan2(direction.x,direction.z)};moving=true;}}
    }
    view.sync(state!,settings,selected,placement);view.update(dt,moving);
    statsTime+=dt;if(statsTime>.75){statsTime=0;const stats=view.stats();$('#metrics').textContent=`${stats.drawCalls} 次绘制 · ${(stats.triangles/1000).toFixed(1)}k 三角形 · ${stats.textures} 张贴图`;
      (window as unknown as {__QA_STATE__:unknown}).__QA_STATE__={state:clone(state!),moving,settings:{...settings},stats};}
    frameId=requestAnimationFrame(tick);
  }
  function stopFrames(){paused=true;cancelAnimationFrame(frameId);keys.clear();}
  function startFrames(){if(disposed)return;if(!ownsViewport()){disposeMount();return;}if(document.hidden||manualPause)return;paused=false;lastTime=0;cancelAnimationFrame(frameId);frameId=requestAnimationFrame(tick);}
  function pause(){manualPause=true;stopFrames();}
  function resume(){manualPause=false;startFrames();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFrames();else startFrames();},{signal:abort.signal});
  const api:CabinAuditHandle={pause,resume,getSnapshot:()=>clone(state!),dispose:disposeMount};
  // Inspection calls use the same command paths as the UI, without mutating a second state store.
  inspection={...api,stats:view.stats,select,preset,camera:(name:CameraView)=>view.setView(name,true),project:view.project,walkTo,interact,settings:(next:Partial<ViewSettings>)=>{settings={...settings,...next};view.sync(state!,settings,selected,placement);view.update(0,false);},audit:()=>auditLayout(state!),capture:view.capture};
  globals.__CABIN_AUDIT__=inspection;
  renderUI();view.sync(state,settings,selected,placement);view.update(0,false);resume();
  (window as unknown as Record<string,unknown>).__VISUAL_READY__=true;if(loadMessage)toast(loadMessage);
  return api;
}
