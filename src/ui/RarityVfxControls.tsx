import {useId} from 'react';
import type {RarityVfxMode} from '../content/item-vfx.ts';
import './rarity-vfx-controls.css';
const choices: readonly {id:RarityVfxMode;label:string;detail:string}[] = [
  {id:'full',label:'完整',detail:'表面流光与动态星芒'},
  {id:'simple',label:'简化',detail:'仅保留一颗静态表面星标'},
  {id:'off',label:'关闭',detail:'不显示地图特效，保留库存等级颜色'},
];
export function RarityVfxControls({mode,onChange,disabled=false,notice=''}:{mode:RarityVfxMode;onChange:(mode:RarityVfxMode)=>void;disabled?:boolean;notice?:string}){
  const id=useId();
  return <fieldset className="rarity-vfx-controls" disabled={disabled} aria-describedby={`${id}-detail`}>
    <legend>稀有物品特效</legend>
    <div className="rarity-vfx-options">{choices.map(choice=><label key={choice.id} className={mode===choice.id?'is-selected':undefined}>
      <input type="radio" name={id} value={choice.id} checked={mode===choice.id} onChange={()=>onChange(choice.id)}/><span>{choice.label}</span>
    </label>)}</div>
    <p id={`${id}-detail`}>{choices.find(choice=>choice.id===mode)!.detail}。只改变外观，不影响物品属性。</p>
    {notice&&<small role="status">{notice}</small>}
  </fieldset>;
}
