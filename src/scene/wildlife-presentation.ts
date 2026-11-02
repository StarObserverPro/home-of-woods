import * as THREE from 'three';
import { WILDLIFE_DEFINITIONS } from '../content/wildlife.ts';
import type { WildlifeDefinitionId } from '../content/wildlife.ts';
import type { WildlifeView } from '../domain/wildlife.ts';
import { wildlifeDay } from '../domain/wildlife.ts';
import type { Models } from './models.ts';
import type { Resources } from './resources.ts';

type Instance = {
  root: THREE.Group; model: THREE.Group; mixer: THREE.AnimationMixer;
  actions: Record<'idle' | 'walk', THREE.AnimationAction>; clip: 'idle' | 'walk';
  materials: THREE.Material[]; skeletons: THREE.Skeleton[]; meshes: THREE.Mesh[];
};
/** Presentation owns no spawn decisions, collision state, timers, input targets or inventory. */
export function createWildlifePresentation(resources: Resources, models: Models) {
  const group = new THREE.Group(); group.name = 'wildlife';
  const instances = new Map<string, Instance>();
  const available = WILDLIFE_DEFINITIONS.filter(d => models.templates.has(d.model) &&
    ['idle', 'walk'].every(name => models.animations.get(d.model)?.some(a => a.name === name))).map(d => d.id);
  const projected = new THREE.Vector3();
  let inFrame = 0;
  let destroyed = false, lastTime: number | null = null, created = 0, released = 0;
  function remove(id: string) {
    const instance = instances.get(id); if (!instance) return;
    instance.mixer.stopAllAction(); instance.mixer.uncacheRoot(instance.model);
    instance.root.removeFromParent(); instance.root.clear();
    instance.skeletons.forEach(s => resources.releaseOwned(s));
    instance.materials.forEach(m => resources.releaseOwned(m));
    instances.delete(id); released++;
  }
  function add(view: WildlifeView) {
    const def = WILDLIFE_DEFINITIONS.find(d => d.id === view.definitionId)!;
    const root = new THREE.Group(), model = models.clone(def.model);
    root.name = view.id; root.userData.targetRef = view.targetRef; root.add(model);
    const materials = new Map<THREE.Material, THREE.Material>(), skeletons = new Set<THREE.Skeleton>(), meshes: THREE.Mesh[] = [];
    model.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) { skeletons.add(object.skeleton); object.frustumCulled = false; }
      if (object instanceof THREE.Mesh) {
        meshes.push(object);
        const use = (source: THREE.Material) => {
          if (!materials.has(source)) materials.set(source, resources.own(source.clone()));
          return materials.get(source)!;
        };
        object.material = Array.isArray(object.material) ? object.material.map(use) : use(object.material);
      }
    });
    const mixer = new THREE.AnimationMixer(model), clips = models.animations.get(def.model)!;
    const actions = { idle: mixer.clipAction(clips.find(c => c.name === 'idle')!), walk: mixer.clipAction(clips.find(c => c.name === 'walk')!) };
    actions.idle.play();
    instances.set(view.id, { root, model, mixer, actions, clip: 'idle', materials: [...materials.values()], skeletons: [...skeletons], meshes });
    group.add(root); created++;
  }
  return {
    group,
    available: () => [...available] as WildlifeDefinitionId[],
    update(views: readonly WildlifeView[], time: number, hour: number, camera: THREE.Camera, reducedMotion: boolean) {
      if (destroyed) return;
      const dt = lastTime === null ? 0 : Math.max(0, Math.min(.1, time - lastTime)); lastTime = time;
      inFrame = 0;
      const ids = new Set(views.map(v => v.id));
      for (const id of instances.keys()) if (!ids.has(id)) remove(id);
      for (const view of views) {
        if (!available.includes(view.definitionId)) continue;
        if (!instances.has(view.id)) add(view);
        const instance = instances.get(view.id)!;
        instance.root.position.set(view.x, view.y, view.z);
        instance.root.rotation.y = view.facing;
        // Inspection-hour overrides are visual only; they must not mutate the game clock.
        instance.root.visible = wildlifeDay(hour) && view.opacity > .001 && instance.root.position.distanceTo(camera.position) < 210;
        projected.set(view.x, view.y + .55, view.z).project(camera);
        if (instance.root.visible && Math.abs(projected.x) < .9 && Math.abs(projected.y) < .9 && projected.z > -1 && projected.z < 1) inFrame++;
        const clip = view.motionTag === 'wildlife.move' ? 'walk' : 'idle';
        if (clip !== instance.clip) {
          instance.actions[instance.clip].fadeOut(.12);
          instance.actions[clip].reset().fadeIn(.12).play(); instance.clip = clip;
        }
        const rate = clip === 'walk' ? Math.max(.65, Math.min(2.2, view.speed / 1.1)) : 1;
        instance.mixer.update(dt * rate);
        // Reduced-motion mode suppresses idle fidgeting, not ground locomotion or state changes.
        if (reducedMotion && clip === 'idle') { instance.actions.idle.time = 0; instance.mixer.update(0); }
        const fading = view.opacity < .999;
        for (const material of instance.materials) {
          if (material.transparent !== fading) { material.transparent = fading; material.depthWrite = !fading; material.needsUpdate = true; }
          material.opacity = view.opacity;
        }
        for (const mesh of instance.meshes) mesh.castShadow = !fading && instance.root.position.distanceTo(camera.position) < 60;
      }
    },
    stats: () => ({ active: instances.size, inFrame, visible: [...instances.values()].filter(i => i.root.visible).length,
      created, released, available: [...available], bones: instances.size * 16,
      ids: [...instances.keys()], destroyed }),
    dispose() {
      if (destroyed) return; destroyed = true; inFrame = 0;
      for (const id of [...instances.keys()]) remove(id);
      group.clear(); group.removeFromParent();
    },
  };
}
