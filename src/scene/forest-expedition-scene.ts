import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {ExpeditionPoint} from '../content/forest-expedition.ts';
import {expeditionHabitatAt, expeditionHeightAt, expeditionPathDistance} from '../world/forest-expedition.ts';
import type {ExpeditionLayout} from '../world/forest-expedition.ts';
import {Resources} from './resources.ts';
import {createExpeditionActor} from './expedition-actor.ts';
import {createExpeditionVegetation} from './expedition-vegetation.ts';
import type {ExpeditionCrownVolume} from './expedition-vegetation.ts';
import {populateExpeditionProduce} from './expedition-produce.ts';
import {createForestExpeditionLighting} from './lighting/forest-expedition-lighting.ts';

export type ExpeditionPick = {kind: 'source' | 'landmark'; id: string} | {kind: 'drop'; key: string} | {kind: 'supply'} | {kind: 'ground'; point: ExpeditionPoint};
export type ExpeditionSceneView = {
  player: ExpeditionPoint & {facing: number; speed: number}; gathering: boolean; carryingWood: boolean;
  sources: Record<string, {remaining: number}>;
  drops: {key: string; x: number; z: number; itemId: string; quantity: number}[];
  selected: ExpeditionPick | null;
};
const TAU = Math.PI * 2;
function seeded(seed: number) {let value = seed >>> 0; return () => {value = Math.imul(1664525, value) + 1013904223; return (value >>> 0) / 4294967296;};}
function setPick(root: THREE.Object3D, pick: ExpeditionPick) {root.traverse(object => {object.userData.expeditionPick = pick;});}

