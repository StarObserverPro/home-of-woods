import {useId} from 'react';
import type {WhimsyMode} from '../content/whimsy-display.ts';
import './rarity-vfx-controls.css';

const choices:readonly {id:WhimsyMode;label:string;detail:string}[]=[
  {id:'full',label:'完整',detail:'器具的短表演与局部动作'},
  {id:'simple',label:'轻量',detail:'只保留较小的奇趣动作'},
  {id:'off',label:'关闭',detail:'停用额外表演，普通使用照常进行'},
];
export function WhimsyControls({mode,onChange,disabled=false,notice=''}:{mode:WhimsyMode;onChange:(mode:WhimsyMode)=>void;disabled?:boolean;notice?:string}){
  const id=useId();
  return <fieldset className="rarity-vfx-controls" disabled={disabled} aria-describedby={`${id}-detail`}>
    <legend>奇趣动作</legend>
    <div className="rarity-vfx-options">{choices.map(choice=><label key={choice.id} className={mode===choice.id?'is-selected':undefined}>
      <input type="radio" name={id} value={choice.id} checked={mode===choice.id} onChange={()=>onChange(choice.id)}/><span>{choice.label}</span>
    </label>)}</div>
    <p id={`${id}-detail`}>{choices.find(choice=>choice.id===mode)!.detail}。</p>
    {notice&&<small role="status">{notice}</small>}
  </fieldset>;
}
