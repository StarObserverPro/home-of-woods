import type {BufferGeometry,MeshStandardMaterial,Color} from 'three';
import type {MountainDefinition} from '../content/environment.ts';
export function buildMountainGeometry(spec:MountainDefinition):BufferGeometry;
export function mountainMaterial(air:{value:Color}):MeshStandardMaterial;
