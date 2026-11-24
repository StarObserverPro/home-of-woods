import * as THREE from 'three';
import {bakeImpostor, impostorRgbaBase64} from '../../src/scene/impostors/bake.ts';
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

function rendererMemory() {
  return {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures};
}

function warmRendererBaseline() {
  const geometry = new THREE.PlaneGeometry(1, 1), material = new THREE.MeshStandardMaterial({roughness: .7, metalness: .5});
  const trace: {dfg?: {value: unknown}} = {};
  material.onBeforeCompile = shader => {trace.dfg = shader.uniforms.dfgLUT;};
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
  camera.position.z = 2;
  const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(1, 2, 3);
  scene.add(new THREE.Mesh(geometry, material), light);
  try {renderer.render(scene, camera);} finally {geometry.dispose(); material.dispose(); scene.clear();}
  // Three's WebGLRenderer assigns getDFGLUT() to Standard uniforms. This global
  // cache belongs to the renderer/engine, not to a tree batch or its atlas.
  const dfg = trace.dfg?.value;
  return {...rendererMemory(), sharedStandardTexture: dfg instanceof THREE.Texture ? dfg.name : null};
}

const rendererBaseline = warmRendererBaseline();

function dilatedTexels(bytes: Uint8Array) {
  let count = 0;
  for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] === 0 && (bytes[i] || bytes[i + 1] || bytes[i + 2])) count++;
  return count;
}

/** Read the actual uploaded texture, without canvas or premultiplied blending. */
function uploadedPadding(texture: THREE.Texture, width: number, height: number) {
  const target = new THREE.WebGLRenderTarget(width, height, {depthBuffer: false, stencilBuffer: false});
  const geometry = new THREE.PlaneGeometry(2, 2), material = new THREE.ShaderMaterial({
    uniforms: {dataMap: {value: texture}}, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 dataUv;void main(){dataUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D dataMap;varying vec2 dataUv;void main(){gl_FragColor=texture2D(dataMap,dataUv);}',
  });
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
  const camera = new THREE.OrthographicCamera(), pixels = new Uint8Array(width * height * 4);
  const prior = renderer.getRenderTarget(), viewport = renderer.getViewport(new THREE.Vector4());
  try {
    renderer.setRenderTarget(target); renderer.setViewport(0, 0, width, height);
    renderer.render(scene, camera); renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return dilatedTexels(pixels);
  } finally {
    renderer.setRenderTarget(prior); renderer.setViewport(viewport);
    target.dispose(); geometry.dispose(); material.dispose(); scene.clear();
  }
}

const api = {
  bake(frameSize: 128 | 256) {
    const source = coniferClusterSource();
    try {
      const prior = {colourSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping,
        viewport: renderer.getViewport(new THREE.Vector4()).toArray(), target: renderer.getRenderTarget(), memory: rendererMemory()};
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
        albedo: impostorRgbaBase64(first.albedo), normal: impostorRgbaBase64(first.normal),
        checks: {deterministic, restored, coverage, errors: [...errors], backend,
          bakerMemoryRestored: JSON.stringify(prior.memory) === JSON.stringify(rendererMemory()), rendererBaseline,
          dilatedTexels: {albedo: dilatedTexels(first.albedo), normal: dilatedTexels(first.normal)}}};
    } finally {source.dispose();}
  },
  async review(manifestUrl: string) {
    review?.dispose();
    const source = coniferClusterSource(), atlas = await loadImpostorAtlas(manifestUrl);
    const {width, height} = atlas.manifest;
    const texturePadding = {albedo: uploadedPadding(atlas.albedo, width, height), normal: uploadedPadding(atlas.normal, width, height)};
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
    return {errors: [...errors], backend, rendered, modes, texturePadding, batch: batch.stats(), before,
      after: {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures}};
  },
  disposeReview() {
    review?.dispose(); review = null;
    return {...rendererMemory(), rendererBaseline, errors: [...errors]};
  },
};
(window as unknown as {__IMPOSTOR_TOOL__: typeof api}).__IMPOSTOR_TOOL__ = api;
