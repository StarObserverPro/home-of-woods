import * as THREE from 'three';
import type { Resources } from './resources.ts';
import type { Models } from './models.ts';
import type { GatheringRegistry } from '../domain/gathering-registry.ts';
import type { GatheringState } from '../domain/gathering.ts';
import { RUNTIME_MODELS } from '../content/assets.ts';
import { InteractionRegistry } from './interaction-registry.ts';

export function createGatheringPresentation(r: Resources, models: Models, registry: GatheringRegistry) {
  const group = new THREE.Group(), hits = new InteractionRegistry();
  const proxyMaterial = r.own(new THREE.MeshBasicMaterial({ visible: false }));
  const batches: { mesh: THREE.InstancedMesh; records: { sourceId: string; matrix: THREE.Matrix4 }[]; local: THREE.Matrix4 }[] = [];
  const visibility = new Map<string, boolean>();
  let patchCount = 0;
  for (const definition of registry.definitions.values()) {
    const spec = RUNTIME_MODELS.find(a => a.assetId === definition.assetId)!;
    const template = models.templates.get(spec.name)!;
    template.updateMatrixWorld(true);
    const records: { sourceId: string; matrix: THREE.Matrix4 }[] = [];
    for (const source of registry.sources.values()) {
      if (source.definitionId !== definition.definitionId) continue;
      const root = new THREE.Group(); root.position.set(source.x,source.targetAnchor.y,source.z);
      const patches = source.patches ?? [{ ...source.targetAnchor, scale: 1, rotation: 0 }];
      for (const patch of patches) {
        const dummy = new THREE.Object3D(); dummy.position.set(patch.x,patch.y,patch.z);
        dummy.rotation.y = patch.rotation; dummy.scale.setScalar(patch.scale); dummy.updateMatrix();
        records.push({ sourceId: source.sourceId, matrix: dummy.matrix.clone() });
        const proxy = new THREE.Mesh(r.geometry(`gather-hit-${definition.definitionId}`,()=>new THREE.SphereGeometry(definition.hitRadius,10,6)),proxyMaterial);
        proxy.position.set(patch.x-source.x,patch.y-source.targetAnchor.y+.4*patch.scale,patch.z-source.z);
        proxy.scale.set(patch.scale,.55*patch.scale,patch.scale); root.add(proxy);
        patchCount++;
      }
      group.add(root); hits.register(root,source.sourceId);
    }
    template.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const mesh = r.own(new THREE.InstancedMesh(object.geometry,object.material,records.length));
      const local=object.matrixWorld.clone();
      mesh.castShadow=true;mesh.receiveShadow=true;
      records.forEach((record,index)=>mesh.setMatrixAt(index,record.matrix.clone().multiply(local)));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.computeBoundingSphere();group.add(mesh);batches.push({mesh,records,local});
    });
  }
  let disposed = false;
  const hidden = new THREE.Matrix4().makeScale(0,0,0), matrix = new THREE.Matrix4();
  return {
    group, hits,
    stats:()=>({ sources:registry.sources.size,patches:patchCount,batches:batches.length,hits:hits.size }),
    update(state: GatheringState) {
      if(disposed)return;
      const changed=new Set<string>();
      for(const source of registry.sources.values()){
        const life=state.sources[source.sourceId],visible=(life?.remaining??0)>0&&life.hostAvailable!==false;
        if(visibility.get(source.sourceId)!==visible){visibility.set(source.sourceId,visible);changed.add(source.sourceId);}
      }
      if(!changed.size)return;
      for(const batch of batches){
        let dirty=false;
        batch.records.forEach((record,index)=>{
          if(!changed.has(record.sourceId))return;
          batch.mesh.setMatrixAt(index,visibility.get(record.sourceId)?matrix.copy(record.matrix).multiply(batch.local):hidden);dirty=true;
        });
        if(dirty)batch.mesh.instanceMatrix.needsUpdate=true;
      }
    },
    // Pick proxies remain to inspect empty/host-disabled resource pools.
    dispose(){if(disposed)return;disposed=true;hits.clear();group.clear();visibility.clear();},
  };
}
