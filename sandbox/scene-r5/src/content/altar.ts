import type {AltarState} from './scene-review.ts';
export const OFFERING_MODES=['empty','forest','mixed'] as const;
export type OfferingMode=typeof OFFERING_MODES[number];
export const OFFERING_NAMES={empty:'空盘',forest:'林产',mixed:'林产＋木料'};
export const ALTAR_LAYOUT={
  offeringSlots:[{id:'altar-offering-left',x:-.91,y:1.24,z:.75},{id:'altar-offering-middle',x:0,y:1.24,z:.75},{id:'altar-offering-right',x:.91,y:1.24,z:.75}],
  seed:{x:0,y:2.75,z:-.65},
  oracle:{id:'grove-altar:oracle',x:1.62,y:3.45,z:.35},
} as const;
export const ORACLE_TEXT:Record<AltarState,{title:string;lines:readonly string[]}>= {
  dormant:{title:'神谕未显',lines:['石环沉寂','等候唤醒']},
  ready:{title:'盖亚神谕',lines:['置入供品','静候回应']},
  answering:{title:'盖亚神谕',lines:['取木有度','留荫待生']},
  resting:{title:'神谕留存',lines:['护持幼树','守望新生']},
};
export function oracleFor(state:AltarState,offering:OfferingMode){
  return state==='ready'&&offering==='empty'?{title:'盖亚神谕',lines:['供品待置','静候回应']}:ORACLE_TEXT[state];
}
