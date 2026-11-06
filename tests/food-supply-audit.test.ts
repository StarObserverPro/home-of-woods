import test from 'node:test';
import assert from 'node:assert/strict';
import {merchantListings} from '../src/content/merchant.ts';
import {CAMP_EXTERIOR_BLUEPRINTS} from '../src/content/workshop.ts';

const exterior=CAMP_EXTERIOR_BLUEPRINTS.filter(plan=>!['blueprint.tent-ropes','blueprint.camp-fire-stones'].includes(plan.id));
const ids=new Set(exterior.map(plan=>plan.id));

test('both exterior slots cover every registered plan from every seed phase without duplicate slots',()=>{
  for(let phase=0;phase<exterior.length;phase++){
    const seen=new Set<string>();
    for(let visit=0;visit<Math.ceil(exterior.length/2);visit++){
      const plans=merchantListings(phase,visit).filter(listing=>listing.kind==='blueprint'&&ids.has(listing.blueprintId!));
      assert.equal(plans.length,2);
      assert.equal(new Set(plans.map(plan=>plan.blueprintId)).size,2);
      for(const plan of plans){assert.ok(ids.has(plan.blueprintId!));seen.add(plan.blueprintId!);}
      assert.deepEqual(merchantListings(phase,visit),merchantListings(phase,visit),'reopening does not reroll stock');
    }
    assert.equal(seen.size,exterior.length,`all plans are reachable from seed phase ${phase}`);
  }
});

test('default seed reaches the cooking chain through normal paid listings without changing supply tuning',()=>{
  const firstVisit=(id:string)=>Array.from({length:exterior.length},(_,visit)=>visit).find(visit=>merchantListings(104729,visit).some(plan=>plan.blueprintId===id));
  assert.equal(firstVisit('blueprint.camp-fire-support'),2);
  assert.equal(firstVisit('blueprint.camp-fire-hook'),3);
  assert.equal(firstVisit('blueprint.camp-fire-pot'),4);
  const supplies=merchantListings(104729,0).filter(listing=>listing.kind==='stack'&&listing.category!=='consumable');
  for(const visit of [0,1,2,3,4]){
    const plans=merchantListings(104729,visit).filter(plan=>plan.kind==='blueprint');
    assert.equal(plans.length,3);
    assert.deepEqual(merchantListings(104729,visit).filter(listing=>listing.kind==='stack'&&listing.category!=='consumable'),supplies);
  }
});
