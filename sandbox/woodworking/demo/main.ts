import { mountCampHandwork } from '../integration/mount-camp.ts'
import type { WoodworkingDraft, WoodworkingMount } from '../src/workbench.ts'
import {
  createInventory,
  inventoryTransaction,
  validateInventory,
  woodBatch,
} from '../../../src/domain/inventory.ts'
import type { InventoryState } from '../../../src/domain/inventory.ts'
import { restoreDraft } from '../src/workbench.ts'
import { rarityDefinition, isRarityId } from '../../../src/content/rarities.ts'

type Session = { version: 2; inventory: InventoryState; serial: number; draft: WoodworkingDraft | null }
const key = 'home-of-woods.handwork.sandbox.v2'
const root = document.querySelector<HTMLElement>('#workshop')!
const ledger = document.querySelector<HTMLElement>('#ledger')!
const gallery = document.querySelector<HTMLDetailsElement>('#gallery')!
const notice = document.querySelector<HTMLElement>('#notice')!
let handle: WoodworkingMount | undefined

function fresh(): Session {
  const rows = [
    { id: 'maple', label: '枫木方料', length: 90, section: 30, quantity: 5 },
    { id: 'pine', label: '松木方料', length: 112, section: 36, quantity: 4 },
    { id: 'offcut', label: '短枫木料', length: 69, section: 28, quantity: 3 },
  ]
  return {
    version: 2,
    serial: 1,
    draft: null,
    inventory: inventoryTransaction(
      createInventory(),
      rows.map((r) => ({
        itemId: 'branch',
        qualityId: 'ordinary',
        blankLot: r.id,
        blankName: r.label,
        wood: woodBatch({
          lengthMm: r.length,
          thicknessMm: r.section,
          straightness: 'straight',
          section: 'square',
        }),
        delta: r.quantity,
      })),
    ),
  }
}
let storage: Storage | null = null
try {
  storage = window.localStorage
} catch {
  /* Private file viewers may supply no storage. */
}
function load(): Session {
  try {
    const raw = storage?.getItem(key)
    if (raw) {
      const s: Session = JSON.parse(raw)
      if (s.version !== 2 || !Number.isSafeInteger(s.serial) || s.serial < 1) throw Error()
      validateInventory(s.inventory)
      if (s.draft) s.draft = restoreDraft(s.draft)
      return s
    }
  } catch {
    notice.textContent = '上次的工件未能取出，已另开工作台。'
  }
  return fresh()
}
let session = load()
function save(next: Session) {
  try {
    storage?.setItem(key, JSON.stringify(next))
  } catch {
    storage = null
    notice.textContent = '当前工件只保留在这次打开的工作台。'
  }
  session = next
}
function shelves() {
  const items = session.inventory.instances || []
  document.querySelector('#count')!.textContent = String(items.length)
  ledger.replaceChildren()
  if (!items.length) {
    ledger.textContent = '尺量辅助从第一件就可用。作品会保留实际尺寸与工艺成绩。'
    return
  }
  for (const item of [...items].sort((a, b) => b.createdAt - a.createdAt)) {
    const data = item.handwork as {
      score: number
      paint: string | null
      sourceMaterial: string
      envelope: { length: number; tenonWidth: number }
    }
    const row = document.createElement('div'),
      swatch = document.createElement('i'),
      name = document.createElement('strong'),
      detail = document.createElement('small')
    swatch.style.background = data.paint || '#bd9062'
    name.textContent = data.sourceMaterial + ' · 直榫样件'
    const grade = isRarityId(item.rarityId) ? rarityDefinition(item.rarityId).name : '普通'
    detail.textContent = `${grade}　工艺 ${data.score}　·　榫宽 ${data.envelope.tenonWidth.toFixed(1)} mm`
    row.append(swatch, name, detail)
    ledger.append(row)
  }
}
function open() {
  handle?.destroy()
  handle = mountCampHandwork(
    root,
    {
      read: () => ({
        seed: 104729,
        time: session.serial,
        workshop: { nextInstance: session.serial },
        inventory: session.inventory,
      }),
      checkpoint: (draft) => {
        if (draft !== null || session.draft !== null) save({ ...session, draft })
      },
      commit: (inventory, serial) => {
        save({ version: 2, inventory, serial, draft: null })
        shelves()
      },
    },
    session.draft,
    () => ({ saw: true, autoFinish: true, brush: true, straightedge: true }),
  )
}
document.querySelector('#replenish')!.addEventListener('click', () => {
  if (!confirm('重置木作练习台？当前工件和作品匣将清空。')) return
  handle?.destroy()
  handle = undefined
  save(fresh())
  gallery.open = false
  shelves()
  open()
})
document.addEventListener('visibilitychange', () => handle?.setPaused(document.hidden))
shelves()
open()
