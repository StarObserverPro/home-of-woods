import * as THREE from 'three';
import {dilateTransparentRgb, impostorFrames, IMPOSTOR_LAYOUT} from './atlas-layout.ts';
import type {ImpostorManifest} from './atlas-layout.ts';

export interface BakedImpostor {
  manifest: ImpostorManifest;
  albedo: Uint8Array;
  normal: Uint8Array;
}

/**
 * Offline tool: capture static, opaque vertex-colour meshes in asset coordinates.
 * This function never enters the game's render loop. All renderer state is restored.
 * The source is read-only; lights, sky, tone mapping and exposure are not baked.
 */
export function bakeImpostor(renderer: THREE.WebGLRenderer, source: THREE.Object3D, options: {
  id: string; source: string; frameSize?: 128 | 256;
}): BakedImpostor {
  const frameSize = options.frameSize ?? 128, padding = IMPOSTOR_LAYOUT.padding;
  const inner = frameSize - padding * 2, width = frameSize * 8, height = frameSize * 4;
  source.updateWorldMatrix(true, true);
  const rootInverse = source.matrixWorld.clone().invert(), capture = new THREE.Scene();
  const temporary: {dispose(): void}[] = [];
  const sourceTriangles = {value: 0};
  const normalMaterial = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 assetNormal;void main(){assetNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 assetNormal;void main(){gl_FragColor=vec4(normalize(assetNormal)*.5+.5,1.);}`,
    toneMapped: false,
  });
  temporary.push(normalMaterial);
  try {
    source.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh ||
        Array.isArray(object.material) || object.morphTargetInfluences?.length) {
        throw new Error('Bake source must contain ordinary static single-material meshes');
      }
      const material = object.material as THREE.MeshStandardMaterial;
      if (material.map || material.alphaMap || material.transparent) throw new Error('Bake source must be opaque vertex colour geometry');
      let geometry = object.geometry.clone();
      if (material.flatShading && geometry.index) {
        const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat;
      }
      geometry.applyMatrix4(rootInverse.clone().multiply(object.matrixWorld));
      if (material.flatShading) geometry.computeVertexNormals();
      temporary.push(geometry);
      sourceTriangles.value += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      const albedo = new THREE.MeshBasicMaterial({color: material.color ?? 0xffffff,
        vertexColors: !!geometry.getAttribute('color'), toneMapped: false, side: material.side});
      temporary.push(albedo);
      const mesh = new THREE.Mesh(geometry, albedo); mesh.frustumCulled = false; capture.add(mesh);
    });
    if (!capture.children.length) throw new Error('Empty impostor source');
    const box = new THREE.Box3().setFromObject(capture), center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() * .5, span = radius * 2.08;
    if (!Number.isFinite(span) || span <= 0) throw new Error('Invalid impostor source bounds');
    const camera = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, .01, radius * 8);
    const target = new THREE.WebGLRenderTarget(inner, inner, {type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, stencilBuffer: false, samples: 4});
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    temporary.push(target);
    const albedo = new Uint8Array(width * height * 4), normal = new Uint8Array(width * height * 4);
    const prior = {
      target: renderer.getRenderTarget(), cubeFace: renderer.getActiveCubeFace(), mipLevel: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), clear: renderer.getClearColor(new THREE.Color()).clone(),
      clearAlpha: renderer.getClearAlpha(), autoClear: renderer.autoClear,
      toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
    };
    const frames = impostorFrames();
    try {
      renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.autoClear = true; renderer.setScissorTest(false); renderer.setClearColor(0, 0);
      for (const frame of frames) {
        camera.position.copy(center).addScaledVector(new THREE.Vector3().fromArray(frame.direction), radius * 3);
        camera.up.set(0, frame.index === 24 ? 0 : 1, frame.index === 24 ? -1 : 0);
        camera.lookAt(center); camera.updateMatrixWorld(true);
        for (const [bytes, override] of [[albedo, null], [normal, normalMaterial]] as const) {
          capture.overrideMaterial = override;
          renderer.setRenderTarget(target); renderer.setViewport(0, 0, inner, inner);
          renderer.clear(); renderer.render(capture, camera);
          const read = new Uint8Array(inner * inner * 4);
          renderer.readRenderTargetPixels(target, 0, 0, inner, inner, read);
          // MSAA resolve averages RGB with transparent black. Store straight RGB
          // so later alpha-weighted interpolation does not darken the silhouette.
          for (let i = 0; i < read.length; i += 4) if (read[i + 3] > 0 && read[i + 3] < 255) {
            const scale = 255 / read[i + 3];
            read[i] = Math.min(255, Math.round(read[i] * scale));
            read[i + 1] = Math.min(255, Math.round(read[i + 1] * scale));
            read[i + 2] = Math.min(255, Math.round(read[i + 2] * scale));
          }
          // Isolate dilation to this tile. No colour crosses into adjacent views.
          const tile = new Uint8Array(frameSize * frameSize * 4);
          for (let y = 0; y < inner; y++) {
            tile.set(read.subarray((inner - y - 1) * inner * 4, (inner - y) * inner * 4), ((y + padding) * frameSize + padding) * 4);
          }
          const padded = dilateTransparentRgb(tile, frameSize, frameSize, padding);
          for (let y = 0; y < frameSize; y++) {
            bytes.set(padded.subarray(y * frameSize * 4, (y + 1) * frameSize * 4),
              ((frame.row * frameSize + y) * width + frame.column * frameSize) * 4);
          }
        }
      }
    } finally {
      renderer.setRenderTarget(prior.target, prior.cubeFace, prior.mipLevel);
      renderer.setViewport(prior.viewport); renderer.setScissor(prior.scissor); renderer.setScissorTest(prior.scissorTest);
      renderer.setClearColor(prior.clear, prior.clearAlpha); renderer.autoClear = prior.autoClear;
      renderer.toneMapping = prior.toneMapping; renderer.outputColorSpace = prior.outputColorSpace;
      capture.overrideMaterial = null;
    }
    return {manifest: {
      version: 1, id: options.id, source: options.source, encoding: 'linear-rgba8', normalSpace: 'asset', alpha: 'coverage',
      frameSize, padding, columns: 8, rows: 4, width, height, frameSpan: span,
      center: center.toArray(), bounds: {min: box.min.toArray(), max: box.max.toArray()},
      frames, sourceTriangles: sourceTriangles.value,
      albedo: `${options.id}-albedo.png`, normal: `${options.id}-normal.png`,
    }, albedo, normal};
  } finally {
    capture.clear(); for (const object of temporary) object.dispose();
  }
}

/** Preserve all raw RGB, including alpha=0 padding, on the trip to Node's PNG encoder. */
export function impostorRgbaBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  }
  return btoa(binary);
}
