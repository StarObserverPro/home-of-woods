import {useEffect,useState} from 'react';
import type {MerchantOrder,MerchantSnapshot} from '../domain/merchant.ts';
import type {MerchantCategory} from '../content/merchant.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon,ownedIcon} from './art-icons.ts';
import type {ArtIconName} from './art-icons.ts';
import {merchantOrderSummary} from './merchant-order.ts';
import {rarityDefinition,isRarityId} from '../content/rarities.ts';
import './merchant.css';

const tabs:[MerchantCategory|'all',string,ArtIconName][]=[['all','全部','inventory'],['food','干粮','trail-rations'],['material','材料','canvas-roll'],['blueprint','图纸','blueprint'],['consumable','日用','merchant-soap']];
export function MerchantShop({view,disabled,onCheckout}:{view:MerchantSnapshot;disabled:boolean;onCheckout:(order:MerchantOrder)=>boolean}){
  const [mode,setMode]=useState<'buy'|'sell'>('buy'),[category,setCategory]=useState<MerchantCategory|'all'>('all');
  const [buy,setBuy]=useState<Record<string,number>>({}),[sell,setSell]=useState<string[]>([]),[highlight,setHighlight]=useState(''),[detailOpen,setDetailOpen]=useState(false);
  useEffect(()=>{setBuy({});setSell([]);setHighlight('');setDetailOpen(false);},[view.index]);
  const listings=view.listings.filter(p=>category==='all'||p.category===category);
  const bill=merchantOrderSummary(view,buy,sell);
  const selected=mode==='buy'?view.listings.find(p=>p.id===highlight):view.saleables.find(p=>p.id===highlight);
  const icon=(item:NonNullable<typeof selected>)=>'remaining' in item?item.kind==='blueprint'?'blueprint' as const:itemIcon(item.itemId??''):ownedIcon(item.definitionId,item.rarity);
  const selectedCount=selected&&'remaining' in selected?buy[selected.id]??0:0;
  function checkout(order:MerchantOrder){if(!disabled&&onCheckout(order)){setBuy({});setSell([]);setHighlight('');setDetailOpen(false);}}
  function choose(id:string){setHighlight(id);setDetailOpen(true);}
  function quantity(id:string,delta:number){const item=view.listings.find(p=>p.id===id);if(!item||item.learned||disabled)return;setBuy(v=>({...v,[id]:Math.max(0,Math.min(item.remaining,(v[id]??0)+delta))}));}
  return <section className={'merchant-shop'+(detailOpen?' show-product-detail':'')} aria-label="行商货箱">
    <header className="merchant-bar">
      <div className="merchant-coins"><GameIcon name="copper-coins" size={30}/><strong>{view.coins}</strong><small>我的铜币</small></div>
      <details className="merchant-help"><summary>交易说明</summary><p>点商品看详情，用 + / − 加入或移出清单，再统一结算。卖出的成品须先收回仓库。</p><p>行商还可收购 {view.budgetLeft} 铜币的木作，货车剩余 {view.cargoLeft} 格。粮袋可有限赊账；卖货所得会先偿还旧粮款。</p>{view.debt>0&&<p>未还粮款：{view.debt} 铜币。</p>}</details>
    </header>
    {view.giftAvailable&&<button className="merchant-gift" onClick={()=>checkout({buy:[],sellIds:[],welcome:true})} disabled={disabled}><GameIcon name="trail-rations" size={32}/><span><strong>领取见面礼</strong><small>粮袋 ×1 · 暖木墩基础图纸</small></span><span aria-hidden="true">领取 →</span></button>}
    <div className="merchant-modes" role="group" aria-label="交易模式"><button aria-pressed={mode==='buy'} onClick={()=>{setMode('buy');setHighlight('');setDetailOpen(false);}}>向行商买入</button><button aria-pressed={mode==='sell'} onClick={()=>{setMode('sell');setHighlight('');setDetailOpen(false);}}>把木作卖出</button></div>
    {mode==='buy'&&<nav className="merchant-tabs" aria-label="商品分类">{tabs.map(([id,name,art])=><button key={id} aria-label={name} aria-pressed={category===id} onClick={()=>{setCategory(id);setHighlight('');setDetailOpen(false);}}><GameIcon name={art} size={26}/><span>{name}</span></button>)}</nav>}
    <div className="merchant-browser">
      <div className="merchant-grid" role="group" aria-label={mode==='buy'?'本次商店货单':'可出售木作'}>
        {mode==='buy'?listings.map(item=>{const count=buy[item.id]??0;return <article className={'merchant-tile'+(count?' in-order':'')} key={item.id}>
          <button className="merchant-product" aria-label={item.name+' '+item.price+'铜币'} aria-pressed={highlight===item.id} onClick={()=>choose(item.id)}><GameIcon name={item.kind==='blueprint'?'blueprint':itemIcon(item.itemId??'')} size={62}/><span className="merchant-product-name">{item.name}</span><span className="merchant-product-price">{item.learned?'已掌握':item.price+' 铜币'}</span><small>{item.learned?'无需再买':'余 '+item.remaining+' 件'}</small></button>
          <div className="merchant-quantity"><button aria-label={'减少'+item.name} disabled={disabled||count===0} onClick={()=>quantity(item.id,-1)}>−</button><span aria-label={'待买 '+count+' 件'}>{count>0?'待买 '+count:'未加入'}</span><button aria-label={'增加'+item.name} disabled={disabled||count>=item.remaining||item.learned} onClick={()=>quantity(item.id,1)}>+</button></div>
        </article>;}):view.saleables.map(item=><button className={'merchant-tile merchant-product merchant-sell'+(sell.includes(item.id)?' in-order':'')} key={item.id} aria-pressed={highlight===item.id} onClick={()=>choose(item.id)} aria-label={'查看待售'+item.name+' '+item.id}><GameIcon name={ownedIcon(item.definitionId,item.rarity)} size={62}/><span className="merchant-product-name">{item.name}</span><small>{isRarityId(item.rarity)?rarityDefinition(item.rarity).name:'未分级'}</small><span className="merchant-product-price">{item.remainingDemand<=0?'本次已收足':item.price+' 铜币'}</span><span className="merchant-selection">{sell.includes(item.id)?'✓ 已加入待售':'查看详情'}</span></button>)}
        {mode==='sell'&&!view.saleables.length&&<div className="menu-empty"><GameIcon name="stump-seat" size={60}/><strong>还没有可出售的木作</strong><p>先把摆在场景中的成品收回仓库。</p></div>}
      </div>
      {selected&&<section className="merchant-detail" aria-label="商品详情"><button className="item-detail-back subtle-button" onClick={()=>{setDetailOpen(false);setHighlight('');}}>← 返回货单</button><GameIcon name={icon(selected)} size={76}/><h3>{selected.name}</h3><p className="merchant-detail-price">{selected.price} 铜币 / 件</p><p>{'detail' in selected?selected.detail:'这件成品在仓库中。加入待售后，确认结算才会交给行商。'}</p>
        {'remaining' in selected?<><p>{selected.learned?'基础图纸已掌握':selected.uses===null?'图纸永久可用':typeof selected.uses==='number'?'可成功制作 '+selected.uses+' 次':'购买后存入营地仓库'}</p><div className="merchant-detail-quantity"><button className="context-button" aria-label={'详情减少'+selected.name} disabled={disabled||!selectedCount} onClick={()=>quantity(selected.id,-1)}>−</button><span>待买 {selectedCount} 件</span><button className="context-button" aria-label={'详情增加'+selected.name} disabled={disabled||selected.learned||selectedCount>=selected.remaining} onClick={()=>quantity(selected.id,1)}>+</button></div>{selected.remaining===0&&<p>本次已售完。</p>}</>:
        <><p>占货车 {selected.cargoUnits} 格 · 同类还收 {selected.remainingDemand} 件</p><button className="context-button primary-action" disabled={disabled||!sell.includes(selected.id)&&selected.remainingDemand<=0} onClick={()=>setSell(v=>v.includes(selected.id)?v.filter(id=>id!==selected.id):[...v,selected.id])}>{sell.includes(selected.id)?'移出待售清单':'加入待售清单'}</button></>}
      </section>}
    </div>
    <div className="merchant-bill"><details><summary>待结算清单 <strong>{bill.count} 件</strong></summary>{!bill.count?<p>清单为空，用 + 或“加入待售清单”挑选。</p>:<><ul>{bill.buyLines.map(item=><li key={item.id}><span>买 {item.name} ×{buy[item.id]}</span><span>−{item.price*buy[item.id]}</span></li>)}{bill.sellLines.map(item=><li key={item.id}><span>卖 {item.name}</span><span>+{item.price}</span></li>)}</ul><button className="subtle-button" disabled={disabled} onClick={()=>{setBuy({});setSell([]);}}>清空待结算清单</button></>}{bill.repayment>0&&<p>本次先偿还粮款 {bill.repayment} 铜币。</p>}{bill.credit>0&&<p>本次粮袋赊账 {bill.credit} 铜币；未还粮款将为 {bill.debtAfter}。</p>}</details></div>
    <footer className="merchant-checkout"><div className="merchant-amounts"><span>买入 {bill.spend} · 卖出 {bill.earn}</span><strong>结算后 {bill.coinsAfter} 铜币</strong>{bill.reason&&<small className="merchant-error" role="status">{bill.reason}</small>}</div><button className="merchant-confirm" disabled={disabled||!bill.count||!!bill.reason} onClick={()=>checkout({buy:bill.buyLines.map(item=>({id:item.id,quantity:buy[item.id]})),sellIds:sell})}>{bill.count?'确认结算 · '+bill.count+' 件':'先选择货物'}</button></footer>
  </section>;
}
