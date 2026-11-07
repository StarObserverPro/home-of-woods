import type {BufferGeometry} from 'three';
export function createTerrainSampler(geometries:BufferGeometry[],cellSize?:number):(x:number,z:number)=>number;
