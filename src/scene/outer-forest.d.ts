import type {BufferGeometry,Group} from 'three';
import type {Resources} from './resources.ts';
import type {ImpostorAtlas} from './impostors/runtime.ts';
export const OUTER_FOREST:{seed:number;triangleBudget:number;maxTrees:number;impostorMinExtent:number};
export type ForestVisualMode='mass'|'trees'|'impostor';
export type DistantTreeKind='oak'|'poplar'|'pine'|'spruce'|'fir';
export function distantTreeGeometry(kind:DistantTreeKind):BufferGeometry;
export function forestWeights(y:number,bankDistance:number):Record<DistantTreeKind,number>;
export function planOuterForest(sample:(x:number,z:number)=>number,counts:Record<DistantTreeKind,number>,existing?:{x:number;z:number}[]):{
  placements:{x:number;y:number;z:number;kind:DistantTreeKind;width:number;height:number;angle:number;tone:number}[];triangles:number;
};
export function createOuterForest(resources:Resources,sample:(x:number,z:number)=>number,existing?:{x:number;z:number}[],options?:{mass?:boolean;mode?:ForestVisualMode;atlas?:ImpostorAtlas}):Group;
