import type {weatherSnapshot} from '../domain/weather.ts';
import {moistureName,fineWorkMultiplier} from '../domain/weather.ts';
import './weather-controls.css';

type WeatherView=ReturnType<typeof weatherSnapshot>;
type WeatherKind=WeatherView['weather'];
const WEATHER_OPTIONS:readonly {id:WeatherKind;name:string;icon:string}[]=[
  {id:'sunny',name:'晴天',icon:'☀'},
  {id:'cloudy',name:'阴天',icon:'☁'},
  {id:'rain',name:'下雨',icon:'☂'},
  {id:'snow',name:'下雪',icon:'❄'},
];

function WoodMoisture({exposure,woods}:{exposure:'open'|'sheltered';woods:WeatherView['woods']}){
  const batches=woods.filter(wood=>wood.exposure===exposure);
  const quantity=batches.reduce((total,wood)=>total+wood.quantity,0);
  const moisture=quantity?batches.reduce((total,wood)=>total+wood.moisture*wood.quantity,0)/quantity:0;
  const percent=Math.round(moisture*100);
  const label=moistureName(moisture);
  return <div className="weather-wood-group">
    <div><strong>{exposure==='open'?'露天木料':'棚下木料'}</strong><span>{quantity} 份</span></div>
    {quantity>0?<><progress max={1} value={moisture} aria-label={`${exposure==='open'?'露天':'棚下'}木料湿度`}/><small>{label} · {percent}%</small></>:<small>尚无木料</small>}
  </div>;
}

export function WeatherWorkNotice({view,moisture}:{view:WeatherView|null;moisture?:number}){
  if(!view||moisture===undefined&&!view.woods.some(wood=>wood.available&&wood.quantity>0))return null;
  return <p className="weather-work-notice" aria-label="木料湿度与精工用时">{moisture===undefined
    ?`可用木料精工预估 ×${view.fineWorkMultiplier.toFixed(2)}，开工时按投入木料结算。`
    :`本次木料${moistureName(moisture)}，精工用时 ×${fineWorkMultiplier(moisture).toFixed(2)}。`}</p>;
}

export function WeatherControls({view,disabled,onWeather,onIntensity,onAutomatic}:{
  view:WeatherView|null;disabled:boolean;
  onWeather:(kind:WeatherKind)=>void;onIntensity:(value:number)=>void;onAutomatic:(value:boolean)=>void;
}){
  if(!view)return null;
  const selected=WEATHER_OPTIONS.find(option=>option.id===view.weather)!;
  const hasAvailableWood=view.woods.some(wood=>wood.available&&wood.quantity>0);
  return <div className="weather-controls">
    <details className="weather-menu" onKeyDown={event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();event.currentTarget.open=false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary aria-label="天气与木料湿度" title="查看天气、切换雨雪及木料湿度">
        <span className="weather-icon" aria-hidden="true">{selected.icon}</span><span>{selected.name}</span><span aria-hidden="true">▾</span>
      </summary>
      <section className="weather-panel" aria-label="天气设置">
        <div className="weather-options" role="group" aria-label="切换天气">
          {WEATHER_OPTIONS.map(option=><button type="button" key={option.id} disabled={disabled}
            aria-label={`切换到${option.name}`} aria-pressed={option.id===view.weather}
            onClick={()=>onWeather(option.id)}><span aria-hidden="true">{option.icon}</span>{option.name}</button>)}
        </div>
        <label className="weather-intensity"><span>雨雪强度 <output>{Math.round(view.intensity*100)}%</output></span>
          <input aria-label="雨雪强度" type="range" min={0} max={100} step={1} value={Math.round(view.intensity*100)} disabled={disabled||!['rain','snow'].includes(view.weather)} onChange={event=>onIntensity(Number(event.target.value)/100)}/>
        </label>
        <label className="weather-automatic"><input type="checkbox" checked={view.auto} disabled={disabled} onChange={event=>onAutomatic(event.target.checked)}/>随游戏时间变化</label>
        <div className="weather-wood" role="group" aria-label="木料湿度">
          <WoodMoisture exposure="open" woods={view.woods}/>
          <WoodMoisture exposure="sheltered" woods={view.woods}/>
        </div>
        {hasAvailableWood&&<p className="weather-work-time">可用木料精工预估 ×{view.fineWorkMultiplier.toFixed(2)}</p>}
      </section>
    </details>
  </div>;
}
