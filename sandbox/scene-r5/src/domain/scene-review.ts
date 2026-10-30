import type {InventoryState} from './inventory.ts';
import {inventoryCount} from './inventory.ts';
export function logPresentation(inventory:InventoryState){
  const quantity=inventoryCount(inventory,'wood');
  return {quantity,visible:Math.min(18,quantity),overflow:Math.max(0,quantity-18)};
}
export function daylightAt(hour:number){
  const altitude=Math.sin((hour-6)/24*Math.PI*2);
  const day=Math.max(0,Math.min(1,(altitude+.12)/.5));
  return {altitude,day,night:1-day,warm:Math.max(0,1-Math.abs(altitude-.12)*3)};
}
