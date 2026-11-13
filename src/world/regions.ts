import {BLESSING,CREEK_BRIDGE,EAST_BANK,REGIONS,REGION_LINKS,WORLD_STREAMING} from '../content/regions.ts';
import type {RegionId} from '../content/regions.ts';
import {HOME,WORLD} from '../content/world.ts';
import type {Point} from '../content/world.ts';
import {riverX} from './river.ts';

export type TravelAccess={openLinks:readonly string[]};
export const CLOSED_ACCESS:TravelAccess={openLinks:[]};
export type RegionalHost={workshop?:{upgrades:Record<string,{level:number}>}};
/** Traversal is derived from the existing construction ledger, never a second bridge flag. */
export function travelAccess(host:RegionalHost):TravelAccess {
  return {openLinks:REGION_LINKS.filter(link=>(host.workshop?.upgrades[link.id]?.level??0)>0).map(link=>link.id)};
}
export function regionAt(x:number,z:number):RegionId|null {
  for(const region of REGIONS){
    const bounds=region.bounds;
    if(x<=bounds.minX||x>=bounds.maxX||z<=bounds.minZ||z>=bounds.maxZ)continue;
    if(region.bank==='west'?x<riverX(z)-4.6:x>riverX(z)+4.6)return region.id;
  }
  return null;
}
export const regionName=(id:RegionId)=>REGIONS.find(region=>region.id===id)!.name;
export function regionOpen(id:RegionId,access:TravelAccess):boolean {
  return REGIONS.some(region=>region.initiallyOpen&&regionRoute(region.id,id,access)!==null);
}
/** A small region graph keeps future long routes out of one world-sized A* search. */
export function regionRoute(from:RegionId,to:RegionId,access:TravelAccess):Point[]|null {
  const queue:{id:RegionId;portals:Point[]}[]=[{id:from,portals:[]}],seen=new Set<RegionId>();
  while(queue.length){
    const current=queue.shift()!;if(current.id===to)return current.portals;
    if(seen.has(current.id))continue;seen.add(current.id);
    for(const link of REGION_LINKS){
      if(!access.openLinks.includes(link.id))continue;
      if(link.from===current.id)queue.push({id:link.to,portals:[...current.portals,link.fromPortal,link.toPortal]});
      if(link.to===current.id)queue.push({id:link.from,portals:[...current.portals,link.toPortal,link.fromPortal]});
    }
  }
  return null;
}
export const chunkKey=(p:Point)=>`${Math.floor(p.x/WORLD_STREAMING.chunkSize)}:${Math.floor(p.z/WORLD_STREAMING.chunkSize)}`;
export function chunkDistance(key:string,p:Point){
  const [x,z]=key.split(':').map(Number),size=WORLD_STREAMING.chunkSize;
  return Math.hypot(Math.max(x*size-p.x,0,p.x-(x+1)*size),Math.max(z*size-p.z,0,p.z-(z+1)*size));
}
/** Blessing coverage is spatial. Building a bridge never extends it. Effects are a later feature. */
export function blessingAt(host:RegionalHost,p:Point){
  if(Math.hypot(p.x-HOME.x,p.z-HOME.z)<=BLESSING.campRadius)return true;
  const level=host.workshop?.upgrades['grove-altar']?.level??1,region=regionAt(p.x,p.z);
  const definition=REGIONS.find(r=>r.id===region);return !!definition&&level>=definition.blessingLevel;
}
export const bridgeOpen=(access:TravelAccess)=>access.openLinks.includes(CREEK_BRIDGE.id);
