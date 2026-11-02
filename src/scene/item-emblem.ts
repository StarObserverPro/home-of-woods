import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { Resources } from './resources.ts';
import { ITEM_EMBLEM, ITEM_VFX } from '../content/item-vfx.ts';
import type { EffectRarity } from '../content/item-vfx.ts';

/** Project onto real triangles in mesh-local space. The result rotates with the object, not the camera. */
export function createEmblemGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  if (bounds.isEmpty() || size.length() < .001) return new THREE.BufferGeometry();
  const temporaryMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const proxy = new THREE.Mesh(geometry, temporaryMaterial);
  proxy.updateMatrixWorld(true);
  const origin = new THREE.Vector3(center.x, bounds.max.y + size.length(), center.z);
  const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0)).intersectObject(proxy, false)[0];
  temporaryMaterial.dispose();
  if (!hit?.face) return new THREE.BufferGeometry();
  const normal = hit.face.normal.clone().normalize();
  if (normal.y < 0) normal.negate();
  const orientation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal));
  const diameter = Math.min(ITEM_EMBLEM.maxSize, Math.max(.02, Math.min(size.x, size.z) * ITEM_EMBLEM.sizeRatio));
  const decal = new DecalGeometry(proxy, hit.point, orientation, new THREE.Vector3(diameter, diameter, Math.max(.005, diameter * ITEM_EMBLEM.depthRatio)));
  // Single-sided sticker: keep only outward-facing triangles from the projector's target surface.
  const p = decal.getAttribute('position'), n = decal.getAttribute('normal'), uv = decal.getAttribute('uv');
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (let i = 0; i < (p?.count ?? 0); i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    if (b.clone().sub(a).cross(c.clone().sub(a)).normalize().dot(normal) < .25) continue;
    for (let j = i; j < i + 3; j++) {
      positions.push(p.getX(j), p.getY(j), p.getZ(j)); normals.push(n.getX(j), n.getY(j), n.getZ(j)); uvs.push(uv.getX(j), uv.getY(j));
    }
  }
  decal.dispose();
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.computeBoundingSphere();
  return result;
}

export function createEmblemFactory(resources: Resources, night: { value: number }) {
  const materials = new Map<EffectRarity, THREE.ShaderMaterial>();
  return {
    create(mesh: THREE.Mesh, rarity: EffectRarity) {
      const geometry = resources.geometry(`item-emblem:${mesh.geometry.uuid}`, () => createEmblemGeometry(mesh.geometry));
      if (!geometry.getAttribute('position')?.count) return null;
      let material = materials.get(rarity);
      if (!material) {
        material = resources.own(new THREE.ShaderMaterial({
          name: `rarity-${rarity}-static-emblem`, transparent: true, depthTest: true, depthWrite: false,
          side: THREE.FrontSide, blending: THREE.NormalBlending, toneMapped: false,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          uniforms: { uTint: { value: new THREE.Color(ITEM_VFX[rarity].tint) }, uNight: night },
          vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: `
            uniform vec3 uTint; uniform float uNight; varying vec2 vUv;
            void main() {
              vec2 p=abs(vUv*2.0-1.0);
              float shape=sqrt(p.x)+sqrt(p.y);
              float aa=max(fwidth(shape),.015);
              float alpha=1.0-smoothstep(1.0-aa,1.0+aa,shape);
              if(alpha<.005)discard;
              float edge=smoothstep(.79,.94,shape);
              vec3 color=mix(mix(uTint,vec3(1.0,.95,.85),.18),uTint*.28,edge);
              gl_FragColor=vec4(color*mix(.9,.6,uNight),alpha*.94);
              #include <colorspace_fragment>
            }`,
        }));
        materials.set(rarity, material);
      }
      const decal = new THREE.Mesh(geometry, material);
      decal.name = `rarity-emblem:${rarity}`; decal.raycast = () => {};
      decal.castShadow = decal.receiveShadow = false;
      return decal;
    },
    stats: () => ({ emblemMaterials: materials.size }),
    clear() { materials.clear(); },
  };
}
