import {useEffect,useRef,useState} from 'react';
import {forestStoryForDay} from '../content/forest-stories.ts';
import type {dayCycleSnapshot} from '../domain/day-cycle.ts';
import './evening.css';
import {GameIcon} from './GameIcon.tsx';

type CycleView=ReturnType<typeof dayCycleSnapshot>;
export function EveningControls({view,disabled,working=false,onContinue,onSleep,onReturnToCamp}:{
  view:CycleView;disabled:boolean;working?:boolean;onContinue:()=>void;onSleep:()=>void;onReturnToCamp:()=>void;
}){
  const night=view.hour>=18||view.hour<6;
  if(!night&&!view.eveningStopped)return null;
  return <div className="evening-clock" aria-label="晚间与休息">
    {view.eveningStopped&&!working&&<div className="evening-arrival" role="status">
      <strong>18:00 · 天色晚了</strong><span>沙漏已停，可以慢慢做饭、读书，也可以直接休息。</span>
      <button disabled={disabled} onClick={onContinue}>继续夜间时间</button>
    </div>}
    <button className="evening-sleep" disabled={disabled||!night||(view.nearCamp&&!view.canSleep)} title={view.nearCamp?(view.sleepReason||'睡到下一次日出'):'沿现有小路返回帐篷'} onClick={view.nearCamp?onSleep:onReturnToCamp}>
      <GameIcon name="rest" size={28}/> {view.nearCamp?'结束一天':'回帐篷'}
    </button>
  </div>;
}
export function ForestReader({day,seed,onClose}:{day:number;seed:number;onClose:()=>void}){
  const [storyIndex,setStoryIndex]=useState(0);
  const [page,setPage]=useState(0);
  const dialog=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  const story=forestStoryForDay(seed,day,storyIndex);
  const advance=()=>{if(page+1<story.pages.length)setPage(v=>v+1);else{setStoryIndex(v=>v+1);setPage(0);}};
  useEffect(()=>{
    const before=document.activeElement;
    dialog.current?.focus();
    return ()=>{if(before instanceof HTMLElement&&before.isConnected)before.focus();};
  },[]);
  return <div className="forest-reader-shell" role="presentation">
    <section className="forest-reader" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="forest-story-title" onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
      if(event.key==='ArrowRight'){event.preventDefault();advance();return;}
      if(event.key==='ArrowLeft'){event.preventDefault();setPage(v=>Math.max(0,v-1));return;}
      if(event.key==='Tab'){
        const buttons=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
      <div className="forest-reader-heading">
        <span>林间故事 · 第 {day} 天</span>
        <button onClick={onClose} aria-label="合上故事书">×</button>
      </div>
      <div className="forest-reader-paper">
        <small>{story.topic}</small>
        <h2 id="forest-story-title">{story.title}</h2>
        <p aria-live="polite">{story.pages[page]}</p>
        <span className="forest-reader-page">{page+1} / {story.pages.length}</span>
      </div>
      <nav className="forest-reader-actions" aria-label="翻阅故事">
        <button disabled={page===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>上一页</button>
        <button onClick={advance}>{page+1===story.pages.length?'换一个故事':'下一页'}</button>
      </nav>
      <p className="forest-reader-hint">读书时沙漏停着。随时合上书，继续夜游或回帐篷休息。</p>
      <button className="forest-reader-close" onClick={onClose}>合上书，继续活动</button>
    </section>
  </div>;
}
