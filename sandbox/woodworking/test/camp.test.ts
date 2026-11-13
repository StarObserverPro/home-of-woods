import assert from 'node:assert/strict'
import test from 'node:test'
import { rarityDefinition } from '../../../src/content/rarities.ts'
import { rollBlueprintRarity } from '../../../src/domain/blueprint-rarity.ts'
import {
  createInventory,
  inventoryTransaction,
  stackIdentity,
  validateInventory,
  woodBatch,
} from '../../../src/domain/inventory.ts'
import type { InventoryDelta } from '../../../src/domain/inventory.ts'
import { prepareInventoryPersistence, serializeInventory } from '../../../src/domain/inventory-persistence.ts'
import { campWoodworking, SAMPLE_ITEM, SAMPLE_PLAN } from '../integration/camp.ts'
import type { CampOwner, CampPort } from '../integration/camp.ts'
import {
  createJob,
  cut,
  CUTS,
  DEFAULT_DESIGN,
  finish,
  idealMark,
  markCut,
  recordTrial,
} from '../src/domain.ts'
import type { FinishedWork, Stock } from '../src/domain.ts'
import type { WoodworkingDraft } from '../src/workbench.ts'

const blank = {
  itemId: 'branch',
  qualityId: 'fine',
  blankLot: 'maple-a',
  blankName: '枫木方料',
  wood: woodBatch({
    lengthMm: 112,
    thicknessMm: 30,
    straightness: 'straight',
    section: 'square',
    species: 'maple',
  }),
  transport: { kind: 'carried' },
  woodCondition: { moisture: 0.45, snow: 0.2 },
}
const initialInventory = () => inventoryTransaction(createInventory(), [{ ...blank, delta: 2 }])

function camp(inventory = initialInventory()) {
  const owner: CampOwner = { seed: 271, time: 36, workshop: { nextInstance: 5 }, inventory }
  const writes: { saved: number; draft: WoodworkingDraft | null } = { saved: 0, draft: null }
  const port: CampPort = {
    read: () => owner,
    commit(next, serial) {
      owner.inventory = next
      owner.workshop.nextInstance = serial
      writes.draft = null
      writes.saved++
    },
    checkpoint(draft) {
      writes.draft = draft
    },
  }
  return { owner, writes, port, options: campWoodworking(port) }
}

function makeDraft(stock: Stock, cheekOffset = 0, design = DEFAULT_DESIGN): WoodworkingDraft {
  let job = createJob(design, stock)
  for (const id of CUTS) {
    const line = idealMark(job, id)
    // Tilt the end slightly. The reusable offcut starts after the longest corner and kerf.
    if (id === 'trim') line.b.u += 0.4
    if (id === 'cheekNear') {
      line.a.u += cheekOffset
      line.b.u += cheekOffset
    }
    job = cut(markCut(job, id, line), id)
  }
  return { version: 1, job: recordTrial(job), selected: 'trim', paint: '#476b53', tested: true }
}

