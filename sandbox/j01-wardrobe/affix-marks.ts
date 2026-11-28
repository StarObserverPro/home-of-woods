import * as THREE from 'three';
import { AFFIX_PARTICLE_SHAPES, type AffixParticleShapeId } from '../../src/content/affix-vfx-library.ts';
import type { Resources } from '../../src/scene/resources.ts';

const columns = 4, rows = 3, cell = 96;
const tiles = new Map(AFFIX_PARTICLE_SHAPES.map(({ id }, i) => [id, i]));

function markShape(p: CanvasRenderingContext2D, id: AffixParticleShapeId) {
  p.lineCap = 'round';
  p.lineJoin = 'round';
  p.fillStyle = '#fff';
  p.strokeStyle = '#fff';
  p.beginPath();
  switch (id) {
    case 'soft-disc': {
      const halo = p.createRadialGradient(0, 0, .08, 0, 0, .86);
      halo.addColorStop(0, '#fff');
      halo.addColorStop(.33, '#fffffff2');
      halo.addColorStop(.57, '#ffffff8a');
      halo.addColorStop(1, '#ffffff00');
      p.fillStyle = halo;
      p.arc(0, 0, .87, 0, 2 * Math.PI);
      break;
    }
    case 'diamond':
      p.moveTo(0, .86); p.lineTo(.57, .05); p.lineTo(0, -.79); p.lineTo(-.57, .05); p.closePath();
      break;
    case 'short-streak': {
      const taper = p.createLinearGradient(-.82, 0, .81, 0);
      taper.addColorStop(0, '#ffffff07'); taper.addColorStop(.8, '#fff');
      p.fillStyle = taper;
      p.moveTo(-.83, -.06); p.quadraticCurveTo(.13, .18, .68, .19);
      p.quadraticCurveTo(.91, .18, .85, .01); p.quadraticCurveTo(.81, -.13, .60, -.14); p.closePath();
      break;
    }
    case 'confetti':
      p.moveTo(-.52, -.50); p.quadraticCurveTo(-.35, .04, -.57, .47);
      p.lineTo(.42, .64); p.quadraticCurveTo(.70, .09, .49, -.34); p.closePath();
      break;
    case 'hollow-ring':
      p.arc(0, 0, .82, 0, 2 * Math.PI); p.moveTo(.62, 0); p.arc(0, 0, .62, 0, 2 * Math.PI, true);
      break;
    case 'soft-arc':
      p.moveTo(-.77, -.05); p.quadraticCurveTo(-.02, .75, .79, .25);
      p.quadraticCurveTo(.65, .03, .43, -.06); p.quadraticCurveTo(-.03, .25, -.77, -.05);
      break;
    case 'four-star':
      p.moveTo(0, .91); p.quadraticCurveTo(.11, .15, .86, 0);
      p.quadraticCurveTo(.11, -.15, 0, -.91); p.quadraticCurveTo(-.11, -.15, -.86, 0);
      p.quadraticCurveTo(-.11, .15, 0, .91);
      break;
    case 'petal': {
      const gradient = p.createLinearGradient(0, -.74, .23, .73);
      gradient.addColorStop(0, '#ffffff99'); gradient.addColorStop(.65, '#fff');
      p.fillStyle = gradient;
      p.moveTo(-.16, -.76); p.bezierCurveTo(-.84, -.36, -.67, .49, .13, .78);
      p.bezierCurveTo(.60, .97, .76, .56, .62, .16); p.bezierCurveTo(.52, -.21, .22, -.61, -.16, -.76);
      break;
    }
    case 'leaf':
      p.moveTo(-.58, -.72); p.lineTo(-.29, -.47);
      p.bezierCurveTo(-.57, .13, -.12, .66, .65, .78); p.bezierCurveTo(.68, -.16, .30, -.53, -.22, -.57);
      p.lineTo(-.52, -.82); p.closePath();
      p.fill();
      p.globalCompositeOperation = 'destination-out'; p.lineWidth = .065;
      p.beginPath(); p.moveTo(-.22, -.52); p.quadraticCurveTo(.08, -.19, .40, .35); p.stroke();
      p.globalCompositeOperation = 'source-over';
      return;
    case 'crescent':
      p.moveTo(.41, .77); p.bezierCurveTo(-.56, .95, -.98, .28, -.74, -.40);
      p.bezierCurveTo(-.56, -.95, .23, -.98, .65, -.44); p.bezierCurveTo(-.08, -.63, -.54, .16, .41, .77);
      break;
    case 'snowflake':
      p.lineWidth = .10;
      for (let i = 0; i < 6; i++) {
        p.moveTo(0, 0); p.lineTo(0, .84);
        p.moveTo(-.18, .59); p.lineTo(0, .43); p.lineTo(.18, .59);
        p.rotate(Math.PI / 3);
      }
      p.stroke();
      return;
  }
  p.fill();
}

