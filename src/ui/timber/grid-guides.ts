/** Inspection only. Actual DOM boxes are the source of truth; the overlay never snaps layout. */
type GridRoot = HTMLElement | ShadowRoot;
let nextGuide = 0;
const NS = 'http://www.w3.org/2000/svg';

export function mountGridGuides(root: GridRoot) {
  const doc = root.ownerDocument, view = doc.defaultView!;
  const owner = root instanceof HTMLElement ? root : root.querySelector<HTMLElement>('[data-how-ui]') ?? root.host as HTMLElement;
  const id = `how-grid-${++nextGuide}`;
  let overlay: HTMLDivElement | undefined, probe: HTMLDivElement | undefined;
  let frame = 0, disposed = false, lastDialog: Element | null = null;
  const queryEnabled = new URLSearchParams(view.location.search).get('uiGrid') === '1';
  const enabled = () => owner.dataset.uiGridDebug === 'true' || (owner.dataset.uiGridDebug !== 'false' && queryEnabled);

  function front() {
    if (!overlay) return;
    try {
      if (overlay.matches(':popover-open')) overlay.hidePopover();
      overlay.showPopover();
    } catch { /* The fixed overlay still works in older hosts without popovers. */ }
  }
  function draw() {
    frame = 0;
    if (!overlay || !probe || disposed) return;
    const rootBox = owner.getBoundingClientRect();
    const viewport = owner.dataset.uiGridRoot === 'viewport';
    const style = view.getComputedStyle(viewport ? probe : owner);
    const value = (key: 'paddingLeft'|'paddingRight'|'paddingTop'|'paddingBottom') => parseFloat(style[key]) || 0;
    const safe = {
      left:rootBox.left + value('paddingLeft'), right:rootBox.right - value('paddingRight'),
      top:rootBox.top + value('paddingTop'), bottom:rootBox.bottom - value('paddingBottom'),
    };
    const svg = doc.createElementNS(NS,'svg');
    svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    svg.style.cssText = 'display:block;pointer-events:none;filter:none;';
    const add = (tag:string, attributes:Record<string,string|number>, parent:Element=svg) => {
      const node = doc.createElementNS(NS,tag);
      for (const [name,value] of Object.entries(attributes)) node.setAttribute(name,String(value));
      parent.append(node); return node;
    };
    const defs = add('defs',{});
    const unit = parseFloat(view.getComputedStyle(owner).getPropertyValue('--how-grid-unit')) || 4;
    const pattern = add('pattern',{id,width:unit*2,height:unit*2,patternUnits:'userSpaceOnUse',x:safe.left,y:safe.top},defs);
    add('path',{d:`M ${unit*2} 0 H 0 V ${unit*2}`,fill:'none',stroke:'#ffffff','stroke-opacity':.14,'stroke-width':.75},pattern);
    add('path',{d:`M ${unit} 0 V ${unit*2} M 0 ${unit} H ${unit*2}`,fill:'none',stroke:'#ffffff','stroke-opacity':.06,'stroke-width':.5},pattern);
    const clip = add('clipPath',{id:`${id}-clip`},defs);
    add('rect',{x:rootBox.left,y:rootBox.top,width:Math.max(0,rootBox.width),height:Math.max(0,rootBox.height)},clip);
    const layer = add('g',{'clip-path':`url(#${id}-clip)`});
    add('rect',{x:safe.left,y:safe.top,width:Math.max(0,safe.right-safe.left),height:Math.max(0,safe.bottom-safe.top),fill:`url(#${id})`},layer);
    const line = (x1:number,y1:number,x2:number,y2:number,color:string,dash='') => add('line',{x1,y1,x2,y2,stroke:color,'stroke-width':1,'stroke-dasharray':dash},layer);
    const box = (r:{left:number;top:number;right:number;bottom:number}, color:string, dash='') => {
      add('rect',{x:r.left,y:r.top,width:Math.max(0,r.right-r.left),height:Math.max(0,r.bottom-r.top),fill:'none',stroke:color,'stroke-width':1,'stroke-dasharray':dash},layer);
    };
    box(safe,'#7ee8ff');
    line(safe.left,0,safe.left,view.innerHeight,'#7ee8ff');
    line(safe.right,0,safe.right,view.innerHeight,'#7ee8ff');
    const visible = (node:HTMLElement) => {
      const r = node.getBoundingClientRect(), s = view.getComputedStyle(node);
      return r.width>0 && r.height>0 && r.bottom>0 && r.top<view.innerHeight && r.right>0 && r.left<view.innerWidth && s.visibility!=='hidden' && s.display!=='none';
    };
    for (const node of [...root.querySelectorAll<HTMLElement>('[data-ui-grid]')].filter(visible).slice(0,200)) {
      const r = node.getBoundingClientRect(), kind = node.dataset.uiGrid;
      const color = kind==='window' ? '#ffd48a' : kind==='notice' ? '#ffa5e3' : kind==='row' ? '#9ae2ad' : '#7ee8ff';
      box(r,color,kind==='row' ? '4 4' : '');
      if (kind==='window' || kind==='content') {
        const s = view.getComputedStyle(node);
        const inner = {left:r.left+parseFloat(s.paddingLeft),right:r.right-parseFloat(s.paddingRight),top:r.top+parseFloat(s.paddingTop),bottom:r.bottom-parseFloat(s.paddingBottom)};
        box(inner,'#ffd48a','3 3');
      }
      if (kind==='row' || kind==='content' || kind==='hud') {
        for (const control of [...node.querySelectorAll<HTMLElement>('button,summary,select,input:not([type="checkbox"]):not([type="radio"])')].filter(visible)) {
          if (control.closest('[data-ui-grid]')!==node) continue;
          const c = control.getBoundingClientRect(); box(c,'#9ae2ad','2 3');
          line(c.left,(c.top+c.bottom)/2,c.right,(c.top+c.bottom)/2,'#9ae2ad','2 4');
        }
      }
    }
    const legendY = Math.max(0,Math.min(view.innerHeight-20,rootBox.bottom-20));
    add('rect',{x:Math.max(0,rootBox.left),y:legendY,width:Math.min(560,rootBox.width),height:20,fill:'#102019',opacity:.9});
    const legend = add('text',{x:Math.max(0,rootBox.left)+8,y:legendY+14,fill:'#f8f0d8','font-family':'system-ui,sans-serif','font-size':11});
    legend.textContent = '4px · 青：安全边 / 金：内容边 / 绿：控件行 / 粉：消息';
    overlay.replaceChildren(svg);
    overlay.dataset.uiGridBoxes = String(root.querySelectorAll('[data-ui-grid]').length);
    const dialog = doc.querySelector('dialog[open]');
    if (dialog!==lastDialog) { lastDialog=dialog; front(); }
  }
  function refresh() {
    if (overlay && !frame && !disposed) frame=view.requestAnimationFrame(draw);
  }
  function clear() {
    if (frame) view.cancelAnimationFrame(frame);
    frame=0; overlay?.remove(); probe?.remove(); overlay=undefined; probe=undefined;
    view.removeEventListener('resize',refresh); doc.removeEventListener('scroll',refresh,true);
    view.visualViewport?.removeEventListener('resize',refresh);
    view.visualViewport?.removeEventListener('scroll',refresh);
  }
  function sync() {
    if (disposed) return;
    if (!enabled()) { if (overlay) clear(); return; }
    if (!overlay) {
      probe=doc.createElement('div'); probe.dataset.uiGridProbe='true'; probe.setAttribute('aria-hidden','true');
      probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden;padding:var(--how-safe-top) var(--how-safe-right) var(--how-safe-bottom) var(--how-safe-left);';
      owner.append(probe);
      overlay=doc.createElement('div'); overlay.dataset.uiGridOverlay=id;
      overlay.setAttribute('aria-hidden','true'); overlay.inert=true; overlay.setAttribute('popover','manual');
      overlay.style.cssText='position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;pointer-events:none;z-index:2147483647;width:100vw;height:100dvh;max-width:none;max-height:none;overflow:hidden;contain:strict;';
      doc.body.append(overlay); front();
      view.addEventListener('resize',refresh); doc.addEventListener('scroll',refresh,true);
      view.visualViewport?.addEventListener('resize',refresh); view.visualViewport?.addEventListener('scroll',refresh);
    }
    refresh();
  }
  sync();
  return {sync,refresh,dispose:()=>{disposed=true;clear();}};
}
