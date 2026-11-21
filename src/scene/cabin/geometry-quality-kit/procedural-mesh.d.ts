import type { BufferGeometry } from 'three';

export type MeshData = { verts: number[][]; faces: number[][] };
export function panelWithHoles(width: number, height: number, thickness: number, holes?: number[][]): MeshData;
export function cleanMesh(mesh: MeshData, weldDistance?: number): MeshData;
export function toGeometry(mesh: MeshData, uvScale?: number): BufferGeometry;
