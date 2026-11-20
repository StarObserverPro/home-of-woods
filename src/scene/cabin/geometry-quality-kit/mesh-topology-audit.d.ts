import type { MeshData } from './procedural-mesh.js';

export function auditMeshData(mesh: MeshData, options?: { maxComponents?: number }): { ok: boolean; issues: unknown[] };
