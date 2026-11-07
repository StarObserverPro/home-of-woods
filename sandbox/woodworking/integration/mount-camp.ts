import { mountWoodworking } from '../src/workbench.ts'
import type { WoodworkingDraft, WoodworkingMount, WoodworkingOptions } from '../src/workbench.ts'
import { campWoodworking } from './camp.ts'
import type { CampPort } from './camp.ts'

/** Mount inside the existing camp panel. The game owns reachability, inventory and the save. */
export function mountCampHandwork(
  container: HTMLElement,
  port: CampPort,
  draft: WoodworkingDraft | null = null,
  tools: WoodworkingOptions['tools'] | (() => WoodworkingOptions['tools']) = {},
  lockedStraightedgeHint?: string,
): WoodworkingMount {
  let active: WoodworkingMount
  function open(saved: WoodworkingDraft | null) {
    active?.destroy()
    active = mountWoodworking(container, {
      ...campWoodworking(port, saved, typeof tools === 'function' ? tools() : tools),
      lockedStraightedgeHint,
      onNew: () => open(null),
    })
  }
  open(draft)
  return {
    getDraft: () => active.getDraft(),
    setPaused: (value) => active.setPaused(value),
    destroy: () => active.destroy(),
  }
}
