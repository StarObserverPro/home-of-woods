import { isRarityVfxMode } from '../content/item-vfx.ts';
import type { RarityVfxMode } from '../content/item-vfx.ts';
import {isWhimsyMode} from '../content/whimsy-display.ts';
import type {WhimsyMode} from '../content/whimsy-display.ts';

export const RARITY_VFX_PREFERENCE_KEY = 'home-of-woods.rarity-vfx';
export const WHIMSY_PREFERENCE_KEY = 'home-of-woods.whimsy';
type DisplayStore = Pick<Storage, 'getItem' | 'setItem'>;
function browserStore(): DisplayStore | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}
/** A display preference, never a second inventory/world writer. Invalid values are harmless. */
export function readRarityVfxPreference(store: DisplayStore | null = browserStore()): RarityVfxMode {
  try { const value = store?.getItem(RARITY_VFX_PREFERENCE_KEY); return isRarityVfxMode(value) ? value : 'full'; }
  catch { return 'full'; }
}
export function writeRarityVfxPreference(mode: RarityVfxMode, store: DisplayStore | null = browserStore()): boolean {
  if (!isRarityVfxMode(mode) || !store) return false;
  try { store.setItem(RARITY_VFX_PREFERENCE_KEY, mode); return true; }
  catch { return false; }
}
export function readWhimsyPreference(store:DisplayStore|null=browserStore()):WhimsyMode{
  try{const value=store?.getItem(WHIMSY_PREFERENCE_KEY);return isWhimsyMode(value)?value:'full';}
  catch{return 'full';}
}
export function writeWhimsyPreference(mode:WhimsyMode,store:DisplayStore|null=browserStore()):boolean{
  if(!isWhimsyMode(mode)||!store)return false;
  try{store.setItem(WHIMSY_PREFERENCE_KEY,mode);return true;}catch{return false;}
}
