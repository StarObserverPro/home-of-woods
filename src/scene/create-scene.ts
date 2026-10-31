import {createUnderstory} from './understory.js';
import {treeVisual} from '../world/tree-appearance.ts';
import * as THREE from "three";
import { CABIN, CAMERA, GIANT, HOME, TENT, WORLD } from "../content/world.ts";
import type { GameState } from "../domain/state.ts";
import type { Tree } from "../world/layout.ts";
import { heightAt, clamp } from "../world/surface.ts";
import { Resources } from "./resources.ts";
import { Models, createSign } from "./models.ts";
import { createScenery, createTerrain } from "./terrain.ts";
import {createEnvironment} from './environment.ts';
import {createCreek} from './creek.ts';
import {createCampProps} from './camp-props.ts';
import {VIEWS,CAMP_PROPS} from '../content/scene-props.ts';
import type {SceneAppearance,SceneViewPreset} from '../content/scene-props.ts';
import {sceneAppearanceAt,daylightAt} from '../domain/scene-props.ts';
import {createForestryPresentation} from './forestry-presentation.ts';
import { createGatheringPresentation } from './gathering-presentation.ts';
import type { GatheringRegistry } from '../domain/gathering-registry.ts';
import {ramp} from './actions/motion.js';
import {createCharacters} from './characters.ts';
import type {CharacterInspection} from './characters.ts';

export type SceneIntent =
  | { kind: "select"; id: string }
  | { kind: "move"; x: number; z: number };
