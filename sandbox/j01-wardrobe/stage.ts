import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Resources } from '../../src/scene/resources.ts';
import { createInteriorLighting } from '../../src/scene/lighting/interior-lighting.ts';
import { createSkySample, sampleSkyLight } from '../../src/scene/lighting/sky-light.ts';
import { createFootContactAnchors } from '../../src/scene/lighting/foot-contact-anchors.ts';
import { createCharacterContactShadows } from '../../src/scene/lighting/character-contact-shadows.ts';
import { createAmbientOcclusion } from '../../src/scene/lighting/ambient-occlusion.ts';
import { CAMERA } from '../../src/content/world.ts';
import { OVERLOOK } from '../../src/content/camera.ts';
import { calendarAt } from '../../src/domain/local-clock.ts';
import { navigationOpticsProjection } from '../../src/scene/overlook-optics-rules.ts';
import { replayAffixCondition, type AffixSpeed } from './affix-events.ts';
import { createAffixPresentation, type AffixLight, type AffixQuality, type AffixRecipe, type AffixView, type TintTarget } from './affix-presentation.ts';
import { createAffixScenery } from './affix-scenery.ts';
import { dyes, slotIds, styleIds, type CameraAngle, type Outfit, type Pose, type Slot, type Style } from './catalog.ts';
import { createFittingRig } from './stage-rig.ts';
import { measureFittingBody } from './body-measurements.ts';

type Layer = 'base' | 'upgrade' | 'attachment' | 'straps' | 'hair' | 'fit-body';
export type BodyView = 'outfit' | 'fitted' | 'source';
export type AffixPhase = 'waiting' | 'fired' | 'finished';
interface Piece {
  slot: Slot;
  style: Style;
  layer: Layer;
  fit: Style | '';
  anchor: string;
  root: THREE.Group;
  dye: Map<THREE.MeshStandardMaterial, THREE.Color>;
}

const poseAngles: Record<CameraAngle, number> = { front: 0, quarter: Math.PI / 5.6, side: Math.PI / 2, back: Math.PI };
const centers: Record<Slot, number> = { top: 1.08, legs: .55, feet: .23, head: 1.43, back: 1.06, hands: .82, waist: .88, neck: 1.22 };
const tintSlots: Record<TintTarget, Slot> = { 'upper-body': 'top', 'lower-body': 'legs', headwear: 'head', footwear: 'feet' };

function preservePbr(resources: Resources, root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.own(object.geometry);
    for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.own(mat);
      for (const input of Object.values(mat)) if (input instanceof THREE.Texture) resources.own(input);
    }
  });
}

function separateBootAtlas(reference: THREE.SkinnedMesh, resources: Resources, faceDeltas?: string) {
  const geometry = resources.own(reference.geometry.clone());
  const index = geometry.getIndex();
  if (!index) throw new Error('J01 脸和手的网格缺少索引');
  const position = geometry.getAttribute('position');
  let fitted = position;
  if (faceDeltas) {
    fitted = position.clone();
    for (const [i, x, y, z, dx, dy, dz] of JSON.parse(faceDeltas) as number[][]) {
      if (i >= position.count || Math.hypot(position.getX(i) - x, position.getY(i) - y, position.getZ(i) - z) > .00001)
        throw new Error('原颈口网格与 J01 试衣候选不匹配');
      fitted.setXYZ(i, x + dx, y + dy, z + dz);
    }
  }
  const indices: number[] = [], withoutHands: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const face = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!face.every(vertex => position.getY(vertex) > .37)) continue;
    indices.push(...face);
    if (!face.every(vertex => Math.abs(position.getZ(vertex)) > .165 && position.getY(vertex) > .385 && position.getY(vertex) < .596)) {
      withoutHands.push(...face);
    }
  }
  // The original boots and face use one atlas. Only the skin under the collar travels with the chest.
  geometry.setIndex(indices);
  reference.geometry = geometry;
  const full = geometry.getIndex()!;
  const covered = new THREE.Uint16BufferAttribute(withoutHands, 1);
  return (showHands: boolean, showSourceBoots: boolean, useFit: boolean) => {
    const visible = showSourceBoots ? index : showHands ? full : covered;
    if (geometry.getIndex() !== visible) geometry.setIndex(visible);
    const shape = useFit ? fitted : position;
    if (geometry.getAttribute('position') !== shape) geometry.setAttribute('position', shape);
  };
}

