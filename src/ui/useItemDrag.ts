import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {ItemTransferIntent,TransferCheck} from '../domain/interaction-access.ts';

type DragState={item:ItemTransferIntent;x:number;y:number;valid:boolean;reason:string};
type Pending={item:ItemTransferIntent;pointerId:number;x:number;y:number;active:boolean;element:HTMLElement};
/** One pointer contract for inventory cards and scene objects, including touch and cancellation. */
export function useItemDrag(preview:(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean)=>TransferCheck,
  commit:(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean)=>TransferCheck){
  const pending=useRef<Pending|null>(null),callbacks=useRef({preview,commit});callbacks.current={preview,commit};
  const [drag,setDrag]=useState<DragState|null>(null),[notice,setNotice]=useState('');
  const suppressClick=useRef(false);
  function cancel(){const p=pending.current;pending.current=null;suppressClick.current=false;if(p?.element.hasPointerCapture(p.pointerId))p.element.releasePointerCapture(p.pointerId);setDrag(null);}
  useEffect(()=>{
    const targetAt=(x:number,y:number)=>{
      const element=document.elementFromPoint(x,y);
      return {warehouse:!!element?.closest('[data-transfer-target="warehouse"]'),scene:element instanceof HTMLCanvasElement};
    };
    const move=(event:PointerEvent)=>{
      const p=pending.current;if(!p||p.pointerId!==event.pointerId)return;
      if(!p.active&&Math.hypot(event.clientX-p.x,event.clientY-p.y)<8)return;
      p.active=true;suppressClick.current=true;event.preventDefault();event.stopPropagation();
      const target=targetAt(event.clientX,event.clientY);
      const check=target.warehouse||target.scene?callbacks.current.preview(p.item,event.clientX,event.clientY,target.warehouse):{valid:false,reason:'拖到场景或仓库中，松手前不会移动物品。'};
      setDrag({item:p.item,x:event.clientX,y:event.clientY,...check});
    };
    const finish=(event:PointerEvent)=>{
      const p=pending.current;if(!p||p.pointerId!==event.pointerId)return;
      if(p.active){
        event.preventDefault();event.stopPropagation();
        const target=targetAt(event.clientX,event.clientY);
        if(event.type!=='pointercancel'&&(target.scene||target.warehouse))setNotice(callbacks.current.commit(p.item,event.clientX,event.clientY,target.warehouse).reason);
        else setNotice('已取消，物品仍在原处。');
      }
      cancel();
      if(p.active&&event.type!=='pointercancel'){
        // Only suppress the synthetic click belonging to this completed drag.
        suppressClick.current=true;setTimeout(()=>{suppressClick.current=false;},0);
      }
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&pending.current){event.preventDefault();event.stopPropagation();cancel();setNotice('已取消，物品仍在原处。');}};
    const click=(event:MouseEvent)=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}};
    const hidden=()=>{if(document.hidden)cancel();};
    window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);
    window.addEventListener('keydown',key,true);window.addEventListener('click',click,true);window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',hidden);
    return()=>{cancel();window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',finish,true);window.removeEventListener('keydown',key,true);window.removeEventListener('click',click,true);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  function start(event:ReactPointerEvent<HTMLElement>,item:ItemTransferIntent){
    if(event.button!==0||!event.isPrimary)return;
    event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    pending.current={item,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,element:event.currentTarget};setNotice('');
  }
  return {drag,notice,start,cancel};
}
