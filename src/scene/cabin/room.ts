import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CABIN_EXTERIOR, CABIN_ROOM, CABIN_ROOF_REPAIR, CABIN_SCONCE, CABIN_WINDOW } from '../../content/cabin.ts';
import { cabinFloorPoint } from '../../domain/cabin.ts';
import { createAmbientOcclusion } from '../lighting/ambient-occlusion.ts';
import type { createSkySample } from '../lighting/sky-light.ts';
import { Resources } from '../resources.ts';
import { cabinEnvelopeVolumes } from './occlusion.ts';
import { CABIN_ROOM_PLAN, createCabinShell } from './shell.ts';

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_VIEW = { yaw: -2.59, elevation: .77, zoom: 1 };

function createWallLamp(resources: Resources) {
  const root = new THREE.Group();
  root.name = 'cabin-wall-lamp';
  root.position.set(CABIN_SCONCE.x, CABIN_SCONCE.y, CABIN_SCONCE.z);
  root.rotation.y = -Math.PI / 2;
  const metal = resources.material('#695441', .75);
  const glass = resources.own(new THREE.MeshStandardMaterial({ color: '#9c794f', roughness: .48 }));
  const box = (name: string, w: number, h: number, d: number, y: number, z: number, material = metal) => {
    const shape = resources.own(new RoundedBoxGeometry(w, h, d, 1, .025));
    const mesh = new THREE.Mesh(shape, material);
    mesh.name = name;
    mesh.position.set(0, y, z);
    root.add(mesh);
    return mesh;
  };
  box('lamp-wall-plate', .27, .72, .10, 0, .045);
  box('lamp-bracket', .12, .10, .33, -.24, .17);
  box('lamp-globe', .34, .45, .30, 0, .30, glass);
  box('lamp-base', .42, .10, .37, -.26, .30);
  box('lamp-cap', .43, .12, .38, .27, .30);
  const direction = new THREE.Vector3();
  root.updateMatrixWorld(true);
  const light = new THREE.PointLight('#ffb774', 0, 8, 2);
  light.position.copy(root.localToWorld(direction.set(0, 0, .44)));
  let lit = false;
  return {
    root, light,
    get lit() { return lit; },
    setLit(value: boolean) {
      lit = value;
      light.intensity = value ? 17 : 0;
      glass.emissive.set(value ? '#ffb55f' : '#000000');
      glass.emissiveIntensity = value ? 1.1 : 0;
    },
  };
}

