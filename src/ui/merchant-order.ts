import type {MerchantSnapshot} from '../domain/merchant.ts';
import {MERCHANT_CAPACITY} from '../content/merchant.ts';

/** Read-only bill preview; the existing domain transaction still validates and commits. */
export function merchantOrderSummary(view:MerchantSnapshot,buy:Record<string,number>,sell:string[]) {
  const buyLines=view.listings.filter(p=>(buy[p.id]??0)>0);
  const sellLines=view.saleables.filter(p=>sell.includes(p.id));
  const spend=buyLines.reduce((n,p)=>n+p.price*buy[p.id],0),earn=sellLines.reduce((n,p)=>n+p.price,0);
  const cargo=sellLines.reduce((n,p)=>n+p.cargoUnits,0),repayment=Math.min(view.debt,earn);
  const available=view.coins+earn-repayment,credit=Math.max(0,spend-available);
  const foodCost=buyLines.filter(p=>p.id==='supply.food').reduce((n,p)=>n+p.price*buy[p.id],0);
  const demand=new Map<string,number>();let demandExceeded=false;
  for(const item of sellLines){const n=(demand.get(item.definitionId)??0)+1;demand.set(item.definitionId,n);if(n>item.remainingDemand)demandExceeded=true;}
  const stale=buyLines.some(p=>p.learned||buy[p.id]>p.remaining)||sellLines.length!==sell.length||Object.entries(buy).some(([id,n])=>n>0&&!view.listings.some(p=>p.id===id));
  const reason=stale?'货单已变化，请重新选择':demandExceeded?'同类木作超出本次收购数量':cargo>view.cargoLeft?'货车空间不足':earn>view.budgetLeft?'行商收购预算不足':credit>foodCost||view.debt-repayment+credit>MERCHANT_CAPACITY.creditLimit?'铜币不足，粮袋之外的货物需要现付':'';
  const count=buyLines.reduce((n,p)=>n+buy[p.id],0)+sellLines.length;
  return {buyLines,sellLines,spend,earn,cargo,repayment,credit,coinsAfter:available+credit-spend,debtAfter:view.debt-repayment+credit,count,reason};
}
