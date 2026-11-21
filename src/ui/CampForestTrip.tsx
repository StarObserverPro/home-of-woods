import {useEffect, useRef, useState} from 'react';
import {createForestExpeditionRuntime} from '../app/forest-expedition-runtime.ts';
import type {CampExpeditionSession, ForestExpeditionRuntime} from '../app/forest-expedition-runtime.ts';
import {ForestExpeditionApp} from './ForestExpedition.tsx';
import {TimberButton} from './timber/components.tsx';
import {mountTimberTheme} from './timber/mount.ts';

export default function CampForestTrip({session,onReturn}:{session:CampExpeditionSession;onReturn:()=>void}) {
  const host=useRef<HTMLElement>(null),canvas=useRef<HTMLCanvasElement>(null);
  const [runtime,setRuntime]=useState<ForestExpeditionRuntime|null>(null);
  const [error,setError]=useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let disposed=false, instance:ForestExpeditionRuntime|undefined;
    const unmountTheme=mountTimberTheme(host.current!);
    createForestExpeditionRuntime(canvas.current!,{camp:session}).then(value=>{
      if(disposed){value.dispose();return;}
      instance=value;
      setRuntime(value);
    }).catch(reason=>{
      if(!disposed){console.error(reason);setError(true);}
    });
    return ()=>{disposed=true;instance?.dispose();unmountTheme();};
  },[session,attempt]);
  return <main ref={host} className="camp-forest-trip" data-how-ui="timber" data-ui-grid-root="viewport">
    <canvas ref={canvas} aria-label="林地，点地面行走，拖动画面转动镜头"/>
    {runtime ? <ForestExpeditionApp runtime={runtime} onReturn={onReturn}/>
      : <div className="camp-forest-loading" role={error?'alert':'status'}>
        {error ? <>林地暂时打不开。<TimberButton onClick={()=>{setError(false);setAttempt(n=>n+1);}}>重试</TimberButton></> : '正在走进林地…'}
      </div>}
  </main>;
}
