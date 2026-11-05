import {WORLD} from './world.ts';
import type {Point} from './world.ts';

export const REGIONS = [
  {id:'home-woodland',name:'营地西岸林',initiallyOpen:true,bank:'west',bounds:{minX:-79,maxX:WORLD.maxX,minZ:WORLD.minOpenZ,maxZ:66},blessingLevel:2,managedSlope:null,resourceArea:null},
  {id:'east-woodland',name:'溪流东岸林',initiallyOpen:false,bank:'east',bounds:{minX:WORLD.minX,maxX:78,minZ:0,maxZ:72},blessingLevel:3,managedSlope:.88,resourceArea:{minX:38,maxX:64,minZ:43,maxZ:64}},
] as const;
export type RegionId = typeof REGIONS[number]['id'];
export const EAST_BANK = {minZ:0,maxZ:72,maxX:78,shoreMargin:8};
export const CREEK_BRIDGE = {
  id:'creek-bridge',name:'跨溪木桥',blueprintId:'blueprint.creek-bridge',
  west:{x:8,z:38},east:{x:44,z:38},width:4.8,
  stand:{x:6,z:38},eastPortal:{x:46,z:38},
} as const;
export const REGION_LINKS:readonly {id:string;from:RegionId;to:RegionId;fromPortal:Point;toPortal:Point}[] = [
  {id:CREEK_BRIDGE.id,from:'home-woodland',to:'east-woodland',fromPortal:CREEK_BRIDGE.stand,toPortal:CREEK_BRIDGE.eastPortal},
];
export const WORLD_STREAMING = {chunkSize:24,detailLoad:43,detailRelease:57,simulation:76,sceneryDraw:560};
export const BLESSING = {campRadius:22,nearbyAtAltarLevel:2,eastAtAltarLevel:3};
