import {CAMP_VISITOR} from '../content/characters.ts';
import {MERCHANT_BUY_RULES,MERCHANT_CAPACITY,MERCHANT_RARITY_MULTIPLIER,merchantListings,merchantVisitAt} from '../content/merchant.ts';
import {ITEM_CATALOG,isStableId} from './item-catalog.ts';
import {inventoryTransaction,isRecord} from './inventory.ts';
import type {InventoryDelta} from './inventory.ts';
import {canonicalInstances} from './owned-items.ts';
import type {OwnedItem} from './owned-items.ts';
import {BLUEPRINT_SHEET,createBlueprintSheet} from './blueprint-copies.ts';
import type {GameState} from './state.ts';

export type MerchantReceipt = {
  visitIndex:number; at:number; soldIds:string[];
  purchases:{id:string;quantity:number}[]; coinsEarned:number; coinsSpent:number;
};
export type MerchantState = {
  coins:number; debt:number; nextSheet:number; welcomeClaimed:boolean;
  visitIndex:number; purchased:Record<string,number>;
  sold:Record<string,number>; cargoUsed:number; budgetSpent:number;
  receipts:MerchantReceipt[];
};
export const createMerchant=():MerchantState=>({
  coins:100,debt:0,nextSheet:1,welcomeClaimed:false,visitIndex:-1,
  purchased:{},sold:{},cargoUsed:0,budgetSpent:0,receipts:[],
});
const safeInt=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>
  Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const safeCounts=(x:unknown):x is Record<string,number> =>
  isRecord(x)&&Object.entries(x).every(([k,v])=>isStableId(k)&&safeInt(v));
