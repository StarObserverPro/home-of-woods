import {useEffect,useState} from 'react';
import {TimberButton,TimberHeading} from './timber/components.tsx';

function usePageCapacity(maximum:number){
  const read=()=>Math.min(maximum,window.innerWidth<=540||window.innerHeight<=520?4:8);
  const [size,setSize]=useState(read);
  useEffect(()=>{const resize=()=>setSize(read());window.addEventListener('resize',resize);resize();return()=>window.removeEventListener('resize',resize);},[maximum]);
  return size;
}

import type {ReactNode,PointerEvent} from 'react';
import {GameIcon} from './GameIcon.tsx';
import type {ArtIconName} from './art-icons.ts';

export type MenuItem={id:string;name:string;icon:ArtIconName|null;category?:string;quantity?:number;badge?:string;muted?:boolean};
export type MenuTab={id:string;name:string;icon?:ArtIconName};
export function IconTabs({tabs,value,onChange,label}:{tabs:readonly MenuTab[];value:string;onChange:(id:string)=>void;label:string}){
  return <nav className="wood-tabs" aria-label={label}>{tabs.map(tab=><button type="button" key={tab.id} aria-label={tab.name} aria-pressed={value===tab.id} onClick={()=>onChange(tab.id)}>{tab.icon&&<GameIcon name={tab.icon} size={27}/>}<span>{tab.name}</span></button>)}</nav>;
}
export function WoodHeading({title,icon,onClose,closeLabel='关闭窗口',children}:{title:string;icon?:ArtIconName;onClose?:()=>void;closeLabel?:string;children?:ReactNode}){
  return <TimberHeading className="wood-heading">{icon&&<GameIcon name={icon} size={32}/>}<h2>{title}</h2>{children}{onClose&&<button type="button" className="wood-close" aria-label={closeLabel} onClick={onClose}>×</button>}</TimberHeading>;
}
export function Pager({page,pages,onChange,label='物品分页'}:{page:number;pages:number;onChange:(page:number)=>void;label?:string}){
  if(pages<=1)return null;
  return <nav className="wood-pager" aria-label={label}><button type="button" aria-label="上一页" disabled={page===0} onClick={()=>onChange(page-1)}>‹</button><span>{page+1}/{pages}</span><button type="button" aria-label="下一页" disabled={page+1>=pages} onClick={()=>onChange(page+1)}>›</button></nav>;
}
/** Local selection only. Quantities, eligibility and commits belong to the runtime snapshot. */
export function ItemBrowser<T extends MenuItem>({items,categories,renderDetail,label,empty='这里暂时没有物品',pageSize=8,tools,onItemPointerDown,canDragItem}:{
  items:readonly T[];categories?:readonly MenuTab[];renderDetail:(item:T)=>ReactNode;label:string;empty?:string;pageSize?:number;tools?:ReactNode;
  onItemPointerDown?:(event:PointerEvent<HTMLElement>,item:T)=>void;canDragItem?:(item:T)=>boolean;
}){
  const [category,setCategory]=useState('all'),[page,setPage]=useState(0),[selection,setSelection]=useState('');
  pageSize=usePageCapacity(pageSize);
  const filtered=items.filter(item=>category==='all'||item.category===category);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),current=Math.min(page,pages-1);
  const shown=filtered.slice(current*pageSize,(current+1)*pageSize);
  const selected=shown.find(item=>item.id===selection)??shown[0];
  // A removal can shrink the last page. Keep the next interaction on the page actually shown.
  useEffect(()=>{if(page!==current)setPage(current);},[page,current]);
  return <section className="item-browser" aria-label={label}>
    {(categories||tools)&&<div className="browser-toolbar">{categories&&<IconTabs tabs={categories} value={category} label={`${label}分类`} onChange={id=>{setCategory(id);setPage(0);setSelection('');}}/>}{tools}</div>}
    <div className="browser-body">
      <div className="browser-catalog"><div className="browser-slots" role="group" aria-label={`${label}图标`}>
        {shown.map(item=>{
          const draggable=!!onItemPointerDown&&(!canDragItem||canDragItem(item));
          return <button type="button" className={'wood-slot'+(item.muted?' is-muted':'')+(draggable?' is-draggable':'')} key={item.id} aria-pressed={selected?.id===item.id} aria-label={item.name+(item.quantity!==undefined?`，${item.quantity}份`:'')+(item.badge?`，${item.badge}`:'')} title={draggable?'按住图标拖到场景，松手放下':undefined} onPointerDown={event=>{if(draggable)onItemPointerDown?.(event,item);}} onClick={()=>setSelection(item.id)}>
          <GameIcon name={item.icon} size={60}/>{selected?.id===item.id&&<span className="slot-mark" aria-hidden="true">◆</span>}{item.quantity!==undefined&&<strong className="slot-quantity">{item.quantity}</strong>}{item.badge&&<span className="slot-badge">{item.badge}</span>}
        </button>;
        })}
        {shown.length>0&&Array.from({length:pageSize-shown.length},(_,i)=><div className="wood-slot empty-slot" key={`empty-${i}`} aria-hidden="true"/>)}
        {!shown.length&&<p className="wood-empty">{empty}</p>}
      </div>
      <Pager page={current} pages={pages} onChange={next=>{setPage(next);setSelection('');}}/>
      </div>
      {selected&&<section key={selected.id} className="wood-detail" aria-label="选中详情">{renderDetail(selected)}</section>}
    </div>
  </section>;
}
export function ItemHeading({name,icon,subtitle}:{name:string;icon:ArtIconName|null;subtitle?:ReactNode}){
  return <div className="wood-item-heading"><GameIcon name={icon} size={46}/><div><h3>{name}</h3>{subtitle&&<small>{subtitle}</small>}</div></div>;
}
export function MenuAction({icon,children,disabled,onClick,secondary=false,label}:{icon?:ArtIconName;children:ReactNode;disabled?:boolean;onClick:()=>void;secondary?:boolean;label?:string}){
  return <TimberButton aria-label={label} emphasis={secondary?'quiet':'normal'} className={secondary?'wood-action secondary':'wood-action'} disabled={disabled} onClick={onClick}>{icon&&<GameIcon name={icon} size={25}/>}<span>{children}</span></TimberButton>;
}
export type MaterialCount={name:string;available?:number;quantity:number;icon?:ArtIconName};
export function materialIcon(name:string):ArtIconName{
  return /五金|铁件/.test(name)?'hardware-kit':/帆布|布面/.test(name)?'canvas-roll':/枝/.test(name)?'branch':/菌/.test(name)?'mushroom':/盐/.test(name)?'cooking-salt':/米/.test(name)?'rice':/燕麦/.test(name)?'oats':/豆/.test(name)?'beans':'wood-log';
}
export function MaterialCounts({items}:{items:readonly MaterialCount[]}){
  return <div className="wood-materials" aria-label="所需材料">{items.map((item,i)=><span key={`${item.name}-${i}`} className={item.available!==undefined&&item.available<item.quantity?'is-missing':undefined} aria-label={`${item.name}，${item.available===undefined?'':`拥有${item.available}，`}需要${item.quantity}`}><GameIcon name={item.icon??materialIcon(item.name)} size={27}/><span>{item.available===undefined?`×${item.quantity}`:`${item.available}/${item.quantity}`}</span></span>)}</div>;
}
export function QuantityControl({value,max,onChange,min=1}:{value:number;max:number;onChange:(value:number)=>void;min?:number}){
  return <div className="wood-quantity" aria-label="操作数量"><button type="button" aria-label="减少数量" disabled={value<=min} onClick={()=>onChange(value-1)}>−</button><output aria-label="当前数量">{value}</output><button type="button" aria-label="增加数量" disabled={value>=max} onClick={()=>onChange(value+1)}>＋</button></div>;
}
export function TextPages({text,label='说明',size=90}:{text:string;label?:string;size?:number}){
  const [page,setPage]=useState(0);
  const parts=text.match(new RegExp(`[\\s\\S]{1,${size}}`,'g'))??[''];
  const current=Math.min(page,parts.length-1);
  return <div className="wood-text-pages"><p>{parts[current]}</p><Pager page={current} pages={parts.length} onChange={setPage} label={label}/></div>;
}
export function ItemNotes({text,children}:{text:string;children:ReactNode}){
  const [open,setOpen]=useState(false);
  return <><button type="button" className="wood-info" aria-label={open?'返回操作':'物品说明'} aria-pressed={open} onClick={()=>setOpen(v=>!v)}>{open?'↶':'i'}</button>{open?<TextPages text={text} size={64}/>:children}</>;
}