function makeAtlas(resources: Resources) {
  const canvas = document.createElement('canvas');
  canvas.width = columns * cell;
  canvas.height = rows * cell;
  const p = canvas.getContext('2d')!;
  for (const [id, tile] of tiles) {
    p.save();
    p.translate((tile % columns + .5) * cell, (Math.floor(tile / columns) + .5) * cell);
    p.scale(cell / 2, -cell / 2);
    markShape(p, id);
    p.restore();
  }
  const texture = resources.own(new THREE.CanvasTexture(canvas));
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

const vertexShader = /* glsl */`
attribute vec3 markCenter;
attribute vec4 markForm;
attribute vec4 markColor;
uniform float glyphMinScale;
varying vec2 atlasUv;
varying vec4 color;
void main() {
  float s = sin(markForm.y), c = cos(markForm.y);
  float size = max(markForm.x, glyphMinScale);
  vec2 offset = mat2(c, s, -s, c) * position.xy * size;
  vec4 viewPoint = viewMatrix * vec4(markCenter, 1.0);
  if (markForm.w > 0.5) viewPoint += viewMatrix * vec4(offset.x, 0.0, -offset.y, 0.0);
  else viewPoint.xy += offset;
  gl_Position = projectionMatrix * viewPoint;
  float tileX = mod(markForm.z, ${columns}.0), tileY = floor(markForm.z / ${columns}.0);
  atlasUv = (vec2(tileX, ${rows - 1}.0 - tileY) + uv) / vec2(${columns}.0, ${rows}.0);
  color = markColor;
}`;

const fragmentShader = /* glsl */`
uniform sampler2D glyphAtlas;
varying vec2 atlasUv;
varying vec4 color;
void main() {
  float mask = texture2D(glyphAtlas, atlasUv).a;
  if (mask < 0.015) discard;
  gl_FragColor = vec4(mix(color.rgb, vec3(1.0), 0.10 * mask), color.a * mask);
  #include <colorspace_fragment>
}`;

export function createAffixMarks(resources: Resources, stage: THREE.Scene, capacity: number) {
  const geometry = resources.own(new THREE.InstancedBufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const dynamic = (components: number) => new THREE.InstancedBufferAttribute(new Float32Array(capacity * components), components).setUsage(THREE.DynamicDrawUsage);
  const centers = dynamic(3), forms = dynamic(4), colors = dynamic(4);
  geometry.setAttribute('markCenter', centers).setAttribute('markForm', forms).setAttribute('markColor', colors);
  const material = resources.own(new THREE.ShaderMaterial({
    uniforms: { glyphAtlas: { value: makeAtlas(resources) }, glyphMinScale: { value: 0 } },
    vertexShader, fragmentShader, transparent: true, depthWrite: false, toneMapped: false,
  }));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = '衣装词条 · 粒形';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 6;
  stage.add(mesh);
  let count = 0;
  return {
    clear() { count = 0; },
    mark(center: THREE.Vector3, size: number, angle: number, id: AffixParticleShapeId, floor: boolean, color: THREE.Color, alpha: number) {
      if (count >= capacity || alpha < .018) return;
      centers.setXYZ(count, center.x, center.y, center.z);
      forms.setXYZW(count, size, angle, tiles.get(id)!, floor ? 1 : 0);
      colors.setXYZW(count, color.r, color.g, color.b, alpha);
      count++;
    },
    commit(minimumWorldSize: number) {
      geometry.instanceCount = count;
      mesh.visible = count > 0;
      material.uniforms.glyphMinScale.value = minimumWorldSize;
      if (!mesh.visible) return;
      for (const attribute of [centers, forms, colors]) attribute.needsUpdate = true;
    },
    get count() { return count; },
  };
}