/** A mountable renderer. No RAF, input listeners, inventory mutation or save writer. */
export async function createForestExpeditionScene(canvas: HTMLCanvasElement) {
  const owner = new Resources(), renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
  let shaderErrors = 0;
  renderer.debug.onShaderError = (gl, program) => {shaderErrors++; console.error('Forest expedition shader compilation', gl.getProgramInfoLog(program));};
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(43, 1, .15, 520);
  const hemi = new THREE.HemisphereLight('#e1eadd', '#56654a', 2.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d0', 3.0); sun.castShadow = true; scene.add(sun, sun.target);
  const sunDirection = new THREE.Vector3(-32,68,28).normalize().toArray();
  let actor: Awaited<ReturnType<typeof createExpeditionActor>>;
  try {actor = await createExpeditionActor(owner);}
  catch (error) {owner.dispose(); renderer.dispose(); renderer.forceContextLoss(); throw error;}
  scene.add(actor.root);
  const ray = new THREE.Raycaster(), cursor = new THREE.Vector2(), target = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
  const direction = new THREE.Vector3(), segment = new THREE.Vector3(), probe = new THREE.Vector3();
  let layout: ExpeditionLayout, mapOwner: Resources | null = null, mapRoot = new THREE.Group();
  let vegetation: ReturnType<typeof createExpeditionVegetation> | null = null;
  let lighting: ReturnType<typeof createForestExpeditionLighting> | null = null;
  let terrain: THREE.Mesh, sources = new Map<string, THREE.Group>(), dropRoot = new THREE.Group(), dropKey = '';
  let pickRoots: THREE.Object3D[] = [], treeChunks: {group: THREE.Group; volumes: ExpeditionCrownVolume[]}[] = [];
  let selection: THREE.Object3D, destination: THREE.Object3D, supplyGlow: THREE.Object3D;
  let dropHitMaterial: THREE.MeshBasicMaterial | null = null;
  let yaw = .18, pitch = .58, distance = 38, targetDistance = 38, snapCamera = true, disposed = false;
  let diagnostics: 'final' | 'terrain' | 'wood' = 'final';
  let width = 1, height = 1;
  const stats = {mapBuilds: 0, vegetation: {} as unknown, visibleTrees: 0};

  function primitive(geo: THREE.BufferGeometry, material: THREE.Material, root: THREE.Object3D, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  function disc(radius: number, color: string, opacity: number) {
    const root = new THREE.Group();
    const geometry = mapOwner!.own(new THREE.RingGeometry(radius - .035, radius + .035, 40, 1, 0, TAU * .90));
    const material = mapOwner!.own(new THREE.MeshBasicMaterial({color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide}));
    const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; root.add(mesh); return root;
  }
  function terrainMesh(current: ExpeditionLayout, resources: Resources) {
    const geometry = resources.own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(current.grid.positions, 3)); geometry.setIndex(new THREE.BufferAttribute(current.grid.indices, 1));
    const colors = new Float32Array(current.grid.positions.length), palette = current.definition.palette;
    const base = new THREE.Color(palette.ground), shade = new THREE.Color(palette.shade), path = new THREE.Color(palette.path), color = new THREE.Color();
    for (let i = 0; i < colors.length; i += 3) {
      const x = current.grid.positions[i], z = current.grid.positions[i + 2], habitat = expeditionHabitatAt(current, x, z);
      const variation = (Math.sin(x * .31 + z * .19) * Math.cos(z * .23) + 1) * .055;
      color.copy(base).lerp(shade, Math.min(.57, habitat.moisture * .24 + variation));
      const pathDistance = Math.min(expeditionPathDistance(current, x, z), Math.hypot(x - current.spawn.x, z - current.spawn.z) * .53,
        Math.hypot(x - current.supply.x, z - current.supply.z) * .5);
      color.lerp(path, 1 - THREE.MathUtils.smoothstep(pathDistance, 1.2, 3.8)); color.toArray(colors, i);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, resources.own(new THREE.MeshStandardMaterial({vertexColors: true, roughness: .97}))); mesh.receiveShadow = true; mesh.name = 'authoritative-terrain';
    return mesh;
  }
  function waterMesh(current: ExpeditionLayout, resources: Resources) {
    for (const water of current.water) {
      const points: number[] = [], indices: number[] = [];
      water.points.forEach((point, i) => {
        points.push(point.x - water.halfWidth, point.y, point.z, point.x + water.halfWidth, point.y, point.z);
        if (i) {const a = (i - 1) * 2, c = i * 2; indices.push(a, c, a + 1, a + 1, c, c + 1);}
      });
      const geometry = resources.own(new THREE.BufferGeometry()); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, resources.own(new THREE.MeshStandardMaterial({color: current.definition.palette.water, roughness: .32, metalness: .05, side: THREE.DoubleSide})));
      mesh.name = 'woodland-stream'; mesh.receiveShadow = true; mapRoot.add(mesh);
      // Quiet broken highlights retain the creek's direction without a second water simulation.
      const strokes: number[] = [];
      for (let i = 1; i < water.points.length - 1; i += 2) {
        const p = water.points[i], offset = Math.sin(i * 2.31) * water.halfWidth * .6;
        strokes.push(p.x + offset - .35, p.y + .035, p.z, p.x + offset + .7, p.y + .035, p.z + .18);
      }
      const lines = new THREE.LineSegments(resources.own(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(strokes, 3))),
        resources.own(new THREE.LineBasicMaterial({color: '#d8e9d7', transparent: true, opacity: .38})));
      mapRoot.add(lines);
    }
  }
  function decorations(current: ExpeditionLayout, resources: Resources) {
    const random = seeded(current.definition.seed + 91), rockGeometry = resources.geometry('expedition-rock', () => new THREE.IcosahedronGeometry(1, 0));
    const rocks = resources.own(new THREE.InstancedMesh(rockGeometry, resources.material(current.definition.palette.rock, .94), 145));
    const matrix = new THREE.Object3D(); let count = 0;
    for (let i = 0; i < 200; i++) {
      const x = (random() - .5) * 169, z = (random() - .5) * 169;
      if (expeditionPathDistance(current, x, z) < 4 || current.resourceSites.some(s => Math.hypot(s.x - x, s.z - z) < 3)) continue;
      if (count >= 145) break;
      const size = .35 + random() * .8; matrix.position.set(x, expeditionHeightAt(current.id, x, z) + .08, z);
      matrix.scale.set(size * 1.5, size * .65, size); matrix.rotation.set(random(), random() * TAU, random() * .3); matrix.updateMatrix(); rocks.setMatrixAt(count++, matrix.matrix);
    }
    rocks.count = count; rocks.castShadow = true; rocks.receiveShadow = true; rocks.computeBoundingSphere(); mapRoot.add(rocks);
    const features: THREE.Group[] = [];
    for (let i = 0; i < 120; i++) {
      const tree = current.trees[Math.floor(random() * current.trees.length)], angle = random() * TAU, radius = tree.trunkRadius + 1 + random() * 3;
      const x = tree.x + Math.cos(angle) * radius, z = tree.z + Math.sin(angle) * radius;
      if (expeditionPathDistance(current, x, z) < 3.2 || current.resourceSites.some(s => Math.hypot(s.x - x, s.z - z) < 3)) continue;
      const h = expeditionHabitatAt(current, x, z);
      features.push(vegetation!.createFeature({id: `understory-${i}`, kind: h.moisture > .7 ? 'fern' : i % 3 ? 'shrub' : 'moss-rock', x, y: expeditionHeightAt(current.id, x, z), z, height: .5 + random() * .65, radius: .65, rotation: random() * TAU, variant: i % 3}));
    }
    // Decoration never needs individual interaction: collapse it into shared material batches.
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const root of features) {
      root.updateMatrixWorld(true); root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
        const copy = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const group = parts.get(object.material) ?? []; group.push(copy); parts.set(object.material, group);
      });
    }
    for (const [material, geometries] of parts) {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (merged) {const mesh = new THREE.Mesh(resources.own(merged), material); mesh.castShadow = true; mesh.receiveShadow = true; mapRoot.add(mesh);}
    }
  }
  function createSourceModels(current: ExpeditionLayout, resources: Resources) {
    const sphere = resources.geometry('source-seed', () => new THREE.IcosahedronGeometry(1, 1));
    const hitMaterial = resources.own(new THREE.MeshBasicMaterial({visible: false}));
    const trees = new Map(current.trees.map(tree => [tree.id,tree]));
    for (const site of current.resourceSites) {
      const base = new THREE.Group(); base.name = site.id; base.position.set(site.x + 1.6, expeditionHeightAt(current.id, site.x + 1.6, site.z - .7), site.z - .7);
      const harvest = new THREE.Group(); harvest.name = 'harvest'; base.add(harvest);
      const host = site.hostTreeId ? trees.get(site.hostTreeId) : undefined;
      const detailed = populateExpeditionProduce(site,current.id,base,harvest,host,vegetation!,resources);
      if (!detailed) {
        if (site.role === 'soil-fungus') {
          const group = actor.templates.mushrooms.clone(true); group.scale.setScalar(1.65); harvest.add(group);
        } else if (site.role === 'branch' || site.role === 'curved-branch') {
          const group = actor.templates.branches.clone(true); group.scale.setScalar(site.role === 'curved-branch' ? 1.65 : 1.2); group.rotation.y = .6; harvest.add(group);
        } else if (site.role === 'long-timber') {
          harvest.add(vegetation!.createFeature({id: site.id + '-wood', kind: 'fallen-log', x: 0, y: .05, z: 0, length: 5.4, radius: .40, rotation: 1.05}));
          base.add(vegetation!.createFeature({id: site.id + '-root', kind: 'root-plate', x: -2.65 * Math.cos(1.05), y: 0, z: 2.65 * Math.sin(1.05), radius: .8, height: 1.7, rotation: 1.05 + Math.PI}));
        } else if (site.role === 'sap') {
          const surface = host && vegetation!.trunkSurface(host,new THREE.Vector3(site.x,site.y,site.z),.56);
          if (surface && host) {
            const outward = new THREE.Vector3(site.x-host.x,0,site.z-host.z).normalize();
            base.position.copy(surface).addScaledVector(outward,.27);
            base.position.y -= .43;
          }
          primitive(resources.geometry('sap-pot', () => new THREE.CylinderGeometry(.32, .28, .44, 10, 1, true)), resources.material('#9d8868', .75), base, 0, .23, 0);
          primitive(resources.geometry('sap-surface', () => new THREE.CircleGeometry(.27, 16)), resources.material('#a4ba96', .45), harvest, 0, .38, 0).rotation.x = -Math.PI / 2;
        } else {
          for (let i = 0; i < 5; i++) {
            const item = primitive(sphere, resources.material('#86664b', .6), harvest, Math.sin(i * 2) * .45, .16, Math.cos(i * 2) * .42);
            item.scale.set(.16, .24, .18);
          }
        }
      }
      const pick = {kind: 'source', id: site.id} as const;
      base.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(harvest);
      if (detailed && bounds.isEmpty()) throw new Error(`Missing harvest geometry: ${site.id}`);
      const center = bounds.isEmpty() ? base.position.clone() : bounds.getCenter(new THREE.Vector3());
      base.userData.visualPoint = {x:center.x,y:center.y,z:center.z};
      if (detailed) {
        setPick(harvest,pick);
        const size = bounds.getSize(new THREE.Vector3()).addScalar(.22);
        const hit = new THREE.Mesh(resources.own(new THREE.BoxGeometry(size.x,size.y,size.z)),hitMaterial);
        hit.position.copy(base.worldToLocal(center)); hit.userData.expeditionPick = pick; base.add(hit);
      } else {
        setPick(base,pick);
        const hit = new THREE.Mesh(resources.geometry('source-hit', () => new THREE.CylinderGeometry(1.5, 1.5, 1.5, 10)),hitMaterial);
        hit.position.y = .7; hit.userData.expeditionPick = pick; base.add(hit);
      }
      sources.set(site.id, base); pickRoots.push(base); mapRoot.add(base);
    }
  }
  function supplyStation(current: ExpeditionLayout, resources: Resources) {
    const root = new THREE.Group(); root.position.set(current.supply.x, expeditionHeightAt(current.id, current.supply.x, current.supply.z - 1.8), current.supply.z - 1.8); root.name = 'trail-supply';
    const wood = resources.material('#987249', .83), dark = resources.material('#5b5036', .88);
    const box = resources.geometry('supply-box', () => new THREE.BoxGeometry(1, 1, 1));
    for (const x of [-1.15, 1.15]) for (const z of [-.55, .55]) primitive(box, wood, root, x, .6, z).scale.set(.14, 1.2, .14);
    primitive(box, wood, root, 0, 1.18, 0).scale.set(2.75, .16, 1.48);
    const rack = primitive(box, dark, root, .66, 1.5, .18); rack.scale.set(1, .5, .8);
    for (let i = 0; i < 3; i++) primitive(box, wood, root, -.82 + i * .42, .3, -.12).scale.set(.31, .56, .72);
    for (const x of [-1.4, 1.4]) primitive(box, wood, root, x, 1.55, -.7).scale.set(.13, 3.1, .13);
    const roof = primitive(box, resources.material('#6f8060', .9), root, 0, 3.12, -.22); roof.scale.set(3.4, .18, 2.0); roof.rotation.x = -.11;
    const hit = new THREE.Mesh(resources.geometry('supply-hit', () => new THREE.BoxGeometry(3.5, 3.4, 2)), resources.own(new THREE.MeshBasicMaterial({visible: false}))); hit.position.y = 1.7; root.add(hit);
    setPick(root, {kind: 'supply'}); pickRoots.push(root); mapRoot.add(root);
    supplyGlow = disc(2.3, '#e3cf94', .6); supplyGlow.position.set(current.supply.x, current.supply.y + .07, current.supply.z); mapRoot.add(supplyGlow);
  }

  function setMap(current: ExpeditionLayout) {
    lighting?.dispose(); lighting=null;
    mapRoot.removeFromParent(); vegetation?.dispose(); mapOwner?.dispose(); mapOwner = new Resources();
    dropHitMaterial = mapOwner.own(new THREE.MeshBasicMaterial({visible: false}));
    layout = current; sources = new Map(); pickRoots = []; treeChunks = []; dropKey = '';
    mapRoot = new THREE.Group(); mapRoot.name = `forest-${current.id}`; scene.add(mapRoot);
    const palette = current.definition.palette;
    scene.background = new THREE.Color(palette.sky); scene.fog = new THREE.Fog(palette.fog, current.id === 'upper' ? 48 : 75, current.id === 'upper' ? 175 : 240);
    terrain = terrainMesh(current, mapOwner); mapRoot.add(terrain); waterMesh(current, mapOwner);
    vegetation = createExpeditionVegetation(mapOwner, {heightAt: (x, z) => expeditionHeightAt(current.id, x, z)});
    // A representative 180-unit plot fits one batch set. Group by authored variant,
    // not sparse spatial cells; a 24-unit grid would fragment nearly every tree.
    const trees = current.trees, group = vegetation.batchTrees(trees, 'mid');
    mapRoot.add(group); treeChunks.push({group, volumes: group.userData.crownVolumes});
    decorations(current, mapOwner); createSourceModels(current, mapOwner); supplyStation(current, mapOwner);
    for (const landmark of current.landmarks) {
      const tree = current.trees.find(t => t.id === landmark.treeId)!;
      const proxy = new THREE.Mesh(mapOwner.own(new THREE.CylinderGeometry(tree.trunkRadius, tree.trunkRadius * 1.15, Math.min(tree.height, 18), 10)), mapOwner.own(new THREE.MeshBasicMaterial({visible: false})));
      proxy.position.set(tree.x, tree.y + Math.min(tree.height, 18) / 2, tree.z); proxy.userData.expeditionPick = {kind: 'landmark', id: landmark.id}; mapRoot.add(proxy); pickRoots.push(proxy);
    }
    selection = disc(1.7, '#ffe2a2', .85); selection.visible = false; mapRoot.add(selection);
    destination = disc(.5, '#e1e9ce', .65); destination.visible = false; mapRoot.add(destination);
    dropRoot = new THREE.Group(); mapRoot.add(dropRoot);
    lighting=createForestExpeditionLighting(mapOwner,{renderer,sun,scene,layout:current,
      canopies:treeChunks.flatMap(chunk=>chunk.volumes),sunDirection,
      ambientEnabled:new URLSearchParams(window.location.search).get('ao')!=='off'});
    stats.mapBuilds++; stats.vegetation = vegetation.stats(); stats.visibleTrees = current.trees.length;
    snapCamera = true;
  }
  function updateDrops(drops: ExpeditionSceneView['drops']) {
    const key = JSON.stringify(drops.map(({key,x,z,itemId,quantity}) => ({key,x,z,itemId,quantity}))); if (key === dropKey) return; dropKey = key;
    for (const object of dropRoot.children) pickRoots = pickRoots.filter(root => root !== object);
    dropRoot.clear();
    for (const drop of drops) {
      const root = new THREE.Group(); root.position.set(drop.x, expeditionHeightAt(layout.id, drop.x, drop.z) + .1, drop.z);
      const wood = /wood|branch|timber/.test(drop.itemId);
      const mesh = new THREE.Mesh(mapOwner!.geometry(wood ? 'ground-wood' : 'ground-sack', () => wood ? new THREE.CylinderGeometry(.18, .21, 2.5, 8) : new THREE.IcosahedronGeometry(.4, 1)), mapOwner!.material(wood ? '#9c794f' : '#b6a17a', .85));
      mesh.rotation.z = wood ? Math.PI / 2 : 0; mesh.position.y = wood ? .2 : .3;
      mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
      const hit = new THREE.Mesh(mapOwner!.geometry('drop-hit', () => new THREE.SphereGeometry(1.1, 8, 6)), dropHitMaterial!); root.add(hit);
      setPick(root, {kind: 'drop', key: drop.key}); pickRoots.push(root); dropRoot.add(root);
    }
    lighting?.bind(dropRoot);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (w === width && h === height) return;
    width = w; height = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function render(view: ExpeditionSceneView, dt: number) {
    if (disposed || !layout) return; resize();
    const y = expeditionHeightAt(layout.id, view.player.x, view.player.z);
    actor.update({...view.player, y, gathering: view.gathering, carryingWood: view.carryingWood}, dt);
    target.set(view.player.x, y + 1.6, view.player.z);
    if (snapCamera) {cameraTarget.copy(target); distance = targetDistance; snapCamera = false;}
    else {cameraTarget.lerp(target, 1 - Math.exp(-7 * dt)); distance += (targetDistance - distance) * (1 - Math.exp(-8 * dt));}
    const horizontal = Math.cos(pitch) * distance;
    camera.position.set(cameraTarget.x + Math.sin(yaw) * horizontal, cameraTarget.y + Math.sin(pitch) * distance, cameraTarget.z + Math.cos(yaw) * horizontal);
    const ground = expeditionHeightAt(layout.id, THREE.MathUtils.clamp(camera.position.x, -89, 89), THREE.MathUtils.clamp(camera.position.z, -89, 89));
    camera.position.y = Math.max(camera.position.y, ground + 2.2); camera.lookAt(cameraTarget);
    direction.copy(cameraTarget).sub(camera.position); const lengthSq = direction.lengthSq();
    for (const chunk of treeChunks) {
      chunk.group.visible = diagnostics !== 'terrain';
      for (const crown of chunk.volumes) {
        // Crown volume, not root distance, determines whether a giant can cover the player.
        probe.set(...crown.center); segment.copy(probe).sub(camera.position);
        const t = THREE.MathUtils.clamp(segment.dot(direction) / lengthSq, 0, 1);
        segment.copy(camera.position).addScaledVector(direction, t);
        const blocks = t > .04 && t < 1 && segment.distanceTo(probe) < crown.radius + 1.4;
        vegetation!.setCrownOpacity(chunk.group, crown.id, diagnostics === 'wood' ? .02 : blocks ? .17 : 1);
      }
    }
    for (const [id, root] of sources) root.getObjectByName('harvest')!.visible = (view.sources[id]?.remaining ?? 0) > 0;
    updateDrops(view.drops);
    selection.visible = false;
    const selected = view.selected;
    const position = selected?.kind === 'source' ? layout.resourceSites.find(s => s.id === selected.id)
      : selected?.kind === 'landmark' ? layout.landmarks.find(s => s.id === selected.id)
      : selected?.kind === 'supply' ? layout.supply : selected?.kind === 'drop' ? view.drops.find(d => d.key === selected.key) : null;
    if (position) {selection.visible = true; selection.position.set(position.x, expeditionHeightAt(layout.id, position.x, position.z) + .08, position.z);}
    lighting?.update({focus:[view.player.x,y,view.player.z],dt,camera,viewportHeight:height,feet:actor.feet()});
    renderer.render(scene, camera);
  }
  return {
    canvas, setMap, render, resize,
    yaw: () => yaw,
    orbit(dx: number, dy = 0) {yaw -= dx * .005; pitch = THREE.MathUtils.clamp(pitch + dy * .004, .16, 1.12);},
    zoom(delta: number) {targetDistance = THREE.MathUtils.clamp(targetDistance * Math.exp(delta * .001), 15, 96);},
    resetCamera() {yaw = .18; pitch = .58; targetDistance = 38;},
    bookmark(name: 'near' | 'design' | 'far') {yaw = .18; pitch = name === 'near' ? .28 : name === 'far' ? .73 : .58; targetDistance = name === 'near' ? 18 : name === 'far' ? 90 : 38; snapCamera = true;},
    diagnostic(mode: typeof diagnostics) {diagnostics = mode;},
    destination(point: ExpeditionPoint | null) {destination.visible = !!point; if (point) destination.position.set(point.x, expeditionHeightAt(layout.id, point.x, point.z) + .09, point.z);},
    project(point: ExpeditionPoint & {y?: number}) {const p = new THREE.Vector3(point.x, point.y ?? expeditionHeightAt(layout.id, point.x, point.z) + .5, point.z).project(camera); return {x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, visible: p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1};},
    pick(clientX: number, clientY: number): ExpeditionPick | null {
      const rect = canvas.getBoundingClientRect(); cursor.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2); ray.setFromCamera(cursor, camera);
      const hit = ray.intersectObjects(pickRoots, true)[0]; if (hit?.object.userData.expeditionPick) return hit.object.userData.expeditionPick as ExpeditionPick;
      const ground = ray.intersectObject(terrain)[0]; return ground ? {kind: 'ground', point: {x: ground.point.x, z: ground.point.z}} : null;
    },
    stats: () => ({...stats, shaderErrors, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      viewport: {width, height, dpr: renderer.getPixelRatio()}, camera: {position: camera.position.toArray(), target: cameraTarget.toArray(), distance, yaw, pitch}, renderer: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL', postProcessing: false,
      lighting:lighting?.stats(),footAnchors:actor.footStats(),
      sourceVisuals:Object.fromEntries([...sources].map(([id,root])=>[id,root.userData.visualPoint]))}),
    dispose() {if (disposed) return; disposed = true; lighting?.dispose(); actor.dispose(); vegetation?.dispose(); mapOwner?.dispose(); owner.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); scene.clear();},
  };
}
