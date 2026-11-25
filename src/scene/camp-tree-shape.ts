import * as THREE from 'three';
import { CAMP_TREE_SPECIES, CAMP_WOODLAND_DIMENSIONS } from '../content/camp-woodland.ts';
import type { CampTreeForm } from '../content/camp-woodland.ts';
import { campTreeDimensions } from '../world/tree-dimensions.ts';
import { V, VegetationBuilder, vegetationNoise } from './expedition-vegetation-geometry.ts';

type Segment = { a: number[]; b: number[]; radius: number };
const TAU = 2 * Math.PI;

/** Closed, faceted bough of needles with a broad shoulder, ridge and drooping tip. */
function spray(leaves: VegetationBuilder, from: THREE.Vector3, tip: THREE.Vector3,
  width: number, thickness: number, colour: THREE.Color, variation: number) {
  const lateral = V(tip.z - from.z, 0, from.x - tip.x).normalize();
  const positions: number[] = [], indices: number[] = [];
  const sections = [[0, .06], [.28, .72], [.54, 1], [1, .025]];
  for (const [t, flare] of sections) {
    const p = from.clone().lerp(tip, t);
    p.y += Math.sin(t * Math.PI) * thickness * (.26 + variation * .30);
    positions.push(
      ...p.clone().addScaledVector(lateral, width * flare * (.85 + variation * .26)).toArray(),
      ...p.clone().addScaledVector(lateral, width * flare * .41).add(V(0, thickness * flare * .82, 0)).toArray(),
      ...p.clone().addScaledVector(lateral, -width * flare * .31).add(V(0, thickness * flare * .94, 0)).toArray(),
      ...p.clone().addScaledVector(lateral, -width * flare).toArray(),
      ...p.clone().addScaledVector(lateral, -width * flare * .45).add(V(0, -thickness * flare * .36, 0)).toArray(),
      ...p.clone().addScaledVector(lateral, width * flare * .40).add(V(0, -thickness * flare * .39, 0)).toArray(),
    );
  }
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < 6; side++) {
      const a = ring * 6 + side, b = ring * 6 + (side + 1) % 6;
      indices.push(a, b, a + 6, b, b + 6, a + 6);
    }
  }
  const end = (sections.length - 1) * 6;
  for (let side = 1; side < 5; side++) indices.push(0, side + 1, side, end, end + side, end + side + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  leaves.add(geometry, colour);
}

