import {buildClosedTerrain} from '../world/closed-terrain.ts';
import * as THREE from "three";
import { PALETTE, WORLD } from "../content/world.ts";
import {
  heightAt,
  pathDistance,
  riverX,
  vertexHeight,
} from "../world/surface.ts";
import { random, makeRocks } from "../world/layout.ts";
import type { Resources } from "./resources.ts";
import {createGroundMaterial} from './ground-material.ts';
export function createTerrain(r: Resources) {
  const nx = (WORLD.maxX - WORLD.minX) / WORLD.step,
    nz = (WORLD.maxZ - WORLD.minZ) / WORLD.step;
  const geo = r.geometry('r5-closed-adaptive-terrain',buildClosedTerrain);
  const mat = createGroundMaterial(r);
  const stone=r.own(new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.88,metalness:0,flatShading:true}));
  stone.name='r5b-cut-rock-and-flat-crest';
  const ground = new THREE.Mesh(geo, [mat,stone]);
  ground.receiveShadow = true;
  ground.name = "authoritative-surface";
  const water = new THREE.Mesh(
    r.geometry("stream-water-v2", () => {
      const strip = new THREE.PlaneGeometry(
        WORLD.riverHalfWidth * 2,
        WORLD.maxZ - WORLD.minZ,
        1,
        nz,
      );
      const vertices = strip.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        const z = -vertices.getY(i) + (WORLD.minZ + WORLD.maxZ) / 2;
        vertices.setXYZ(i, vertices.getX(i) + riverX(z), 0, z);
      }
      strip.computeVertexNormals();
      return strip;
    }),
    r.own(
      new THREE.MeshStandardMaterial({
        color: PALETTE.water,
        roughness: 0.38,
        metalness: 0,
        transparent: true,
        opacity: 0.9,
      }),
    ),
  );
  water.position.y = WORLD.waterY;
  water.name = "stream-water-layer";
  water.receiveShadow = true;
  return { ground, water };
}
export function createScenery(r: Resources) {
  const group = new THREE.Group(),
    rng = random(20261029);
  const rock = r.geometry("rock", () => new THREE.IcosahedronGeometry(1, 1));
  const rockMat = r.material(PALETTE.rock, 0.8);
  const dummy = new THREE.Object3D();
  const rocks = makeRocks();
  const rockInstances = new THREE.InstancedMesh(rock, rockMat, rocks.length);
  rocks.forEach((p, i) => {
    dummy.position.set(p.x, heightAt(p.x, p.z) - 0.3, p.z);
    dummy.rotation.set(0.1, p.rotation, 0.1);
    dummy.scale.set(p.scale, p.scale * 0.65, p.scale * 0.8);
    dummy.updateMatrix();
    rockInstances.setMatrixAt(i, dummy.matrix);
  });
  rockInstances.castShadow = true;
  rockInstances.receiveShadow = true;
  group.add(rockInstances);
  // Sparse low flower groups, shared geometry/material, no high-frequency leaf textures.
  const flowerGeo = r.geometry(
    "flower",
    () => new THREE.IcosahedronGeometry(0.13, 0),
  );
  const flowers = new THREE.InstancedMesh(
    flowerGeo,
    r.material("#f3df9b", 0.8),
    90,
  );
  let flowerCount = 0;
  for (let i = 0; i < 1600 && flowerCount < 90; i++) {
    const x = -61 + rng() * 80,
      z = -55 + rng() * 119;
    if (pathDistance(x, z) < 4 || Math.abs(x - riverX(z)) < 8) continue;
    dummy.position.set(x, heightAt(x, z) + 0.18, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.6 + rng());
    dummy.updateMatrix();
    flowers.setMatrixAt(flowerCount++, dummy.matrix);
  }
  flowers.count = flowerCount;
  group.add(flowers);
  return { group };
}