function bindPieces(pack: THREE.Object3D, reference: THREE.SkinnedMesh, actor: THREE.Object3D): Piece[] {
  const pieces: Piece[] = [];
  const joints = new Map(reference.skeleton.bones.map((bone, i) => [bone.name, i]));
  pack.traverse(object => {
    const { kitSlot, kitStyle, kitLayer, kitFit, kitAnchor } = object.userData;
    if (!slotIds.includes(kitSlot) || !styleIds.includes(kitStyle)) return;
    const root = new THREE.Group();
    root.name = object.name;
    if (kitLayer === 'fit-body') root.userData.kitFaceDeltas = object.userData.kitFaceDeltas;
    const materials = new Map<THREE.MeshStandardMaterial, THREE.Color>();
    object.traverse(wearable => {
      if (!(wearable instanceof THREE.SkinnedMesh)) return;
      const sourceJoints = wearable.skeleton.bones.map(bone => joints.get(bone.name));
      if (sourceJoints.some(i => i === undefined)) throw new Error(`蒙皮骨骼与 J01 不匹配 · ${object.name}`);
      const attribute = wearable.geometry.getAttribute('skinIndex');
      for (let vertex = 0; vertex < attribute.count; vertex++) {
        for (let channel = 0; channel < attribute.itemSize; channel++) {
          attribute.setComponent(vertex, channel, sourceJoints[attribute.getComponent(vertex, channel)]!);
        }
      }
      const mesh = new THREE.SkinnedMesh(wearable.geometry, wearable.material);
      mesh.bind(reference.skeleton, reference.bindMatrix);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (mat instanceof THREE.MeshStandardMaterial && mat.name.startsWith('Dye.')) materials.set(mat, mat.color.clone());
      }
      root.add(mesh);
    });
    if (!root.children.length) throw new Error(`导出件缺少蒙皮 · ${object.name}`);
    actor.add(root);
    pieces.push({ slot: kitSlot, style: kitStyle, layer: kitLayer, fit: kitFit || '', anchor: kitAnchor || '', root, dye: materials });
  });
  for (const slot of slotIds) for (const style of styleIds) {
    const nodes = pieces.filter(p => p.slot === slot && p.style === style);
    if (!(['base', 'upgrade', 'attachment'] as const).every(layer => nodes.some(p => p.layer === layer)) ||
      !nodes.some(p => p.layer === 'base' && p.dye.size) || !nodes.some(p => p.layer === 'attachment' && p.anchor)) {
      throw new Error(`服装导出缺件 · ${slot}/${style}`);
    }
  }
  return pieces;
}

