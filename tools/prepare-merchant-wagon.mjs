import {readFile, writeFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

// The binary exporter uses FileReader for its final Blob even with no textures.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const sourceUrl = new URL('../sources/codels/wagon-v1.glb', import.meta.url);
const outputUrl = new URL('../public/assets/merchant/wagon.glb', import.meta.url);
const bytes = await readFile(sourceUrl);
const {scene} = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
const body = scene.getObjectByName('body');
const wheels = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].map(name => scene.getObjectByName(name));
assert.ok(body && wheels.every(Boolean));
scene.updateMatrixWorld(true);

const colors = {
  woodDark:'#604632', wood:'#946540', woodLight:'#b18a5c',
  iron:'#555952', canvas:'#d9caa4', sack:'#b5a077',
};
const materials = new Map();
const model = new THREE.Group();
model.name='merchant-wagon';
for (const part of [body, ...wheels]) {
  const group = new THREE.Group();
  group.name = part.name;
  part.getWorldPosition(group.position);
  model.add(group);
  const inverse = part.matrixWorld.clone().invert();
  const batches = new Map();
  part.traverse(mesh => {
    if (!mesh.isMesh) return;
    const name = mesh.material.name;
    assert.ok(colors[name], `Unknown wagon material ${name}`);
    if (!materials.has(name)) {
      const material = new THREE.MeshStandardMaterial({
        color:colors[name], roughness:name==='iron'?.75:.9, metalness:0, side:mesh.material.side,
      });
      material.name=name;
      materials.set(name,material);
    }
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') geometry.deleteAttribute(attribute);
    }
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    if (!batches.has(name)) batches.set(name,[]);
    batches.get(name).push(geometry);
  });
  for (const [name, geometries] of batches) {
    const combined = mergeGeometries(geometries);
    assert.ok(combined);
    const mesh = new THREE.Mesh(mergeVertices(combined),materials.get(name));
    mesh.name = `${part.name}-${name}`;
    group.add(mesh);
    combined.dispose();
    geometries.forEach(geometry => geometry.dispose());
  }
}

const bounds = new THREE.Box3().setFromObject(model);
assert.ok(Math.abs(bounds.min.y) < .01, 'Tires must sit on the ground');
model.traverse(mesh => {
  if (mesh.isMesh) assert.ok(mesh.geometry.index.count % 3 === 0);
});
const binary = await new GLTFExporter().parseAsync(model,{binary:true});
await mkdir(new URL('.',outputUrl),{recursive:true});
await writeFile(outputUrl,Buffer.from(binary));
console.log(`Exported ${binary.byteLength} bytes with four independent wheel pivots`);
