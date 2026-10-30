import {createRuntime} from './app/runtime.ts';
import type {Runtime,Snapshot} from './app/runtime.ts';
import {VIEWS,ALTAR_STATES} from './content/scene-review.ts';
import type {ReviewView,AltarState} from './content/scene-review.ts';
import {REVIEW_PROPS} from './content/scene-review.ts';
import {OFFERING_MODES,OFFERING_NAMES,ALTAR_LAYOUT,oracleFor} from './content/altar.ts';
import type {OfferingMode} from './content/altar.ts';
import './review.css';
const app=document.querySelector<HTMLDivElement>('#app')!;
const names={dormant:'沉寂',ready:'待供奉',answering:'回应',resting:'休眠'};
app.innerHTML=`<div id="scene" aria-label="场景预览"></div>
<header><span class="brand">森林之家 <i>SCENE STUDY / 05</i></span><h1>溪光与营火</h1><p>独立沙盒 R5c · ${104729} <span id="clock">14:00</span></p></header>
<nav aria-label="观察位置">${Object.entries(VIEWS).map(([id,v])=>`<button data-view="${id}" aria-pressed="${id==='overview'}">${v.label}</button>`).join('')}</nav>
<aside id="selected" hidden></aside>
<div class="bottom"><details id="controls" open><summary>场景调节 <span>昼夜 · 原木 · 祭坛</span></summary><div class="controls-grid">
<section><label for="hour">光照 <output id="period">白昼</output></label><div class="row"><button data-hour="14">白昼</button><button data-hour="18">黄昏</button><button data-hour="23">夜晚</button></div><input id="hour" aria-label="时刻" type="range" min="0" max="24" step=".1" value="14"><label class="check"><input id="cycle" type="checkbox">自动昼夜</label></section>
<section><label>营地 <output id="stock">原木 0</output></label><div class="row"><button data-wood="0">空堆</button><button data-wood="6">6 根</button><button data-wood="18">18 根</button><button data-wood="32">32 根</button></div><div class="row"><label class="check"><input id="fire" type="checkbox" checked>点燃篝火</label><button id="warehouse">查看库存</button></div></section>
<section><label>祭坛 <output id="altar-status">待供奉</output></label><div class="row">${ALTAR_STATES.map(s=>`<button data-altar="${s}">${names[s]}</button>`).join('')}</div><div class="row" aria-label="供品摆放示例">${OFFERING_MODES.map(mode=>`<button data-offering="${mode}">${OFFERING_NAMES[mode]}</button>`).join('')}</div><label class="check"><input id="reflection" type="checkbox" checked>水面倒影</label><label class="check"><input id="reduced" type="checkbox">减少动态</label></section>
</div><p class="scope">库存按钮为沙盒设定；供品与神谕为摆放预览。点神谕纸页可读全文。WASD / 点地移动，拖动转镜头，滚轮缩放。</p></details>
<footer><span id="status" role="status">正在建立山谷…</span><div><button id="pause">暂停</button><button id="reenter">卸载重入</button><button id="capture">保存画面</button></div></footer></div>
<dialog id="inventory"><h2>原木储备</h2><div id="inventory-body"></div><button id="close-inventory">回到山谷</button></dialog>
<details class="diagnostics"><summary>运行数据</summary><pre id="stats"></pre></details>`;
const $=<T extends HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
let runtime:Runtime|undefined,last:Snapshot|undefined,paused=false,view:ReviewView='overview',saved=0,reentering=false;
const audits:Record<string,unknown>[]=[];
function update(s:Snapshot){last=s;const review=runtime?.review;
  $('#stock').textContent=`原木 ${s.forestry.wood}`;
  if(review){$('#clock').textContent=`${Math.floor(review.hour).toString().padStart(2,'0')}:${Math.floor(review.hour%1*60).toString().padStart(2,'0')}`;$('#period').textContent=review.hour>6&&review.hour<17?'白昼':review.hour>=17&&review.hour<20?'黄昏':'夜晚';$('#altar-status').textContent=names[review.altar];
    app.querySelectorAll<HTMLButtonElement>('[data-altar]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.altar===review.altar)));
    app.querySelectorAll<HTMLButtonElement>('[data-offering]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.offering===review.offering)));
  }
  $('#stats').textContent=JSON.stringify({...s.stats,audits},null,2);
  const st=s.stats as {frameMsP50?:number;drawCalls?:number;triangles?:number;shaderErrors?:number};
  $('#status').textContent=`${st.drawCalls??0} 次绘制 · ${Math.round((st.triangles??0)/1000)}k 三角形 · ${Math.round(st.frameMsP50??0)} ms${paused?' · 已暂停':''}`;
  const id=s.selected,prop=Object.values(REVIEW_PROPS).find(p=>p.id===id),oracle=id===ALTAR_LAYOUT.oracle.id;$('#selected').hidden=!prop&&!oracle;
  if(prop)$('#selected').textContent=prop===REVIEW_PROPS.logs?`原木堆 · 库存 ${s.forestry.wood} / 可见 ${Math.min(18,s.forestry.wood)}${s.forestry.wood>18?'，其余收纳在仓库':''}`:prop===REVIEW_PROPS.fire?`营地篝火 · ${review?.fire?'燃烧中':'熄灭'}`:`林间祭坛 · ${names[review?.altar??'ready']} · ${OFFERING_NAMES[review?.offering??'forest']}`;
  if(oracle){const text=oracleFor(review?.altar??'ready',review?.offering??'forest');$('#selected').textContent=`${text.title}\n${text.lines.join('　')}`;}
}
async function boot(){try{runtime=await createRuntime($('#scene'),update,last?runtime?.getState():undefined);runtime.setReviewView(view);$('#status').textContent='山谷已就绪';}catch(e){$('#status').textContent=String(e);console.error(e);}}
app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view as ReviewView;runtime?.setReviewView(view);app.querySelectorAll('[data-view]').forEach(e=>e.setAttribute('aria-pressed',String(e===b)));});
app.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach(b=>b.onclick=()=>{$<HTMLInputElement>('#hour').value=b.dataset.hour!;runtime?.setReview({hour:Number(b.dataset.hour)});});
$<HTMLInputElement>('#hour').oninput=e=>runtime?.setReview({hour:Number((e.target as HTMLInputElement).value)});
for(const [id,key] of [['cycle','cycle'],['fire','fire'],['reflection','reflections']] as const)$<HTMLInputElement>('#'+id).onchange=e=>runtime?.setReview({[key]:(e.target as HTMLInputElement).checked});
$<HTMLInputElement>('#reduced').onchange=e=>runtime?.setReducedMotion((e.target as HTMLInputElement).checked);
app.querySelectorAll<HTMLButtonElement>('[data-wood]').forEach(b=>b.onclick=()=>runtime?.setReviewWood(Number(b.dataset.wood)));
app.querySelectorAll<HTMLButtonElement>('[data-altar]').forEach(b=>b.onclick=()=>runtime?.setReview({altar:b.dataset.altar as AltarState}));
app.querySelectorAll<HTMLButtonElement>('[data-offering]').forEach(b=>b.onclick=()=>runtime?.setReview({offering:b.dataset.offering as OfferingMode}));
$('#pause').onclick=()=>{paused=!paused;runtime?.pause(paused);$('#pause').textContent=paused?'继续':'暂停';};
$('#warehouse').onclick=()=>{runtime?.setInterfaceOpen(true);$('#inventory-body').textContent=JSON.stringify(runtime?.getState().inventory,null,2);$<HTMLDialogElement>('#inventory').showModal();};
$('#close-inventory').onclick=()=>{$<HTMLDialogElement>('#inventory').close();runtime?.setInterfaceOpen(false);};
$<HTMLDialogElement>('#inventory').oncancel=()=>runtime?.setInterfaceOpen(false);
$('#reenter').onclick=async()=>{if(!runtime||reentering)return;reentering=true;$<HTMLButtonElement>('#reenter').disabled=true;const previous=runtime,state=previous.getState(),review={...previous.review};runtime=undefined;previous.destroy();audits.push(previous.stats());try{await new Promise(resolve=>setTimeout(resolve,20));runtime=await createRuntime($('#scene'),update,state);runtime.setReview(review);runtime.setReviewView(view);runtime.pause(paused);}catch(e){$('#status').textContent=String(e);}finally{reentering=false;$<HTMLButtonElement>('#reenter').disabled=false;}};
$('#capture').onclick=async()=>{if(!runtime)return;try{const name=`r5c-${Math.min(innerWidth,innerHeight)<600?'mobile':'desktop'}-${view}-${Math.round(runtime.review.hour)}-${runtime.review.altar}-${runtime.review.offering}-${++saved}`;const image=runtime.capture(),stats={...runtime.stats(),audits};if(location.protocol==='file:'){const a=document.createElement('a');a.href=image;a.download=name+'.png';a.click();$('#status').textContent='已导出画面';return;}const res=await fetch('/__review-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,image,stats})});if(!res.ok)throw new Error(await res.text());$('#status').textContent=`已保存 ${name}`;}catch(e){$('#status').textContent=String(e);}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$<HTMLDialogElement>('#inventory').close();runtime?.setInterfaceOpen(false);}});
window.addEventListener('pagehide',()=>runtime?.destroy());
void boot();
