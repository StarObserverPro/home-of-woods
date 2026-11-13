import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DESIGN, DEFAULT_STOCK } from '../src/domain.ts'
import { createPiece, executeSaw, materialBalance, sawProvider, outerSurface } from '../src/machining.ts'
import type { Workpiece } from '../src/machining.ts'
import { surfaces, surfaceId, totalVolume, volume, subtract, components } from '../src/solid.ts'
import { defaultLayout, operationFor, recommendedSurface, inspectPiece, inspectTenon, repairTenon, finishTenon, restorePiece } from '../src/tenon.ts'
import type { TaskId } from '../src/tenon.ts'

const fresh = () => createPiece(DEFAULT_DESIGN, DEFAULT_STOCK)
function saw(p: Workpiece, task: TaskId, position: number, depth: number, wasteSide?: -1|1) {
  const layout = {...defaultLayout(p,task),position,depth,...(wasteSide ? {wasteSide} : {})}
  return executeSaw(p,operationFor(p,task,layout,recommendedSurface(p,task)))
}
function sample(near = 8, far = 22, reverse = false) {
  let p = saw(fresh(),'trim',80,30)
  const cuts: [TaskId,number,number][] = [['cheekNear',near,20],['shoulderNear',60,near],['cheekFar',far,20],['shoulderFar',60,30-far]]
  for (const [id,pos,depth] of reverse ? cuts.reverse() : cuts) p = saw(p,id,pos,depth)
  return p
}
function conserved(p: Workpiece) { assert.ok(Math.abs(materialBalance(p).errorMm3)<1e-6); assert.equal(components(p.geometry.boxes).length,1) }

test('partial crosscut, continuation and duplicate depth conserve real material without premature offcuts',()=>{
  let p=saw(fresh(),'trim',80,10)
  assert.equal(p.ledger.offcuts.length,0);assert.equal(p.ledger.sawdustMm3,300);conserved(p)
  const held=structuredClone(p)
  assert.throws(()=>saw(p,'trim',80,10),/已经锯过/)
  assert.throws(()=>saw(p,'trim',80,5),/已经锯过/)
  assert.deepEqual(p,held)
  p=saw(p,'trim',80,30);conserved(p)
  assert.equal(p.ledger.sawdustMm3,900)
  assert.equal(materialBalance(p).offcutsMm3,8100)
  assert.ok(surfaces(p.geometry.boxes).some(s=>s.id===surfaceId(0,1,80)))
})

test('cheek first or shoulder first both work; each single kerf leaves side waste attached',()=>{
  let p=saw(fresh(),'trim',80,30)
  p=saw(p,'cheekNear',8,20)
  assert.equal(p.ledger.offcuts.length,1)
  p=saw(p,'shoulderNear',60,8)
  assert.equal(p.ledger.offcuts.length,2)
  for(const reverse of [false,true]) {
    const q=sample(8,22,reverse);conserved(q)
    assert.equal(inspectTenon(q).status,'pass');assert.equal(inspectTenon(q).score,100)
    assert.equal(totalVolume(q.geometry.boxes),62400)
  }
})

test('datum positions and selected waste side determine actual geometry, not ideal targets',()=>{
  let p=saw(fresh(),'trim',80,30,-1)
  assert.equal(Math.max(...p.geometry.boxes.map(b=>b.max[0])),79)
  assert.equal(inspectTenon(p).status,'scrap')
  const q=sample(8.2,21.8)
  assert.equal(inspectTenon(q).status,'pass')
  assert.equal(inspectTenon(q).score,96)
  assert.equal(finishTenon(inspectPiece(q)).envelope.tenonWidth,13.600000000000001)
})

test('preview refuses nonexistent faces, inaccessible interior starts, wrong orientation and fixture',()=>{
  const p=fresh(),op=operationFor(p,'trim',{...defaultLayout(p,'trim'),position:80,depth:5},recommendedSurface(p,'trim'))
  for(const bad of [{...op,entrySurface:'drawing:top'}, {...op,planeAxis:1 as const}, {...op,fixture:'side-out' as const}, {...op,depth:31}, {...op,position:2}, {...op,depth:NaN}]) {
    assert.equal(sawProvider.preview(p,bad).allowed,false)
    assert.throws(()=>executeSaw(p,bad))
  }
  const shallow=executeSaw(p,op)
  const inner=surfaces(shallow.geometry.boxes).find(s=>s.axis===0&&s.sign===1&&s.plane===80)!
  const blocked={...op,id:'blocked',entrySurface:inner.id,planeAxis:2 as const,position:8,depth:15,fixture:'end-up' as const,wasteSide:-1 as const}
  assert.match(sawProvider.preview(shallow,blocked).reason,/挡住/)
})

