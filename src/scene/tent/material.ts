import * as THREE from 'three';
import { TENT_CLOTH as C } from '../../content/tent.ts';
import type { TentCanvasVariant } from '../../content/tent.ts';
import type { Resources } from '../resources.ts';

const hash = (x: number, y: number) => {
  let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 113, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
};
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const colors = Object.fromEntries(Object.entries(C.palette).map(([key, color]) => [key, rgb(color)]));

/** Broad original step-diamond border. Repeat is along the tent's length;
 * this is an authored geometric textile, not a scan of a named traditional work. */
function pattern(variant: TentCanvasVariant) {
  const size = C.patternResolution, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    const repeat = (u * 5) % 1, across = Math.abs(repeat - .5) * 2;
    let color = variant === 'sage' ? colors.sage : colors.cream;
    if (v > .62 && v < .94) color = colors.red;
    if ((v > .60 && v < .635) || (v > .925 && v < .965)) color = colors.ink;
    if ((v > .57 && v < .59) || (v > .975)) color = colors.ochre;
    if (v >= .65 && v <= .91) {
      const down = Math.abs((v - .78) / .13);
      // Three deliberately broad steps keep the motif legible at gameplay scale.
      const width = down < .34 ? .77 : down < .67 ? .53 : .27;
      if (across < width) color = colors.cream;
      if (across < .22 && down < .30) color = colors.ink;
    }
    // Low amplitude dye variation only. Fiber relief belongs to the shared maps.
    const dye = .985 + hash(Math.floor(x / 5), Math.floor(y / 5)) * .03;
    const i = (y * size + x) * 4;
    data[i] = Math.min(255, color[0] * dye);
    data[i + 1] = Math.min(255, color[1] * dye);
    data[i + 2] = Math.min(255, color[2] * dye); data[i + 3] = 255;
  }
  return texture(data, size, true);
}

function texture(data: Uint8Array, size: number, color = false) {
  const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.magFilter = THREE.LinearFilter;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.generateMipmaps = true; result.anisotropy = 4; result.needsUpdate = true;
  return result;
}

/** Felt fibers share one height field for bump and roughness. Trilinear mips
 * average the fine relief as the tent gets smaller instead of retaining sparkles. */
function fibers() {
  const size = C.fiberResolution, relief = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = .42 * hash(x, y) + .35 * hash(Math.floor((x + (y % 7)) / 4), Math.floor(y / 2))
      + .23 * hash(Math.floor(x / 11), Math.floor(y / 11));
    const i = (y * size + x) * 4, height = Math.round(h * 255), roughness = Math.round((.94 + .06 * (1 - h)) * 255);
    relief.set([height, height, height, 255], i);
    rough.set([roughness, roughness, roughness, 255], i);
  }
  const bump = texture(relief, size), roughness = texture(rough, size);
  bump.repeat.setScalar(C.fiberRepeat); roughness.repeat.setScalar(C.fiberRepeat);
  return { bump, roughness };
}

export function createTentMaterials(r: Resources) {
  const warm = r.own(pattern('warm')), sage = r.own(pattern('sage'));
  const maps = fibers(); r.own(maps.bump); r.own(maps.roughness);
  const cloth = r.own(new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: warm, bumpMap: maps.bump, bumpScale: C.bumpScale,
    roughnessMap: maps.roughness, roughness: C.roughness, metalness: 0,
    sheen: C.sheen, sheenColor: '#d8c9ab', sheenRoughness: C.sheenRoughness,
    side: THREE.DoubleSide,
  }));
  cloth.name = 'tent-felt-with-step-diamond-border';
  const lining = r.own(new THREE.MeshPhysicalMaterial({
    color: '#b79e79', roughness: .96, bumpMap: maps.bump, bumpScale: C.bumpScale * .6,
    sheen: .4, sheenRoughness: .95, sheenColor: '#cfb893', side: THREE.DoubleSide,
  }));
  const wood = r.material('#806342', .87), binding = r.material('#b49b6d', .95);
  const floor = r.material('#655e49', 1);
  return {
    cloth, lining, wood, binding, floor,
    setVariant(variant: TentCanvasVariant) { cloth.map = variant === 'sage' ? sage : warm; },
    textureBytes: C.patternResolution ** 2 * 4 * 2 + C.fiberResolution ** 2 * 4 * 2,
    textureCount: 4,
  };
}
