import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TENT_FURNISHINGS as F, TENT_SHAPE as S } from '../../content/tent.ts';
import type { Resources } from '../resources.ts';
import { mergeTentParts, tentRod, tentTube } from './geometry.ts';

/** The exterior doorway and the room use the exact same local furniture layout.
 * These are decorative belongings; they do not mint inventory items on entry. */
export function createTentFurnishings(r: Resources) {
  const group = new THREE.Group(); group.name = 'tent-belongings';
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const result = new THREE.Mesh(r.own(geometry), material); result.name = name;
    result.castShadow = result.receiveShadow = true; group.add(result); return result;
  };
  const bagMaterial = r.own(new THREE.MeshPhysicalMaterial({ color: '#4d7374', roughness: .97,
    sheen: .45, sheenColor: '#abc1b3', sheenRoughness: 1 }));
  const bag = F.sleepingBag, bagGeometry = new RoundedBoxGeometry(bag.width, bag.height, bag.length, 2, .14);
  const p = bagGeometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const taper = 1 - .22 * (p.getZ(i) / bag.length + .5);
    p.setX(i, p.getX(i) * taper);
    if (p.getY(i) > 0) p.setY(i, p.getY(i) + Math.sin((p.getZ(i) + 1.4) * Math.PI * 2.1) * .012);
  }
  bagGeometry.computeVertexNormals();
  mesh('tent:sleeping-bag', bagGeometry, bagMaterial).position.set(bag.x, S.floorY + bag.height / 2 + .015, bag.z);
  const pillow = mesh('tent:sleeping-bag:hood-pillow', new RoundedBoxGeometry(.73, .17, .55, 2, .08), r.material('#d0bd91', .98));
  pillow.position.set(bag.x, S.floorY + bag.height + .025, bag.z - bag.length * .34);
  const seams: THREE.BufferGeometry[] = [];
  for (const z of [-.80, -.30, .22, .70, 1.10]) {
    const w = bag.width * .41 * (1 - .22 * ((z - bag.z) / bag.length + .5));
    seams.push(tentTube([[bag.x - w, S.floorY + .22, z], [bag.x, S.floorY + .325, z - .015],
      [bag.x + w, S.floorY + .22, z]], .009, 8));
  }
  // A narrow zipper follows the right seam, visibly distinct from the quilting.
  seams.push(tentTube([[bag.x + .46, S.floorY + .22, -1.05], [bag.x + .44, S.floorY + .24, .05],
    [bag.x + .34, S.floorY + .20, 1.05]], .012, 12));
  mesh('tent:sleeping-bag:quilting', mergeTentParts(seams), r.material('#8da5a0', .98));

  const drum = F.drum, drumBase = S.floorY + .015;
  const profile = [[0, 0], [.22, 0], [.27, .035], [.29, .11], [.31, .48], [.34, .62], [.33, .68],
    [.30, .68], [.30, .62], [.26, .11], [.22, .035], [0, .035]];
  mesh('tent:small-drum:body', new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 12), r.material('#87523b', .9))
    .position.set(drum.x, drumBase, drum.z);
  const skin = mesh('tent:small-drum:skin', new THREE.CylinderGeometry(.326, .328, .035, 16), r.material('#dbc594', .97));
  skin.position.set(drum.x, drumBase + drum.height - .03, drum.z);
  const laces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, b = (i + .5) / 10 * Math.PI * 2;
    laces.push(tentRod([drum.x + Math.sin(a) * .335, drumBase + .62, drum.z + Math.cos(a) * .335],
      [drum.x + Math.sin(b) * .275, drumBase + .075, drum.z + Math.cos(b) * .275], .013, 5));
  }
  for (const [radius, y] of [[.336, .680], [.272, .075]]) {
    const rim = new THREE.TorusGeometry(radius, .022, 4, 16); rim.rotateX(Math.PI / 2);
    rim.translate(drum.x, drumBase + y, drum.z); laces.push(rim);
  }
  mesh('tent:small-drum:lacing-and-rims', mergeTentParts(laces), r.material('#d0b17c', .96));

  const bowl = F.bowl;
  const cushion = mesh('tent:singing-bowl:cushion', new RoundedBoxGeometry(.66, .08, .62, 2, .035), r.material('#9b5041', .98));
  cushion.position.set(bowl.x, S.floorY + .04, bowl.z);
  // One revolved wall includes both the outside and inside and a rounded lip.
  const bowlProfile = [[0, .02], [.10, .02], [.19, .04], [.25, .09], [.292, .17], [.30, .205],
    [.296, .22], [.28, .22], [.274, .20], [.25, .12], [.19, .065], [.10, .05], [0, .05]];
  const bronze = r.own(new THREE.MeshStandardMaterial({ color: '#b99752', roughness: .43, metalness: .7 }));
  mesh('tent:singing-bowl', new THREE.LatheGeometry(bowlProfile.map(([x, y]) => new THREE.Vector2(x, y)), 20), bronze)
    .position.set(bowl.x, S.floorY + .08, bowl.z);
  mesh('tent:singing-bowl:mallet', tentRod([bowl.x + .40, S.floorY + .065, bowl.z - .26],
    [bowl.x + .44, S.floorY + .065, bowl.z + .25], .037), r.material('#704c31', .86));
  return group;
}
