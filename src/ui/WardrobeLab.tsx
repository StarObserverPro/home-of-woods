import {useState} from 'react';
import type {Runtime} from '../app/runtime.ts';
import {DEFAULT_WARDROBE, WARDROBE_OPTIONS, WARDROBE_SLOTS, WARDROBE_SLOT_NAMES, resolveWardrobe} from '../content/wardrobe-preview.ts';
import type {WardrobeLook, WardrobeSlot} from '../content/wardrobe-preview.ts';

type Props={runtime:()=>Runtime|null;localPlayer:boolean};
const J01_OPTIONS={
  top:{original:'靛蓝工衫','field-shirt':'本色工衫'},
  headwear:{none:'不戴帽',cap:'劳工贝雷帽'},
} as const;
/** QA-only appearance test; no items, blueprints, capacity or permanent equipment are granted. */
export function WardrobeLab({runtime,localPlayer}:Props){
  const [look,setLook]=useState<WardrobeLook>({...DEFAULT_WARDROBE});
  function choose(slot:WardrobeSlot,id:string){
    const patch={[slot]:id} as Partial<WardrobeLook>;
    const next=resolveWardrobe(patch,look);
    setLook(next);runtime()?.previewWardrobe(patch);
  }
  function reset(){
    setLook({...DEFAULT_WARDROBE});runtime()?.previewWardrobe(DEFAULT_WARDROBE);
  }
  const slots=localPlayer?(['top','headwear'] as const):WARDROBE_SLOTS;
  return <fieldset className="scene-inspector wardrobe-lab">
    <legend>人物衣装检视 · {localPlayer?'林工':'KayKit'}</legend>
    <div className="scene-options">
      <button onClick={()=>runtime()?.inspectCharacter('wardrobe')}>近景看穿搭</button>
      <button onClick={()=>runtime()?.inspectCharacter(null)}>返回漫步</button>
      <button onClick={reset}>恢复原造型</button>
    </div>
    {slots.map(slot=><label key={slot}>
      {WARDROBE_SLOT_NAMES[slot]}
      <select aria-label={'衣装'+WARDROBE_SLOT_NAMES[slot]} value={look[slot]} onChange={e=>choose(slot,e.target.value)}>
        {Object.entries(localPlayer&&(slot==='top'||slot==='headwear')?J01_OPTIONS[slot]:WARDROBE_OPTIONS[slot]).map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select>
    </label>)}
    <small>仅检视模型结构与动作。不会发放衣物、帽子、背包或图纸，不改变负重/词条，也不写入存档。</small>
  </fieldset>;
}
