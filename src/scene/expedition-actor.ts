import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CHARACTER} from '../content/characters.ts';
import type {Resources} from './resources.ts';
import {createFootContactAnchors} from './lighting/foot-contact-anchors.ts';

/** Borrows the accepted KayKit body and clips; the host remains the only clock. */
export async function createExpeditionActor(owner: Resources) {
  const loader = new GLTFLoader();
  const urls = ['/assets/characters/player.glb', '/assets/characters/motions.glb', '/assets/gathering/mushrooms.glb', '/assets/gathering/branches.glb'];
  const loaded = await Promise.all(urls.map(url => loader.loadAsync(url).then(asset => {
    // Register each successful request immediately; a failed sibling cannot orphan it.
    asset.scene.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) owner.own(object.skeleton);
    if (!(object instanceof THREE.Mesh)) return;
    owner.own(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      owner.own(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) owner.own(value);
    }
    object.castShadow = true; object.receiveShadow = true;
    }); return asset;
  })));
  if (owner.disposed) throw new Error('林地已关闭');
  const root = new THREE.Group(); root.name = 'expedition-player';
  const body = loaded[0].scene; body.scale.multiplyScalar(CHARACTER.worldScale); root.add(body);
  const footAnchors = createFootContactAnchors(body,{idPrefix:'expedition-player'});
  const mixer = new THREE.AnimationMixer(body);
  const clips = new Map(loaded[1].animations.map(clip => [clip.name, clip]));
  const actions = new Map<string, THREE.AnimationAction>();
  for (const name of ['Idle_A', 'Walking_A', 'Running_A', 'PickUp']) {
    const clip = clips.get(name);
    if (!clip) throw new Error(`缺少角色动作：${name}`);
    actions.set(name, mixer.clipAction(clip));
  }
  let mode = '', facing = 0;
  // Carrying is visible even when a panel is closed. It reads the same inventory load as speed.
  const bundle = new THREE.Group(); bundle.name = 'carried-wood-bundle';
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(owner.geometry('expedition-held-branch', () => new THREE.CylinderGeometry(.07, .09, 1.6, 7)), owner.material('#8b6748', .85));
    log.rotation.z = Math.PI / 2; log.position.set(0, 1.12 + i * .12, .53 + (i % 2) * .13); bundle.add(log);
  }
  bundle.visible = false; root.add(bundle);
  return {
    root, feet:footAnchors.update, footStats:footAnchors.stats,
    templates: {mushrooms: loaded[2].scene, branches: loaded[3].scene},
    update(view: {x: number; y: number; z: number; facing: number; speed: number; gathering: boolean; carryingWood: boolean}, dt: number) {
      root.position.set(view.x, view.y, view.z);
      const delta = Math.atan2(Math.sin(view.facing - facing), Math.cos(view.facing - facing));
      facing += delta * (1 - Math.exp(-14 * dt)); body.rotation.y = facing; bundle.rotation.y = facing;
      const next = view.gathering ? 'PickUp' : view.speed > 4.4 ? 'Running_A' : view.speed > .03 ? 'Walking_A' : 'Idle_A';
      if (next !== mode) {
        const previous = actions.get(mode), action = actions.get(next)!;
        action.reset().play(); if (previous) action.crossFadeFrom(previous, .16, false); mode = next;
      }
      const action = actions.get(next)!;
      action.timeScale = next === 'Walking_A' ? Math.max(.35, view.speed / 3.3) : next === 'Running_A' ? view.speed / 5.6 : 1;
      mixer.update(dt); bundle.visible = view.carryingWood && !view.gathering;
    },
    dispose() {mixer.stopAllAction(); mixer.uncacheRoot(body); root.removeFromParent();},
  };
}