export function makeCampTreeShape(form: CampTreeForm, seed: number, distant: boolean) {
  const profile = CAMP_TREE_SPECIES[form.species], dimensions = campTreeDimensions(form);
  // The action-tree adapter applies its standard .74 model scale and cut collar.
  const scale = form.layer === 'pole' ? 1 / .74 : 1;
  const height = dimensions.height * scale, radius = dimensions.radius * scale, crown = dimensions.crown * scale;
  const quality = distant ? 'far' : 'near';
  const trunk = new VegetationBuilder(quality), branches = new VegetationBuilder(quality);
  const roots = new VegetationBuilder(quality), leaves = new VegetationBuilder(quality);
  const root = new THREE.Group(), segments: Segment[] = [];
  const rng = (i: number) => vegetationNoise(seed + i * 103);
  const tint = (i: number) => new THREE.Color(profile.leaf).offsetHSL((rng(i + 512) - .5) * .027, 0, (rng(i + 718) - .48) * .115);
  const lean = (rng(9) - .5) * crown * .32;
  const stemAt = (t: number) => V(lean * t * t, t * height, Math.sin(t * Math.PI) * lean * .31);
  const addLimb = (points: THREE.Vector3[], radii: number[]) => {
    branches.branch(points, radii, profile.bark, 1, distant ? 4 : 6);
    for (let i = 1; i < points.length; i++)
      segments.push({ a: points[i - 1].toArray(), b: points[i].toArray(), radius: radii[i - 1] });
  };
  const conifer = profile.kind === 'pine', hemlock = form.species === 'hemlock', cedar = form.species === 'redcedar';
  const oldFir = form.species === 'douglas-fir' && form.layer === 'old-growth';
  const point = (a: number, r: number, y: number) => V(Math.cos(a) * r, y, Math.sin(a) * r);
  const stemTop = conifer ? .976 : .79;
  const referenceHeight = Math.min(CAMP_WOODLAND_DIMENSIONS.breastHeight * scale, height * .26);
  trunk.branch(
    [V(0, -Math.max(.55, radius), 0), V(0, .07, 0), V(0, referenceHeight, 0),
      stemAt(.28), stemAt(.47), stemAt(.69), stemAt(stemTop)],
    [radius * 1.35, radius * 1.22, radius, radius * .83, radius * .63, radius * .39, radius * .045],
    profile.bark, 1, distant ? 7 : 10,
  );
  if (form.layer !== 'pole') {
    for (let i = 0; i < (distant ? 4 : 6); i++) {
      const a = (i + rng(208 + i) * .42) * TAU / (distant ? 4 : 6);
      const reach = radius * (1.9 + rng(i + 180) * 1.0);
      roots.branch([point(a, radius * .57, radius * 1.7), point(a, radius * 1.22, radius * .34),
        point(a, reach * .77, -reach * .42), point(a, reach, -reach * .85)],
      [radius * .47, radius * .31, radius * .135, radius * .025], profile.bark, 1, distant ? 4 : 6);
    }
  }
  if (conifer) {
    const levels = form.layer === 'young' || form.layer === 'pole' ? 5 : form.layer === 'midstory' ? 6 : oldFir ? 8 : 7;
    const fanCount = cedar ? 4 : 3;
    for (let i = 0; i < levels; i++) {
      const t = i / (levels - 1);
      const crownHeight = dimensions.crownBase + (.952 - dimensions.crownBase) * (1 - (1 - t) ** 1.24);
      for (let j = 0; j < fanCount; j++) {
        const slot = i * 7 + j;
        const a = i * 2.399963 + (j + rng(slot) * .41) * TAU / fanCount;
        const span = crown * (.80 - .62 * t) * (.82 + rng(slot + 27) * .28);
        const start = stemAt(crownHeight + (rng(slot + 240) - .5) * .055);
        const dip = span * (cedar ? .28 : hemlock ? .24 : .075);
        const end = start.clone().add(point(a, span, -dip));
        const elbow = start.clone().add(point(a + .06, span * .50, dip * .29));
        if (!distant || i % 2 === 0) addLimb([start, elbow, end],
          [radius * (.22 - .135 * t), radius * .075 * (1 - .55 * t), radius * .012]);
        const thickness = span * (oldFir ? .145 : .16) + height * .008;
        spray(leaves, start.clone().lerp(elbow, .55), end, span * (cedar ? .39 : .33), thickness, tint(slot), rng(slot + 21));
        if (!distant && i < levels - 2) {
          for (const side of [-1, 1]) {
            const twig = start.clone().lerp(elbow, .74 + side * .11);
            const tip = twig.clone().add(point(a + side * (.53 + rng(slot + 187 + side) * .24), span * (.45 + .19 * rng(slot + 204 + side)), -dip * .86));
            spray(leaves, twig, tip, span * .21, thickness * .54, tint(slot + 83 + side * 5), rng(slot + side));
          }
        }
      }
    }
    const top = stemAt(.982), topTiers = distant ? 2 : 3;
    for (let level = 0; level < topTiers; level++) {
      const centre = stemAt(.935 + level * .018);
      for (let side = 0; side < 3; side++) {
        const a = (side + level * .53) * TAU / 3;
        const down = centre.clone().add(point(a, crown * (.19 - level * .047), -height * .021));
        spray(leaves, centre.clone().lerp(top, .42), down,
          crown * (.095 - level * .018), height * .018, tint(310 + level * 3 + side), rng(468 + side));
      }
    }
    if (hemlock) {
      const arch = top.clone().add(V(crown * .075, height * .008, 0));
      const tip = top.clone().add(V(crown * .20, -height * .011, crown * .028));
      addLimb([stemAt(.95), arch, tip],[radius * .066, radius * .031, radius * .008]);
      spray(leaves, top.clone().add(V(-crown * .06, -.03, 0)), tip, crown * .073, height * .015, tint(319), .5);
    }
    if (oldFir) for (let i = 0; i < 5; i++) {
      const a = i * 2.399963 + rng(i);
      const from = stemAt(.24 + i * .053), reach = radius * (1.25 + rng(i + 164) * .75);
      addLimb([from, from.clone().add(point(a, reach * .77, .08)), from.clone().add(point(a + .1, reach, .24))],
        [radius * .16, radius * .09, radius * .036]);
    }
  } else {
    const maple = form.species === 'bigleaf-maple';
    const limbs = maple ? 6 : 5;
    for (let i = 0; i < limbs; i++) {
      const a = (i + (rng(i + 40) - .5) * .58) * TAU / limbs;
      const reach = crown * (.55 + rng(i + 91) * .19);
      const start = stemAt(dimensions.crownBase - .14 + rng(i + 64) * .22);
      const elbow = point(a - .13, reach * .36, height * (.61 + rng(i + 22) * .10));
      const tip = point(a + .14, reach, height * (.76 + rng(i + 37) * .13));
      const thick = radius * (maple ? .44 : .33) * (.86 + rng(i) * .29);
      addLimb([start, elbow, tip], [thick, thick * .49, thick * .075]);
      const leafRadius = crown * (maple ? .33 : .30);
      leaves.cluster(tip, V(leafRadius, height * (maple ? .104 : .125), leafRadius * .88), tint(i), seed + i * 11, distant ? 0 : 1);
      const side = i % 2 ? 1 : -1;
      const split = elbow.clone().lerp(tip, .47).add(point(a + side * 1.15, crown * .34, height * .037));
      addLimb([elbow, split], [thick * .37, thick * .045]);
      leaves.cluster(split.clone().add(V(0, height * .025, 0)), V(leafRadius * .82, height * .088, leafRadius * .76),
        tint(i + 21), seed + i * 15 + 7, distant ? 0 : 1);
      if (!distant) {
        const back = tip.clone().lerp(elbow, .32).add(point(a - side * .97, crown * .20, height * .044));
        leaves.cluster(back, V(leafRadius * .72, height * .084, leafRadius * .74), tint(i + 77), seed + i * 31, 0);
      }
    }
    leaves.cluster(stemAt(.865), V(crown * .32, height * .13, crown * .32), tint(106), seed + 199, distant ? 0 : 1);
    if (form.layer === 'elder') {
      const a = .4 + rng(146) * 2.2;
      const elbow = point(a, crown * .58, height * .39), tip = point(a + .18, crown * .84, height * .52);
      addLimb([stemAt(.27), elbow, tip], [radius * .68, radius * .34, radius * .055]);
      leaves.cluster(tip.clone().add(V(0, height * .055, 0)), V(crown * .27, height * .10, crown * .24), tint(191), seed + 239, distant ? 0 : 1);
    }
  }
  root.userData.woodSegments = segments;
  if (form.layer === 'pole') root.userData.cutRadius = dimensions.radius;
  const bark = new THREE.MeshStandardMaterial({ color: profile.bark, roughness: .94 });
  const green = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .89, flatShading: true });
  for (const [name, builder, material] of [
    ['trunk', trunk, bark], ['wood-branch', branches, bark], ['roots', roots, bark], ['crown', leaves, green],
  ] as const) {
    const geometry = builder.finish();
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}