export async function mountStage(host: HTMLElement, initial: Outfit, beforeFit = false) {
  const loader = new GLTFLoader();
  const [base, pack] = await Promise.all([
    loader.loadAsync('/j01-assets/actor.glb'), loader.loadAsync(beforeFit ? '/j01-assets/wearables-before.glb' : '/j01-assets/wearables.glb'),
  ]);
  const resources = new Resources();
  preservePbr(resources, base.scene);
  preservePbr(resources, pack.scene);
  const stage = new THREE.Scene();
  const background = new THREE.Color('#62756f');
  const fog = new THREE.Fog('#62756f', 6, 15);
  stage.background = background;
  stage.fog = fog;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(1.65, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.append(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .05, 24);
  const navigationCamera = new THREE.PerspectiveCamera(40, 1, .1, 1200);
  const sky = createSkySample();
  const daylight = new THREE.Color('#62756f'), moonlight = new THREE.Color('#2d3a50'), mist = new THREE.Color('#81958f');
  // The fitting-room opening is on the front-left of its plinth, in local scene space.
  const up = new THREE.Vector3(0, 1, 0);
  const lights = resources.own(createInteriorLighting(stage, new THREE.Vector3(-.86, 1.86, 1.44)));
  let lastLight = '', hasMist = false;
  function lightAt(hour: number, raining: boolean, foggy: boolean) {
    const sampledHour = Math.round(hour * 20) / 20;
    const key = `${sampledHour}/${raining}/${foggy}`;
    if (key === lastLight) return;
    lastLight = key;
    hasMist = foggy;
    sampleSkyLight(sky, sampledHour, raining ? .91 : foggy ? .74 : .20, raining ? .7 : 0);
    sky.sunDirection.applyAxisAngle(up, 1.49);
    lights.setSky(sky, sampledHour);
    renderer.toneMappingExposure = lights.exposure;
    background.copy(daylight).lerp(moonlight, sky.night).lerp(mist, foggy ? .65 : raining ? .23 : 0);
    fog.color.copy(background);
  }
  lightAt(14, false, false);
  const table = new THREE.Mesh(resources.own(new THREE.CylinderGeometry(.77, .83, .115, 64)),
    resources.own(new THREE.MeshStandardMaterial({ color: '#78806c', roughness: .94 })));
  table.position.y = -.0575;
  table.receiveShadow = true;
  table.castShadow = true;
  const floor = new THREE.Mesh(resources.own(new THREE.PlaneGeometry(1800, 1800)),
    resources.own(new THREE.MeshStandardMaterial({ color: '#6c796e', roughness: 1 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.116;
  floor.receiveShadow = true;
  stage.add(floor, table);
  const ao = createAmbientOcclusion(resources);
  ao.bind(table);
  const contact = createCharacterContactShadows(resources, { surfaceAt: (x, z) => x * x + z * z <= .77 ** 2 ? 0 : -.116 });

  const avatar = new THREE.Group();
  avatar.name = '林工 J01';
  avatar.scale.setScalar(1.55);
  avatar.rotation.y = -Math.PI / 2;
  avatar.add(base.scene);
  stage.add(avatar);
  const sourceParts = new Map<string, THREE.Object3D[]>();
  let skin: THREE.SkinnedMesh | null = null;
  base.scene.traverse(object => {
    const part = object.userData.j01Part;
    if (typeof part === 'string') {
      const list = sourceParts.get(part) ?? [];
      list.push(object);
      sourceParts.set(part, list);
      object.visible = part === 'face' || part === 'wrist';
    }
    if (object instanceof THREE.SkinnedMesh) {
      object.castShadow = object.receiveShadow = true;
      object.frustumCulled = false;
      if (part === 'face') skin = object;
    }
  });
  const reference = skin as THREE.SkinnedMesh | null;
  const walk = base.animations[0];
  if (!reference || reference.skeleton.bones.length !== 50 || !walk) throw new Error('缺少已认可的 J01 版型和步态');
  resources.own(reference.skeleton);
  const pieces = bindPieces(pack.scene, reference, base.scene);
  const fittedTorso = pieces.find(part => part.layer === 'fit-body');
  const showSkin = separateBootAtlas(reference, resources, fittedTorso?.root.userData.kitFaceDeltas);
  const bodyParts = ['under-top', 'under-legs', 'boots'] as const;
  const hairStyles = new Set(pieces.filter(part => part.slot === 'head' && part.layer === 'hair').map(part => part.style));
  const footAnchors = Object.fromEntries(styleIds.map(style => [style, createFootContactAnchors(
    pieces.find(p => p.slot === 'feet' && p.style === style && p.layer === 'base')!.root, { toePrefix: 'ball', idPrefix: style },
  )])) as Record<Style, ReturnType<typeof createFootContactAnchors>>;

  const rig = createFittingRig(avatar, base.scene, base.animations, reference);
  const bones = rig.bones;
  const scenery = createAffixScenery(resources, stage);
  const affixes = createAffixPresentation(resources, stage);
  const head = new THREE.Vector3(), left = new THREE.Vector3(), right = new THREE.Vector3(), body = new THREE.Vector3();
  const forward = new THREE.Vector3(), side = new THREE.Vector3();
  const dyed = new Map<THREE.MeshStandardMaterial, { slot: Slot; base: THREE.Color }>();

  let outfit = initial;
  let frame = 0, last = 0, phase: number | null = null;
  let dirty = true, mode: Pose = 'stand', bodyView: BodyView = 'outfit';
  let angle = poseAngles.quarter, tilt = .15, focus: Slot | null = null;
  let width = 1, height = 1, samples = 0, pointOwners = 0;
  let affixEnabled = false, affixLight: AffixLight = 'condition', quality: AffixQuality = 'full', affixView: AffixView = 'fitting';
  let run: { recipe: AffixRecipe; speed: AffixSpeed; notify: (phase: AffixPhase) => void } | null = null;
  let replay: ReturnType<typeof replayAffixCondition> | null = null;
  let shown: AffixPhase | null = null, events = 0, lastTint: Slot | null = null;
  let manual = false, seek: number | null = null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function navigationLens() {
    const mobile = innerWidth / innerHeight < .8;
    const lens = navigationOpticsProjection({ ...CAMERA, zoom: affixView === 'near' ? CAMERA.maxZoom : CAMERA.zoom }, innerWidth / innerHeight, mobile);
    return { fov: lens.fov, zoom: lens.zoom * innerHeight / height };
  }

  function fittingHeight() {
    return focus ? focus === 'head' || focus === 'feet' ? .31 : .43 : affixEnabled ? 1.15 : .98;
  }

  function tell(value: AffixPhase) {
    if (shown === value) return;
    shown = value;
    run?.notify(value);
  }

  function animate(dt: number) {
    const motion = replay?.advance(dt);
    if (motion?.fired && shown === 'waiting' && run) {
      affixes.play(run.recipe);
      events++;
      tell('fired');
    }
    const input = motion?.input;
    avatar.position.x = input?.x ?? 0;
    avatar.position.z = input?.z ?? 0;
    avatar.rotation.y = -Math.PI / 2;
    if (input?.walking && replay?.id === 'place.riverside') avatar.rotation.y -= .82;
    if (input?.walking && replay?.id === 'place.campfire') avatar.rotation.y += .82;
    const feet = rig.sample(Math.min(dt, .065), input ? input.walking ? 'walk' : 'stand' : mode,
      input ? null : phase, reduced.matches, footAnchors[bodyView === 'outfit' ? outfit.feet.style as Style : 'yard'].update,
      motion?.working ? replay!.activity : null);
    contact.update(feet);
    ao.setCharacterContacts(contact.contacts());

    const raining = input?.weather === 'rain';
    const foggy = input?.fog ?? false;
    const hour = affixLight === 'night' ? 0 : affixLight === 'day' || !input ? 14 : calendarAt(input.time).hour;
    lightAt(affixEnabled ? hour : 14, raining, foggy);
    scenery.update(replay?.id ?? null, raining, replay?.elapsed ?? 0, motion?.working);
    if (shown === 'fired') {
      bones.get('head')!.getWorldPosition(head);
      bones.get('upperarm_l')!.getWorldPosition(left);
      bones.get('upperarm_r')!.getWorldPosition(right);
      bones.get('spine_02')!.getWorldPosition(body);
      forward.set(1, 0, 0).transformDirection(avatar.matrixWorld);
      side.crossVectors(up, forward);
      const lens = affixView !== 'fitting' && navigationLens();
      const half = lens ? OVERLOOK.distance * Math.tan(lens.fov * Math.PI / 360) / lens.zoom : fittingHeight();
      const tint = affixes.update(motion?.fired ? 0 : dt, { head, left, right, body, side, forward, feet }, quality,
        reduced.matches, half * 2 / height);
      const slot = tint && tintSlots[tint.target];
      if (slot || lastTint) for (const [material, dye] of dyed) {
        if (dye.slot === slot && tint) material.color.copy(dye.base).lerp(tint.color, tint.amount);
        else if (dye.slot === lastTint) material.color.copy(dye.base);
      }
      lastTint = slot || null;
      if (!affixes.active) tell('finished');
    }
    samples++;
  }

  function draw() {
    const overview = affixEnabled && affixView !== 'fitting';
    if (overview) {
      const lens = navigationLens();
      const horizontal = Math.cos(CAMERA.elevation) * OVERLOOK.distance;
      navigationCamera.fov = lens.fov;
      navigationCamera.zoom = lens.zoom;
      navigationCamera.aspect = width / height;
      navigationCamera.position.set(Math.sin(angle) * horizontal, .82 + Math.sin(CAMERA.elevation) * OVERLOOK.distance, Math.cos(angle) * horizontal);
      navigationCamera.lookAt(0, .82, 0);
      navigationCamera.updateProjectionMatrix();
      fog.near = hasMist ? 105 : 125;
      fog.far = hasMist ? 126 : 510;
      ao.updateCamera(navigationCamera, height);
      renderer.render(stage, navigationCamera);
      return;
    }
    const center = focus ? centers[focus] : affixEnabled ? .95 : .81;
    const half = fittingHeight();
    const aspect = width / height;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.position.set(Math.sin(angle) * 4, center + tilt * 4, Math.cos(angle) * 4);
    camera.lookAt(0, center, 0);
    camera.updateProjectionMatrix();
    fog.near = hasMist ? .75 : 6;
    fog.far = hasMist ? 8.2 : 15;
    ao.updateCamera(camera, height);
    renderer.render(stage, camera);
  }

  function paintOutfit(next: Outfit) {
    outfit = next;
    const wearing = bodyView === 'outfit';
    const hat = wearing ? outfit.head.style : 'none';
    showSkin(!wearing || outfit.hands.style === 'none' || outfit.hands.style === 'yard', !wearing, bodyView !== 'source');
    for (const part of sourceParts.get('hair') ?? []) part.visible = hat === 'none';
    for (const part of sourceParts.get('hair-tucked') ?? []) part.visible = hat !== 'none' && !hairStyles.has(hat);
    for (const key of bodyParts) for (const part of sourceParts.get(key) ?? [])
      part.visible = !wearing && (key !== 'under-top' || bodyView === 'source' || !fittedTorso);
    dyed.clear();
    for (const p of pieces) {
      if (p.layer === 'fit-body') {
        p.root.visible = bodyView === 'fitted';
        continue;
      }
      const chosen = outfit[p.slot];
      p.root.visible = wearing && p.style === chosen.style && (!p.fit || p.fit === outfit.top.style) &&
        (p.layer !== 'upgrade' || chosen.upgraded) && (p.layer !== 'attachment' || chosen.attached);
      if (p.root.visible) for (const [material, original] of p.dye) {
        const hex = dyes[chosen.dye].hex;
        if (hex) material.color.set(hex);
        else material.color.copy(original);
        dyed.set(material, { slot: p.slot, base: material.color.clone() });
      }
    }
    pointOwners = pieces.filter(piece => piece.root.visible && piece.layer === 'attachment').length;
    dirty = true;
  }

  function resetAffix() {
    lastTint = null;
    affixes.clear();
    paintOutfit(outfit);
    rig.resetPhase();
    events = 0;
    shown = run ? 'waiting' : null;
    replay = run && replayAffixCondition(run.recipe.trigger, run.speed);
    if (shown) run?.notify(shown);
    dirty = true;
  }

  function loop(now: number) {
    frame = requestAnimationFrame(loop);
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (seek !== null) {
      const next = seek;
      seek = null;
      resetAffix();
      for (let t = 0; t < next; t += .04) animate(Math.min(.04, next - t));
      animate(0);
      dirty = false;
      draw();
      return;
    }
    const moving = !replay && (mode === 'walk' || mode === 'run') && phase == null && !reduced.matches;
    const replaying = !manual && shown !== null && shown !== 'finished';
    if (!dirty && !moving && !replaying) return;
    dirty = false;
    animate(manual ? 0 : dt);
    draw();
  }

  const observer = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    dirty = true;
  });
  observer.observe(host);
  const updatePreference = () => { dirty = true; };
  reduced.addEventListener('change', updatePreference);
  paintOutfit(initial);
  frame = requestAnimationFrame(loop);

  return {
    paintOutfit,
    setBodyView(value: BodyView) { bodyView = value; paintOutfit(outfit); },
    setCamera(key: CameraAngle) { angle = poseAngles[key]; tilt = .13; dirty = true; },
    orbit(dx: number, dy: number) { angle += dx; tilt = THREE.MathUtils.clamp(tilt + dy, -.19, .43); dirty = true; },
    detail(slot: Slot | null) { focus = slot; dirty = true; },
    setPose(pose: Pose) { mode = pose; rig.resetPhase(); phase = null; dirty = true; },
    setPhase(value: number | null) { phase = value; dirty = true; },
    setAffixView(enabled: boolean, view: AffixView, light: AffixLight, nextQuality: AffixQuality) {
      affixEnabled = enabled; affixView = view; affixLight = light; quality = nextQuality;
      if (!enabled && run) { run = null; resetAffix(); }
      dirty = true;
    },
    playAffix(recipe: AffixRecipe, speed: AffixSpeed, notify: (phase: AffixPhase) => void) {
      run = { recipe, speed, notify };
      if (bodyView !== 'outfit') bodyView = 'outfit';
      resetAffix();
    },
    cancelAffix() { if (run) { run = null; resetAffix(); } },
    seekAffix(seconds: number | null) {
      manual = seconds !== null;
      seek = seconds;
      dirty = true;
    },
    measureBody() {
      const source = (name: string) => sourceParts.get(name) ?? [];
      return measureFittingBody(avatar, bones, {
        torso: fittedTorso && bodyView !== 'source' ? [fittedTorso.root] : source('under-top'),
        legs: source('under-legs'), shoes: source('boots'), face: source('face'), hair: source('hair'),
        shell: pieces.filter(part => part.slot === 'top' && part.style === outfit.top.style && part.layer === 'base').map(part => part.root),
      });
    },
    hasNativeRun: rig.hasNativeRun,
    stats() {
      const poseValues = ['Pelvis', 'upperarm_l', 'upperarm_r', 'calf_l', 'calf_r']
        .map(name => bones.get(name)!.quaternion.toArray().map(value => Number(value.toFixed(6))));
      return { pose: mode, poseValues, samples, joints: bones.size, attached: pointOwners, clips: rig.clips, bodyView,
        affix: { ...affixes.stats(), elapsed: replay?.elapsed ?? null, phase: shown, trigger: run?.recipe.trigger ?? null,
          input: replay?.sample() ?? null, events, view: affixView, quality },
        hair: { original: sourceParts.get('hair')?.some(part => part.visible) ?? false },
        outfit, lights: lights.stats(), contact: contact.stats(), render: { ...renderer.info.render },
        active: pieces.filter(p => p.root.visible).map(p => ({slot: p.slot, style: p.style, fit:p.fit,
          layer:p.layer, anchor:p.anchor, dyes:[...p.dye.keys()].map(mat => '#' + mat.color.getHexString())})),
      };
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reduced.removeEventListener('change', updatePreference);
      rig.dispose();
      resources.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
