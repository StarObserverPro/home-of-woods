import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TENT_SHAPE as S, TENT_CLOTH as C, TENT_HANGING_SOCKETS } from '../../content/tent.ts';
import type { TentCanvasVariant, TentDebugMode } from '../../content/tent.ts';
import type { Resources } from '../resources.ts';
import { createTentMaterials } from './material.ts';
import { createTentFurnishings } from './props.ts';
import { mergeTentParts, tentCurtainGeometry, tentDoorOutline, tentEndGeometry, tentRod, tentRoofGeometry, tentRoofPoint, tentTube } from './geometry.ts';

export type TentFrame = {
  time: number; delta: number; reducedMotion: boolean;
  windStrength?: number; windDirection?: { x: number; z: number };
};

/** One small, thick canvas shell. The caller owns placement, its clock and all
 * Resources; this module creates no loop, renderer, lights or persistent state. */
export function createTentExterior(r: Resources) {
  const group = new THREE.Group(); group.name = 'felt-camp-tent'; group.userData.authoredTent = true;
  const materials = createTentMaterials(r), originals = new Map<THREE.Mesh, THREE.Material>();
  const make = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(r.own(geometry), material); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); originals.set(mesh, material);
    mesh.userData.tentDynamicMaterial = true; return mesh;
  };
  const panels = {
    left: make('felt-canvas:left', tentRoofGeometry(-1), materials.cloth),
    right: make('felt-canvas:right', tentRoofGeometry(1), materials.cloth),
    front: make('felt-canvas:front-open-arch', tentEndGeometry(true), materials.cloth),
    back: make('felt-canvas:back', tentEndGeometry(false), materials.cloth),
  };
  for (const [side, mesh] of Object.entries(panels)) mesh.userData.tentPanel = side;
  const floor = make('groundsheet', new RoundedBoxGeometry(S.halfWidth * 2, .08, S.halfDepth * 2, 1, .028), materials.floor);
  floor.position.y = S.floorY - .04;

  const supportGeometry: THREE.BufferGeometry[] = [];
  for (const z of [-S.halfDepth - .04, S.halfDepth + .04]) for (const side of [-1, 1] as const) {
    supportGeometry.push(tentRod([side * 2.70, .10, z], [0, 3.94, z], .069));
  }
  supportGeometry.push(tentRod([0, 3.94, -2.75], [0, 3.94, 2.75], .075));
  supportGeometry.push(tentRod([0, 0, -3.7], [0, .34, -3.62], .05));
  make('tent:fixed-timber-frame-and-pegs', mergeTentParts(supportGeometry), materials.wood);

  const bindings: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    for (const along of [0, 1]) {
      const points = Array.from({ length: 11 }, (_, i) => tentRoofPoint(side, i / 10, along)
        .add(new THREE.Vector3(0, .012, along ? .014 : -.014)).toArray());
      bindings.push(tentTube(points, .022, 14));
    }
    bindings.push(tentTube(Array.from({ length: 17 }, (_, i) => tentRoofPoint(side, 1, i / 16).toArray()), .022, 16));
  }
  const archPoints = tentDoorOutline().getPoints(8).slice(0, -1).map(p => [p.x, p.y, S.doorZ + .007] as const);
  bindings.push(tentTube(archPoints, .024, 32));
  make('tent:stitched-bindings', mergeTentParts(bindings), materials.binding);

  const ropes: THREE.BufferGeometry[] = [];
  // The front A-frame carries the entrance; only the rear ridge needs a guy.
  // There is no waist-height line or peg crossing the walk-in doorway.
  ropes.push(tentTube([[0, 3.91, -2.70], [0, 1.82, -3.24], [0, .23, -3.75]], .016, 8));
  make('tent:ridge-guy-lines', mergeTentParts(ropes), materials.binding);

  const sockets = new Map<string, THREE.Object3D>(), loops: THREE.BufferGeometry[] = [];
  for (const definition of TENT_HANGING_SOCKETS) {
    const anchor = new THREE.Object3D(); anchor.name = definition.id;
    anchor.position.set(definition.x, definition.y, definition.z); anchor.userData.attachmentSlotId = definition.id;
    anchor.userData.maxDecorationRadius = .20; group.add(anchor); sockets.set(definition.id, anchor);
    const { x, y, z } = definition;
    // Short knotted tie loops are present before anything has been installed.
    loops.push(tentTube([[x - .075, y + .08, z], [x - .09, y - .09, z + .025],
      [x, y - .17, z + .035], [x + .09, y - .09, z + .025], [x + .075, y + .08, z]], .019, 12));
  }
  make('tent:three-empty-hanging-loops', mergeTentParts(loops), materials.binding);

  const curtain = make('tent:door-curtain-lowered', tentCurtainGeometry(), materials.cloth);
  const raised = make('tent:door-curtain-gathered', tentTube([[-.73, 2.68, 2.53], [-.40, 2.94, 2.53],
    [0, 3.06, 2.53], [.40, 2.94, 2.53], [.73, 2.68, 2.53]], .115, 24), materials.lining);
  const doorway = new THREE.Mesh(r.own(new THREE.ShapeGeometry(tentDoorOutline(), 6)), r.own(new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
  })));
  doorway.name = 'tent:door-hit-target'; doorway.position.z = S.doorZ + .10;
  doorway.userData.tentDoor = true; doorway.userData.tentDynamicMaterial = true; group.add(doorway);
  const furnishings = createTentFurnishings(r); group.add(furnishings);
  furnishings.traverse(object => { if (object instanceof THREE.Mesh) { originals.set(object, object.material as THREE.Material); object.userData.tentDynamicMaterial = true; } });

  const clothMeshes = [panels.left, panels.right];
  const rest = clothMeshes.map(mesh => Float32Array.from(mesh.geometry.getAttribute('position').array));
  let open = true, variant: TentCanvasVariant = 'warm', debugMode: TentDebugMode = 'final', lastWindTime = -Infinity;
  let displacement = 0, lastReduced = false, sampledWindStrength = 0;
  const clay = r.own(new THREE.MeshStandardMaterial({ color: '#c7bcaa', roughness: .96, side: THREE.DoubleSide }));
  const normals = r.own(new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }));
  const wireframe = r.own(new THREE.MeshBasicMaterial({ color: '#e6d6b1', wireframe: true, side: THREE.DoubleSide }));
  curtain.visible = false; raised.visible = true;

  function setDoorOpen(value: boolean, _immediate = false) {
    open = value; curtain.visible = !open; raised.visible = open;
  }
  return {
    group, panels, furnishings, sockets, doorTargets: [doorway],
    setDoorOpen,
    setCanvasVariant(value: TentCanvasVariant) { variant = value; materials.setVariant(value); },
    setDebugMode(value: TentDebugMode) {
      debugMode = value;
      for (const [mesh, material] of originals) {
        mesh.material = value === 'clay' ? clay : value === 'normals' ? normals : value === 'wireframe' ? wireframe : material;
      }
    },
    update(frame: TentFrame) {
      const time = Number.isFinite(frame.time) ? frame.time : 0;
      const force = frame.reducedMotion !== lastReduced || time < lastWindTime;
      if (!force && time - lastWindTime < 1 / C.windUpdatesPerSecond) return;
      lastWindTime = time; lastReduced = frame.reducedMotion;
      const strength = Number.isFinite(frame.windStrength) ? frame.windStrength! : .45;
      const wind = frame.reducedMotion ? 0 : Math.max(0, Math.min(1, strength));
      const direction = frame.windDirection && Number.isFinite(frame.windDirection.x) && Number.isFinite(frame.windDirection.z)
        ? frame.windDirection : { x: .8, z: .3 };
      const length = Math.hypot(direction.x, direction.z) || 1, dx = direction.x / length, dz = direction.z / length;
      displacement = 0; sampledWindStrength = wind;
      for (let meshIndex = 0; meshIndex < clothMeshes.length; meshIndex++) {
        const geometry = clothMeshes[meshIndex].geometry, position = geometry.getAttribute('position');
        const weights = geometry.getAttribute('tentWindWeight'), base = rest[meshIndex];
        for (let i = 0; i < position.count; i++) {
          const k = i * 3, x = base[k], y = base[k + 1], z = base[k + 2], weight = weights.getX(i);
          const wave = (.72 * Math.sin(time * 1.32 + z * 1.25 + meshIndex * .7)
            + .28 * Math.sin(time * 2.18 - x * 2.0 + z * .52)) * C.maxWindDisplacement * wind * weight;
          position.setXYZ(i, x + wave * dx, y + wave * .34, z + wave * dz * .42);
          displacement = Math.max(displacement, Math.abs(wave));
        }
        position.needsUpdate = true; geometry.computeVertexNormals();
      }
    },
    stats() {
      let triangles = 0, meshes = 0;
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes++; triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      });
      return { doorOpen: open, variant, debugMode, triangles, meshes, textureCount: materials.textureCount,
        textureBytes: materials.textureBytes, windDisplacement: displacement, sampledWindStrength,
        maxWindDisplacement: C.maxWindDisplacement, windVertices: rest.reduce((sum, vertices) => sum + vertices.length / 3, 0),
        hangingSlots: [...sockets.keys()], furnishings: ['sleeping-bag', 'small-drum', 'singing-bowl'] };
    },
  };
}

export { createTentFurnishings } from './props.ts';
