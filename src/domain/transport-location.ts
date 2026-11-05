import {WORLD} from '../content/world.ts';
import type {CarryMethod} from '../content/carrying.ts';
export type TransportLocation = {kind:'carried'} | {kind:'ground';x:number;z:number};
export function transportLocation(item: Record<string,unknown>): TransportLocation | undefined {
  const raw=item.transport;
  if(raw===undefined)return undefined; // Old stock is already stored at camp.
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid material location');
  const p=raw as Record<string,unknown>;
  if(p.kind==='carried'&&Object.keys(p).length===1)return {kind:'carried'};
  if(p.kind==='ground'&&Object.keys(p).length===3&&typeof p.x==='number'&&typeof p.z==='number'&&
    Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=WORLD.minX&&p.x<=WORLD.maxX&&p.z>=WORLD.minZ&&p.z<=WORLD.maxZ)
    return {kind:'ground',x:p.x,z:p.z};
  throw new Error('Invalid material location');
}
export const isStored = (item:Record<string,unknown>) => transportLocation(item)===undefined;
export const isCarried = (item:Record<string,unknown>) => transportLocation(item)?.kind==='carried';
export const isAvailableMaterial = (item:Record<string,unknown>) => !item.harvest&&transportLocation(item)?.kind!=='ground';
export function carryMethod(raw:unknown):CarryMethod {
  if(raw===undefined)return 'hands';
  if(raw==='hands'||raw==='bundle')return raw;
  throw new Error('Unsupported carrying method');
}
