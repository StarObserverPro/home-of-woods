import {useRef,useState} from 'react';
import type {Runtime} from '../app/runtime.ts';
import {VIEWS,ALTAR_STATES} from '../content/scene-props.ts';
import type {SceneViewPreset,SceneAppearance} from '../content/scene-props.ts';
import {OFFERING_MODES,OFFERING_NAMES} from '../content/altar.ts';
const altarNames={dormant:'沉寂',ready:'待供奉',answering:'回应',resting:'休眠'};
type Props={runtime:()=>Runtime|null;active:boolean;audits:Record<string,unknown>[]};
export function SceneInspector({runtime,active,audits}:Props){
  const [view,setView]=useState<SceneViewPreset>('overview'),[preview,setPreview]=useState<Partial<SceneAppearance>>({hour:14}),[notice,setNotice]=useState('');
  const captureCount=useRef(0);
  function inspect(nextView:SceneViewPreset,next:Partial<SceneAppearance>){setView(nextView);setPreview(next);runtime()?.inspectScene(nextView,next);}
  async function capture(){
    const current=runtime();if(!current)return;
    try{const result=current.captureScene(),name=`scene-${innerWidth<600?'mobile':'desktop'}-${view}-${Math.round(preview.hour??14)}-${preview.altar??'ready'}-${++captureCount.current}`;
      const response=await fetch('/__scene-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,image:result.image,stats:{...result.stats,audits}})});
      if(!response.ok)throw new Error(await response.text());setNotice(`已保存 ${name}`);
    }catch(error){setNotice(error instanceof Error?error.message:'画面未保存');}
  }
  return <fieldset className="scene-inspector"><legend>场景检视</legend>
    <label>观察位置<select aria-label="场景观察位置" value={view} onChange={e=>inspect(e.target.value as SceneViewPreset,preview)}>{Object.entries(VIEWS).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select></label>
    <div className="scene-options">{([['白昼',14],['黄昏',18],['夜晚',23]] as const).map(([label,hour])=><button key={hour} aria-pressed={active&&preview.hour===hour} onClick={()=>inspect(view,{...preview,hour})}>{label}</button>)}</div>
    <div className="scene-options">{ALTAR_STATES.map(altar=><button key={altar} aria-pressed={(preview.altar??'ready')===altar} onClick={()=>inspect(view,{...preview,altar})}>{altarNames[altar]}</button>)}</div>
    <div className="scene-options">{OFFERING_MODES.map(offering=><button key={offering} aria-pressed={(preview.offering??'empty')===offering} onClick={()=>inspect(view,{...preview,offering})}>{OFFERING_NAMES[offering]}</button>)}</div>
    <button onClick={()=>{runtime()?.inspectScene(null);setNotice('已恢复角色镜头与模拟');}}>结束场景检视</button>
    {import.meta.env.DEV&&<button disabled={!active} onClick={()=>void capture()}>保存场景画面</button>}
    <small>检视暂停模拟；供品为摆放示例。</small>{notice&&<p role="status">{notice}</p>}
  </fieldset>;
}
