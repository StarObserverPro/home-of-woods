import * as THREE from 'three';
import { TENT_FURNISHINGS, TENT_SCALE, TENT_SHAPE } from '../../content/tent.ts';
import type { TentCanvasVariant, TentDebugMode } from '../../content/tent.ts';
import { TENT_ROOM } from '../../content/tent-room.ts';
import { tentFloorPoint } from '../../domain/tent.ts';
import { floorOccluder } from '../../world/occlusion.ts';
import type { OcclusionVolume } from '../../world/occlusion.ts';
import { createAmbientOcclusion } from '../lighting/ambient-occlusion.ts';
import { createInteriorLighting } from '../lighting/interior-lighting.ts';
import type { createSkySample } from '../lighting/sky-light.ts';
import { Resources } from '../resources.ts';
import { createTentExterior } from './exterior.ts';

const DEFAULT_VIEW = { yaw: -.52, elevation: .65, zoom: 1 };

/** The same cloth and belongings in a separate room. Camera-side canvas cuts
 * away for play while the complete shell still owns the light's depth pass. */
export function createTentRoom() {
  const resources = new Resources();
  const scene = new THREE.Scene(); scene.name = TENT_ROOM.id;
  scene.background = new THREE.Color('#272a28');
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  const view = { ...DEFAULT_VIEW };
  const tent = createTentExterior(resources);
  tent.group.scale.setScalar(TENT_SCALE); scene.add(tent.group);
  tent.group.updateMatrixWorld(true);

  const envelope = new THREE.Group(); envelope.name = 'tent-interior-shadow-envelope'; scene.add(envelope);
  const casterMaterial = resources.own(new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide,
  }));
  const shadowSources = [...Object.values(tent.panels),
    tent.group.getObjectByName('tent:door-curtain-lowered') as THREE.Mesh,
    tent.group.getObjectByName('tent:door-curtain-gathered') as THREE.Mesh];
  const casters = shadowSources.map(source => {
    const copy = new THREE.Mesh(source.geometry, casterMaterial);
    copy.name = source.name + ':shadow'; copy.matrixAutoUpdate = false;
    copy.matrix.copy(source.matrixWorld); copy.castShadow = true; envelope.add(copy);
    source.castShadow = false; return { source, copy };
  });
  const lighting = createInteriorLighting(scene, new THREE.Vector3(0, 3.2, TENT_SHAPE.doorZ * TENT_SCALE - .2));
  const occlusion = createAmbientOcclusion(resources);
  const floorY = TENT_ROOM.floorY;
  const volumes: OcclusionVolume[] = [
    { id: 'tent:enclosure', center: [0, 1.3, -.5], halfSize: [3.1, 1.2, 2.8], yaw: 0,
      softness: .7, strength: .16, detail: false },
  ];
  for (const [id, spec] of Object.entries(TENT_FURNISHINGS)) {
    const width = 'width' in spec ? spec.width : spec.radius * 2;
    const depth = 'length' in spec ? spec.length : spec.radius * 2;
    volumes.push(...floorOccluder(`tent:${id}:contact`,spec.x*TENT_SCALE,floorY,spec.z*TENT_SCALE,
      width*TENT_SCALE,spec.height*TENT_SCALE,depth*TENT_SCALE));
  }
  occlusion.setVolumes(volumes); occlusion.bind(tent.group);
  const target = new THREE.Vector3(0, 1.35, .1);
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const hit = new THREE.Vector3();
  let doorOpen = true, frames = 0, disposed = false;
  let cutWalls: string[] = [];

  return {
    scene, camera, view, occlusion,
    get exposure() { return lighting.exposure; },
    setDoorOpen(value: boolean) { doorOpen = value; tent.setDoorOpen(value, true); lighting.setOpening(value); },
    setCanvasVariant(value: TentCanvasVariant) { tent.setCanvasVariant(value); },
    setDebugMode(value: TentDebugMode) { tent.setDebugMode(value); occlusion.bind(tent.group); },
    resetCamera() { Object.assign(view, DEFAULT_VIEW); },
    zoomBy(amount: number) { view.zoom = THREE.MathUtils.clamp(view.zoom * amount, .8, 1.7); },
    orbit(dx: number, dy: number) {
      view.yaw -= dx; view.elevation = THREE.MathUtils.clamp(view.elevation + dy, .42, 1.08);
    },
    setLighting(sample: ReturnType<typeof createSkySample>, hour: number) {
      lighting.setSky(sample, hour); occlusion.setNight(sample.night);
    },
    update(time: number, dt: number, reducedMotion: boolean) {
      if (disposed) return;
      tent.update({ time, delta: dt, reducedMotion, windStrength: .25 });
      const fitHeight = Math.max(10.6, TENT_ROOM.width * 1.16 / camera.aspect);
      const distance = fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * view.zoom);
      const { yaw, elevation } = view;
      camera.position.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation))
        .multiplyScalar(distance).add(target);
      camera.lookAt(target); camera.updateMatrixWorld(true);
      const cutLeft = camera.position.x < -.4, cutRight = camera.position.x > .4;
      const cutFront = camera.position.z > -.4, cutBack = !cutFront;
      const cuts = { left: cutLeft, right: cutRight, front: cutFront, back: cutBack };
      for (const [key, mesh] of Object.entries(tent.panels)) mesh.visible = !cuts[key as keyof typeof cuts];
      cutWalls = Object.entries(cuts).filter(([, cut]) => cut).map(([name]) => name);
      // Canvas cutaways are a camera view only; door openness still controls its shadow.
      for (const { source, copy } of casters) copy.visible = source.name.includes('lowered') ? !doorOpen
        : source.name.includes('gathered') ? doorOpen : true;
      frames++;
    },
    pick(ray: THREE.Raycaster) {
      const floorHit = ray.ray.intersectPlane(floor, hit);
      const floorDistance = floorHit ? ray.ray.origin.distanceTo(floorHit) : Infinity;
      if (ray.intersectObjects(tent.doorTargets, true).some(result => result.distance < floorDistance)) return { kind: 'tent-door' } as const;
      if (!floorHit) return null;
      const { x, z } = floorHit;
      if (z > TENT_ROOM.depth / 2 - .35 && z < TENT_ROOM.depth / 2 + 1.2 && Math.abs(x) < 1.8) return { kind: 'tent-door' } as const;
      if (Math.abs(x) > TENT_ROOM.width / 2 || Math.abs(z) > TENT_ROOM.depth / 2) return null;
      return { kind: 'move', ...tentFloorPoint(floorHit) } as const;
    },
    stats() {
      return { id: TENT_ROOM.id, parentId: TENT_ROOM.parentId, frames, doorOpen, cutWalls,
        camera: { ...view, fov: camera.fov, aspect: camera.aspect, position: camera.position.toArray(), target: target.toArray() },
        resources: resources.stats(), occlusion: occlusion.stats(), light: lighting.stats(), tent: tent.stats() };
    },
    dispose() {
      if (disposed) return; disposed = true;
      occlusion.dispose(); lighting.dispose(); scene.clear(); resources.dispose();
    },
  };
}
