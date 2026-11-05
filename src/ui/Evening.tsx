import {useState} from 'react';
import {forestStoryForDay} from '../content/forest-stories.ts';
import type {dayCycleSnapshot} from '../domain/day-cycle.ts';
import './evening.css';

type CycleView=ReturnType<typeof dayCycleSnapshot>;
export function EveningControls({view,disabled,onContinue,onSleep,onReturnToCamp}:{
  view:CycleView;disabled:boolean;onContinue:()=>void;onSleep:()=>void;onReturnToCamp:()=>void;
}){
  const night=view.hour>=18||view.hour<6;
  return <div className="evening-clock" aria-label="晚间与休息">
    {view.eveningStopped&&<div className="evening-arrival" role="status">
      <strong>18:00 · 晚饭时间</strong><span>沙漏已停，可以先做饭、吃饭或看故事。</span>
      <button disabled={disabled} onClick={onContinue}>继续今晚 1×</button>
    </div>}
    <button className="evening-sleep" disabled={disabled||!night||(view.nearCamp&&!view.canSleep)} title={view.nearCamp?(view.sleepReason||'睡到下一次日出'):'沿现有小路返回帐篷'} onClick={view.nearCamp?onSleep:onReturnToCamp}>
      <span aria-hidden="true">☾</span> {view.nearCamp?'结束一天':'回帐篷'}
    </button>
  </div>;
}
export function ForestReader({day,seed,onClose}:{day:number;seed:number;onClose:()=>void}){
  const [storyIndex,setStoryIndex]=useState(0);
  const [page,setPage]=useState(0);
  const story=forestStoryForDay(seed,day,storyIndex);
  const advance=()=>{if(page+1<story.pages.length)setPage(v=>v+1);else{setStoryIndex(v=>v+1);setPage(0);}};
  return <div className="forest-reader-shell" role="presentation">
    <section className="forest-reader" role="dialog" aria-modal="true" aria-label="篝火边的森林故事">
      <div className="forest-reader-heading">
        <span>林间故事 · 第 {day} 天</span>
        <button onClick={onClose} aria-label="合上故事书">×</button>
      </div>
      <div className="forest-reader-paper">
        <small>{story.topic}</small>
        <h2>{story.title}</h2>
        <p>{story.pages[page]}</p>
        <span className="forest-reader-page">{page+1} / {story.pages.length}</span>
      </div>
      <nav className="forest-reader-actions" aria-label="翻阅故事">
        <button disabled={page===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>上一页</button>
        <button onClick={advance}>{page+1===story.pages.length?'换一个故事':'下一页'}</button>
      </nav>
      <p className="forest-reader-hint">人物在篝火边歇息，阅读期间世界时间暂停。故事来自本地文库，无需联网。</p>
      <button className="forest-reader-close" onClick={onClose}>合上书，继续活动</button>
    </section>
  </div>;
}
