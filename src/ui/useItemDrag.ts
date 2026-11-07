import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {ItemTransferIntent,TransferCheck} from '../domain/interaction-access.ts';

type DragState={item:ItemTransferIntent;x:number;y:number;valid:boolean;reason:string};
type Pending={
  item:ItemTransferIntent;pointerId:number;x:number;y:number;lastX:number;lastY:number;
  active:boolean;element:HTMLElement;onClick?:()=>void;
};
type SuppressedClick={pointerId:number;x:number;y:number;until:number};

/** One pointer contract for inventory cards and scene objects, including touch and cancellation. */
export function useItemDrag(
  preview:(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean)=>TransferCheck,
  commit:(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean)=>TransferCheck,
){
  const pending=useRef<Pending|null>(null);
  const callbacks=useRef({preview,commit});callbacks.current={preview,commit};
  const [drag,setDrag]=useState<DragState|null>(null),[notice,setNotice]=useState('');
  const suppressedClick=useRef<SuppressedClick|null>(null);

  function cancel(){
    const source=pending.current;
    pending.current=null;
    if(source?.active){
      suppressedClick.current={pointerId:source.pointerId,x:source.lastX,y:source.lastY,until:performance.now()+700};
    }
    if(source?.element.hasPointerCapture(source.pointerId))source.element.releasePointerCapture(source.pointerId);
    setDrag(null);
  }

  useEffect(()=>{
    const targetAt=(x:number,y:number)=>{
      const element=document.elementFromPoint(x,y);
      return {warehouse:!!element?.closest('[data-transfer-target="warehouse"]'),scene:element instanceof HTMLCanvasElement};
    };
    const move=(event:PointerEvent)=>{
      const source=pending.current;
      if(!source||source.pointerId!==event.pointerId)return;
      source.lastX=event.clientX;source.lastY=event.clientY;
      if(!source.active&&Math.hypot(event.clientX-source.x,event.clientY-source.y)<8)return;
      source.active=true;
      event.preventDefault();event.stopPropagation();
      const target=targetAt(event.clientX,event.clientY);
      const check=target.warehouse||target.scene
        ?callbacks.current.preview(source.item,event.clientX,event.clientY,target.warehouse)
        :{valid:false,reason:'拖到场景或仓库中，松手前不会移动物品。'};
      setDrag({item:source.item,x:event.clientX,y:event.clientY,...check});
    };
    const finish=(event:PointerEvent)=>{
      const source=pending.current;
      if(!source||source.pointerId!==event.pointerId)return;
      source.lastX=event.clientX;source.lastY=event.clientY;
      if(source.active){
        event.preventDefault();event.stopPropagation();
        const target=targetAt(event.clientX,event.clientY);
        if(event.type!=='pointercancel'&&(target.scene||target.warehouse)){
          setNotice(callbacks.current.commit(source.item,event.clientX,event.clientY,target.warehouse).reason);
        }else setNotice('已取消，物品仍在原处。');
      }else if(event.type!=='pointercancel')source.onClick?.();
      cancel();
    };
    const key=(event:KeyboardEvent)=>{
      if(!pending.current)return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)){
        event.preventDefault();event.stopPropagation();return;
      }
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopPropagation();
      cancel();setNotice('已取消，物品仍在原处。');
    };
    const click=(event:MouseEvent)=>{
      const suppressed=suppressedClick.current;
      if(!suppressed)return;
      if(performance.now()>suppressed.until){suppressedClick.current=null;return;}
      const samePointer=event instanceof PointerEvent&&event.pointerId===suppressed.pointerId;
      const samePlace=Math.hypot(event.clientX-suppressed.x,event.clientY-suppressed.y)<12;
      if(!samePointer&&!samePlace)return;
      event.preventDefault();event.stopPropagation();suppressedClick.current=null;
    };
    const lostCapture=(event:PointerEvent)=>{
      if(pending.current?.pointerId===event.pointerId)cancel();
    };
    const additionalPointer=(event:PointerEvent)=>{
      if(pending.current&&pending.current.pointerId!==event.pointerId)cancel();
    };
    const hidden=()=>{if(document.hidden)cancel();};
    window.addEventListener('pointermove',move,{capture:true,passive:false});
    window.addEventListener('pointerup',finish,true);
    window.addEventListener('pointercancel',finish,true);
    window.addEventListener('lostpointercapture',lostCapture,true);
    window.addEventListener('pointerdown',additionalPointer,true);
    window.addEventListener('keydown',key,true);
    window.addEventListener('click',click,true);
    window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',hidden);
    return()=>{
      cancel();
      window.removeEventListener('pointermove',move,true);
      window.removeEventListener('pointerup',finish,true);
      window.removeEventListener('pointercancel',finish,true);
      window.removeEventListener('lostpointercapture',lostCapture,true);
      window.removeEventListener('pointerdown',additionalPointer,true);
      window.removeEventListener('keydown',key,true);
      window.removeEventListener('click',click,true);
      window.removeEventListener('blur',cancel);
      document.removeEventListener('visibilitychange',hidden);
    };
  },[]);

  function start(event:ReactPointerEvent<HTMLElement>,item:ItemTransferIntent,onClick?:()=>void){
    if(event.button!==0||!event.isPrimary)return;
    cancel();
    suppressedClick.current=null;
    event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    pending.current={item,pointerId:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,active:false,element:event.currentTarget,onClick};
    setNotice('');
  }
  return {drag,notice,start,cancel};
}
