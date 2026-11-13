import {WOOD_TONES,woodToneDrift} from '../../../../src/content/wood-tones.ts';
import {setWoodTone} from '../../../../src/scene/wood-tones.ts';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Resources} from '../../../../src/scene/resources.ts';
import {woodCoordinates, woodMaterial} from '../../../../src/scene/wood-grain.ts';

type Dimensions = readonly [number, number, number];
type ItemId = 'bed'|'table'|'stool'|'chest'|'shelf'|'stove'|'lantern'|'bowl'|'rug'|'plant';
export type FurnitureVisual = {
  root: THREE.Group;
  setState(state: {open: boolean; lit: boolean}, dt?: number): void;
};
type StaticPart = {name: string; geometry: THREE.BufferGeometry; material: THREE.Material};
type ImportedId = 'bed'|'table'|'stool'|'wall-shelf'|'rug';

const TAU = Math.PI * 2;

/**
 * One factory owns adopted meshes, atlas and authored geometry through Resources.
 * Instance roots own transforms and articulated groups, never inventory or lighting policy.
 * Removing a root does not dispose shared resources; the sandbox owner disposes Resources.
 */
export async function loadFurnitureAssets(resources: Resources) {
  const base = `${import.meta.env?.BASE_URL ?? '/'}assets/cabin-interior/`;
  const loader = new GLTFLoader();
  const ownedImageBitmaps = new WeakSet<object>();
  const imported = new Map<ImportedId, THREE.Group>();
  const ids: ImportedId[] = ['bed', 'table', 'stool', 'wall-shelf', 'rug'];
  const loaded = await Promise.all(ids.map(async id => {
    const result = await loader.loadAsync(`${base}${id}.glb`);
    // Register even late completions with the owner, so failed/replaced mounts do not leak.
    result.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.own(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.own(material);
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map) {
          resources.own(map);
          const bitmap = map.source.data as {close?: () => void}|null;
          if (bitmap && typeof bitmap.close === 'function' && !ownedImageBitmaps.has(bitmap)) {
            ownedImageBitmaps.add(bitmap);
            // Texture.dispose releases GPU storage; ImageBitmap has a separate decoded-image lifetime.
            resources.own({dispose: () => bitmap.close!()});
          }
        }
      }
    });
    return {id, scene: result.scene};
  }));
  if (resources.disposed) throw new Error('Cabin furniture owner was disposed while loading.');

  const firstMesh: THREE.Mesh[] = [];
  loaded[0].scene.traverse(object => {if (object instanceof THREE.Mesh) firstMesh.push(object);});
  const firstMaterial = firstMesh[0]?.material as THREE.MeshStandardMaterial;
  if (!firstMaterial?.map) throw new Error('Cabin furniture atlas did not load.');
  const atlas = firstMaterial.map;
  atlas.anisotropy = 4;
  const adoptedMaterial = resources.own(new THREE.MeshStandardMaterial({map: atlas, roughness: .88, metalness: 0}));
  adoptedMaterial.name = 'cabin:kaykit-forest-palette';
  adoptedMaterial.userData.source = 'KayKit Furniture Bits 1.0 / CC0-1.0';
  adoptedMaterial.onBeforeCompile = shader => {
    shader.vertexShader='attribute vec3 woodTone;varying vec3 vCabinWoodTone;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCabinWoodTone=woodTone;');
    shader.fragmentShader='varying vec3 vCabinWoodTone;\n'+shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      // Preserve the licensed atlas and its authored gradients; map only its blue cloth swatch.
      #ifdef USE_MAP
        if (diffuseColor.b > diffuseColor.r * 1.18 && diffuseColor.b > diffuseColor.g * 1.06) {
          float clothLight = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
          diffuseColor.rgb = vec3(.105, .215, .145) * (.62 + 1.05 * clothLight);
        } else if (diffuseColor.r > diffuseColor.g * 1.15 && diffuseColor.g > diffuseColor.b * 1.15) {
          diffuseColor.rgb *= vec3(.88, .94, .90) * vCabinWoodTone;
        }
      #endif
    `);
  };
  adoptedMaterial.customProgramCacheKey = () => 'cabin-kaykit-forest-palette-wood-v2';
  let sourceTriangles = 0;
  for (const {id, scene} of loaded) {
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      // Per-model offset in the same wood swatch; no recoloring cloth, metal or the rug.
      const factor=id==='bed'?[1.12,1.15,1.19]:id==='stool'?[.82,.83,.84]:[1,1,1];
      const drift=woodToneDrift(`adopted:${id}:${object.name}`,.10),values=new Float32Array(object.geometry.getAttribute('position').count*3);
      for(let i=0;i<values.length;i+=3)values.set(id==='rug'?[1,1,1]:drift.map((v,k)=>v*factor[k]),i);
      object.geometry.setAttribute('woodTone',new THREE.BufferAttribute(values,3));
      object.material = adoptedMaterial;
      object.castShadow = object.receiveShadow = true;
      sourceTriangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    imported.set(id, scene);
  }

  const wood = woodMaterial(resources, WOOD_TONES.warm.face, .84);
  const darkWood = woodMaterial(resources, WOOD_TONES.dark.face, .88);
  const paleWood = woodMaterial(resources, WOOD_TONES.light.face, .82);
  const iron = resources.own(new THREE.MeshStandardMaterial({color: '#303933', roughness: .67, metalness: .35}));
  iron.name = 'cabin:patinated-iron';
  const brass = resources.own(new THREE.MeshStandardMaterial({color: '#b48e4c', roughness: .48, metalness: .62}));
  brass.name = 'cabin:aged-brass';
  const stone = resources.own(new THREE.MeshStandardMaterial({color: '#797967', roughness: .98}));
  const charcoal = resources.own(new THREE.MeshStandardMaterial({color: '#25251f', roughness: 1}));
  const terracotta = resources.own(new THREE.MeshStandardMaterial({color: '#ad6d4b', roughness: .95}));
  const leafMaterials = ['#516b38', '#6f824b', '#395c3e'].map(color => resources.own(new THREE.MeshStandardMaterial({color, roughness: .94, side: THREE.DoubleSide})));
  let created = 0;

  function mesh(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true) {
    const result = new THREE.Mesh(resources.own(geometry), material);
    result.name = name;
    result.castShadow = shadow;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  }
  function box(width: number, height: number, depth: number, x: number, y: number, z: number, radius = .012, grain = false) {
    const geometry = new RoundedBoxGeometry(width, height, depth, 1, Math.min(radius, width / 5, height / 5, depth / 5));
    if (grain) woodCoordinates(geometry);
    return geometry.translate(x, y, z);
  }
  function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, segments = 10) {
    const delta = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    return geometry.translate(...a.clone().add(b).multiplyScalar(.5).toArray());
  }
  function join(parent: THREE.Group, parts: StaticPart[]) {
    // Retain semantic part names in metadata before static batching; motion groups stay separate.
    parent.userData.parts = parts.map(part => part.name);
    const groups = new Map<THREE.Material, StaticPart[]>();
    for (const part of parts) groups.set(part.material, [...(groups.get(part.material) ?? []), part]);
    for (const [material, entries] of groups) {
      const normalized = entries.map(({geometry}) => geometry.index ? geometry.toNonIndexed() : geometry.clone());
      // All authored pieces of a wooden batch own the same custom coordinate attribute.
      if ((material as THREE.MeshStandardMaterial).userData.proceduralWood) {
        for (const [i,geometry] of normalized.entries()) {if (!geometry.getAttribute('woodCoord')) woodCoordinates(geometry);setWoodTone(geometry,`${parent.name}:${entries[i].name}`);}
      }
      const merged = mergeGeometries(normalized, false);
      for (const geometry of normalized) geometry.dispose();
      for (const {geometry} of entries) geometry.dispose();
      if (!merged) throw new Error(`Cannot batch cabin ${parent.name}.`);
      const result = mesh(parent, `${parent.name}:${material.name || material.type}`, merged, material);
      result.userData.partNames = entries.map(entry => entry.name);
    }
  }

  function fitted(id: ImportedId, dimensions: Dimensions) {
    const root = new THREE.Group();
    root.name = `cabin:${id}`;
    const template = imported.get(id);
    if (!template) throw new Error(`Missing adopted cabin model ${id}.`);
    const instance = template.clone(true);
    const bounds = new THREE.Box3().setFromObject(instance);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    instance.scale.set(dimensions[0] / size.x, dimensions[1] / size.y, dimensions[2] / size.z);
    instance.position.set(-center.x * instance.scale.x, -bounds.min.y * instance.scale.y, -center.z * instance.scale.z);
    root.add(instance);
    root.userData.source = 'KayKit Furniture Bits 1.0 / CC0-1.0';
    root.userData.dimensions = [...dimensions];
    if (id === 'bed') root.userData.mattressSurface = dimensions[1] * .55;
    return root;
  }

  function standingShelf(dimensions: Dimensions): FurnitureVisual {
    const [w, h, d] = dimensions, root = new THREE.Group();
    root.name = 'cabin:shelf';
    const post = .10, parts: StaticPart[] = [];
    for (const x of [-w / 2 + post / 2, w / 2 - post / 2]) {
      for (const z of [-d / 2 + post / 2, d / 2 - post / 2]) parts.push({name: `stile:${x}:${z}`, geometry: box(post, h, post, x, h / 2, z, .015, true), material: darkWood});
    }
    parts.push({name: 'base-rail', geometry: box(w - post * 2, .12, d - .06, 0, .12, 0, .018, true), material: wood});
    parts.push({name: 'rear-crown', geometry: box(w - post * 2, .10, .08, 0, h - .05, -d / 2 + .04, .014, true), material: darkWood});
    const template = imported.get('wall-shelf')!;
    const supportTop = h - .15;
    for (const [index, y] of [.45, 1.08, supportTop].entries()) {
      // Source vertex measurement: usable top is Y=.1; its back/side lips reach +.3.
      const insert = template.clone(true);
      insert.name = `adopted-shelf-insert:${index}`;
      insert.scale.set((w - .20) / 2, .5, (d - .08) / .5);
      insert.position.set(0, y - .05, -(d - .08) / 2);
      root.add(insert);
    }
    join(root, parts);
    root.userData.supportTop = supportTop;
    root.userData.source = 'KayKit shelf_B_large CC0 inserts; project-authored timber frame';
    return {root, setState() {}};
  }

  function chest(dimensions: Dimensions): FurnitureVisual {
    const [w, h, d] = dimensions, root = new THREE.Group();
    root.name = 'cabin:chest';
    const body = new THREE.Group(), lid = new THREE.Group();
    body.name = 'chest:body'; lid.name = 'chest:hinged-lid'; root.add(body, lid);
    const footHeight = h * .17, wallTop = h * .835;
    const outerW = w - .08, outerD = d - .06, thickness = .065;
    const ring = new THREE.Shape();
    rectPath(ring, -outerW / 2, -outerD / 2, outerW, outerD);
    const cavity = new THREE.Path();
    // Winding opposite the outer boundary: this is an actual hole through the shell.
    cavity.moveTo(-outerW / 2 + thickness, -outerD / 2 + thickness);
    cavity.lineTo(-outerW / 2 + thickness, outerD / 2 - thickness);
    cavity.lineTo(outerW / 2 - thickness, outerD / 2 - thickness);
    cavity.lineTo(outerW / 2 - thickness, -outerD / 2 + thickness); cavity.closePath();
    ring.holes.push(cavity);
    const shell = new THREE.ExtrudeGeometry(ring, {depth: wallTop - footHeight, bevelEnabled: true, bevelSegments: 1, bevelSize: .007, bevelThickness: .007, steps: 1, curveSegments: 1});
    shell.rotateX(-Math.PI / 2).translate(0, footHeight, 0); woodCoordinates(shell, 'board', 'x');
    // The closed carcass represents assembled boards, not one hollowed log:
    // front/back grain follows X, while both side boards follow Z.
    const frontGrain = shell.getAttribute('woodCoord');
    woodCoordinates(shell, 'board', 'z');
    const sideGrain = shell.getAttribute('woodCoord'), shellNormals = shell.getAttribute('normal');
    for (let vertex = 0; vertex < frontGrain.count; vertex++) {
      if (Math.abs(shellNormals.getX(vertex)) > Math.abs(shellNormals.getZ(vertex))) {
        frontGrain.setXYZ(vertex, sideGrain.getX(vertex), sideGrain.getY(vertex), sideGrain.getZ(vertex));
      }
    }
    shell.setAttribute('woodCoord', frontGrain);
    const parts: StaticPart[] = [{name: 'continuous-open-carcass', geometry: shell, material: wood},
      {name: 'cavity-bottom', geometry: box(outerW - thickness * 2, .07, outerD - thickness * 2, 0, footHeight + .035, 0, .008, true), material: darkWood}];
    for (const x of [-w / 2 + .13, w / 2 - .13]) for (const z of [-d / 2 + .13, d / 2 - .13]) {
      parts.push({name: `foot:${x}:${z}`, geometry: box(.15, footHeight, .15, x, footHeight / 2, z, .018, true), material: darkWood});
    }
    for (const x of [-w * .29, w * .29]) {
      parts.push({name: `front-binding:${x}`, geometry: box(.065, wallTop - footHeight - .03, .018, x, (wallTop + footHeight) / 2, outerD / 2 + .01, .005), material: iron});
      for (const y of [footHeight + .075, wallTop - .07]) parts.push({name: `binding-rivet:${x}:${y}`, geometry: new THREE.SphereGeometry(.012, 8, 4).scale(1, 1, .55).translate(x, y, outerD / 2 + .023), material: brass});
    }
    for (const side of [-1, 1]) {
      const handle = new THREE.TorusGeometry(.065, .011, 6, 16).rotateY(Math.PI / 2).translate(side * (outerW / 2 + .017), wallTop * .67, 0);
      parts.push({name: `side-ring:${side}`, geometry: handle, material: iron});
    }
    join(body, parts);
    const hingeY = wallTop + .014, hingeZ = -d / 2 + .035;
    lid.position.set(0, hingeY, hingeZ);
    const lidDepthCenter = -hingeZ;
    const lidThickness = h - hingeY - .016;
    const lidParts: StaticPart[] = [{name: 'solid-lid', geometry: box(w, lidThickness, d, 0, lidThickness / 2, lidDepthCenter, .025, true), material: paleWood}];
    for (const x of [-w * .29, w * .29]) {
      lidParts.push({name: `lid-binding:${x}`, geometry: box(.065, .014, d - .035, x, lidThickness + .007, lidDepthCenter, .004), material: iron});
    }
    lidParts.push({name: 'front-latch', geometry: box(.095, .11, .025, 0, -.015, outerD / 2 + .012 - hingeZ, .007), material: brass});
    for (const x of [-w * .3, w * .3]) lidParts.push({name: `hinge:${x}`, geometry: new THREE.CylinderGeometry(.025, .025, .14, 10).rotateZ(Math.PI / 2).translate(x, 0, 0), material: iron});
    join(lid, lidParts);
    root.userData.hinge = {position: [0, hingeY, hingeZ], axis: 'x', limits: [0, -1.50]};
    root.userData.cavity = {width: outerW - thickness * 2, depth: outerD - thickness * 2, floorY: footHeight + .07, topY: wallTop};
    let amount = 0;
    return {root, setState(state, dt) {
      const target = state.open ? 1 : 0;
      amount = dt === undefined ? target : THREE.MathUtils.damp(amount, target, 12, Math.min(Math.max(dt, 0), .1));
      lid.rotation.x = -1.50 * amount;
      root.userData.openAmount = amount;
    }};
  }

  function stove(dimensions: Dimensions): FurnitureVisual {
    const [w, h, d] = dimensions, root = new THREE.Group();
    root.name = 'cabin:stove';
    const parts: StaticPart[] = [];
    parts.push({name: 'stone-hearth', geometry: box(w, .10, d, 0, .05, 0, .035), material: stone});
    const bodyW = w * .73, bodyD = d * .55, bottom = .26, bodyH = .84;
    for (const x of [-bodyW / 2 + .09, bodyW / 2 - .09]) for (const z of [-bodyD / 2 + .08, bodyD / 2 - .08]) {
      parts.push({name: `splayed-foot:${x}:${z}`, geometry: rod(new THREE.Vector3(x * 1.15, .10, z * 1.1), new THREE.Vector3(x, bottom + .025, z), .038, 8), material: iron});
    }
    const face = new THREE.Shape();
    roundedRectPath(face, -bodyW / 2, bottom, bodyW, bodyH, .055);
    const opening = new THREE.Path();
    rectPath(opening, -bodyW * .31, bottom + .18, bodyW * .62, .48);
    face.holes.push(opening);
    const frame = new THREE.ExtrudeGeometry(face, {depth: bodyD, bevelEnabled: true, bevelSegments: 1, bevelSize: .016, bevelThickness: .016, steps: 1, curveSegments: 4});
    frame.translate(0, 0, -bodyD / 2);
    parts.push({name: 'firebox-thick-shell', geometry: frame, material: iron});
    parts.push({name: 'firebox-rear', geometry: box(bodyW - .04, bodyH - .04, .045, 0, bottom + bodyH / 2, -bodyD / 2 - .008, .015), material: iron});
    parts.push({name: 'top-plate', geometry: box(bodyW + .07, .055, bodyD + .06, 0, bottom + bodyH + .025, 0, .023), material: iron});
    const grateY = bottom + .16;
    for (const x of [-.20, -.10, 0, .10, .20]) parts.push({name: `grate:${x}`, geometry: rod(new THREE.Vector3(x, grateY, -.18), new THREE.Vector3(x, grateY, .19), .012, 8), material: iron});
    for (const x of [-.13, .13]) {
      const log = new THREE.CylinderGeometry(.065, .07, .39, 9).rotateX(Math.PI / 2).rotateY(x > 0 ? .25 : -.2).translate(x, grateY + .085, 0);
      parts.push({name: `charcoal-log:${x}`, geometry: log, material: charcoal});
    }
    const doorZ = bodyD / 2 + .035;
    const doorFrame = new THREE.Shape();
    roundedRectPath(doorFrame, -bodyW * .335, bottom + .15, bodyW * .67, .54, .035);
    const glassHole = new THREE.Path();
    rectPath(glassHole, -bodyW * .27, bottom + .205, bodyW * .54, .43); doorFrame.holes.push(glassHole);
    const doorRing = new THREE.ExtrudeGeometry(doorFrame, {depth: .025, bevelEnabled: true, bevelSegments: 1, bevelThickness: .005, bevelSize: .005, curveSegments: 3, steps: 1}).translate(0, 0, doorZ);
    parts.push({name: 'cast-door-ring', geometry: doorRing, material: iron});
    for (const x of [-.11, .11]) parts.push({name: `door-mullion:${x}`, geometry: box(.018, .43, .015, x, bottom + .42, doorZ + .04, .004), material: iron});
    parts.push({name: 'door-latch', geometry: box(.14, .028, .045, bodyW * .37, bottom + .44, doorZ + .06, .009), material: brass});
    const chimneyBase = bottom + bodyH + .05, chimneyX = .18, chimneyZ = -.16;
    const pipe = lathe([[.10, chimneyBase], [.10, h], [.076, h], [.076, chimneyBase]], 20, true).translate(chimneyX, 0, chimneyZ);
    parts.push({name: 'hollow-flue', geometry: pipe, material: iron});
    for (const y of [chimneyBase + .06, h - .45]) parts.push({name: `flue-collar:${y}`, geometry: lathe([[.111, y], [.111, y + .045], [.10, y + .045], [.10, y]], 20, true).translate(chimneyX, 0, chimneyZ), material: iron});
    join(root, parts);
    const glow = resources.own(new THREE.MeshStandardMaterial({color: '#aa4016', emissive: '#ff7f28', emissiveIntensity: .8, roughness: .8}));
    const flames = new THREE.Group(); flames.name = 'stove:embers'; root.add(flames);
    for (const [i, x] of [-.14, .02, .16].entries()) {
      const height = .27 + (i === 1 ? .08 : 0);
      mesh(flames, `ember-tongue:${i}`, lathe([[0, 0], [.055, .02], [.065, .1], [.035, height * .75], [0, height]], 10).translate(x, grateY + .09, .03), glow, false);
    }
    const glassMaterial = resources.own(new THREE.MeshStandardMaterial({color: '#78654e', roughness: .28, transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide}));
    mesh(root, 'stove:glass', new THREE.PlaneGeometry(bodyW * .55, .44).translate(0, bottom + .42, doorZ + .011), glassMaterial, false);
    root.userData.chimneyEnd = {position: [chimneyX, h, chimneyZ], radius: .10};
    root.userData.hearth = {width: w, depth: d, height: .10};
    return {root, setState(state) {
      flames.visible = state.lit;
      glow.emissiveIntensity = state.lit ? 1.4 : 0;
      glassMaterial.opacity = state.lit ? .17 : .35;
    }};
  }

  function lantern(dimensions: Dimensions): FurnitureVisual {
    const root = new THREE.Group(); root.name = 'cabin:lantern';
    const parts: StaticPart[] = [];
    parts.push({name: 'oil-reservoir', geometry: lathe([[0, 0], [.105, 0], [.13, .025], [.13, .052], [.11, .075], [.075, .083], [0, .083]], 20), material: iron});
    parts.push({name: 'bonnet', geometry: lathe([[0, .325], [.12, .325], [.14, .35], [.12, .37], [.065, .405], [0, .405]], 20), material: brass});
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(angle) * .113, z = Math.cos(angle) * .113;
      parts.push({name: `frame-upright:${i}`, geometry: rod(new THREE.Vector3(x, .062, z), new THREE.Vector3(x, .342, z), .009, 8), material: iron});
    }
    parts.push({name: 'bail-handle', geometry: new THREE.TorusGeometry(.068, .009, 6, 20).translate(0, .473, 0), material: iron});
    parts.push({name: 'wick-wheel', geometry: new THREE.CylinderGeometry(.022, .022, .02, 10).rotateX(Math.PI / 2).translate(0, .061, .129), material: brass});
    join(root, parts);
    const glassMaterial = resources.own(new THREE.MeshStandardMaterial({color: '#ead7a8', roughness: .25, transparent: true, opacity: .20, emissive: '#c46a1d', emissiveIntensity: 0, depthWrite: false, side: THREE.DoubleSide}));
    mesh(root, 'lantern:glass', lathe([[.092, .077], [.108, .13], [.101, .29], [.079, .325], [.073, .325], [.095, .29], [.102, .13], [.086, .077]], 12, true), glassMaterial, false);
    const flameMaterial = resources.own(new THREE.MeshStandardMaterial({color: '#ffe6a0', emissive: '#ffc562', emissiveIntensity: 2.5, roughness: 1}));
    const flame = mesh(root, 'lantern:flame', lathe([[0, .10], [.025, .118], [.03, .155], [.019, .20], [0, .25]], 12), flameMaterial, false);
    root.scale.set(dimensions[0] / .28, dimensions[1] / .55, dimensions[2] / .28);
    root.userData.lightAnchor = [0, dimensions[1] * .37, 0];
    return {root, setState(state) {
      flame.visible = state.lit;
      glassMaterial.emissiveIntensity = state.lit ? .45 : 0;
      glassMaterial.opacity = state.lit ? .24 : .12;
    }};
  }

  function bowl(dimensions: Dimensions): FurnitureVisual {
    const root = new THREE.Group(); root.name = 'cabin:bowl';
    const geometry = lathe([[0, 0], [.06, 0], [.09, .009], [.12, .043], [.145, .10], [.16, .144], [.157, .155], [.145, .16], [.136, .145], [.125, .09], [.10, .045], [.06, .026], [0, .026]], 28);
    woodCoordinates(geometry, 'round-board', 'y');
    mesh(root, 'bowl:continuous-thick-vessel', geometry, paleWood);
    root.scale.set(dimensions[0] / .32, dimensions[1] / .16, dimensions[2] / .32);
    root.userData.shellThickness = .012;
    return {root, setState() {}};
  }

  function plant(dimensions: Dimensions): FurnitureVisual {
    const root = new THREE.Group(); root.name = 'cabin:plant';
    mesh(root, 'plant:terracotta-pot', lathe([[0, 0], [.105, 0], [.127, .025], [.17, .25], [.19, .265], [.19, .315], [.175, .335], [.159, .322], [.151, .267], [.12, .055], [0, .055]], 20), terracotta);
    mesh(root, 'plant:soil', new THREE.CylinderGeometry(.151, .151, .018, 20).translate(0, .297, 0), charcoal);
    const leafParts: StaticPart[] = [];
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996323, height = i === 8 ? .54 : .30 + (i % 3) * .07;
      const spread = i === 8 ? .06 : .19 + (i % 2) * .025;
      const path = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, .307, 0), new THREE.Vector3(Math.sin(angle) * spread * .18, .307 + height * .83, Math.cos(angle) * spread * .18), new THREE.Vector3(Math.sin(angle) * spread, .307 + height, Math.cos(angle) * spread));
      leafParts.push({name: `stem:${i}`, geometry: new THREE.TubeGeometry(path, 5, .0055, 5, false), material: leafMaterials[2]});
      leafParts.push({name: `lanceolate-leaf:${i}`, geometry: leafGeometry(path, angle, i === 8 ? .046 : .063), material: leafMaterials[i % leafMaterials.length]});
    }
    join(root, leafParts);
    root.scale.set(dimensions[0] / .5, dimensions[1] / .85, dimensions[2] / .5);
    return {root, setState() {}};
  }

  const builders: Record<ItemId, (dimensions: Dimensions) => FurnitureVisual> = {
    bed: dimensions => ({root: fitted('bed', dimensions), setState() {}}),
    table: dimensions => ({root: fitted('table', dimensions), setState() {}}),
    stool: dimensions => ({root: fitted('stool', dimensions), setState() {}}),
    rug: dimensions => ({root: fitted('rug', dimensions), setState() {}}),
    shelf: standingShelf, chest, stove, lantern, bowl, plant,
  };
  return {
    createItemVisual(definitionId: string, dimensions: Dimensions): FurnitureVisual {
      if (resources.disposed) throw new Error('Cabin furniture factory is disposed.');
      if (dimensions.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Invalid cabin furniture dimensions.');
      const builder = builders[definitionId as ItemId];
      if (!builder) throw new Error(`Unregistered cabin furniture: ${definitionId}`);
      const result = builder(dimensions);
      result.root.userData.definitionId = definitionId;
      result.root.userData.dimensions = [...dimensions];
      result.root.userData.frame = 'metres; Y-up; bottom-centred; +Z front';
      created++;
      return result;
    },
    stats: () => ({loadedAssets: imported.size, sourceTriangles, sharedTextures: 1, createdInstances: created}),
  };
}

function rectPath(path: THREE.Shape|THREE.Path, x: number, y: number, w: number, h: number) {
  path.moveTo(x, y); path.lineTo(x + w, y); path.lineTo(x + w, y + h); path.lineTo(x, y + h); path.closePath();
}

function roundedRectPath(path: THREE.Shape|THREE.Path, x: number, y: number, w: number, h: number, radius: number) {
  path.moveTo(x + radius, y); path.lineTo(x + w - radius, y);
  path.quadraticCurveTo(x + w, y, x + w, y + radius); path.lineTo(x + w, y + h - radius);
  path.quadraticCurveTo(x + w, y + h, x + w - radius, y + h); path.lineTo(x + radius, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - radius); path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y); path.closePath();
}

/** A welded ring/pole revolve: axis vertices are not duplicated into zero-area triangles. */
function lathe(profile: readonly (readonly [number, number])[], segments: number, closeProfile = false) {
  const positions: number[] = [], uvs: number[] = [], rings: number[][] = [], indices: number[] = [];
  for (const [i, [radius, y]] of profile.entries()) {
    const ring: number[] = [], count = radius < 1e-8 ? 1 : segments;
    for (let j = 0; j < count; j++) {
      const angle = j / segments * TAU;
      ring.push(positions.length / 3); positions.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      uvs.push(j / segments, i / Math.max(profile.length - 1, 1));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - (closeProfile ? 0 : 1); i++) {
    const a = rings[i], b = rings[(i + 1) % rings.length];
    for (let j = 0; j < segments; j++) {
      const next = (j + 1) % segments;
      if (a.length === 1 && b.length === 1) continue;
      if (a.length === 1) indices.push(a[0], b[next], b[j]);
      else if (b.length === 1) indices.push(a[j], a[next], b[0]);
      else indices.push(a[j], a[next], b[next], a[j], b[next], b[j]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** A curved lanceolate blade; explicitly two-sided thin botanical surface, not a solid shell. */
function leafGeometry(path: THREE.QuadraticBezierCurve3, angle: number, halfWidth: number) {
  const points: number[] = [], uvs: number[] = [], indices: number[] = [];
  const side = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
  const steps = 7;
  const first = path.getPoint(.18); points.push(...first.toArray()); uvs.push(.5, 0);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, point = path.getPoint(.18 + .82 * t), width = Math.pow(Math.sin(Math.PI * t), .82) * halfWidth;
    const left = point.clone().addScaledVector(side, -width), ridge = point.clone().add(new THREE.Vector3(0, .013 * Math.sin(Math.PI * t), 0)), right = point.clone().addScaledVector(side, width);
    points.push(...left.toArray(), ...ridge.toArray(), ...right.toArray()); uvs.push(0, t, .5, t, 1, t);
    if (i === 1) indices.push(0, 1, 2, 0, 2, 3);
    else {
      const prev = 1 + (i - 2) * 3, current = prev + 3;
      indices.push(prev, current, current + 1, prev, current + 1, prev + 1, prev + 1, current + 1, current + 2, prev + 1, current + 2, prev + 2);
    }
  }
  const tip = points.length / 3; points.push(...path.getPoint(1).toArray()); uvs.push(.5, 1);
  const last = tip - 3; indices.push(last, tip, last + 1, last + 1, tip, last + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