test('work faces come from exposed solid boundaries, not internal box seams',()=>{
  const boxes=[{min:[0,0,0],max:[10,10,10]},{min:[10,0,0],max:[20,10,10]}] as any
  assert.equal(surfaces(boxes).length,6)
  assert.equal(surfaces(boxes).some(s=>s.axis===0&&s.plane===10),false)
  const split=subtract([{min:[0,0,0],max:[20,10,10]}],{min:[8,0,0],max:[9,10,10]})
  assert.equal(components(split).length,2)
  assert.equal(totalVolume(split),1900)
})

test('bounded one-time automatic finish removes material, changes score and demands a new inspection',()=>{
  let p=sample(7.5,22)
  let r=inspectTenon(p);assert.equal(r.status,'repairable');assert.equal(r.score,90);assert.equal(r.repairedScore,94)
  assert.throws(()=>repairTenon(p),/先检查/)
  const before=materialBalance(p)
  p=repairTenon(inspectPiece(p));conserved(p)
  assert.equal(inspectTenon(p).status,'pass');assert.equal(inspectTenon(p).score,94)
  assert.ok(p.ledger.shavingsMm3>0);assert.ok(materialBalance(p).retainedMm3<before.retainedMm3)
  assert.throws(()=>finishTenon(p),/试配/)
  assert.equal(finishTenon(inspectPiece(p)).automaticFinish,true)
  assert.throws(()=>repairTenon(inspectPiece(p)))
  assert.throws(()=>saw(p,'trim',79.9,30),/收尾后/)
})

test('too thin, overdeep internal kerfs and incomplete pieces cannot be rescued or collected',()=>{
  const thin=sample(9,22);assert.equal(inspectTenon(thin).status,'scrap');assert.throws(()=>repairTenon(inspectPiece(thin)))
  let over=saw(fresh(),'trim',80,30)
  over=saw(over,'cheekNear',8,23)
  over=saw(over,'shoulderNear',60,8)
  over=saw(over,'cheekFar',22,20);over=saw(over,'shoulderFar',60,8)
  assert.equal(inspectTenon(over).status,'scrap');assert.match(inspectTenon(over).issues.join(''),/内部损伤/)
  assert.throws(()=>finishTenon(inspectPiece(over)))
  assert.equal(inspectTenon(fresh()).status,'incomplete');assert.throws(()=>finishTenon(inspectPiece(fresh())))
})

test('operation replay ignores forged meshes/ledgers, rejects unknown tools and preserves partial work',()=>{
  const partial=saw(fresh(),'trim',80,10)
  assert.deepEqual(restorePiece(JSON.parse(JSON.stringify(partial))),partial)
  let p=inspectPiece(repairTenon(inspectPiece(sample(7.5,22))))
  assert.deepEqual(restorePiece(JSON.parse(JSON.stringify(p))),p)
  const forged=structuredClone(p);forged.geometry.boxes=[];forged.ledger.sawdustMm3=0
  assert.deepEqual(restorePiece(forged),p)
  assert.throws(()=>restorePiece({...p,operations:[{kind:'chisel.pocket',id:'fake'}]}),/工具/)
  assert.throws(()=>restorePiece({...p,inspectedAt:1}),/过期/)
  const bad=structuredClone(p);(bad.operations.at(-1) as any).cutters[0].max[2]+=1
  assert.throws(()=>restorePiece(bad))
})

test('non-finite dimensions and malformed operations are rejected without mutation',()=>{
  for(const invalid of [NaN,Infinity,0,-1]) assert.throws(()=>createPiece({...DEFAULT_DESIGN,length:invalid},DEFAULT_STOCK))
  const p=fresh(),op=operationFor(p,'trim',{...defaultLayout(p,'trim'),position:80,depth:10},outerSurface(p,1,1))
  assert.throws(()=>executeSaw(p,{...op,id:''}));assert.equal(p.operations.length,0)
  const q=executeSaw(p,op);assert.throws(()=>executeSaw(q,op),/已经执行/)
})

test('120 seeded partial-cut combinations preserve volume and never create negative matter',()=>{
  let seed=7121
  for(let i=0;i<120;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    const near=7+(seed%200)/100,far=21+((seed>>>8)%200)/100
    let p=saw(fresh(),'trim',80,2+(seed%27));conserved(p)
    p=saw(p,'trim',80,30);conserved(p)
    p=saw(p,'cheekNear',near,20);conserved(p)
    p=saw(p,'shoulderNear',60,near);conserved(p)
    p=saw(p,'shoulderFar',60,30-far);conserved(p)
    p=saw(p,'cheekFar',far,20);conserved(p)
    assert.ok(p.geometry.boxes.every(b=>volume(b)>0));assert.ok(p.ledger.offcuts.every(o=>o.volumeMm3>0))
  }
})
