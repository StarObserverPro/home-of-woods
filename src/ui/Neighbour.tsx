import {useState} from 'react';
import type {NeighbourView} from '../app/npc-session.ts';
import type {NpcVisitInteraction} from '../domain/npc-visit.ts';
import {RIDGE_NEIGHBOUR} from '../content/npcs/ridge-neighbour/profile.ts';
import './neighbour.css';

export function neighbourDetails(id:string|null,view:NeighbourView){
  return id===RIDGE_NEIGHBOUR.id?{title:view.name,tag:'山那边的邻居',detail:RIDGE_NEIGHBOUR.home}:null;
}
export function NeighbourControls({view,disabled,onApproach,onAction,onTalk,onPromise}:{
  view:NeighbourView;disabled:boolean;onApproach:()=>void;
  onAction:(action:NpcVisitInteraction,activityId?:string)=>void;onTalk:(text:string)=>void;onPromise:()=>void;
}){
  const [input,setInput]=useState('');
  if(!view.visible)return <p className="wood-note">阿榆已经回去了，改天再见。</p>;
  const unavailable=disabled||view.focused||view.phase==='leaving';
  return <section className="neighbour-controls" aria-label="与阿榆相处" data-ui-grid-root="module" data-ui-grid="content">
    <p className="wood-note">{view.status} · 山那边的邻居</p>
    <div className="neighbour-conversation" role="log" aria-label="最近的交谈" aria-live="polite">
      {view.history.map((line,index)=><p key={index} className={line.role==='player'?'neighbour-player-line':undefined}><strong>{line.role==='player'?'你':view.name}</strong><span>{line.text}</span></p>)}
      {view.line&&view.history.at(-1)?.text!==view.line&&<p><strong>{view.name}</strong><span>{view.line}</span></p>}
    </div>
    {view.phase==='leaving'?<p className="wood-note">他正沿小路往回走。</p>:!view.near?
      <button className="context-button primary-action" disabled={disabled} onClick={onApproach}>走近阿榆</button>:
      <>
        <form className="neighbour-input" onSubmit={event=>{event.preventDefault();const text=input.trim();if(!text||unavailable)return;onTalk(text);setInput('');}}>
          <label htmlFor="neighbour-speech">和他说句话</label>
          <div data-ui-grid="row"><input id="neighbour-speech" value={input} maxLength={240} autoComplete="off" placeholder="聊聊营地里的事……" disabled={unavailable} onChange={event=>setInput(event.target.value)}/>
            <button type="submit" className="context-button" disabled={unavailable||!input.trim()}>说话</button></div>
        </form>
        <div className="tree-actions">
          <button className="context-button" disabled={unavailable} onClick={()=>onAction('greet')}>打个招呼</button>
          {view.activities.map(item=><button key={item.id} className="context-button" disabled={unavailable||!item.available} title={item.reason||undefined} onClick={()=>onAction('activity',item.id)}>{item.label}</button>)}
          <button className="context-button" disabled={unavailable||!view.canPromise} onClick={onPromise}>约好下回来看看木作</button>
        </div>
        <div className="tree-actions neighbour-farewell">
          <button className="context-button" disabled={disabled} onClick={()=>onAction('roam')}>我先忙，你自己转转</button>
          <button className="context-button" disabled={disabled} onClick={()=>onAction('goodbye')}>今天先聊到这儿</button>
        </div>
        {view.clockReason&&<p className="wood-note">相处时，沙漏保持平常速度。</p>}
      </>}
  </section>;
}
