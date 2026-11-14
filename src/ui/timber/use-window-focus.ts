import {useEffect} from 'react';

const FOCUSABLE = 'button:not(:disabled),summary,a[href],select:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]';

/** A window owns focus while its existing App owner keeps Escape and world input. */
export function useWindowFocus(selector:string|null, identity:string|null=selector) {
  useEffect(()=>{
    if (!selector) return;
    const panel = document.querySelector<HTMLElement>(selector);
    if (!panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const eligible = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(node=>node.checkVisibility() && !node.closest('[inert]'));
    // Delay until layout has hidden the background tools and React has committed the contents.
    const frame = requestAnimationFrame(()=>{
      if (panel.isConnected) (eligible()[0] ?? panel).focus({preventScroll:true});
    });
    const trap = (event:KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = eligible(), first = nodes[0], last = nodes.at(-1);
      if (!first) {event.preventDefault();panel.focus();return;}
      if (!panel.contains(document.activeElement) || event.shiftKey && document.activeElement===first) {
        event.preventDefault();(event.shiftKey?last:first)?.focus();
      } else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    };
    panel.addEventListener('keydown',trap);
    return ()=>{
      cancelAnimationFrame(frame);panel.removeEventListener('keydown',trap);
      requestAnimationFrame(()=>{
        if (previous?.isConnected && previous.checkVisibility()) previous.focus({preventScroll:true});
      });
    };
  },[selector,identity]);
}
