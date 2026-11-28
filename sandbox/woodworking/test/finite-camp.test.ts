import assert from 'node:assert/strict'
import test from 'node:test'
import { createInventory, inventoryTransaction, woodBatch } from '../../../src/domain/inventory.ts'
import { campWoodworking } from '../integration/camp.ts'
import type { CampOwner, CampPort } from '../integration/camp.ts'
import { createPiece, executeSaw } from '../src/machining.ts'
import { defaultLayout, operationFor, recommendedSurface, inspectPiece, finishTenon } from '../src/tenon.ts'
import type { TaskId } from '../src/tenon.ts'
import type { FiniteSawDraft } from '../src/workbench.ts'
const design = {length:80,tenonLength:20,tenonWidth:14}
function host() {
  const owner:CampOwner={seed:3,time:1,workshop:{nextInstance:1},inventory:inventoryTransaction(createInventory(),[{itemId:'branch',qualityId:'ordinary',blankLot:'a',wood:woodBatch({lengthMm:112,thicknessMm:30,section:'square',straightness:'straight'}),delta:2}])}
  let commits=0
  const port:CampPort={read:()=>owner,checkpoint:()=>{},commit:(inventory,serial)=>{owner.inventory=inventory;owner.workshop.nextInstance=serial;commits++}}
  return {owner,port,options:campWoodworking(port),commits:()=>commits}
}
function draft(stock:any,complete:boolean):FiniteSawDraft {
  let job=createPiece(design,stock)
  const cuts:[TaskId,number,number][]=complete?[['trim',80,30],['cheekNear',8,20],['shoulderNear',60,8],['shoulderFar',60,8],['cheekFar',22,20]]:[['trim',80,5]]
  for(const [id,position,depth] of cuts) job=executeSaw(job,operationFor(job,id,{...defaultLayout(job,id),position,depth},recommendedSurface(job,id)))
  if(complete)job=inspectPiece(job)
  return {version:2,job,selected:'trim',selectedSurface:null,layouts:{},paint:null}
}
test('partial V2 kerf consumes stock on discard, without inventing an unseparated offcut',async()=>{
  const h=host(),d=draft(h.options.stocks![0],false)
  await h.options.onDiscard!(d)
  assert.equal(h.commits(),1);assert.equal(h.owner.inventory.stacks.length,1);assert.equal(h.owner.inventory.stacks[0].quantity,1)
  assert.equal(h.owner.inventory.instances?.length??0,0)
  assert.throws(()=>h.options.onDiscard!(d))
})
test('V2 settlement replays geometry and pays only actual reusable offcuts in one host transaction',async()=>{
  const h=host(),d=draft(h.options.stocks![0],true),actual=finishTenon(d.job)
  d.job.ledger.offcuts.push({id:'forged',kind:'reusable',volumeMm3:1000,box:{min:[0,0,0],max:[100,30,30]}})
  await h.options.onComplete!({...actual,score:1},d.job.stock.id,d)
  assert.equal(h.commits(),1);assert.equal(h.owner.inventory.instances!.length,1)
  const offcuts=h.owner.inventory.stacks.filter(r=>r.blankLot!=='a')
  assert.equal(offcuts.length,1);assert.equal(offcuts[0].wood!.spec!.lengthMm,31)
  assert.equal((h.owner.inventory.instances![0].handwork as any).score,100)
  assert.equal((h.owner.inventory.instances![0].handwork as any).materialBalance.errorMm3,0)
  assert.throws(()=>h.options.onComplete!(actual,d.job.stock.id,d));assert.equal(h.commits(),1)
})
test('V2 failed persistence is retryable and never awards two collectibles',async()=>{
  const h=host(),d=draft(h.options.stocks![0],true),actual=finishTenon(d.job),commit=h.port.commit
  h.port.commit=()=>{throw Error('full')}
  const before=structuredClone(h.owner)
  assert.throws(()=>h.options.onComplete!(actual,d.job.stock.id,d),/full/);assert.deepEqual(h.owner,before)
  h.port.commit=commit;await h.options.onComplete!(actual,d.job.stock.id,d)
  assert.equal(h.owner.inventory.instances!.length,1)
})
