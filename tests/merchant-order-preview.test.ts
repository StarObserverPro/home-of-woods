import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {exchangeMerchant,merchantSnapshot} from '../src/domain/merchant.ts';
import {merchantOrderSummary} from '../src/ui/merchant-order.ts';

function merchant(){const s=createState();s.time=25;s.selected=CAMP_VISITOR.id;s.player.x=CAMP_VISITOR.x;s.player.z=CAMP_VISITOR.z;return s;}
const seat=(id:string)=>({instanceId:id,definitionId:'furniture.stump-seat',blueprintId:'blueprint.stump-cozy',createdAt:0,rarityId:'common',traits:[],location:{kind:'inventory' as const}});
test('bill includes old-debt repayment before evaluating a mixed buy/sell order',()=>{
 const state=merchant();state.merchant.coins=0;state.merchant.debt=150;state.inventory.instances=[seat('one')];
 const buy={'supply.canvas':1},sell=['one'];const preview=merchantOrderSummary(merchantSnapshot(state),buy,sell);
 assert.equal(preview.repayment,125);assert.match(preview.reason,/铜币不足/);
 const before=structuredClone(state);assert.equal(exchangeMerchant(state,{buy:[{id:'supply.canvas',quantity:1}],sellIds:sell}).ok,false);assert.deepEqual(state,before);
});
test('food credit and sale repayment in the bill match the committed ledger',()=>{
 const state=merchant();state.merchant.coins=0;state.merchant.debt=125;state.inventory.instances=[seat('one')];
 const preview=merchantOrderSummary(merchantSnapshot(state),{'supply.food':1},['one']);
 assert.equal(preview.reason,'');assert.equal(preview.repayment,125);assert.equal(preview.credit,200);
 assert.equal(exchangeMerchant(state,{buy:[{id:'supply.food',quantity:1}],sellIds:['one']}).ok,true);
 assert.equal(state.merchant.coins,preview.coinsAfter);assert.equal(state.merchant.debt,preview.debtAfter);
});
test('bill rejects combined per-type demand overflow and stale instance selections',()=>{
 const state=merchant();state.inventory.instances=['one','two','three'].map(seat);const view=merchantSnapshot(state);
 assert.match(merchantOrderSummary(view,{},['one','two','three']).reason,/收购数量/);
 assert.match(merchantOrderSummary(view,{},['gone']).reason,/货单已变化/);
 assert.equal(merchantOrderSummary(view,{},['one','two']).reason,'');
});
