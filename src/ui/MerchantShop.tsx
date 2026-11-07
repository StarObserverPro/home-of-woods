import {useEffect,useState} from 'react';
import type {MerchantOrder,MerchantSnapshot} from '../domain/merchant.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon,ownedIcon} from './art-icons.ts';
import {merchantOrderSummary} from './merchant-order.ts';
import {IconTabs,ItemBrowser,ItemHeading,ItemNotes,MenuAction,QuantityControl} from './ItemBrowser.tsx';
import type {MenuItem} from './ItemBrowser.tsx';

type ShopItem=MenuItem&{listing?:MerchantSnapshot['listings'][number];sale?:MerchantSnapshot['saleables'][number]};
const categories=[{id:'all',name:'全部',icon:'inventory'},{id:'food',name:'食物',icon:'trail-rations'},{id:'material',name:'材料',icon:'canvas-roll'},{id:'blueprint',name:'图纸',icon:'blueprint'},{id:'consumable',name:'日用',icon:'merchant-soap'}] as const;
export function MerchantShop({view,disabled,onCheckout}:{view:MerchantSnapshot;disabled:boolean;onCheckout:(order:MerchantOrder)=>boolean}){
  const [mode,setMode]=useState('buy'),[buy,setBuy]=useState<Record<string,number>>({}),[sell,setSell]=useState<string[]>([]);
  useEffect(()=>{setBuy({});setSell([]);},[view.index]);
  const bill=merchantOrderSummary(view,buy,sell);
  const buyItems:ShopItem[]=view.listings.map(item=>({id:`buy:${item.id}`,name:item.name,icon:item.kind==='blueprint'?'blueprint':itemIcon(item.itemId??''),category:item.category,listing:item,quantity:buy[item.id]||undefined,badge:item.learned?'✓':item.remaining===0?'售罄':undefined}));
  const sellItems:ShopItem[]=view.saleables.map(item=>({id:`sell:${item.id}`,name:item.name,icon:ownedIcon(item.definitionId,item.rarity),sale:item,badge:sell.includes(item.id)?'待售':undefined}));
  const items=mode==='buy'?buyItems:mode==='sell'?sellItems:[...buyItems.filter(item=>buy[item.listing!.id]>0),...sellItems.filter(item=>sell.includes(item.sale!.id))];
  function quantity(id:string,value:number){const item=view.listings.find(p=>p.id===id);if(!item||item.learned||disabled)return;setBuy(v=>({...v,[id]:Math.max(0,Math.min(item.remaining,value))}));}
  function checkout(order:MerchantOrder){if(!disabled&&onCheckout(order)){setBuy({});setSell([]);}}
  return <section className="wood-shop" aria-label="行商货箱">
    <div className="wood-shop-tools"><span className="wood-coins"><GameIcon name="copper-coins" size={27}/><strong>{view.coins}</strong></span><IconTabs label="交易模式" tabs={[{id:'buy',name:'买入'},{id:'sell',name:'卖出'},{id:'bill',name:`货单 ${bill.count}`}]} value={mode} onChange={setMode}/>{view.giftAvailable&&<button className="wood-gift" disabled={disabled} onClick={()=>checkout({buy:[],sellIds:[],welcome:true})} aria-label="领取见面礼"><GameIcon name="trail-rations" size={27}/><span>见面礼</span></button>}</div>
    <ItemBrowser key={`${mode}:${view.index}`} label={mode==='buy'?'商店货单':mode==='sell'?'可售木作':'待结算货单'} items={items} categories={mode==='buy'?categories:undefined} empty={mode==='sell'?'先把成品收回仓库':mode==='bill'?'货单为空':'本次没有这类货物'} renderDetail={item=>{
      const listing=item.listing,sale=item.sale,price=(listing??sale)!.price;
      return <><ItemHeading name={item.name} icon={item.icon} subtitle={<><GameIcon name="copper-coins" size={18}/>{price} / 件</>}/><ItemNotes text={`${listing?.detail??'成品收回仓库后可以出售。'} 行商收购余额 ${view.budgetLeft}，货车余量 ${view.cargoLeft}。未还粮款 ${view.debt}；卖货所得先还粮款。`}>
        {listing?<><p className="wood-note">{listing.learned?'已掌握':typeof listing.uses==='number'?`可制作 ${listing.uses} 次 · 余 ${listing.remaining}`:`余 ${listing.remaining} 件`}</p><QuantityControl min={0} value={buy[listing.id]??0} max={disabled||listing.learned?0:listing.remaining} onChange={value=>quantity(listing.id,value)}/></>:
          sale&&<><p className="wood-note">占 {sale.cargoUnits} 格 · 同类还收 {sale.remainingDemand}</p><MenuAction icon="trade" disabled={disabled||!sell.includes(sale.id)&&sale.remainingDemand<=0} onClick={()=>setSell(v=>v.includes(sale.id)?v.filter(id=>id!==sale.id):[...v,sale.id])}>{sell.includes(sale.id)?'移出货单':'加入待售'}</MenuAction></>}
      </ItemNotes></>;
    }}/>
    <footer className="wood-checkout"><div><span>买 {bill.spend} · 卖 {bill.earn}</span><strong>结算后 {bill.coinsAfter} 铜币</strong>{bill.repayment>0&&<small>还粮款 {bill.repayment}</small>}{bill.credit>0&&<small>赊账 {bill.credit} · 总欠 {bill.debtAfter}</small>}</div><MenuAction icon="trade" disabled={disabled||!bill.count||!!bill.reason} onClick={()=>checkout({buy:bill.buyLines.map(item=>({id:item.id,quantity:buy[item.id]})),sellIds:sell})}>结算 {bill.count||''}</MenuAction></footer>
    {bill.reason&&<p className="wood-reason" role="status">{bill.reason}</p>}
  </section>;
}