export async function createScene(
  host: HTMLElement,
  trees: Tree[],
  intent: (value: SceneIntent) => void,
  gatheringRegistry: GatheringRegistry,
) {
  const r = new Resources(),
    models = new Models(r);
  try {
    await models.load();
  } catch (error) {
    r.dispose();
    throw error;
  }
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (error) {
    r.dispose();
    throw error;
  }
  renderer.setPixelRatio(1);
  let shaderErrors=0;
  renderer.debug.onShaderError=(gl,program)=>{shaderErrors++;console.error('Scene shader compilation',gl.getProgramInfoLog(program));};
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  const gl=renderer.getContext(),debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
  const graphicsBackend=debugRenderer ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "森林之家可玩山谷");
  canvas.setAttribute("role", "application");
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const environment=createEnvironment(r,{renderer});
  const light=environment.lighting;
  scene.add(environment.group);
  scene.environment=environment.environmentMap;
  scene.environmentIntensity=light.environmentIntensity;
  renderer.toneMappingExposure=light.recommendedExposure;
  scene.fog = new THREE.Fog(light.haze, 220, 440);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1100);
  let yaw = CAMERA.yaw,
    elevation = CAMERA.elevation,
    zoom: number = CAMERA.zoom,
    destroyed = false,
    reducedMotion = false,
    elapsed = 0,
    mobile = false;
  const overview = new THREE.Vector3(HOME.x + 35, 29, HOME.z + 31);
  const target = new THREE.Vector3(HOME.x + 25, 27, HOME.z + 25);
  const desired = new THREE.Vector3(),
    offset = new THREE.Vector3();
  const hemi = new THREE.HemisphereLight(light.skyColor, light.groundColor, light.ambientIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
  sun.target.position.set(-20, 8, 0);
  sun.position.copy(sun.target.position).addScaledVector(light.sunDirection,135);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -85;
  sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85;
  sun.shadow.camera.bottom = -85;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.22;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const { ground, water } = createTerrain(r);
  const river=createCreek(r,water),camp=createCampProps(r);
  scene.add(river.group,camp.group);
  const auditParams=new URLSearchParams(window.location.search),auditHour=auditParams.has('inspect')&&auditParams.has('hour')?Number(auditParams.get('hour')):NaN;
  let appearance=sceneAppearanceAt(0),scenePreset:SceneViewPreset|null=null,sceneOverrides:Partial<SceneAppearance>={};
  let sceneCamera:{yaw:number;elevation:number;zoom:number;target:THREE.Vector3}|null=null;
  scene.add(ground, water);
  const scenery = createScenery(r);
  scene.add(scenery.group);
  const forest = models.createForest(trees);
  scene.add(forest.group);
  // Ground every near and instanced distant tree using the same surface facts.
  for (const t of trees)
    forest.selections.get(t.id)?.position.set(t.x, heightAt(t.x, t.z), t.z);
  const understory=createUnderstory(r,trees,forest.selections);scene.add(understory.group);
  const props = new Map<string, THREE.Object3D>();
  for (const [name, p] of [
    ["cabin", CABIN],
    ["tent", TENT],
  ] as const) {
    const model = models.staticClone(name);
    model.scale.setScalar(1.6);
    model.position.set(p.x, heightAt(p.x, p.z), p.z);
    scene.add(model);
    props.set(name, model);
  }
  const propFades = new Map<
    THREE.Object3D,
    {
      center: THREE.Vector3;
      radius: number;
      materials: {
        mesh: THREE.Mesh;
        opaque: THREE.Material;
        fade: THREE.Material;
      }[];
    }
  >();
  props.forEach((root) => {
    const box = new THREE.Box3().setFromObject(root),
      center = box.getCenter(new THREE.Vector3()),
      radius = box.getSize(new THREE.Vector3()).length() / 2,
      materials: {
        mesh: THREE.Mesh;
        opaque: THREE.Material;
        fade: THREE.Material;
      }[] = [];
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const opaque = o.material as THREE.Material,
          fade = r.own(opaque.clone());
        fade.transparent = true;
        fade.opacity = 0.22;
        fade.depthWrite = false;
        materials.push({ mesh: o, opaque, fade });
      }
    });
    propFades.set(root, { center, radius, materials });
  });
  const characters=createCharacters(r,models,trees,forest.selections),player=characters.player;
  scene.add(player,characters.visitor);
  let inspectionCamera:{yaw:number;elevation:number;zoom:number;target:THREE.Vector3}|null=null;
  const forestry=createForestryPresentation({models,resources:r,forestGroup:forest.group,trees,selections:forest.selections});
  const gathering = createGatheringPresentation(r, models, gatheringRegistry);
  scene.add(gathering.group);
  const signs = [
    { x: -24, z: -37, label: "宅后望台 ↑" },
    { x: -31, z: -74, label: "深山 · 待开放" },
    { x: -31, z: 12, label: "溪谷小径 ↓" },
    { x: 7, z: 46, label: "对岸林地 · 待开放" },
  ];
  for (const p of signs) {
    const sign = createSign(r, p.label);
    sign.position.set(p.x, heightAt(p.x, p.z), p.z);
    scene.add(sign);
  }
  // A visible closed trail boundary, outside the same world-owned movement limit.
  const gateZ=WORLD.minOpenZ-.8,gatePosts=[-37,-27,-17].map(x=>new THREE.Vector3(x,heightAt(x,gateZ),gateZ));
  for(const p of gatePosts){
    const post=new THREE.Mesh(r.geometry('sign-post',()=>new THREE.CylinderGeometry(.13,.17,2.4,7)),r.material('#c0a270'));
    post.position.copy(p).add(new THREE.Vector3(0,1.2,0));post.castShadow=true;scene.add(post);
  }
  for(let i=1;i<gatePosts.length;i++)for(const height of [1,1.9]){
    const a=gatePosts[i-1].clone().add(new THREE.Vector3(0,height,0)),b=gatePosts[i].clone().add(new THREE.Vector3(0,height,0));
    const direction=b.clone().sub(a),rail=new THREE.Mesh(r.geometry('sign-board',()=>new THREE.BoxGeometry(2.7,.95,.18)),r.material('#c0a270'));
    rail.position.copy(a).lerp(b,.5);rail.scale.set(direction.length()/2.7,.22/.95,1.8);rail.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),direction.normalize());rail.castShadow=true;scene.add(rail);
  }
  const markerMaterial = r.own(
    new THREE.MeshBasicMaterial({
      color: "#f5df92",
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const marker = new THREE.Mesh(
    r.geometry("selection-ring", () => new THREE.RingGeometry(0.8, 1, 48)),
    markerMaterial,
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  const destination = new THREE.Mesh(
    r.geometry("destination-ring", () => new THREE.RingGeometry(0.3, 0.42, 32)),
    r.own(
      new THREE.MeshBasicMaterial({
        color: "#fff4c9",
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  );
  destination.rotation.x = -Math.PI / 2;
  destination.visible = false;
  scene.add(destination);
  const ray = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    treeById = new Map(trees.map((t) => [t.id, t]));
  const fadeMat = r.own(forest.material.clone());
  fadeMat.transparent = true;
  fadeMat.opacity = 0.2;
  fadeMat.depthWrite = false;
  fadeMat.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n#ifdef USE_COLOR\nif(vColor.r>vColor.g*1.05) diffuseColor.a=1.;\n#endif');
  };
  fadeMat.customProgramCacheKey=()=> 'r3-crown-fade-preserve-bark';
  const projectedCorner=new THREE.Vector3(), occluderCenter=new THREE.Vector3();
  const occlusionRay=new THREE.Raycaster(),headWorld=new THREE.Vector3(),headDirection=new THREE.Vector3(),localHit=new THREE.Vector3();
  const inverseTreeMatrix=new THREE.Matrix4();
  const crownBounds=new Map<string,THREE.Box3>();
  forest.selections.forEach((object,id)=>{
    const mesh=object as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox!.clone();
    bounds.min.y=2.4;
    crownBounds.set(id,bounds);
    mesh.updateWorldMatrix(true,false);
  });
  const pick = (clientX: number, clientY: number) => {
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...forestry.getPickTargets(),...props.values(),...gathering.hits.objects(),...camp.hits.filter(o=>o.userData.propActive!==false)], true)[0],
      terrainHit = ray.intersectObject(ground)[0];
    if (hit && (!terrainHit || hit.distance < terrainHit.distance + 0.2)) {
      if(hit.object.userData.propId){intent({kind:'select',id:hit.object.userData.propId});return;}
      const sourceId = gathering.hits.resolve(hit.object);
      if (sourceId) { intent({ kind: 'select', id: sourceId }); return; }
      let root: THREE.Object3D = hit.object;
      while (
        root.parent &&
        root.parent !== scene &&
        root.parent !== forest.group
      )
        root = root.parent;
      const id =
        [...props.entries()].find(([, o]) => o === root)?.[0] ??
        (treeById.has(root.name) ? root.name : null);
      if (id) intent({ kind: "select", id });
      return;
    }
    if (terrainHit)
      intent({ kind: "move", x: terrainHit.point.x, z: terrainHit.point.z });
  };
  let cameraAction='',cameraOverride='';
  const manualCamera=()=>{cameraOverride=cameraAction;};
  const pointers = new Map<
    number,
    { x: number; y: number; sx: number; sy: number; drag: boolean }
  >();
  let multi = false,
    lastPinch = 0;
  const pointerDown = (e: PointerEvent) => {
    if (destroyed) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      drag: false,
    });
    if (pointers.size > 1) {
      multi = true;
      const p = [...pointers.values()];
      lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
  };
  const pointerMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.drag = true;
    if (pointers.size === 2) {
      const ps = [...pointers.values()],
        dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (lastPinch > 0)
        zoom = clamp((zoom * dist) / lastPinch, CAMERA.minZoom, CAMERA.maxZoom);
      lastPinch = dist;
      manualCamera();yaw -= dx * 0.003;
    } else if (p.drag) {
      manualCamera();yaw -= dx * 0.006;
      elevation = clamp(elevation + dy * 0.003, CAMERA.minElevation, 1.15);
    }
  };
  const pointerUp = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (e.type !== "pointercancel" && !p.drag && !multi)
      pick(e.clientX, e.clientY);
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      multi = false;
      lastPinch = 0;
    }
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();manualCamera();
    zoom = clamp(
      zoom * Math.exp(-e.deltaY * 0.001),
      CAMERA.minZoom,
      CAMERA.maxZoom,
    );
  };
  const contextMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", contextMenu);
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h || destroyed) return;
    renderer.setSize(w, h);
    const aspect = w / h;
    mobile = aspect < 0.8;
    camera.aspect=aspect;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const view = {
    getAppearance:()=>({...appearance}),
    inspectScene(preset:SceneViewPreset|null,overrides:Partial<SceneAppearance>={}){
      if(preset&&!sceneCamera)sceneCamera={yaw,elevation,zoom,target:target.clone()};
      if(!preset&&sceneCamera){({yaw,elevation,zoom}=sceneCamera);target.copy(sceneCamera.target);sceneCamera=null;}
      scenePreset=preset;sceneOverrides=preset?{...overrides}:{};
      if(preset){const p=VIEWS[preset];yaw=p.yaw;elevation=p.elevation;zoom=p.zoom;target.fromArray(p.target);}river.invalidate();
    },
    capture(state:GameState){view.render(state,0);return canvas.toDataURL('image/png');},
    canvas,
    camera,
    renderer,
    getYaw: () => yaw,
    resetCamera() {
      yaw = CAMERA.yaw;
      elevation = CAMERA.elevation;
      zoom = CAMERA.zoom;
    },
    rotate(amount: number) {manualCamera();
      yaw += amount;
    },
    zoomBy(amount: number) {manualCamera();
      zoom = clamp(zoom * amount, CAMERA.minZoom, CAMERA.maxZoom);
    },
    setReducedMotion(value: boolean) {
      reducedMotion = value;
    },
    inspectCharacter(value:CharacterInspection){
      if(value&&!inspectionCamera){inspectionCamera={yaw,elevation,zoom,target:target.clone()};yaw=player.rotation.y-.6;elevation=.24;zoom=1;}
      if(!value&&inspectionCamera){({yaw,elevation,zoom}=inspectionCamera);target.copy(inspectionCamera.target);inspectionCamera=null;}
      characters.setInspection(value);
    },
    render(state: GameState, dt: number) {
      if (destroyed) return;
      elapsed = state.time;
      appearance={...sceneAppearanceAt(state.time),...(Number.isFinite(auditHour)&&auditHour>=0&&auditHour<=24?{hour:auditHour}:{}),...sceneOverrides};
      if(state.ritual?.startedAt!=null&&state.time-state.ritual.startedAt<8){if(state.ritual.phase==='completed')appearance.altar='resting';else if(state.ritual.phase==='performing'&&state.time-state.ritual.startedAt>3.5)appearance.altar='answering';}
      if((sceneOverrides.hour!==undefined||Number.isFinite(auditHour))&&sceneOverrides.fire===undefined)appearance.fire=daylightAt(appearance.hour).night>.5;
      const sky=environment.setHour(appearance.hour);
      hemi.color.copy(light.skyColor);hemi.groundColor.copy(light.groundColor);hemi.intensity=light.ambientIntensity;
      sun.color.copy(light.sunColor);sun.intensity=light.sunIntensity;sun.position.copy(sun.target.position).addScaledVector(light.sunDirection,135);
      scene.environmentIntensity=light.environmentIntensity;(scene.fog as THREE.Fog).color.copy(light.haze);
      camp.update(elapsed,appearance,state.inventory,sky.night,reducedMotion);
      const { x, z, facing, moving } = state.player,
        y = heightAt(x, z);
      forestry.update(state,reducedMotion);understory.update(state);
      characters.update(state,reducedMotion);
      forestry.alignContact(characters.getImpact());
      gathering.update(state.gathering);
      const action=state.gathering.action,ritual=state.ritual;
      cameraAction=action?.phase==='performing'?action.actionId:ritual?.phase==='performing'?`prayer-${ritual.startedAt}`:'';
      const framed=!!cameraAction && cameraOverride!==cameraAction && !reducedMotion && !scenePreset;
      const actionTime=action?.phase==='performing'?state.time-action.startedAt!:ritual?.phase==='performing'?state.time-ritual.startedAt!:0;
      const actionLength=action?.phase==='performing'?action.durationSeconds:5.5;
      const blend=framed?ramp(actionTime,0,.65)*(1-ramp(actionTime,actionLength-.75,actionLength)):0;
      const climbing=action?.phase==='performing'&&action.motionTag==='gather.climb';
      const rear=action?.phase==='performing'&&action.motionTag==='gather.pluck';
      const actionYaw=player.rotation.y+Math.PI+(rear?0:-.8);
      const viewYaw=yaw+Math.atan2(Math.sin(actionYaw-yaw),Math.cos(actionYaw-yaw))*blend;
      const viewElevation=THREE.MathUtils.lerp(elevation,climbing?THREE.MathUtils.lerp(.10,.28,ramp(actionTime,2,3.2)):.28,blend);
      const actionDistance=climbing?THREE.MathUtils.lerp(9,22,ramp(actionTime,2,3.2)):10;
      const framing = Math.min(1, (CAMERA.zoom / zoom) ** 2);
      const inspecting=characters.getInspection()!==null;
      desired.set(x,y+(inspecting?1.25:1.5),z).lerp(overview,inspecting?0:(mobile ? .12 : .75)*framing);
      if(inspecting)target.copy(desired);else if(scenePreset){target.fromArray(VIEWS[scenePreset].target);if(scenePreset==='altar')target.y=camp.foundation.levelY+1.9;if(scenePreset==='ritual')target.y=camp.foundation.levelY+2.5;}else target.lerp(desired, reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
      desired.copy(player.position).add(new THREE.Vector3(0,climbing?THREE.MathUtils.lerp(.85,2.3,ramp(actionTime,2,3.2)):1,0));target.lerp(desired,blend);if(mobile)target.y-=1.1*blend;
      offset
        .set(
          Math.sin(viewYaw) * Math.cos(viewElevation),
          Math.sin(viewElevation),
          Math.cos(viewYaw) * Math.cos(viewElevation),
        )
        .multiplyScalar(inspecting?11:scenePreset?VIEWS[scenePreset].distance:THREE.MathUtils.lerp(110,actionDistance,blend));
      camera.position.copy(target).add(offset);
      if(camera.position.x>WORLD.minX&&camera.position.x<WORLD.maxX&&camera.position.z>WORLD.minZ&&camera.position.z<WORLD.maxZ)camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+THREE.MathUtils.lerp(3,.4,blend));
      if(scenePreset)for(const tree of trees)if(Math.hypot(camera.position.x-tree.x,camera.position.z-tree.z)<3*tree.scale)camera.position.y=Math.max(camera.position.y,heightAt(tree.x,tree.z)+9*tree.scale);
      camera.lookAt(target);
      camera.zoom = THREE.MathUtils.lerp(zoom,1,blend) * (mobile ? scenePreset?.8:THREE.MathUtils.lerp(1.45,.9,blend) : 1);
      camera.updateProjectionMatrix();
      environment.update(elapsed,dt,camera.position,reducedMotion);
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      river.update(elapsed,sky.day,reducedMotion,appearance.reflections,host.clientWidth<600||host.clientHeight<500);
      const selected = state.selected
        ? (gatheringRegistry.sources.get(state.selected) ?? treeById.get(state.selected) ??
          (state.selected === "cabin"
            ? CABIN
            : state.selected === "tent"
              ? TENT
              : Object.values(CAMP_PROPS).find(p=>p.id===state.selected)??null))
        : null;
      marker.visible = !!selected;
      if (selected) {
        marker.position.set(
          selected.x,
          heightAt(selected.x, selected.z) + 0.07,
          selected.z,
        );
        marker.scale.setScalar(
          'sourceId' in selected ? 1.25 : "role" in selected && selected.role === "landmark"
            ? 3.8
            : "kind" in selected
              ? 1.6
              : 5,
        );
      }
      destination.visible = state.route.length > 0;
      if (state.route.length) {
        const p = state.route[state.route.length - 1];
        destination.position.set(p.x, heightAt(p.x, p.z) + 0.09, p.z);
      }
      // Project the actual crown bounds; large landmark scale must not trigger early fading.
      // Bark stays opaque. Stable tree coordinates and colliders never change.
      const playerScreen = new THREE.Vector3(x, y + 1.7, z).project(camera),
        screen = new THREE.Vector3();
      headWorld.set(x,y+1.7,z);headDirection.copy(headWorld).sub(camera.position);
      occlusionRay.set(camera.position,headDirection.clone().normalize());occlusionRay.far=headDirection.length()-.15;
      forest.selections.forEach((o, id) => {
        const t = treeById.get(id)!;
        if(!o.visible||o.userData.forestrySelectable===false){(o as THREE.Mesh).material=forest.material;return;}
        (o as THREE.Mesh).castShadow=Math.hypot(t.x-x,t.z-z)<48;
        const bounds=crownBounds.get(id)!;
        let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
        for(const xx of [bounds.min.x,bounds.max.x])
          for(const yy of [bounds.min.y,bounds.max.y])
            for(const zz of [bounds.min.z,bounds.max.z]){
              projectedCorner.set(xx,yy,zz).applyMatrix4(o.matrixWorld).project(camera);
              left=Math.min(left,projectedCorner.x);right=Math.max(right,projectedCorner.x);
              bottom=Math.min(bottom,projectedCorner.y);top=Math.max(top,projectedCorner.y);
            }
        bounds.getCenter(occluderCenter).applyMatrix4(o.matrixWorld).project(camera);
        const possible=playerScreen.x>left && playerScreen.x<right && playerScreen.y>bottom && playerScreen.y<top && occluderCenter.z<playerScreen.z;
        const hit=possible ? occlusionRay.intersectObject(o,false)[0] : undefined;
        const overlap=!!hit && localHit.copy(hit.point).applyMatrix4(inverseTreeMatrix.copy(o.matrixWorld).invert()).y>2.4;
        (o as THREE.Mesh).material = overlap ? fadeMat : forest.material;
      });
      propFades.forEach(({ center, radius, materials }) => {
        screen.copy(center).project(camera);
        const aspect=camera.aspect,
          halfH = camera.position.distanceTo(center)*Math.tan(camera.fov*Math.PI/360)/camera.zoom;
        const overlap =
          Math.abs(screen.x - playerScreen.x) < radius / (halfH * aspect) &&
          Math.abs(screen.y - playerScreen.y) < radius / halfH &&
          screen.z < playerScreen.z;
        materials.forEach(({ mesh, opaque, fade }) => {
          mesh.material = overlap ? fade : opaque;
        });
      });
      renderer.info.reset();renderer.info.autoReset=false;
      renderer.render(scene, camera);
    },
    stats() {
      return {
        understory:understory.stats(),treeShapes:trees.reduce((counts,t)=>{const name=treeVisual(t).name;counts[name]=(counts[name]??0)+1;return counts;},{} as Record<string,number>),appearance:{...appearance},scenePreset,camp:camp.stats(),terrain:ground.geometry.userData,shaderErrors,
        resources: r.stats(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        gpu: { ...renderer.info.memory },
        zoom,
        yaw,
        elevation,
        canvas: { width: canvas.width, height: canvas.height },
        treeCount: trees.length,
        graphicsBackend,
        managedTrees: trees.filter((t) => t.role === "managed").length,
        gatheringHits: gathering.hits.size,
        characters:characters.stats(),
        gatheringPresentation: gathering.stats(),
        environment:environment.stats(),
        river:river.stats(),
        destroyed,
        contextLost: renderer.getContext().isContextLost(),
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
      pointers.clear();
      forestry.dispose();
      characters.dispose();
      gathering.dispose();
      river.dispose();
      camp.dispose();
      environment.dispose();
      scene.environment=null;
      scene.clear();
      props.clear();
      forest.selections.clear();
      models.clear();
      r.dispose();
      sun.shadow.map?.depthTexture?.dispose();
      sun.shadow.map?.dispose();
      sun.shadow.mapPass?.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return view;
}
export type SceneView = Awaited<ReturnType<typeof createScene>>;