/** A room owns its local scene and lights. The host supplies a renderer and one existing actor. */
export function createCabinRoom(cabinModel: THREE.Object3D) {
  const resources = new Resources();
  const scene = new THREE.Scene();
  scene.name = 'old-cabin-interior';
  scene.background = new THREE.Color('#292721');
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 110);
  const view = { ...DEFAULT_VIEW };
  const shell = createCabinShell(resources, { room: CABIN_ROOM, plan: CABIN_ROOM_PLAN, cutDoor: true, buildRoof: false });
  shell.setDoor(false, 1);
  scene.add(shell.root);

  const ambient = new THREE.HemisphereLight();
  const direction = new THREE.DirectionalLight();
  direction.castShadow = true;
  const shadow = direction.shadow;
  shadow.mapSize.set(1024, 1024);
  shadow.camera.left = shadow.camera.bottom = -11;
  shadow.camera.right = shadow.camera.top = 11;
  shadow.camera.near = .2;
  shadow.camera.far = 42;
  shadow.camera.updateProjectionMatrix();
  shadow.normalBias = .035;
  shadow.bias = -.00016;
  shadow.radius = 2;
  direction.target.position.set(0, 1, 0);
  const skyThroughWindow = new THREE.PointLight(undefined, 0, 6.5, 2);
  skyThroughWindow.position.set(CABIN_WINDOW.x, CABIN_WINDOW.bottom + CABIN_WINDOW.height / 2, CABIN_ROOM.depth / 2 - .33);
  const lamp = createWallLamp(resources);
  scene.add(ambient, direction, direction.target, skyThroughWindow, lamp.root, lamp.light);

  // Stable depth casters survive camera cutaways. Their draw writes depth only
  // in the light's pass; the color pass has both color and depth writes disabled.
  const envelope = new THREE.Group(), patchedRoof = new THREE.Group();
  envelope.name = 'cabin-shadow-envelope';
  patchedRoof.name = 'cabin-shadows-repaired-boards';
  envelope.add(patchedRoof);
  scene.add(envelope);
  const casterMaterial = resources.own(new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, shadowSide: THREE.DoubleSide,
  }));
  const cast = (part: THREE.Mesh, matrix: THREE.Matrix4, group: THREE.Group) => {
    const mesh = new THREE.Mesh(part.geometry, casterMaterial);
    mesh.name = part.name + ':shadow';
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.castShadow = true;
    group.add(mesh);
  };
  shell.root.updateMatrixWorld(true);
  shell.root.traverse(part => { part.castShadow = false; });
  for (const part of shell.shadowSolids) cast(part, part.matrixWorld, envelope);

  // Roof and window boards follow the asset used outside, including both repair patches.
  const { scale, threshold } = CABIN_EXTERIOR;
  const modelToRoom = new THREE.Matrix4().makeScale(scale, scale, scale);
  modelToRoom.setPosition(0, -threshold.y * scale, 0);
  cabinModel.updateWorldMatrix(true, true);
  cabinModel.traverse(part => {
    if (part instanceof THREE.Mesh && /^(roof_board|boarded_window)/.test(part.name)) {
      cast(part, modelToRoom.clone().multiply(part.matrixWorld), envelope);
    }
  });
  for (const repair of CABIN_ROOF_REPAIR) {
    const part = cabinModel.getObjectByName(repair.source);
    if (!(part instanceof THREE.Mesh)) throw new Error(`Missing room shadow source ${repair.source}`);
    const position = new THREE.Vector3().setFromMatrixPosition(part.matrixWorld);
    const matrix = part.matrixWorld.clone().setPosition(repair.x, position.y, repair.z);
    cast(part, modelToRoom.clone().multiply(matrix), patchedRoof);
  }

  const occlusion = createAmbientOcclusion(resources);
  occlusion.setVolumes(cabinEnvelopeVolumes(CABIN_ROOM, CABIN_ROOM_PLAN));
  occlusion.bind(shell.root);
  occlusion.bind(lamp.root);
  const floor = new THREE.Plane(UP, -CABIN_ROOM.floorY);
  const hit = new THREE.Vector3();
  const target = new THREE.Vector3(0, .86, .28);
  const localDirection = new THREE.Vector3();
  let frames = 0;
  let exposure = 1;
  let hour = 0;
  let skyNight = 0;
  let outdoorStrength = 0;
  const minZoom = .78, maxZoom = 1.9;

  return {
    scene, camera, view, occlusion,
    get exposure() { return exposure; },
    get lampOn() { return lamp.lit; },
    resetCamera() { Object.assign(view, DEFAULT_VIEW); },
    zoomBy(amount: number) { view.zoom = THREE.MathUtils.clamp(view.zoom * amount, minZoom, maxZoom); },
    orbit(dx: number, dy: number) {
      view.yaw -= dx;
      view.elevation = THREE.MathUtils.clamp(view.elevation + dy, .48, 1.12);
    },
    setLighting(sample: ReturnType<typeof createSkySample>, sourceHour: number) {
      hour = sourceHour;
      skyNight = sample.night;
      outdoorStrength = sample.sunIntensity;
      localDirection.copy(sample.sunDirection).applyAxisAngle(UP, -CABIN_EXTERIOR.yaw);
      direction.position.copy(direction.target.position).addScaledVector(localDirection, 23);
      direction.color.copy(sample.sunColor);
      direction.intensity = sample.sunIntensity * THREE.MathUtils.lerp(.24, .86, sample.day);
      ambient.color.copy(sample.skyColor).lerp(new THREE.Color('#fff0da'), .28);
      ambient.groundColor.copy(sample.groundColor).lerp(new THREE.Color('#796045'), .42);
      ambient.intensity = sample.ambientIntensity * THREE.MathUtils.lerp(.56, .88, sample.day);
      // The boarded front window leaks sky fill, even when the sun hits the back of the house.
      skyThroughWindow.color.copy(sample.skyColor);
      skyThroughWindow.intensity = sample.ambientIntensity * (.28 + 2.1 * sample.day);
      exposure = sample.recommendedExposure * 1.12;
      occlusion.setNight(sample.night);
    },
    setLamp(value: boolean) { lamp.setLit(value); },
    update(repairLevel: number) {
      patchedRoof.visible = repairLevel > 0;
      const fitHeight = Math.max(11.7, Math.hypot(CABIN_ROOM.width, CABIN_ROOM.depth + 1) * 1.04 / camera.aspect);
      const distance = fitHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * view.zoom);
      const { yaw, elevation } = view;
      camera.position.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation))
        .multiplyScalar(distance).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      shell.setCut('auto', camera.position);
      lamp.root.visible = !shell.isCut('east');
      frames++;
    },
    pick(ray: THREE.Raycaster) {
      const floorHit = ray.ray.intersectPlane(floor, hit);
      const floorDistance = floorHit ? ray.ray.origin.distanceTo(floorHit) : Infinity;
      if (lamp.root.visible && ray.intersectObject(lamp.root, true).some(result => result.distance < floorDistance)) return { kind: 'cabin-lamp' } as const;
      if (shell.doorPivot.visible && ray.intersectObject(shell.doorPivot, true).some(result => result.distance < floorDistance)) return { kind: 'cabin-door' } as const;
      if (!floorHit) return null;
      const { x, z } = floorHit;
      const atPorch = z >= CABIN_ROOM.depth / 2 - .13 && z <= CABIN_ROOM.depth / 2 + CABIN_ROOM.porchDepth && Math.abs(x - CABIN_ROOM.doorX) <= CABIN_ROOM.porchWidth / 2;
      if (atPorch) return { kind: 'cabin-door' } as const;
      if (Math.abs(x) > CABIN_ROOM.width / 2 || Math.abs(z) > CABIN_ROOM.depth / 2) return null;
      return { kind: 'move', ...cabinFloorPoint(floorHit) } as const;
    },
    stats() {
      return {
        frames, roofPatches: patchedRoof.visible ? CABIN_ROOF_REPAIR.length : 0,
        camera: { ...view, position: camera.position.toArray(), target: target.toArray() },
        shell: shell.stats(), resources: resources.stats(), occlusion: occlusion.stats(),
        light: { hour, skyNight, outdoorStrength, sun: direction.intensity, sky: ambient.intensity,
          direction: localDirection.toArray(), window: skyThroughWindow.intensity, lamp: lamp.light.intensity,
          shadowSize: shadow.mapSize.x, exposure },
      };
    },
    dispose() {
      occlusion.dispose();
      shadow.dispose();
      scene.clear();
      resources.dispose();
    },
  };
}
