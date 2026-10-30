import type {InventoryState} from './inventory.ts';
import {inventoryCount} from './inventory.ts';
import {VISUAL_DAY_SECONDS,CAMP_PROPS} from '../content/scene-props.ts';
import type {SceneAppearance} from '../content/scene-props.ts';
import {ALTAR_LAYOUT,oracleFor} from '../content/altar.ts';
export function logPresentation(inventory:InventoryState){
  const quantity=inventoryCount(inventory,'wood');
  return {quantity,visible:Math.min(18,quantity),overflow:Math.max(0,quantity-18)};
}
export function daylightAt(hour:number){
  const altitude=Math.sin((hour-6)/24*Math.PI*2);
  const day=Math.max(0,Math.min(1,(altitude+.12)/.5));
  return {altitude,day,night:1-day,warm:Math.max(0,1-Math.abs(altitude-.12)*3)};
}
export function sceneAppearanceAt(time:number):SceneAppearance{
  const hour=(14+time/VISUAL_DAY_SECONDS*24)%24;
  return {hour,fire:daylightAt(hour).night>.5,altar:'ready',offering:'empty',reflections:true};
}
export function scenePropDetails(id:string|null,appearance:SceneAppearance,wood:number){
  if(id===CAMP_PROPS.fire.id)return {title:'营地篝火',tag:appearance.fire?'夜间营火':'白昼炭堆',detail:appearance.fire?'火舌照亮石圈与营地。':'灰黑的焦木与炭头留在石圈中，白天没有火光。'};
  if(id===CAMP_PROPS.logs.id)return {title:'原木堆',tag:`库存 ${wood} 根`,detail:`木架陈列 ${Math.min(18,wood)} 根原木${wood>18?`，其余 ${wood-18} 根收纳在仓库`:''}。`};
  if(id===CAMP_PROPS.altar.id)return {title:'林间祭坛',tag:'盖亚的供奉台',detail:'前沿三格石盘留作供品陈列，右上方悬浮着神谕纸页。供奉尚待开启，可先点击纸页读谕。'};
  if(id===ALTAR_LAYOUT.oracle.id){const text=oracleFor(appearance.altar,appearance.offering);return {title:text.title,tag:'悬浮神谕',detail:text.lines.join('，')+'。'};}
  return null;
}
