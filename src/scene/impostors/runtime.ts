import * as THREE from 'three';
import {validateImpostorManifest} from './atlas-layout.ts';
import type {ImpostorManifest} from './atlas-layout.ts';

export interface ImpostorAtlas {
  manifest: ImpostorManifest;
  albedo: THREE.Texture;
  normal: THREE.Texture;
  dispose(): void;
}

export interface ImpostorPlacement {
  /** Asset root, not the center of its camera-facing card. */
  position: [number, number, number];
  scale?: [number, number, number];
  yaw?: number;
  tone?: number;
}

export async function loadImpostorAtlas(manifestUrl: string): Promise<ImpostorAtlas> {
  const url = new URL(manifestUrl, window.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impostor manifest: HTTP ${response.status}`);
  const manifest = validateImpostorManifest(await response.json());
  const loader = new THREE.TextureLoader();
  const result = await Promise.allSettled([
    loader.loadAsync(new URL(manifest.albedo, url).href), loader.loadAsync(new URL(manifest.normal, url).href),
  ]);
  if (result.some(item => item.status === 'rejected')) {
    for (const item of result) if (item.status === 'fulfilled') item.value.dispose();
    throw new Error('Impostor texture load failed; keep the geometry representation');
  }
  const albedo = (result[0] as PromiseFulfilledResult<THREE.Texture>).value;
  const normal = (result[1] as PromiseFulfilledResult<THREE.Texture>).value;
  for (const texture of [albedo, normal]) {
    const dimensions = texture.image as {width: number; height: number};
    if (dimensions.width !== manifest.width || dimensions.height !== manifest.height) {
      albedo.dispose(); normal.dispose(); throw new Error('Impostor texture dimensions differ from manifest');
    }
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = texture === albedo ? THREE.LinearSRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true;
  }
  let disposed = false;
  return {manifest, albedo, normal, dispose() {if (disposed) return; disposed = true; albedo.dispose(); normal.dispose();}};
}

const vertexDeclarations = /* glsl */`
uniform vec3 impostorCenter;
uniform float impostorSpan;
varying vec4 vImpostorFrames;
varying vec4 vImpostorWeights;
varying float vImpostorAzimuth;
varying mat3 vImpostorNormalToView;
float impostorIndex(float ring,float angle){return ring>2.5?24.:ring*8.+mod(angle,8.);}
`;

const vertexPlacement = /* glsl */`
mat4 impostorWorld=modelMatrix*instanceMatrix;
vec3 impostorX=impostorWorld[0].xyz,impostorY=impostorWorld[1].xyz,impostorZ=impostorWorld[2].xyz;
vec3 impostorCofX=cross(impostorY,impostorZ),impostorCofY=cross(impostorZ,impostorX),impostorCofZ=cross(impostorX,impostorY);
vec3 impostorDelta=cameraPosition-(impostorWorld*vec4(impostorCenter,1.)).xyz;
vec3 impostorDirection=normalize(vec3(dot(impostorDelta,impostorCofX),dot(impostorDelta,impostorCofY),dot(impostorDelta,impostorCofZ)));
float impostorHorizontal=length(impostorDirection.xz);
float impostorAzimuth=impostorHorizontal<.00001?0.:mod(atan(impostorDirection.x,impostorDirection.z)+6.28318530718,6.28318530718);
float impostorElevation=max(0.,atan(impostorDirection.y,max(.00001,impostorHorizontal)));
float impostorAngle=impostorAzimuth/0.785398163397;
float impostorRing=min(3.,impostorElevation/0.523598775598);
float impostorA=floor(impostorAngle),impostorR=floor(impostorRing);
vec2 impostorBlend=fract(vec2(impostorAngle,impostorRing));
vImpostorFrames=vec4(impostorIndex(impostorR,impostorA),impostorIndex(impostorR,impostorA+1.),impostorIndex(min(3.,impostorR+1.),impostorA),impostorIndex(min(3.,impostorR+1.),impostorA+1.));
vImpostorWeights=vec4((1.-impostorBlend.x)*(1.-impostorBlend.y),impostorBlend.x*(1.-impostorBlend.y),(1.-impostorBlend.x)*impostorBlend.y,impostorBlend.x*impostorBlend.y);
vImpostorAzimuth=impostorAzimuth;
vImpostorNormalToView=mat3(viewMatrix)*mat3(impostorCofX,impostorCofY,impostorCofZ);
vec3 impostorRight=vec3(cos(impostorAzimuth),0.,-sin(impostorAzimuth));
// Below the horizon use the lowest capture and a vertical card.
vec3 impostorFacing=vec3(sin(impostorAzimuth)*cos(impostorElevation),sin(impostorElevation),cos(impostorAzimuth)*cos(impostorElevation));
vec3 impostorUp=normalize(cross(impostorFacing,impostorRight));
vec3 transformed=impostorCenter+(impostorRight*position.x+impostorUp*position.y)*impostorSpan;
`;

const fragmentDeclarations = /* glsl */`
uniform sampler2D impostorNormals;
uniform vec2 impostorAtlasSize;
uniform float impostorFrameSize;
uniform float impostorPadding;
uniform float impostorDebug;
varying vec4 vImpostorFrames;
varying vec4 vImpostorWeights;
varying float vImpostorAzimuth;
varying mat3 vImpostorNormalToView;
vec2 impostorUv(float index,vec2 uv){
  vec2 pixel=vec2(mod(index,8.),floor(index/8.))*impostorFrameSize;
  pixel+=vec2(impostorPadding+.5)+uv*(impostorFrameSize-2.*impostorPadding-1.);
  return vec2(pixel.x/impostorAtlasSize.x,1.-pixel.y/impostorAtlasSize.y);
}
void impostorSample(out vec4 colour,out vec3 assetNormal){
  colour=vec4(0.);assetNormal=vec3(0.);
  for(int i=0;i<4;i++){
    float weight=vImpostorWeights[i];if(weight<.00001)continue;
    float frame=vImpostorFrames[i];
    // Input image coordinates are top-left, whereas plane UV is bottom-left.
    vec2 localUv=vMapUv;
    if(frame>23.5){
      float c=cos(vImpostorAzimuth),s=sin(vImpostorAzimuth);
      localUv=mat2(c,s,-s,c)*(localUv-.5)+.5;
    }
    if(any(lessThan(localUv,vec2(0.)))||any(greaterThan(localUv,vec2(1.))))continue;
    vec2 uv=impostorUv(frame,vec2(localUv.x,1.-localUv.y));
    vec4 sampleColour=texture2D(map,uv);
    float coverage=sampleColour.a*weight;
    colour+=vec4(sampleColour.rgb*coverage,coverage);
    assetNormal+=(texture2D(impostorNormals,uv).xyz*2.-1.)*coverage;
  }
  colour.rgb/=max(.00001,colour.a);
  assetNormal=normalize(assetNormal+vec3(0.,.000001,0.));
}
`;

/**
 * One draw call per atlas. A maximum of four neighbouring views is blended.
 * Uses the scene's ordinary MeshStandard lighting/fog and does not bake sunlight.
 * Surface depth is the card plane; use only for noninteractive distant scenery.
 * The caller owns the atlas; a batch only disposes its mesh/geometry/material.
 */
export function createImpostorBatch(atlas: ImpostorAtlas, placements: readonly ImpostorPlacement[]) {
  validateImpostorManifest(atlas.manifest);
  for (const placement of placements) {
    const scale = placement.scale ?? [1, 1, 1];
    if (placement.position.length !== 3 || !placement.position.every(Number.isFinite) || scale.length !== 3 ||
      !scale.every(value => Number.isFinite(value) && value > 0) ||
      !Number.isFinite(placement.yaw ?? 0) || !Number.isFinite(placement.tone ?? 1)) throw new Error('Invalid impostor placement');
  }
  const {manifest} = atlas;
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(manifest.center), manifest.frameSpan * Math.SQRT1_2);
  geometry.boundingBox = new THREE.Box3().setFromCenterAndSize(geometry.boundingSphere.center,
    new THREE.Vector3().setScalar(manifest.frameSpan * Math.SQRT2));
  const debug = {value: 0};
  const material = new THREE.MeshStandardMaterial({color: 0xffffff, map: atlas.albedo,
    roughness: 1, metalness: 0, alphaTest: .42, depthWrite: true, transparent: false,
    side: THREE.DoubleSide, alphaToCoverage: true});
  material.name = `impostor-${manifest.id}`;
  material.customProgramCacheKey = () => 'how-impostor-25-linear-normal-v1';
  material.onBeforeCompile = shader => {
    shader.uniforms.impostorCenter = {value: new THREE.Vector3().fromArray(manifest.center)};
    shader.uniforms.impostorSpan = {value: manifest.frameSpan};
    shader.uniforms.impostorNormals = {value: atlas.normal};
    shader.uniforms.impostorAtlasSize = {value: new THREE.Vector2(manifest.width, manifest.height)};
    shader.uniforms.impostorFrameSize = {value: manifest.frameSize};
    shader.uniforms.impostorPadding = {value: manifest.padding};
    shader.uniforms.impostorDebug = debug;
    shader.vertexShader = vertexDeclarations + shader.vertexShader.replace('#include <begin_vertex>', vertexPlacement);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', fragmentDeclarations + '\nvoid main() {')
      .replace('#include <map_fragment>', 'vec4 impostorColour;vec3 impostorAssetNormal;impostorSample(impostorColour,impostorAssetNormal);diffuseColor*=impostorColour;')
      .replace('#include <normal_fragment_maps>', 'normal=normalize(vImpostorNormalToView*impostorAssetNormal);')
      .replace('#include <opaque_fragment>', 'if(impostorDebug>.5&&impostorDebug<1.5)outgoingLight=diffuseColor.rgb;else if(impostorDebug>1.5)outgoingLight=impostorAssetNormal*.5+.5;\n#include <opaque_fragment>');
  };
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = `distant-impostor-${manifest.id}`; mesh.castShadow = false; mesh.receiveShadow = false;
  const transform = new THREE.Object3D(), tone = new THREE.Color();
  placements.forEach((placement, index) => {
    const scale = placement.scale ?? [1, 1, 1];
    transform.position.fromArray(placement.position); transform.scale.fromArray(scale); transform.rotation.set(0, placement.yaw ?? 0, 0);
    transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tone.setScalar(placement.tone ?? 1));
  });
  mesh.computeBoundingSphere(); mesh.computeBoundingBox();
  let disposed = false;
  return {
    mesh, material,
    debug(mode: 'final' | 'albedo' | 'normal') {debug.value = mode === 'albedo' ? 1 : mode === 'normal' ? 2 : 0;},
    stats() {return {atlas: manifest.id, instances: placements.length, triangles: placements.length * 2,
      sourceTrianglesPerInstance: manifest.sourceTriangles, drawCalls: placements.length ? 1 : 0,
      frameCount: manifest.frames.length, textureBytes: manifest.width * manifest.height * 4 * 2,
      textureSamplesMax: 8, mipmaps: false, castsShadow: false, disposed};},
    dispose() {if (disposed) return; disposed = true; mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose();},
  };
}
