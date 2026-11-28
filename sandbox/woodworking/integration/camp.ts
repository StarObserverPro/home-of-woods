// This is a game-host adapter. The embeddable UI never imports the world or writes its save.
import {
  inventoryTransaction,
  stackIdentity,
  stackKey,
  validateInventory,
} from '../../../src/domain/inventory.ts'
import type { InventoryState, InventoryStack, InventoryDelta } from '../../../src/domain/inventory.ts'
import { isAvailableMaterial } from '../../../src/domain/transport-location.ts'
import { canonicalInstances } from '../../../src/domain/owned-items.ts'
import { rollBlueprintRarity } from '../../../src/domain/blueprint-rarity.ts'
import { rarityDefinition } from '../../../src/content/rarities.ts'
import { endAt, finish, restoreJob } from '../src/domain.ts'
import { finishTenon, restorePiece } from '../src/tenon.ts'
import type { Stock } from '../src/domain.ts'
import type { WoodworkingDraft, WoodworkingOptions, WoodworkingReceipt } from '../src/workbench.ts'

export const SAMPLE_PLAN = 'blueprint.handwork-tenon'
export const SAMPLE_ITEM = 'woodworking.tenon-sample'
export type CampOwner = {
  seed: number
  time: number
  workshop: { nextInstance: number }
  inventory: InventoryState
}
export interface CampPort {
  read(): CampOwner
  // Publish inventory, serial and cleared working draft in ONE host transaction.
  // Throw before publication if persistence fails; the workbench can retry.
  commit(inventory: InventoryState, nextInstance: number): void
  checkpoint(draft: WoodworkingDraft | null): void
}

function blankOf(row: InventoryStack): Stock | null {
  const spec = row.wood?.spec
  if (
    !spec ||
    row.wood?.reserved ||
    row.quantity < 1 ||
    !isAvailableMaterial(row) ||
    !['wood', 'branch', 'small-wood'].includes(row.itemId) ||
    spec.straightness !== 'straight' ||
    spec.section !== 'square' ||
    typeof row.blankLot !== 'string'
  )
    return null
  return {
    id: row.blankLot,
    label: typeof row.blankName === 'string' ? row.blankName : '方木坯',
    length: spec.lengthMm,
    width: spec.thicknessMm,
    height: spec.thicknessMm,
  }
}

export function campWoodworking(
  port: CampPort,
  draft: WoodworkingDraft | null = null,
  tools: WoodworkingOptions['tools'] = {},
): WoodworkingOptions {
  const opening = port.read(),
    serial = opening.workshop.nextInstance
  const lots = new Map<string, { stock: Stock; key: string }>()
  for (const row of opening.inventory.stacks) {
    const stock = blankOf(row)
    if (!stock) continue
    if (lots.has(stock.id)) throw new Error('方料批次号重复')
    lots.set(stock.id, { stock, key: stackKey(row) })
  }
  function checkBlank(stockId: string, held: WoodworkingDraft) {
    const live = port.read(),
      lot = lots.get(stockId)
    if (live.workshop.nextInstance !== serial || !lot) throw new Error('工作台批次已变化，请重新打开工作台')
    const row = live.inventory.stacks.find((s) => stackKey(s) === lot.key && blankOf(s))
    const job = held.version === 2 ? restorePiece(held.job) : restoreJob(held.job)
    if (
      !row ||
      job.stock.id !== stockId ||
      job.stock.width !== lot.stock.width ||
      job.stock.height !== lot.stock.height ||
      job.stock.length !== lot.stock.length
    )
      throw new Error('选中的方料已移走或被占用')
    return { live, row, job }
  }
  function consumeBlank({ live, row, job }: ReturnType<typeof checkBlank>) {
    const sourceMaterial =
      typeof row.sourceMaterial === 'string' ? row.sourceMaterial : (row.blankName ?? '方木坯')
    const deltas: InventoryDelta[] = [{ ...stackIdentity(row), delta: -1 }]
    // V2 pays out only actually detached rectangular stock. A shallow kerf has no offcut.
    // Fine fuel/sawdust remains an abstract volume ledger, never a Woodcraft body.
    const offcuts = 'version' in job
      ? job.ledger.offcuts.filter(o => o.kind === 'reusable' && o.box).map(o => ({
          length: o.box!.max[0] - o.box!.min[0], section: o.box!.max[1] - o.box!.min[1],
        }))
      : [{ length: Math.floor(job.stock.length - Math.max(endAt(job, 0), endAt(job, job.stock.width)) - 1), section: job.stock.width }].filter(o => o.length >= 12)
    if (row.itemId !== 'small-wood') offcuts.forEach((offcut, index) => {
      deltas.push({
        ...stackIdentity(row),
        blankLot: `offcut-${live.seed}-${serial}${index ? '-' + index : ''}`,
        blankName: '截余方料', sourceMaterial,
        wood: { ...row.wood!, spec: { ...row.wood!.spec!, lengthMm: offcut.length, thicknessMm: offcut.section } },
        ...(row.woodCondition ? { woodCondition: row.woodCondition } : {}), delta: 1,
      })
    })
    return { inventory: inventoryTransaction(live.inventory, deltas), sourceMaterial }
  }
  return {
    stocks: [...lots.values()].map((lot) => lot.stock),
    draft,
    tools,
    onDraftChange: (data) => port.checkpoint(data),
    onDiscard(held) {
      const checked = checkBlank(held.job.stock.id, held)
      if (!('version' in checked.job ? checked.job.operations.length : Object.keys(checked.job.cuts).length)) return
      const { inventory } = consumeBlank(checked)
      port.commit(inventory, serial + 1)
    },
    onComplete(_result, stockId, held): WoodworkingReceipt {
      const checked = checkBlank(stockId, held),
        { live, job } = checked
      const result = 'version' in job ? finishTenon(job, held.paint) : finish(job, held.paint)
      const rarityId = rollBlueprintRarity(live.seed, serial, SAMPLE_PLAN, 'common', result.score)
      const instanceId = `crafted-${live.seed}-${serial}`
      if (live.inventory.instances?.some((item) => item.instanceId === instanceId))
        throw new Error('本件木作已经收好')
      const { inventory, sourceMaterial } = consumeBlank(checked)
      inventory.instances = canonicalInstances([
        ...(inventory.instances || []),
        {
          instanceId,
          definitionId: SAMPLE_ITEM,
          blueprintId: SAMPLE_PLAN,
          createdAt: live.time,
          location: { kind: 'inventory' },
          rarityId,
          traits: [],
          handwork: { ...result, sourceMaterial },
          crafting: { qualityScore: result.score, scoreSource: 'handwork', blueprintTier: 'common' },
        },
      ])
      validateInventory(inventory)
      port.commit(inventory, serial + 1)
      return { rarityLabel: rarityDefinition(rarityId).name }
    },
  }
}
