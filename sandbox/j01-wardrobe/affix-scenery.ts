import * as THREE from 'three';
import type { AffixTriggerId } from '../../src/content/affix-vfx-library.ts';
import type { Resources } from '../../src/scene/resources.ts';
import { affixSites } from './affix-events.ts';

export function createAffixScenery(resources: Resources, stage: THREE.Scene) {
  const group = new THREE.Group();
  group.name = '词条条件 · 试衣间';
  stage.add(group);
  const water = new THREE.Group(), fire = new THREE.Group(), forage = new THREE.Group(), bench = new THREE.Group();
  group.add(water, fire, forage, bench);
  water.position.set(affixSites.creek.x, .020, affixSites.creek.z);
  fire.position.set(affixSites.fire.x, .013, affixSites.fire.z);
  forage.position.set(.23, 0, .30);
  bench.position.set(-.29, 0, .22);

  const sphere = resources.own(new THREE.IcosahedronGeometry(1, 0));
  const box = resources.own(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = resources.own(new THREE.CylinderGeometry(.74, 1, 1, 7));
  function object(parent: THREE.Group, shape: THREE.BufferGeometry, color: string, at: number[], size: number[]) {
    const mesh = new THREE.Mesh(shape, resources.material(color, .88));
    mesh.position.fromArray(at);
    mesh.scale.fromArray(size);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  const pool = object(water, sphere, '#426f7b', [-.11, 0, .015], [.24, .026, .38]);
  pool.rotation.y = .31;
  for (let i = 0; i < 5; i++) {
    const shore = object(water, sphere, i % 2 === 0 ? '#828575' : '#656e62',
      [.01 - .018 * i, .018, .09 * (i - 2)], [.067, .046 + i * .008, .077]);
    shore.rotation.y = i * .82;
    object(water, sphere, '#85b4b7', [-.16 - .018 * i, .024, .110 * (i - 2)], [.067 - i * .006, .004, .011]);
  }

  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    const rock = object(fire, sphere, i % 2 ? '#606060' : '#7a7770',
      [Math.sin(a) * .117, .031, Math.cos(a) * .110], [.065, .039, .054]);
    rock.rotation.y = a;
  }
  for (let i = 0; i < 3; i++) {
    object(fire, box, '#463127', [0, .037, .012], [.165, .033, .035]).rotation.y = i * 2.05;
  }
  const coals = [object(fire, sphere, '#d17a43', [0, .103, 0], [.063, .105, .068]),
    object(fire, sphere, '#edbe69', [.019, .152, -.013], [.041, .112, .037])];
  const lamp = new THREE.PointLight('#ec9853', .23, 1.6, 2);
  lamp.position.y = .19;
  fire.add(lamp);

  object(forage, cylinder, '#826a4d', [0, .12, 0], [.069, .24, .069]);
  const sprig = new THREE.Group();
  sprig.position.y = .245;
  forage.add(sprig);
  object(sprig, box, '#8d925a', [0, .075, 0], [.012, .155, .012]).rotation.z = -.19;
  for (let i = 0; i < 4; i++) {
    const sign = i % 2 ? 1 : -1;
    object(sprig, sphere, i % 2 ? '#8ba863' : '#728f52', [sign * .032, .052 + i * .028, 0], [.043, .011, .026]).rotation.z = sign * .61;
  }

  for (const x of [-.077, .077]) for (const z of [-.046, .046])
    object(bench, box, '#694b37', [x, .20, z], [.037, .40, .037]);
  object(bench, box, '#9c7756', [0, .42, 0], [.235, .052, .151]);
  const blank = object(bench, box, '#866b4c', [0, .455, .007], [.142, .030, .060]);
  const finished = object(bench, cylinder, '#b28b5e', [0, .458, .007], [.049, .033, .049]);

  const rainGeometry = resources.own(new THREE.BufferGeometry());
  const rainPositions = new THREE.BufferAttribute(new Float32Array(72 * 6), 3).setUsage(THREE.DynamicDrawUsage);
  rainGeometry.setAttribute('position', rainPositions);
  const rain = new THREE.LineSegments(rainGeometry, resources.own(new THREE.LineBasicMaterial({
    color: '#bccbd0', transparent: true, opacity: .25, depthWrite: false,
  })));
  rain.frustumCulled = false;
  stage.add(rain);

  function update(id: AffixTriggerId | null, raining: boolean, seconds: number, working = false) {
    water.visible = id === 'place.riverside';
    fire.visible = id === 'place.campfire';
    forage.visible = id === 'action.gather-done';
    bench.visible = id === 'action.craft-done';
    sprig.visible = working;
    blank.visible = working;
    finished.visible = !working;
    if (fire.visible) {
      coals[0].scale.y = .099 + .016 * Math.sin(seconds * 13);
      coals[1].scale.y = .093 + .022 * Math.sin(seconds * 9 + 1.2);
      lamp.intensity = .26 + .04 * Math.sin(seconds * 18);
    }
    rain.visible = raining;
    if (!raining) return;
    for (let i = 0; i < 72; i++) {
      const y = 2.14 * (((i * 53 % 103) / 103 - seconds * 1.75) % 1 + 1) % 2.14;
      const x = (i * 83 % 101 / 101 - .5) * 2.15 + (y - 1) * .1;
      const z = (i * 37 % 97 / 97 - .5) * 1.1;
      rainPositions.setXYZ(i * 2, x, y, z).setXYZ(i * 2 + 1, x + .011, y + .065, z);
    }
    rainPositions.needsUpdate = true;
  }

  update(null, false, 0);
  return { update };
}