test('one camp commit debits a real lot, carries forward the usable offcut and awards the scored item', async () => {
  const { owner, writes, options } = camp()
  const stock = options.stocks![0]
  assert.equal(stock.label, '枫木方料')
  const draft = makeDraft(stock, 0.25)
  options.onDraftChange!(draft)
  assert.equal(writes.draft, draft)
  const actual = finish(draft.job, draft.paint)
  const claimed: FinishedWork = {
    ...actual,
    paint: '#ff00ff',
    score: 100,
    envelope: { ...actual.envelope, length: 1 },
  }
  assert.ok(actual.score < claimed.score)
  // Surface moisture can change after opening the bench without changing the lot identity.
  owner.inventory.stacks[0].woodCondition = { moisture: 0.7, snow: 0.1 }
  const before = structuredClone(owner.inventory)
  const receipt = await options.onComplete!(claimed, stock.id, draft)
  assert.equal(writes.saved, 1)
  assert.equal(writes.draft, null)
  assert.equal(owner.workshop.nextInstance, 6)
  assert.equal(owner.inventory.revision, before.revision + 1)
  const original = owner.inventory.stacks.find((row) => row.blankLot === stock.id)!
  const offcut = owner.inventory.stacks.find((row) => row.blankLot !== stock.id)!
  assert.equal(original.quantity, 1)
  assert.equal(offcut.quantity, 1)
  assert.equal(offcut.itemId, original.itemId)
  assert.equal(offcut.qualityId, original.qualityId)
  assert.deepEqual(offcut.wood, { ...original.wood, spec: { ...original.wood!.spec, lengthMm: 30 } })
  assert.deepEqual(offcut.woodCondition, original.woodCondition)
  assert.deepEqual(offcut.transport, original.transport)
  const items = owner.inventory.instances!
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.instanceId, 'crafted-271-5')
  assert.equal(item.blueprintId, SAMPLE_PLAN)
  assert.equal(item.definitionId, SAMPLE_ITEM)
  assert.deepEqual(item.location, { kind: 'inventory' })
  assert.deepEqual(item.handwork, { ...actual, sourceMaterial: '枫木方料' })
  assert.deepEqual(item.crafting, {
    qualityScore: actual.score,
    scoreSource: 'handwork',
    blueprintTier: 'common',
  })
  const rarity = rollBlueprintRarity(owner.seed, 5, SAMPLE_PLAN, 'common', actual.score)
  assert.equal(item.rarityId, rarity)
  assert.equal(receipt?.rarityLabel, rarityDefinition(rarity).name)
  assert.deepEqual(item.traits, [])
  const restored = prepareInventoryPersistence(serializeInventory(owner.inventory))
  if (restored.decision !== 'restored')
    throw new Error('normal inventory persistence should restore this save')
  assert.deepEqual(validateInventory(restored.value), validateInventory(owner.inventory))
  assert.deepEqual(restored.value.instances, items)
  const completed = structuredClone(owner)
  assert.throws(() => options.onComplete!(claimed, stock.id, draft))
  assert.deepEqual(owner, completed)
  assert.equal(writes.saved, 1)
})

test('moved, reserved or exhausted stock fails without spending material or clearing the draft', () => {
  for (const stale of ['moved', 'reserved', 'used']) {
    const { owner, writes, options } = camp()
    const stock = options.stocks![0],
      draft = makeDraft(stock),
      item = finish(draft.job)
    options.onDraftChange!(draft)
    const row = owner.inventory.stacks[0]
    const identity = stackIdentity(row)
    const deltas: InventoryDelta[] = [{ ...identity, delta: -row.quantity }]
    if (stale === 'moved') deltas.push({ ...identity, transport: { kind: 'ground', x: 0, z: 0 }, delta: 1 })
    if (stale === 'reserved')
      deltas.push({ ...identity, wood: { ...identity.wood!, reserved: true }, delta: 1 })
    owner.inventory = inventoryTransaction(owner.inventory, deltas)
    const snapshot = structuredClone(owner)
    assert.throws(() => options.onComplete!(item, stock.id, draft))
    assert.deepEqual(owner, snapshot)
    assert.equal(writes.saved, 0)
    assert.equal(writes.draft, draft)
  }
})

test('a perfect client preview cannot repair an undercut or replace its blank with another size', () => {
  const { owner, writes, options } = camp()
  const stock = options.stocks![0],
    clean = makeDraft(stock),
    item = finish(clean.job)
  const undercut = makeDraft(stock, 2),
    wrongBlank = makeDraft({ ...stock, height: stock.height + 1 })
  for (const held of [undercut, wrongBlank]) {
    const before = structuredClone(owner)
    assert.throws(() => options.onComplete!(item, stock.id, held))
    assert.deepEqual(owner, before)
  }
  assert.equal(writes.saved, 0)
})

test('failed host persistence leaves the original inventory intact and permits one retry', async () => {
  const { owner, port } = camp()
  const before = structuredClone(owner),
    publish = port.commit
  port.commit = () => {
    throw new Error('disk full')
  }
  const options = campWoodworking(port),
    stock = options.stocks![0],
    draft = makeDraft(stock)
  const item = finish(draft.job, draft.paint)
  assert.throws(() => options.onComplete!(item, stock.id, draft), /disk full/)
  assert.deepEqual(owner, before)
  port.commit = publish
  await options.onComplete!(item, stock.id, draft)
  assert.equal(owner.inventory.instances?.length, 1)
  assert.equal(owner.workshop.nextInstance, before.workshop.nextInstance + 1)
})

