import {useEffect,useRef,useState} from 'react';
import {requestVisitorStory} from '../app/visitor-story.ts';
import type {VisitorStoryResult} from '../app/visitor-story.ts';
import {MenuAction,TextPages} from './ItemBrowser.tsx';

/** Kept inside the existing merchant window/focus owner; unmount cancels in-flight work. */
export function VisitorStory({day,visitIndex,disabled}:{day:number;visitIndex:number;disabled:boolean}){
  const [result,setResult]=useState<VisitorStoryResult|null>(null),[busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  async function listen(){
    if(disabled||request.current||result)return;
    const controller=new AbortController();request.current=controller;setBusy(true);
    try{
      const next=await requestVisitorStory({day,visitIndex},{signal:controller.signal});
      if(!controller.signal.aborted)setResult(next);
    }catch{/* Closing the merchant window intentionally cancels listening. */}
    finally{if(!controller.signal.aborted)setBusy(false);request.current=null;}
  }
  return <section aria-label="行商见闻" aria-busy={busy} data-ui-grid="content">
    {!result?<MenuAction icon="read" disabled={disabled||busy} onClick={()=>void listen()}>{busy?'行商想了想…':'讲个路上见闻'}</MenuAction>:
      <><h3>{result.story.title}</h3><TextPages text={result.story.paragraphs.join('\n\n')} size={90} label="行商故事分页"/>
      <p className="wood-note" role="status">{result.source==='local'?'行商翻出一则旧故事。':'行商刚讲的路上见闻。'}</p></>}
  </section>;
}