export function validateMerchant(raw:unknown):MerchantState {
  if(!isRecord(raw))throw new Error('Invalid merchant ledger');
  const keys=['coins','debt','nextSheet','welcomeClaimed','visitIndex','purchased','sold','cargoUsed','budgetSpent','receipts'];
  if(Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key))||
    !safeInt(raw.coins)||!safeInt(raw.debt,0,MERCHANT_CAPACITY.creditLimit)||
    !safeInt(raw.nextSheet,1)||typeof raw.welcomeClaimed!=='boolean'||
    !safeInt(raw.visitIndex,-1)||!safeCounts(raw.purchased)||!safeCounts(raw.sold)||
    !safeInt(raw.cargoUsed,0,MERCHANT_CAPACITY.cargoUnits)||
    !safeInt(raw.budgetSpent,0,MERCHANT_CAPACITY.buyBudget)||
    !Array.isArray(raw.receipts)||raw.receipts.length>20)throw new Error('Invalid merchant economy state');
  for(const receipt of raw.receipts){
    if(!isRecord(receipt)||!safeInt(receipt.visitIndex)||!safeInt(receipt.at)||
      !safeInt(receipt.coinsEarned)||!safeInt(receipt.coinsSpent)||
      !Array.isArray(receipt.soldIds)||!receipt.soldIds.every(isStableId)||
      !Array.isArray(receipt.purchases)||!receipt.purchases.every((line:unknown)=>
        isRecord(line)&&isStableId(line.id)&&safeInt(line.quantity,1,100)))throw new Error('Invalid merchant receipt');
  }
  return structuredClone(raw) as MerchantState;
}
function currentLedger(host:GameState,index:number):MerchantState {
  const ledger=host.merchant;
  return ledger.visitIndex===index?ledger:{...ledger,visitIndex:index,purchased:{},sold:{},cargoUsed:0,budgetSpent:0};
}
const saleRule=(item:OwnedItem)=>{
  const rule=MERCHANT_BUY_RULES[item.definitionId as keyof typeof MERCHANT_BUY_RULES];
  if(!rule||('status' in rule&&rule.status!=='active')||
    ITEM_CATALOG.ownedItems.get(item.definitionId)?.status!=='active')return null;
  const rarity=typeof item.rarityId==='string'?item.rarityId:'common';
  return {...rule,price:Math.round(rule.basePrice*(MERCHANT_RARITY_MULTIPLIER[rarity]??1))};
};
export function merchantSnapshot(host:GameState) {
  const visit=merchantVisitAt(host.time),ledger=currentLedger(host,visit.index);
  const listings=merchantListings(host.seed,visit.index);
  return {
    ...visit,coins:ledger.coins,debt:ledger.debt,
    cargoLeft:MERCHANT_CAPACITY.cargoUnits-ledger.cargoUsed,
    budgetLeft:MERCHANT_CAPACITY.buyBudget-ledger.budgetSpent,
    giftAvailable:visit.parked&&!ledger.welcomeClaimed,
    listings:listings.map(item=>({...item,remaining:Math.max(0,item.stock-(ledger.purchased[item.id]??0)),
      learned:item.kind==='blueprint'&&item.uses===null&&host.workshop.blueprints.includes(item.blueprintId??'')})),
    saleables:(host.inventory.instances??[]).flatMap(item=>{
      const rule=item.location.kind==='inventory'&&item.definitionId!==BLUEPRINT_SHEET?saleRule(item):null;
      return rule?[{id:item.instanceId,name:rule.name,icon:rule.icon,price:rule.price,
        cargoUnits:rule.cargoUnits,definitionId:item.definitionId,rarity:typeof item.rarityId==='string'?item.rarityId:'common',
        remainingDemand:Math.max(0,rule.perVisit-(ledger.sold[item.definitionId]??0))}]:[];
    }),
  };
}
export type MerchantBuyLine={id:string;quantity:number};
export type MerchantOrder={buy:MerchantBuyLine[];sellIds:string[];welcome?:boolean};
export type MerchantTradeResult={ok:boolean;message:string};
const failed=(message:string):MerchantTradeResult=>({ok:false,message});
/** Staged buy/sell order is validated entirely before a single world-state assignment. */
export function exchangeMerchant(host:GameState,order:MerchantOrder):MerchantTradeResult {
  if(host.selected!==CAMP_VISITOR.id||
    Math.hypot(host.player.x-CAMP_VISITOR.x,host.player.z-CAMP_VISITOR.z)>3)return failed('走近货车后再交易。');
  const visit=merchantVisitAt(host.time);
  if(!visit.parked)return failed('行商尚未停稳，或已经离开。');
  if(host.workshop.job||host.forestry.active||host.gathering.action||host.ritual)return failed('先完成手上的动作。');
  if(!Array.isArray(order.buy)||!Array.isArray(order.sellIds)||order.buy.length>30||order.sellIds.length>100||
    order.buy.some(line=>!line||!isStableId(line.id)||!safeInt(line.quantity,1,100))||
    order.sellIds.some(id=>!isStableId(id))||
    new Set(order.buy.map(x=>x.id)).size!==order.buy.length||
    new Set(order.sellIds).size!==order.sellIds.length)return failed('交易清单无效。');
  const ledger=currentLedger(host,visit.index),listingById=new Map(merchantListings(host.seed,visit.index).map(item=>[item.id,item]));
  const sellInstances:OwnedItem[]=[];
  const sold={...ledger.sold},purchased={...ledger.purchased};
  let cargoUsed=ledger.cargoUsed,coinsEarned=0,coinsSpent=0,nextSheet=ledger.nextSheet;
  const addedSheets:OwnedItem[]=[];
  const deltas:InventoryDelta[]=[];
  let addedPermanent:string[]=[];
  for(const id of order.sellIds){
    const item=host.inventory.instances?.find(i=>i.instanceId===id);
    const rule=item&&item.location.kind==='inventory'?saleRule(item):null;
    if(!item||!rule)return failed('只能出售已收回仓库的可交易成品。');
    if((sold[item.definitionId]??0)>=rule.perVisit)return failed('这种木作收得够多了，下次再带来吧。');
    if(cargoUsed+rule.cargoUnits>MERCHANT_CAPACITY.cargoUnits)return failed('货车装不下更多大件了。');
    if(ledger.budgetSpent+coinsEarned+rule.price>MERCHANT_CAPACITY.buyBudget)return failed('行商这趟的收购预算不足。');
    coinsEarned+=rule.price;cargoUsed+=rule.cargoUnits;
    sold[item.definitionId]=(sold[item.definitionId]??0)+1;
    sellInstances.push(item);
  }
  for(const line of order.buy){
    const listing=listingById.get(line.id);
    if(!listing)return failed('这件货物不在本次货单中。');
    if((purchased[line.id]??0)+line.quantity>listing.stock)return failed('这件货物没有那么多库存。');
    if(listing.kind==='blueprint'&&line.quantity!==1)return failed('图纸每次只能购买一张。');
    if(listing.kind==='blueprint'&&host.workshop.blueprints.includes(listing.blueprintId??''))return failed('已经掌握这张图纸。');
    coinsSpent+=listing.price*line.quantity;
    if(!safeInt(coinsSpent))return failed('交易数额过大。');
    purchased[line.id]=(purchased[line.id]??0)+line.quantity;
    if(listing.kind==='stack'){
      if(!listing.itemId||ITEM_CATALOG.items.get(listing.itemId)?.status!=='active')return failed('商品尚未开放。');
      deltas.push({itemId:listing.itemId,qualityId:'ordinary',delta:line.quantity});
    }else if(listing.blueprintId){
      if(listing.uses===null){addedPermanent.push(listing.blueprintId);}
      else {
        if(!safeInt(nextSheet+1)||!safeInt(listing.uses,1,100))return failed('图纸编号或使用次数无效。');
        addedSheets.push(createBlueprintSheet(host.seed,nextSheet++,listing.blueprintId,listing.uses!,host.time));
      }
    }
  }
  const claim=order.welcome===true;
  if(claim&&ledger.welcomeClaimed)return failed('见面礼已经领取过了。');
  if(claim){deltas.push({itemId:'trail-rations',qualityId:'ordinary',delta:1});
    if(!host.workshop.blueprints.includes('blueprint.stump-cozy'))addedPermanent.push('blueprint.stump-cozy');
  }
  if(!claim&&!order.buy.length&&!order.sellIds.length)return failed('先选几件货物。');
  // Pay down old ration credit from sales first; only one essential ration bag may incur new credit.
  const repayment=Math.min(ledger.debt,coinsEarned);
  const available=ledger.coins+coinsEarned-repayment;
  if(!safeInt(available))return failed('铜币数额超出上限。');
  const shortfall=Math.max(0,coinsSpent-available);
  const foodCost=order.buy.reduce((n,line)=>n+(line.id==='supply.food'?200*line.quantity:0),0);
  if(shortfall>foodCost||ledger.debt-repayment+shortfall>MERCHANT_CAPACITY.creditLimit)
    return failed('铜币不足。粮袋可有限赊账，其他货物需要现付。');
  let inventory;
  try{inventory=inventoryTransaction(host.inventory,deltas);}
  catch{return failed('交易物资未能入库，本次未扣款。');}
  const sellIds=new Set(sellInstances.map(i=>i.instanceId));
  inventory.instances=canonicalInstances([...(inventory.instances??[]).filter(i=>!sellIds.has(i.instanceId)),...addedSheets]);
  const newLedger:MerchantState={
    ...ledger,coins:available+shortfall-coinsSpent,debt:ledger.debt-repayment+shortfall,
    nextSheet,welcomeClaimed:ledger.welcomeClaimed||claim,purchased,sold,cargoUsed,
    budgetSpent:ledger.budgetSpent+coinsEarned,
    receipts:[...ledger.receipts,{visitIndex:visit.index,at:host.time,
      soldIds:[...order.sellIds],purchases:order.buy.map(x=>({...x})),
      coinsEarned,coinsSpent}].slice(-20),
  };
  if(!safeInt(newLedger.coins))return failed('交易余额无效。');
  host.inventory=inventory;host.merchant=newLedger;
  host.workshop={...host.workshop,blueprints:[...new Set([...host.workshop.blueprints,...addedPermanent])]};
  const change=coinsEarned-coinsSpent;
  return {ok:true,message:(claim?'收下见面礼 · ':'')+'交易完成，铜币'+(change>=0?'+':'')+change+
    (newLedger.debt?' · 赊账 '+newLedger.debt:'')};
}
