import {CLOCK_SPEEDS} from '../domain/local-clock.ts';
import type {ClockSpeed} from '../domain/local-clock.ts';
import {GameIcon} from './GameIcon.tsx';
import './clock-controls.css';

export function Hourglass({view,onSpeed,disabled,disabledReason}:{
  view:{speed:ClockSpeed};onSpeed:(speed:ClockSpeed)=>void;disabled:boolean;disabledReason?:string;
}){
  const speedLabel=view.speed===0?'已停':`${view.speed}×`;
  return <div className="clock-controls" role="group" aria-label="时间控制">
    <details className="clock-menu" onKeyDown={event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();event.currentTarget.open=false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary aria-label="沙漏速度" title={disabledReason??'切换时间速度：停止、1倍、4倍、12倍'}>
        <GameIcon name="hourglass" size={26}/><span className="clock-caption"><span>时间 <strong>{speedLabel}</strong></span>
          {disabledReason&&<small role="status">{disabledReason.split('，')[0]}</small>}</span><span aria-hidden="true">▾</span>
      </summary>
      <div className="hourglass" role="group" aria-label="沙漏速度选项">
        {CLOCK_SPEEDS.map(speed=><button key={speed} disabled={disabled} aria-pressed={view.speed===speed}
          aria-label={speed===0?'停住沙漏':`沙漏 ${speed} 倍速`} onClick={event=>{
            onSpeed(speed);
            const menu=event.currentTarget.closest('details');
            if(menu){menu.open=false;menu.querySelector('summary')?.focus();}
          }}>{speed===0?'停':`${speed}×`}</button>)}
        <p>{disabledReason??(view.speed===0?'沙漏已停，选择倍速继续。':'时间速度不改变人物的行走速度。')}</p>
      </div>
    </details>
    {view.speed===0&&<button className="clock-resume" disabled={disabled} title={disabledReason??'以1倍速度继续时间'}
      onClick={()=>onSpeed(1)}><GameIcon name="play" size={22}/>继续时间</button>}
  </div>;
}
