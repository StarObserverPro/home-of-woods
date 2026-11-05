import {useEffect,useState} from 'react';
import type {MerchantOrder} from '../domain/merchant.ts';
import type {MerchantSnapshot} from '../domain/merchant.ts';
import type {MerchantCategory} from '../content/merchant.ts';
import './merchant.css';

const tabs:[MerchantCategory|'all',string,string][]=[
  ['all','全部','▦'],['food','干粮','🥖'],['material','材料','🧵'],
  ['blueprint','图纸','📜'],['consumable','日用','🧼'],
];
export function MerchantShop({view,disabled,onCheckout}:{
  view:MerchantSnapshot;disabled:boolean;onCheckout:(order:MerchantOrder)=>boolean;
}){
  const [mode,setMode]=useState<'buy'|'sell'>('buy');
  const [category,setCategory]=useState<MerchantCategory|'all'>('all');
  const [buy,setBuy]=useState<Record<string,number>>({});
  const [sell,setSell]=useState<string[]>([]);
  const [highlight,setHighlight]=useState('');
  useEffect(()=>{setBuy({});setSell([]);setHighlight('');},[view.index]);
  const listings=view.listings.filter(p=>category==='all'||p.category===category);
  const selectedSale=view.saleables.filter(p=>sell.includes(p.id));
  const buyLines=view.listings.filter(p=>(buy[p.id]??0)>0);
  const spend=buyLines.reduce((n,p)=>n+p.price*buy[p.id],0);
  const earn=selectedSale.reduce((n,p)=>n+p.price,0);
  const cargo=selectedSale.reduce((n,p)=>n+p.cargoUnits,0);
  const money=earn-spend;
  const overCargo=cargo>view.cargoLeft;
  const overBudget=earn>view.budgetLeft;
  const negative=spend>view.coins+earn;
  const allowedCredit=negative&&buyLines.some(p=>p.id==='supply.food')&&
    spend-(view.coins+earn)<=200-view.debt &&
    spend-(view.coins+earn)<=200*(buy['supply.food']??0);
  const canBuy=!negative||allowedCredit;
  const selected=view.listings.find(p=>p.id===highlight)??view.saleables.find(p=>p.id===highlight);
  function checkout(order:MerchantOrder){
    if(disabled)return;
    if(onCheckout(order)){setBuy({});setSell([]);setHighlight('');}
  }
  return <section className="merchant-shop" aria-label="行商货箱">
    <header className="merchant-bar">
      <div className="merchant-coins" title="铜币余额">🪙 <strong>{view.coins}</strong><small>铜币</small></div>
      <div className="merchant-budget" title="本次收购剩余预算">💰 {view.budgetLeft}</div>
      <div className="merchant-budget" title="货车剩余装货空间">📦 {view.cargoLeft}/100</div>
      <details className="merchant-help"><summary aria-label="交易说明">?</summary>
        <p>图纸、货物与木作通过一次账单结算。先把成品收回仓库才能卖；同类物品受收购偏好、预算和货车空间限制。</p>
        <p>粮袋可以有限赊账；高级图纸不能赊。永久图纸显示 ∞，复杂图纸按成功制作次数损耗。</p>
        {view.debt>0&&<p>未还粮款：{view.debt} 铜币；下一次卖货自动抵扣。</p>}
      </details>
    </header>
    {view.giftAvailable&&<button className="merchant-gift" onClick={()=>checkout({buy:[],sellIds:[],welcome:true})} disabled={disabled} title="第一次见面赠一袋干粮和暖木墩基础图纸">🎁 领取见面礼 <span>干粮 ×1 · 木作图纸</span></button>}
    <div className="merchant-modes" role="group" aria-label="交易模式">
      <button aria-pressed={mode==='buy'} onClick={()=>setMode('buy')}>买入</button>
      <button aria-pressed={mode==='sell'} onClick={()=>setMode('sell')}>卖出</button>
    </div>
    {mode==='buy'&&<nav className="merchant-tabs" aria-label="商品分类">
      {tabs.map(([id,name])=><button key={id} title={name} aria-label={name} aria-pressed={category===id} onClick={()=>setCategory(id)}>{name}</button>)}
    </nav>}
    <div className="merchant-grid" role="group" aria-label={mode==='buy'?'本次商店货单':'可出售木作'}>
      {mode==='buy'?listings.map(item=>{
        const count=buy[item.id]??0,available=item.remaining-count,locked=item.learned;
        return <article className="merchant-tile" key={item.id}>
          <button className="merchant-product" title={item.detail} aria-label={item.name+' '+item.price+'铜币'} aria-pressed={highlight===item.id} onClick={()=>setHighlight(item.id)}>
            <span className="merchant-product-icon">{item.icon}</span>
            <span className="merchant-product-name">{item.name}</span>
            <span className="merchant-product-price">{locked?'已掌握':item.price+' 🪙'}</span>
          </button>
          <div className="merchant-quantity">
            <button aria-label={'减少'+item.name} disabled={disabled||count===0} onClick={()=>setBuy(v=>({...v,[item.id]:Math.max(0,count-1)}))}>−</button>
            <span>{count}{item.uses!==undefined&&item.uses!==null?' · '+item.uses+'次':''}</span>
            <button aria-label={'增加'+item.name} disabled={disabled||available<=0||locked} onClick={()=>setBuy(v=>({...v,[item.id]:count+1}))}>+</button>
          </div>
        </article>;
      }):view.saleables.map(item=>{
        const checked=sell.includes(item.id),unwanted=item.remainingDemand<=0;
        return <button className="merchant-tile merchant-sell" key={item.id} title={unwanted?'同类已经收足':'占车厢 '+item.cargoUnits+' 格'} aria-pressed={checked} disabled={disabled||unwanted} onClick={()=>{
          setHighlight(item.id);setSell(v=>v.includes(item.id)?v.filter(id=>id!==item.id):[...v,item.id]);
        }}>
          <span className="merchant-product-icon">{item.icon}</span>
          <span className="merchant-product-name">{item.name}<small>{item.rarity}</small></span>
          <span className="merchant-product-price">{unwanted?'收够了':item.price+' 🪙'}</span>
          <span className="merchant-selection">{checked?'✓':'○'}</span>
        </button>;
      })}
      {mode==='sell'&&!view.saleables.length&&<span className="merchant-empty">仓库里还没有可出售的木作</span>}
    </div>
    {selected&&<div className="merchant-detail" role="status">
      <strong>{selected.name}</strong>
      <span>{'detail' in selected?selected.detail:'已收回仓库的成品，可从这里装上货车'}</span>
    </div>}
    <footer className="merchant-checkout">
      <div className="merchant-amounts"><span>买 −{spend}</span><span>卖 +{earn}</span><strong>{money>=0?'+':''}{money} 🪙</strong></div>
      {(overCargo||overBudget||!canBuy)&&<small className="merchant-error">{overCargo?'货车装不下':overBudget?'收购预算不足':'铜币不足'}</small>}
      <button className="merchant-confirm" disabled={disabled||(!buyLines.length&&!sell.length)||overCargo||overBudget||!canBuy}
        onClick={()=>checkout({buy:buyLines.map(item=>({id:item.id,quantity:buy[item.id]})),sellIds:sell})}>结算 ✓</button>
    </footer>
  </section>;
}
