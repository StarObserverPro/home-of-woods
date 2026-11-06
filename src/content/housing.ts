import {CABIN} from './world.ts';
import {BROOM} from './broom.ts';

/** Ordinary handwork; these recipes do not implement a reviewed magical affix. */
export const HOUSING_BLUEPRINTS = [
  {id:'blueprint.pinecone-doorbell',kind:'craft',name:'松果门铃',definitionId:'accessory.pinecone-doorbell',description:'用枝料刻出松果形木铃，挂在木枝吊架下，轻拉便会响。',source:'走近营地工作台，展开基础手作图纸。',targetLabel:'工作台 · 制作挂件',traitId:'',traitName:'',value:0},
  {id:'blueprint.guest-bench',kind:'craft',name:'会客长凳',definitionId:'furniture.guest-bench',description:'用两根原木做一张矮长凳，摆在火塘旁坐一会儿。',source:'走近营地工作台，展开基础手作图纸。',targetLabel:'工作台 · 制作家具',traitId:'',traitName:'',value:0},
] as const;
export const HOUSING = {
  doorbell:{
    definitionId:'accessory.pinecone-doorbell',slotId:'cabin:entry-hanging',hostId:'cabin',
    anchor:{x:.9,y:2.8,z:3.9},point:{x:CABIN.x+1.44,z:CABIN.z+6.24},
    stand:{x:CABIN.x+1.44,z:CABIN.z+9.3},reach:4,
  },
  guestBench:{
    definitionId:'furniture.guest-bench',radius:1.4,
    geometry:{length:2.4,width:.9,height:.85,seatThickness:.15,supportCount:2,supportInset:.2},
    stand:{x:0,z:2.05},seat:{x:0,z:.1},facingOffset:0,
  },
} as const;
export const isHousingBlueprint=(id:string)=>HOUSING_BLUEPRINTS.some(plan=>plan.id===id);
export const housingBlueprint=(id:string)=>HOUSING_BLUEPRINTS.find(plan=>plan.id===id);
export const isHousingFurniture=(definitionId:string)=>definitionId==='furniture.guest-bench'||definitionId==='furniture.prep-side-table';
export const isHousingItem=(definitionId:string)=>definitionId===HOUSING.doorbell.definitionId||isHousingFurniture(definitionId);
export const housingItemName=(definitionId:string)=>definitionId===BROOM.definitionId?'枝扫帚':definitionId==='furniture.prep-side-table'?'备餐边桌':HOUSING_BLUEPRINTS.find(plan=>plan.definitionId===definitionId)?.name??'家具';
