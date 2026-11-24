import * as THREE from 'three';
import {bakeImpostor, impostorPng} from '../../src/scene/impostors/bake.ts';
import {createImpostorBatch, loadImpostorAtlas} from '../../src/scene/impostors/runtime.ts';
import {coniferClusterSource} from './source.ts';

const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(1); renderer.setSize(960, 600); document.body.append(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
const errors: string[] = [];
renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
  errors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join('\n'));
};
const debug = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
const backend = debug ? renderer.getContext().getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown';
let review: {dispose(): void} | null = null;

const api = {
  bake(frameSize: 128 | 256) {
    const source = coniferClusterSource();
    try {
      const prior = {colourSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping,
        viewport: renderer.getViewport(new THREE.Vector4()).toArray(), target: renderer.getRenderTarget()};
      const first = bakeImpostor(renderer, source.group, {id: 'rainier-conifer-cluster', frameSize,
        source: 'Project-owned distantTreeGeometry, composed by tools/impostors/source.ts'});
      const repeat = bakeImpostor(renderer, source.group, {id: 'rainier-conifer-cluster', frameSize,
        source: 'Project-owned distantTreeGeometry, composed by tools/impostors/source.ts'});
      const deterministic = first.albedo.every((v, i) => v === repeat.albedo[i]) && first.normal.every((v, i) => v === repeat.normal[i]);
      const restored = prior.colourSpace === renderer.outputColorSpace && prior.toneMapping === renderer.toneMapping &&
        prior.target === renderer.getRenderTarget() && JSON.stringify(prior.viewport) === JSON.stringify(renderer.getViewport(new THREE.Vector4()).toArray());
      const coverage = first.manifest.frames.map(frame => {
        let opaque = 0, borderAlpha = 0;
        for (let y = 0; y < frameSize; y++) for (let x = 0; x < frameSize; x++) {
          const index = ((frame.row * frameSize + y) * first.manifest.width + frame.column * frameSize + x) * 4 + 3;
          if (first.albedo[index] > 0) opaque++;
          if (x < 3 || x >= frameSize - 3 || y < 3 || y >= frameSize - 3) borderAlpha += first.albedo[index];
        }
        return {index: frame.index, opaque, borderAlpha};
      });
      return {manifest: first.manifest,
        albedo: impostorPng(first.albedo, first.manifest.width, first.manifest.height),
        normal: impostorPng(first.normal, first.manifest.width, first.manifest.height),
        checks: {deterministic, restored, coverage, errors: [...errors], backend}};
    } finally {source.dispose();}
  },
  async review(manifestUrl: string) {
    review?.dispose();
    const source = coniferClusterSource(), atlas = await loadImpostorAtlas(manifestUrl);
    const before = {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures};
    const batch = createImpostorBatch(atlas, [{position: [11, 0, 0]}]);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#d4dfdc');
    source.group.position.x = -11; scene.add(source.group, batch.mesh);
    // Diagnostic only: compare unlit data, not a second outdoor lighting setup.
    const originals: THREE.Material[] = [], diagnosticMaterials: THREE.Material[] = [];
    source.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      originals.push(object.material);
      const material = new THREE.MeshBasicMaterial({vertexColors: true}); diagnosticMaterials.push(material); object.material = material;
    });
    const camera = new THREE.OrthographicCamera(-25, 25, 15.625, -15.625, .1, 160);
    camera.position.set(0, 24, 55); camera.lookAt(0, 4, 0); camera.updateMatrixWorld(true);
    batch.debug('albedo'); renderer.render(scene, camera);
    review = {dispose() {
      batch.dispose(); atlas.dispose(); source.dispose(); for (const m of diagnosticMaterials) m.dispose(); scene.clear();
    }};
    let rendered = 1;
    const modes = [];
    for (const elevation of [0, 30, 60, 89]) for (const azimuth of [0, 44.9, 45.1, 180, 359.9]) {
      const e = elevation * Math.PI / 180, a = azimuth * Math.PI / 180;
      camera.position.set(Math.sin(a) * Math.cos(e) * 60, 4 + Math.sin(e) * 60, Math.cos(a) * Math.cos(e) * 60);
      camera.up.set(0, 1, 0); camera.lookAt(0, 4, 0); camera.updateMatrixWorld(true);
      renderer.render(scene, camera); rendered++;
      modes.push({elevation, azimuth, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles});
    }
    // Restore an ordinary oblique comparison for the evidence image.
    camera.position.set(0, 24, 55); camera.lookAt(0, 4, 0); camera.updateMatrixWorld(true); renderer.render(scene, camera);
    return {errors: [...errors], backend, rendered, modes, batch: batch.stats(), before,
      after: {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures}};
  },
  disposeReview() {
    review?.dispose(); review = null;
    return {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, errors: [...errors]};
  },
};
(window as unknown as {__IMPOSTOR_TOOL__: typeof api}).__IMPOSTOR_TOOL__ = api;
