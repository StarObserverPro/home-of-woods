import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GameEvent, GameState, Selection, Vec2 } from '../domain/types';
import { GAME } from '../content/config';
import { getSurface } from '../world/surface';
import { Resources } from './resources';
import { buildingModel, cropModel, playerModel, treeModel } from './models';
import { createTerrain } from './terrain';

export interface SceneOptions {
  onTarget(position: Vec2, entityId?: string): void;
  onDestination(position: Vec2): void;
  onZoom(delta: number): void;
  onContextLost(): void;
  onContextRestored(): void;
}

interface Entry { group: THREE.Group; key: string; entity: Vec2 }
interface Particle { mesh: THREE.Mesh; life: number; vx: number; vy: number; vz: number }

export function createScene(host: HTMLElement, initial: GameState, options: SceneOptions) {
  const resources = new Resources();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#d3e1c2');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'game-canvas'; renderer.domElement.setAttribute('aria-label', '林间空地。WASD 或方向键移动，E 使用当前工具。');
  renderer.domElement.tabIndex = 0; host.append(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, 0.1, 100);
  const cameraTarget = new THREE.Vector3(initial.player.x * 0.25, 0.3, initial.player.z * 0.4);
  const cameraOffset = new THREE.Vector3(18, 24, 24);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04); scene.environment = environment.texture; scene.environmentIntensity = 0.35; room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#f5f8ef', '#80927a', 1.5));
  const sun = new THREE.DirectionalLight('#fff8e9', 2.2); sun.position.set(-9, 20, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -21; sun.shadow.camera.right = 21; sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60; sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.00025; sun.shadow.radius = 3; scene.add(sun);
  const terrain = createTerrain(resources, initial.seed); scene.add(terrain.group);
  const player = playerModel(resources); scene.add(player.root);
  const trees = new Map<string, Entry>(), plots = new Map<string, Entry>(), buildings = new Map<string, Entry>();
  // Stable identity is independent of children order or mesh indices.
  const interactions = new Map<string, THREE.Group>();
  const propRuntime = new Map<string, { group: THREE.Group; start: number; falling: boolean }>();
  const effects = new THREE.Group(); scene.add(effects);
  const particles: Particle[] = [];
  for (let i = 0; i < 32; i++) {
    const mesh = resources.mesh('box', i % 3 === 0 ? '#eee0ac' : '#c08a4c', [0.08, 0.08, 0.08], [0, 0, 0]);
    mesh.visible = false; mesh.castShadow = false; effects.add(mesh); particles.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  const ringGeometry = new THREE.RingGeometry(0.46, 0.52, 48); ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#fff5c7', transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.position.y = 0.025; ring.renderOrder = 3; scene.add(ring);
  const markerGeometry = new THREE.RingGeometry(0.2, 0.29, 24); markerGeometry.rotateX(-Math.PI / 2);
  const marker = new THREE.Mesh(markerGeometry, ringMaterial); marker.visible = false; marker.position.y = 0.03; scene.add(marker);
  const preview = new THREE.Group(); scene.add(preview);
  const previewMaterial = new THREE.MeshStandardMaterial({ color: '#edf6bc', transparent: true, opacity: 0.52, roughness: 0.5, depthWrite: false });
  const footprintGeometry = new THREE.PlaneGeometry(1, 1); footprintGeometry.rotateX(-Math.PI / 2);
  const footprintMaterial = new THREE.MeshBasicMaterial({ color: '#f5f5ba', transparent: true, opacity: 0.35, depthWrite: false });
  const footprint = new THREE.Mesh(footprintGeometry, footprintMaterial); footprint.position.y = 0.03; preview.add(footprint);
  const highlightMaterials = new Map<THREE.Material, THREE.Material>();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), hit = new THREE.Vector3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let destroyed = false, time = 0, lastPlotKey = '', zoom = 1, target: Vec2 | null = null, destination: Vec2 | null = null;
  let previewKey = '', previewModel: THREE.Group | null = null, swingUntil = 0, walkPhase = 0;
  let previousX = initial.player.x, previousZ = initial.player.z, reducedMotion = false, frameCount = 0;
  let pointerDown: { x: number; y: number; id: number; button: number } | null = null;

  const resize = () => {
    if (destroyed) return;
    const width = host.clientWidth || innerWidth, height = host.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, width < 700 ? 1.3 : 1.6)); renderer.setSize(width, height, false);
    const halfHeight = (width < 700 ? 10.2 : 10.8) / zoom;
    camera.left = -halfHeight * width / height; camera.right = halfHeight * width / height; camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const syncEntries = (map: Map<string, Entry>, entities: Array<Vec2 & { id: string }>, key: (entity: any) => string, create: (entity: any) => THREE.Group) => {
    const living = new Set<string>();
    for (const entity of entities) {
      living.add(entity.id); const signature = key(entity); let entry = map.get(entity.id);
      if (!entry || entry.key !== signature) {
        if (entry) { scene.remove(entry.group); interactions.delete(entity.id); propRuntime.delete(entity.id); }
        const group = create(entity); group.position.set(entity.x, getSurface(entity.x, entity.z).height, entity.z); group.userData.entityId = entity.id;
        group.traverse(object => { object.userData.entityId = entity.id; }); scene.add(group);
        entry = { group, key: signature, entity }; map.set(entity.id, entry); interactions.set(entity.id, group);
      }
      entry.entity = entity;
      entry.group.position.set(entity.x, getSurface(entity.x, entity.z).height, entity.z);
    }
    for (const [id, entry] of map) if (!living.has(id)) {
      if (!propRuntime.get(id)?.falling) scene.remove(entry.group);
      map.delete(id); interactions.delete(id);
    }
  };

  const sync = (state: GameState, selection: Selection, chosen: Vec2 | null, build: { valid: boolean; width: number; depth: number } | null) => {
    if (destroyed) return;
    syncEntries(trees, state.trees, tree => `${tree.stage}:${tree.variant}`, tree => treeModel(resources, tree));
    syncEntries(plots, state.plots, plot => `${plot.crop}:${plot.growth >= GAME.cropSeconds}`, plot => plot.crop ? cropModel(resources, plot.growth >= GAME.cropSeconds) : new THREE.Group());
    syncEntries(buildings, state.buildings, b => `${b.kind}:${b.rotation}`, b => { const model = buildingModel(resources, b.kind); model.rotation.y = b.rotation * Math.PI / 2; return model; });
    const plotKey = state.plots.map(p => `${p.id}:${p.watered}`).join('|');
    if (plotKey !== lastPlotKey) { terrain.paint(state.plots); lastPlotKey = plotKey; }
    target = chosen; ring.visible = target !== null && selection.tool !== 'build'; if (target) ring.position.set(target.x, 0.035, target.z);
    player.setTool(selection.tool);
    preview.visible = selection.tool === 'build' && !!target;
    if (preview.visible && target && build) {
      if (previewKey !== selection.building) {
        if (previewModel) preview.remove(previewModel);
        previewKey = selection.building; previewModel = buildingModel(resources, selection.building);
        previewModel.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.material = previewMaterial; obj.castShadow = false; } }); preview.add(previewModel);
      }
      preview.position.set(target.x, 0, target.z); previewModel!.rotation.y = selection.rotation * Math.PI / 2;
      footprint.scale.set(build.width, 1, build.depth); previewMaterial.color.set(build.valid ? '#d6edac' : '#dc9b7c'); footprintMaterial.color.set(build.valid ? '#f7edb0' : '#ce7558');
    }
  };

  const event = (events: GameEvent[]) => {
    for (const e of events) {
      swingUntil = time + 0.36;
      const entry = trees.get(e.entityId);
      if (entry && (e.type === 'chop' || e.type === 'fell')) propRuntime.set(e.entityId, { group: entry.group, start: time, falling: e.type === 'fell' });
      for (let i = 0; i < (e.type === 'fell' || e.type === 'build' ? 16 : 7); i++) {
        const particle = particles.find(p => p.life <= 0); if (!particle) break;
        const phase = i * 2.399 + time;
        particle.life = 0.65; particle.vx = Math.sin(phase) * 1.8; particle.vz = Math.cos(phase) * 1.8; particle.vy = 1.2 + (i % 3) * 0.35;
        particle.mesh.position.set(e.position.x, e.type === 'chop' || e.type === 'fell' ? 1 : 0.2, e.position.z); particle.mesh.visible = !reducedMotion;
      }
    }
  };

  const frame = (dt: number, state: GameState) => {
    if (destroyed) return;
    time += dt; frameCount++;
    const moved = Math.hypot(state.player.x - previousX, state.player.z - previousZ); walkPhase += moved * 6;
    previousX = state.player.x; previousZ = state.player.z;
    player.root.position.set(state.player.x, reducedMotion ? 0 : Math.abs(Math.sin(walkPhase)) * (moved > 0.001 ? 0.045 : 0), state.player.z);
    player.root.rotation.y = state.player.facing;
    player.leftLeg.rotation.x = reducedMotion || moved < 0.001 ? 0 : Math.sin(walkPhase) * 0.53; player.rightLeg.rotation.x = -player.leftLeg.rotation.x;
    player.arm.rotation.x = time < swingUntil && !reducedMotion ? -Math.sin((swingUntil - time) / 0.36 * Math.PI) * 1.8 : 0;
    for (const [id, p] of propRuntime) {
      const elapsed = time - p.start;
      if (p.falling) {
        p.group.rotation.z = reducedMotion ? 0 : Math.min(elapsed / 0.55, 1) * -1.5;
        p.group.scale.multiplyScalar(1 - Math.min(dt * (elapsed > 0.45 ? 5 : 0), 0.8));
        if (elapsed > 0.9) { scene.remove(p.group); propRuntime.delete(id); }
      } else {
        p.group.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 38) * Math.max(0, 0.4 - elapsed) * 0.18;
        if (elapsed > 0.4) { p.group.rotation.z = 0; propRuntime.delete(id); }
      }
    }
    for (const p of particles) if (p.life > 0) {
      p.life -= dt; p.vy -= 4 * dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 4; p.mesh.visible = !reducedMotion && p.life > 0 && p.mesh.position.y > 0;
    }
    for (const entry of trees.values()) {
      const near = Math.hypot(entry.entity.x - state.player.x, entry.entity.z - state.player.z) < 2.6 && entry.entity.x + entry.entity.z > state.player.x + state.player.z;
      for (const child of entry.group.children) if (child instanceof THREE.Mesh && child.position.y > 1.9) {
        if (!child.userData.originalMaterial) child.userData.originalMaterial = child.material;
        const original = child.userData.originalMaterial as THREE.MeshStandardMaterial;
        if (near) {
          let material = highlightMaterials.get(original);
          if (!material) { material = original.clone(); material.transparent = true; material.opacity = 0.25; material.depthWrite = false; highlightMaterials.set(original, material); }
          child.material = material; child.castShadow = false;
        } else { child.material = original; child.castShadow = true; }
      }
    }
    const factor = reducedMotion ? 1 : 1 - Math.exp(-dt * 3.5);
    cameraTarget.x += (state.player.x - cameraTarget.x) * factor; cameraTarget.z += (state.player.z - 1.6 - cameraTarget.z) * factor;
    camera.position.copy(cameraTarget).add(cameraOffset); camera.lookAt(cameraTarget);
    if (destination) { marker.visible = true; marker.position.set(destination.x, 0.04, destination.z); } else marker.visible = false;
    renderer.render(scene, camera);
  };

  const pick = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const objects = [...interactions.values()];
    const hits = raycaster.intersectObjects(objects, true);
    const chosen = hits[0];
    if (chosen?.object.userData.entityId) {
      const id = chosen.object.userData.entityId as string; const obj = interactions.get(id)!;
      options.onTarget({ x: obj.position.x, z: obj.position.z }, id); return;
    }
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      const position = { x: hit.x, z: hit.z };
      options.onTarget(position); options.onDestination(position);
    }
  };
  const down = (e: PointerEvent) => { pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId, button: e.button }; renderer.domElement.setPointerCapture(e.pointerId); };
  const up = (e: PointerEvent) => {
    const start = pointerDown; pointerDown = null;
    if (start && start.id === e.pointerId && start.button === 0 && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 9) pick(e.clientX, e.clientY);
  };
  const cancelPointer = () => { pointerDown = null; };
  const wheel = (e: WheelEvent) => { e.preventDefault(); options.onZoom(e.deltaY > 0 ? -0.07 : 0.07); };
  const lost = (e: Event) => { e.preventDefault(); options.onContextLost(); };
  const restored = () => options.onContextRestored();
  const listeners: Array<[string, EventListener]> = [['pointerdown', down as EventListener], ['pointerup', up as EventListener], ['pointercancel', cancelPointer], ['lostpointercapture', cancelPointer], ['wheel', wheel as EventListener], ['webglcontextlost', lost], ['webglcontextrestored', restored]];
  for (const [name, handler] of listeners) renderer.domElement.addEventListener(name, handler, name === 'wheel' ? { passive: false } : undefined);
  sync(initial, { tool: 'axe', plant: 'tree', building: 'cabin', rotation: 0 }, null, null); frame(0, initial);
  return {
    sync, frame, event,
    setDestination(position: Vec2 | null) { destination = position; },
    setReducedMotion(value: boolean) { reducedMotion = value; },
    setCamera(settings: { x?: number; z?: number; zoom?: number }) {
      if (settings.x !== undefined) cameraTarget.x = settings.x; if (settings.z !== undefined) cameraTarget.z = settings.z;
      if (settings.zoom !== undefined) zoom = Math.max(0.65, Math.min(1.65, settings.zoom)); resize();
    },
    zoom(delta: number) { zoom = Math.max(0.65, Math.min(1.65, zoom + delta)); resize(); },
    project(position: Vec2) { const v = new THREE.Vector3(position.x, 0.6, position.z).project(camera); const rect = renderer.domElement.getBoundingClientRect(); return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height }; },
    metrics() { return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, resources: resources.counts, interactions: interactions.size, visualUpdates: propRuntime.size, frames: frameCount, destroyed, renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER) }; },
    destroy() {
      if (destroyed) return; destroyed = true; observer.disconnect();
      for (const [name, handler] of listeners) renderer.domElement.removeEventListener(name, handler);
      interactions.clear(); propRuntime.clear(); trees.clear(); plots.clear(); buildings.clear(); scene.clear();
      terrain.dispose(); environment.dispose(); ringGeometry.dispose(); ringMaterial.dispose(); markerGeometry.dispose(); footprintGeometry.dispose(); footprintMaterial.dispose(); previewMaterial.dispose();
      for (const m of highlightMaterials.values()) m.dispose(); highlightMaterials.clear();
      sun.shadow.map?.dispose(); resources.dispose(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
