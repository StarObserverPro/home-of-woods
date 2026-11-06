import {craftProfile} from '../content/parametric-crafting.ts';
import {ITEM_CATALOG} from './item-catalog.ts';
import {recognizedStack,stackIdentity} from './inventory.ts';
import type {InventoryStack,InventoryDelta} from './inventory.ts';
import {isAvailableMaterial} from './transport-location.ts';
import type {GameState} from './state.ts';

/** Resolve the registered recipe, preserving batch metadata and transport restrictions. */
export function craftMaterialDebits(host:GameState,blueprintId:string):InventoryDelta[]|null{
  const profile=craftProfile(blueprintId);if(!profile||profile.status!=='active')return null;
  const used=new Map<InventoryStack,number>(),debits:InventoryDelta[]=[];
  for(const input of profile.inputs){
    if(input.handling!=='consume')return null;
    let left=input.quantity;
    for(const stack of host.inventory.stacks){
      if(!recognizedStack(stack)||!isAvailableMaterial(stack)||stack.wood?.reserved||!input.typeIds.includes(ITEM_CATALOG.items.get(stack.itemId)?.typeId??''))continue;
      const quantity=Math.min(left,stack.quantity-(used.get(stack)??0));
      if(quantity>0){debits.push({...stackIdentity(stack),delta:-quantity});used.set(stack,(used.get(stack)??0)+quantity);left-=quantity;}
      if(!left)break;
    }
    if(left)return null;
  }
  return debits;
}
export function craftMaterialCosts(host:GameState,blueprintId:string){
  return (craftProfile(blueprintId)?.inputs??[]).map(input=>({
    name:input.typeIds.includes('wood.branch')?'枝杈':'原木',quantity:input.quantity,
    available:host.inventory.stacks.filter(stack=>recognizedStack(stack)&&isAvailableMaterial(stack)&&!stack.wood?.reserved&&input.typeIds.includes(ITEM_CATALOG.items.get(stack.itemId)?.typeId??'')).reduce((sum,stack)=>sum+stack.quantity,0),
  }));
}
