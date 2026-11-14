import {useEffect,useRef} from 'react';

const FOCUSABLE = 'button:not(:disabled),summary,a[href],select:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]';

function visible(node:HTMLElement) {
  return node.isConnected && node.checkVisibility({visibilityProperty:true}) && !node.closest('[inert]');
}

function anotherModal(panel?:HTMLElement) {
  return [...document.querySelectorAll<HTMLElement>('dialog:modal,[aria-modal="true"]')]
    .some(modal=>visible(modal) && (!panel || !modal.contains(panel)));
}

/** A window owns keyboard focus; App still owns Escape and outside-pointer dismissal. */
export function useWindowFocus(selector:string|null, identity:string|null=selector, suspended=false) {
  const owner=useRef<HTMLElement|null>(null),opener=useRef<HTMLElement|null>(null);
  const restoring=useRef(0),handoff=useRef(suspended);
  useEffect(()=>{
    handoff.current=suspended;
    cancelAnimationFrame(restoring.current);
    const restore=(leaving?:HTMLElement)=>{
      if(!opener.current)return;
      restoring.current=requestAnimationFrame(()=>{
        if(owner.current || handoff.current || anotherModal())return;
        const target=opener.current,active=document.activeElement;
        // A successor or the user may already have chosen a new focus target.
        if(active instanceof HTMLElement && active!==document.body && active!==document.documentElement
          && active!==target && !leaving?.contains(active) && visible(active)){
          opener.current=null;
          return;
        }
        opener.current=null;
        if(target && visible(target))target.focus({preventScroll:true});
      });
    };
    const panel=selector&&!suspended?document.querySelector<HTMLElement>(selector):null;
    if(!panel){
      if(!suspended)restore();
      return()=>cancelAnimationFrame(restoring.current);
    }
    if(!opener.current?.isConnected)opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    owner.current=panel;
    const ownsFocus=()=>owner.current===panel && !handoff.current && visible(panel) && !anotherModal(panel);
    const eligible=()=>[...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter(node=>node.tabIndex>=0 && !node.matches(':disabled') && visible(node));
    const frame=requestAnimationFrame(()=>{
      if(!ownsFocus())return;
      const active=document.activeElement;
      if(!(active instanceof HTMLElement) || !panel.contains(active) || !visible(active))
        (eligible()[0]??panel).focus({preventScroll:true});
    });
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=='Tab' || event.defaultPrevented || !ownsFocus())return;
      const nodes=eligible(),first=nodes[0],last=nodes.at(-1),active=document.activeElement;
      if(!first){event.preventDefault();panel.focus({preventScroll:true});return;}
      // Removed or hidden controls leave focus on body; the next Tab re-enters here.
      if(!nodes.includes(active as HTMLElement) || active===(event.shiftKey?first:last)){
        event.preventDefault();
        (event.shiftKey?last:first)?.focus();
      }
    };
    document.addEventListener('keydown',trap);
    return()=>{
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown',trap);
      if(owner.current===panel)owner.current=null;
      restore(panel);
    };
  },[selector,identity,suspended]);
}
