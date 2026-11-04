import {isStored} from './transport-location.ts';
import { WOODCRAFT, insideWoodcraft, zeroVector } from '../content/woodcraft.ts';
import type { Vec3, Quat } from '../content/woodcraft.ts';
import { heightAt } from '../world/surface.ts';
import { inventoryTransaction, canonicalStacks, exactKeys, isRecord, recognizedStack, stackKey } from './inventory.ts';
import type { InventoryStack, InventoryState } from './inventory.ts';
import { ITEM_CATALOG } from './item-catalog.ts';

export type LooseWood = {
  id: string; source: InventoryStack; position: Vec3; rotation: Quat;
  linear: Vec3; angular: Vec3; phase: 'queued' | 'loose'; sleeping: boolean;
};
export type WoodcraftState = { nextId: number; prepared: boolean; pieces: LooseWood[] };
export type WoodcraftOwner = { inventory: InventoryState; woodcraft: WoodcraftState; selected: string | null };
export const createWoodcraft = (): WoodcraftState => ({ nextId: 1, prepared: false, pieces: [] });
export const woodLabel = (s: InventoryStack) => ITEM_CATALOG.items.get(s.itemId)?.name ?? s.itemId;
export function availableWood(inventory: InventoryState) {
  return inventory.stacks.filter(s => isStored(s) && ['wood', 'branch'].includes(s.itemId) && !s.wood?.reserved && recognizedStack(s) && s.quantity > 0)
    .sort((a,b) => Number(b.itemId === 'wood') - Number(a.itemId === 'wood') || stackKey(a).localeCompare(stackKey(b)));
}
export const availableWoodCount = (inventory: InventoryState) => availableWood(inventory).reduce((n,s) => n+s.quantity,0);
/** Display dimensions are bounded toy-scale proxies; original material specifications stay intact. */
export function woodShape(source: InventoryStack) {
  const log = source.itemId === 'wood', spec = source.wood?.spec;
  const length = Math.max(log ? 1.2 : .6, Math.min(log ? 2.5 : 1.6, spec ? spec.lengthMm / 1000 : log ? 2.2 : 1.2));
  const radius = Math.max(log ? .19 : .055, Math.min(log ? .32 : .12, spec ? spec.thicknessMm / 2000 : log ? .26 : .075));
  return { length, radius, fork: !log && spec?.straightness !== 'straight' };
}
function initialPiece(source: InventoryStack, n: number, target?: Vec3): LooseWood {
  const yaw = (n * 2.399963229728653) % (Math.PI * 2), s = Math.SQRT1_2;
  const x = target?.x ?? WOODCRAFT.x + Math.sin(n * 2.7) * .85;
  const z = target?.z ?? WOODCRAFT.z + Math.cos(n * 1.9) * .7;
  return { id: `loose-wood-${n}`, source: { ...structuredClone(source), quantity: 1 },
    position: { x, y: Math.max(heightAt(x,z) + 2, (target?.y ?? 0) + .8), z },
    rotation: { x: Math.sin(yaw/2)*s, y: Math.sin(yaw/2)*s, z: Math.cos(yaw/2)*s, w: Math.cos(yaw/2)*s },
    linear: zeroVector(), angular: {x:.25,y:.5,z:.2}, phase: 'queued', sleeping: false };
}
/** Synchronous exclusive ownership transfer. Every queued piece has already left inventory. */
export function transferWood(owner: WoodcraftOwner, mode: 'prepare' | 'one', target?: Vec3, sourceKey?:string): number {
  const candidates = availableWood(owner.inventory).filter(s=>mode!=='one'||sourceKey===undefined||stackKey(s)===sourceKey), total = candidates.reduce((n,s)=>n+s.quantity,0);
  const capacity = (mode === 'prepare' ? WOODCRAFT.maxPieces - 1 : WOODCRAFT.maxPieces) - owner.woodcraft.pieces.length;
  let need = Math.min(Math.max(0, capacity), mode === 'prepare' ? Math.max(0,total-1) : Math.min(1,total));
  if (!need) return 0;
  if (target && (!insideWoodcraft(target) || !Number.isFinite(target.y) || target.y < heightAt(target.x,target.z)-.2 || target.y > heightAt(target.x,target.z)+8)) throw new Error('请选择木料区内的位置。');
  if (!Number.isSafeInteger(owner.woodcraft.nextId + need)) throw new Error('木料编号已耗尽。');
  const deltas = [], pieces: LooseWood[] = []; let nextId = owner.woodcraft.nextId;
  for (const source of candidates) {
    const count = Math.min(need,source.quantity);
    if (count) {
      deltas.push({...source,delta:-count});
      for(let i=0;i<count;i++) pieces.push(initialPiece(source,nextId++,target));
      need-=count;
    }
    if(!need) break;
  }
  const inventory = inventoryTransaction(owner.inventory,deltas);
  const woodcraft = {nextId, prepared: owner.woodcraft.prepared || mode === 'prepare', pieces:[...owner.woodcraft.pieces,...pieces]};
  owner.inventory=inventory; owner.woodcraft=woodcraft;
  return pieces.length;
}
export function collectWood(owner: WoodcraftOwner,id:string): boolean {
  const piece=owner.woodcraft.pieces.find(p=>p.id===id); if(!piece) return false;
  const inventory=inventoryTransaction(owner.inventory,[{...piece.source,delta:1}]);
  owner.inventory=inventory; owner.woodcraft={...owner.woodcraft,pieces:owner.woodcraft.pieces.filter(p=>p.id!==id)};
  if(owner.selected===id) owner.selected=WOODCRAFT.id;
  return true;
}
const vector=(raw:unknown,quaternion=false) => {
  if(!isRecord(raw)) throw new Error('Invalid wood pose');
  exactKeys(raw,quaternion?['x','y','z','w']:['x','y','z']);
  if(Object.values(raw).some(v=>typeof v!=='number'||!Number.isFinite(v))) throw new Error('Non-finite wood pose');
  return raw as unknown as Quat;
};
export function validateWoodcraft(raw:unknown): WoodcraftState {
  if(!isRecord(raw)) throw new Error('Invalid woodcraft state');
  exactKeys(raw,['nextId','prepared','pieces']);
  if(!Number.isSafeInteger(raw.nextId)||(raw.nextId as number)<1||typeof raw.prepared!=='boolean'||!Array.isArray(raw.pieces)||raw.pieces.length>WOODCRAFT.maxPieces) throw new Error('Invalid woodcraft budget or identity');
  const ids=new Set<string>();
  for(const p of raw.pieces) {
    if(!isRecord(p)) throw new Error('Invalid loose wood');
    exactKeys(p,['id','source','position','rotation','linear','angular','phase','sleeping']);
    const match=typeof p.id==='string' && /^loose-wood-([1-9]\d*)$/.exec(p.id), n=match?Number(match[1]):NaN;
    if(!Number.isSafeInteger(n)||n>=(raw.nextId as number)||ids.has(p.id as string)) throw new Error('Invalid loose wood identity');
    ids.add(p.id as string);
    const stacks=canonicalStacks([p.source]);
    if(stacks.length!==1||stacks[0].quantity!==1||!isStored(stacks[0])||!['wood','branch'].includes(stacks[0].itemId)||stacks[0].wood?.reserved) throw new Error('Invalid loose wood source');
    const pos=vector(p.position), q=vector(p.rotation,true), v=vector(p.linear), a=vector(p.angular);
    const ground=WOODCRAFT.ground;
    if(pos.x<ground.minX||pos.x>ground.maxX||pos.z<ground.minZ||pos.z>ground.maxZ||pos.y<heightAt(pos.x,pos.z)-2||pos.y>heightAt(WOODCRAFT.x,WOODCRAFT.z)+14 ||
      Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>.001 || Math.hypot(v.x,v.y,v.z)>60 || Math.hypot(a.x,a.y,a.z)>100 ||
      !['queued','loose'].includes(p.phase as string)||typeof p.sleeping!=='boolean'||p.phase==='queued'&&p.sleeping) throw new Error('Invalid loose wood dynamics');
  }
  return structuredClone(raw) as unknown as WoodcraftState;
}