test('two open benches cannot both claim the same host serial', async () => {
  const { port, writes, options } = camp()
  const competing = campWoodworking(port),
    stock = options.stocks![0],
    draft = makeDraft(stock)
  const item = finish(draft.job)
  await options.onComplete!(item, stock.id, draft)
  assert.throws(() => competing.onComplete!(item, stock.id, draft))
  assert.equal(writes.saved, 1)
})

test('a sample made from the reusable offcut keeps the source material across inventory generations', async () => {
  const { owner, options, port } = camp()
  const stock = options.stocks![0],
    draft = makeDraft(stock)
  await options.onComplete!(finish(draft.job), stock.id, draft)
  const next = campWoodworking(port)
  const offcut = next.stocks!.find((candidate) => candidate.id !== stock.id)!
  assert.equal(offcut.length, 30)
  const smaller = makeDraft(offcut, 0, { length: 25, tenonLength: 8, tenonWidth: 10 })
  const result = finish(smaller.job, smaller.paint)
  await next.onComplete!(result, offcut.id, smaller)
  const handwork = owner.inventory.instances!.find((item) => item.instanceId === 'crafted-271-6')!.handwork
  assert.deepEqual(handwork, { ...result, sourceMaterial: '枫木方料' })
  assert.equal(
    owner.inventory.stacks.some((row) => row.blankLot === offcut.id),
    false,
  )
})

function earlyDraft(stock: Stock, saw: boolean): WoodworkingDraft {
  const blank = createJob(DEFAULT_DESIGN, stock)
  const marked = markCut(blank, 'trim', idealMark(blank, 'trim'))
  return { version: 1, job: saw ? cut(marked, 'trim') : marked, selected: 'trim', paint: null, tested: false }
}

test('discarding a sawn workpiece consumes one blank and closes the serial without a collectible', async () => {
  const { owner, writes, options } = camp()
  const stock = options.stocks![0],
    draft = earlyDraft(stock, true)
  options.onDraftChange!(draft)
  const before = structuredClone(owner)
  await options.onDiscard!(draft)
  assert.equal(owner.inventory.revision, before.inventory.revision + 1)
  assert.equal(owner.workshop.nextInstance, before.workshop.nextInstance + 1)
  assert.equal(
    owner.inventory.stacks.find((row) => row.blankLot === stock.id)!.quantity,
    before.inventory.stacks[0].quantity - 1,
  )
  const offcut = owner.inventory.stacks.find((row) => row.blankLot !== stock.id)!
  assert.equal(offcut.wood?.spec?.lengthMm, 31)
  assert.deepEqual(owner.inventory.instances ?? [], before.inventory.instances ?? [])
  assert.equal(writes.saved, 1)
  assert.equal(writes.draft, null)
  const discarded = structuredClone(owner)
  await assert.rejects(async () => options.onDiscard!(draft))
  assert.deepEqual(owner, discarded)
  assert.equal(writes.saved, 1)
})

test('discard cannot debit a marked-only piece or a sawn piece whose host lot has moved', async () => {
  for (const moved of [false, true]) {
    const { owner, writes, options } = camp()
    const stock = options.stocks![0],
      draft = earlyDraft(stock, moved)
    options.onDraftChange!(draft)
    if (moved) {
      const row = owner.inventory.stacks[0],
        identity = stackIdentity(row)
      owner.inventory = inventoryTransaction(owner.inventory, [
        { ...identity, delta: -row.quantity },
        { ...identity, transport: { kind: 'ground', x: 0, z: 0 }, delta: row.quantity },
      ])
    }
    const before = structuredClone(owner)
    if (moved) await assert.rejects(async () => options.onDiscard!(draft))
    else await options.onDiscard!(draft)
    assert.deepEqual(owner, before)
    assert.equal(writes.saved, 0)
    assert.equal(writes.draft, draft)
  }
})
