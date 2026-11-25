import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Matrix4, Quaternion, Vector3} from 'three';

const COMPONENTS = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16};
const TYPES = {
  5120: [1, 'readInt8'], 5121: [1, 'readUInt8'], 5122: [2, 'readInt16LE'],
  5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'],
};
const finiteTriple = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const mipBytes = (width, height) => {
  let bytes = 0;
  do {bytes += width * height * 4; if (width === 1 && height === 1) break;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  } while (true);
  return bytes;
};

export function parseGlb(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB file');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Only GLB version 2 is supported');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB header length does not match file bytes');
  let gltf, binary;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error('Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw new Error('Invalid GLB chunk length');
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 12 && type !== 0x4e4f534a) throw new Error('The first GLB chunk must be JSON');
    if (type === 0x4e4f534a) {
      if (gltf) throw new Error('Duplicate JSON chunk');
      gltf = JSON.parse(chunk.toString('utf8'));
    } else if (type === 0x004e4942) {
      if (binary) throw new Error('Duplicate BIN chunk');
      binary = chunk;
    }
    offset += 8 + length;
  }
  if (gltf?.asset?.version !== '2.0') throw new Error('Expected glTF asset.version 2.0');
  return {gltf, binary: binary ?? Buffer.alloc(0), bytes};
}

/** Read image headers without downloading external resources or decoding pixels. */
export function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')
    return {format: 'png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') return {format: 'webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3)};
    if (kind === 'VP8 ' && bytes.toString('hex', 23, 26) === '9d012a')
      return {format: 'webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff};
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return {format: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff)};
    }
  }
  if (bytes.length >= 28 && bytes.subarray(0, 12).toString('hex') === 'ab4b5458203230bb0d0a1a0a')
    return {format: 'ktx2', width: bytes.readUInt32LE(20), height: bytes.readUInt32LE(24)};
  if (bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 0xff) continue;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7)
        return {format: 'jpeg', width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3)};
      offset += length;
    }
  }
  return null;
}

function inspectionReader(gltf, binary) {
  const accessors = new Map();
  function view(index) {
    const value = gltf.bufferViews?.[index];
    if (!value) throw new Error(`Missing bufferView ${index}`);
    if (value.buffer !== 0 || gltf.buffers?.[0]?.uri) throw new Error('External buffer cannot be measured');
    if (value.extensions?.EXT_meshopt_compression) throw new Error('Export an uncompressed review GLB before auditing meshopt geometry');
    const offset = value.byteOffset ?? 0;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(value.byteLength) || value.byteLength < 0 || offset + value.byteLength > binary.length)
      throw new Error(`bufferView ${index} exceeds BIN bytes`);
    return {bytes: binary.subarray(offset, offset + value.byteLength), stride: value.byteStride};
  }
  function read(index) {
    if (accessors.has(index)) return accessors.get(index);
    const a = gltf.accessors?.[index], type = TYPES[a?.componentType], size = COMPONENTS[a?.type];
    if (!a || !type || !size || !Number.isInteger(a.count) || a.count < 1) throw new Error(`Invalid accessor ${index}`);
    if (a.count * size > 16_000_000) throw new Error(`Accessor ${index} is too large for character inspection`);
    if (['MAT2', 'MAT3'].includes(a.type) && type[0] < 4) throw new Error('Packed integer matrix inspection is unsupported');
    const values = new Float64Array(a.count * size);
    const populate = (target, source, count, offset = 0, stride = size * type[0]) => {
      if (!Number.isInteger(offset) || offset < 0 || stride < size * type[0] || offset + (count - 1) * stride + size * type[0] > source.length)
        throw new Error(`Accessor ${index} exceeds its bufferView`);
      for (let i = 0; i < count; i++) for (let j = 0; j < size; j++) target[i * size + j] = source[type[1]](offset + i * stride + j * type[0]);
    };
    if (a.bufferView !== undefined) {
      const source = view(a.bufferView);
      populate(values, source.bytes, a.count, a.byteOffset ?? 0, source.stride ?? size * type[0]);
    }
    if (a.sparse) {
      const sparse = a.sparse, indexType = TYPES[sparse.indices.componentType];
      if (!indexType || ![5121, 5123, 5125].includes(sparse.indices.componentType) || sparse.count < 1 || sparse.count > a.count)
        throw new Error(`Invalid sparse accessor ${index}`);
      const indices = view(sparse.indices.bufferView).bytes, source = view(sparse.values.bufferView).bytes;
      const patch = new Float64Array(sparse.count * size);
      populate(patch, source, sparse.count, sparse.values.byteOffset ?? 0);
      let previous = -1;
      for (let i = 0; i < sparse.count; i++) {
        const at = (sparse.indices.byteOffset ?? 0) + i * indexType[0];
        if (at < 0 || at + indexType[0] > indices.length) throw new Error(`Sparse accessor ${index} has truncated indices`);
        const vertex = indices[indexType[1]](at);
        if (vertex <= previous || vertex >= a.count) throw new Error(`Sparse accessor ${index} indices are invalid`);
        values.set(patch.subarray(i * size, (i + 1) * size), vertex * size);
        previous = vertex;
      }
    }
    if (a.normalized && a.componentType !== 5126) {
      const maximum = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295}[a.componentType];
      for (let i = 0; i < values.length; i++) values[i] = Math.max(-1, values[i] / maximum);
    }
    if (!values.every(Number.isFinite)) throw new Error(`Accessor ${index} has non-finite values`);
    accessors.set(index, values);
    return values;
  }
  return {view, read};
}

function materialTextures(material) {
  const result = [];
  function collect(value, key = '') {
    if (!value || typeof value !== 'object') return;
    if (key.toLowerCase().endsWith('texture') && Number.isInteger(value.index)) result.push({slot: key, texture: value.index, uv: value.texCoord ?? 0});
    for (const [child, item] of Object.entries(value)) collect(item, child);
  }
  collect(material);
  return result;
}

export function inspectGlb(input, {file = null} = {}) {
  const {gltf, binary, bytes} = parseGlb(input), reader = inspectionReader(gltf, binary);
  const issues = [], primitives = [], materialIds = new Set(), skinIds = new Set();
  const issue = (code, message) => issues.push({code, message});
  if ((gltf.buffers ?? []).some(b => b.uri) || (gltf.images ?? []).some(i => i.uri && !i.uri.startsWith('data:')))
    issue('external-resource', 'GLB references external files; no external resource was opened');
  for (let i = 0; i < (gltf.bufferViews?.length ?? 0); i++) {
    try {reader.view(i);} catch (error) {issue('buffer-data', error.message);}
  }
  if ((gltf.buffers?.[0]?.byteLength ?? 0) > binary.length) issue('buffer-length', 'Declared buffer exceeds BIN bytes');

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let boundsComplete = true;
  const nodes = gltf.nodes ?? [], scene = gltf.scenes?.[gltf.scene ?? 0];
  if (!scene) issue('missing-scene', 'No default glTF scene exists');
  const visited = new Set();
  function walk(index, parentMatrix) {
    if (!Number.isInteger(index) || !nodes[index] || visited.has(index)) {issue('invalid-scene-graph', `Invalid or repeated scene node ${index}`); return;}
    visited.add(index);
    const node = nodes[index], matrix = new Matrix4();
    if (node.matrix) {
      if (!Array.isArray(node.matrix) || node.matrix.length !== 16 || !node.matrix.every(Number.isFinite)) {
        issue('node-transform', `Invalid transform for node ${index}`); boundsComplete = false; return;
      }
      matrix.fromArray(node.matrix);
    } else {
      const translation = node.translation ?? [0, 0, 0], scale = node.scale ?? [1, 1, 1], rotation = node.rotation ?? [0, 0, 0, 1];
      if (!finiteTriple(translation) || !finiteTriple(scale) || rotation.length !== 4 || !rotation.every(Number.isFinite)) {
        issue('node-transform', `Invalid transform for node ${index}`); boundsComplete = false; return;
      }
      matrix.compose(new Vector3(...translation), new Quaternion(...rotation), new Vector3(...scale));
    }
    matrix.premultiply(parentMatrix);
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      if (!mesh) issue('missing-mesh', `Node ${index} references missing mesh ${node.mesh}`);
      if (node.skin !== undefined) skinIds.add(node.skin);
      for (const [primitiveIndex, primitive] of (mesh?.primitives ?? []).entries()) {
        const position = gltf.accessors?.[primitive.attributes?.POSITION], count = position?.count ?? 0;
        const indices = primitive.indices === undefined ? null : gltf.accessors?.[primitive.indices];
        const elementCount = indices?.count ?? count, mode = primitive.mode ?? 4;
        const triangles = mode === 4 ? elementCount / 3 : [5, 6].includes(mode) ? Math.max(0, elementCount - 2) : 0;
        const entry = {
          node: index, nodeName: node.name ?? null, mesh: node.mesh, meshName: mesh.name ?? null,
          primitive: primitiveIndex, mode, vertices: count, elements: elementCount, triangles,
          material: primitive.material ?? null, skin: node.skin ?? null,
          attributes: Object.keys(primitive.attributes ?? {}), morphTargets: primitive.targets?.length ?? 0,
          morphNames: (mesh.extras?.targetNames ?? []).slice(0, primitive.targets?.length ?? 0), part: mesh.extras?.howCharacterPart ?? 'unclassified',
        };
        primitives.push(entry);
        if (primitive.material !== undefined) materialIds.add(primitive.material);
        if (position?.type !== 'VEC3' || !Number.isInteger(count) || count < 1) issue('positions', `Mesh ${node.mesh}:${primitiveIndex} has invalid positions`);
        if (!Number.isInteger(triangles) || triangles < 0) issue('triangles', `Mesh ${node.mesh}:${primitiveIndex} has an incomplete triangle`);
        if (![4, 5, 6].includes(mode)) issue('primitive-mode', `Mesh ${node.mesh}:${primitiveIndex} is not a triangle primitive`);
        if (primitive.extensions?.KHR_draco_mesh_compression) {issue('compressed-geometry', 'Export an uncompressed review GLB before auditing Draco geometry'); boundsComplete = false; continue;}
        try {
          const positions = reader.read(primitive.attributes.POSITION);
          const point = new Vector3();
          for (let i = 0; i < count; i++) {
            point.fromArray(positions, i * 3).applyMatrix4(matrix);
            for (let axis = 0; axis < 3; axis++) {min[axis] = Math.min(min[axis], point.getComponent(axis)); max[axis] = Math.max(max[axis], point.getComponent(axis));}
          }
          if (primitive.indices !== undefined) {
            if (!indices || indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType)) throw new Error('Invalid triangle index accessor');
            if (reader.read(primitive.indices).some(value => value < 0 || value >= count)) throw new Error('Triangle index exceeds vertex count');
          }
          for (const [semantic, accessor] of Object.entries(primitive.attributes)) {
            if (gltf.accessors?.[accessor]?.count !== count) throw new Error(`${semantic} count differs from positions`);
            reader.read(accessor);
          }
          for (const target of primitive.targets ?? []) for (const [semantic, accessor] of Object.entries(target)) {
            if (gltf.accessors?.[accessor]?.count !== count) throw new Error(`Morph ${semantic} count differs from positions`);
            reader.read(accessor);
          }
          if (node.skin !== undefined && primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined) {
            if (gltf.accessors[primitive.attributes.JOINTS_0].type !== 'VEC4' || gltf.accessors[primitive.attributes.WEIGHTS_0].type !== 'VEC4') throw new Error('Skin joints and weights must be VEC4');
            const joints = reader.read(primitive.attributes.JOINTS_0), weights = reader.read(primitive.attributes.WEIGHTS_0);
            const boneCount = gltf.skins?.[node.skin]?.joints?.length ?? 0;
            if (joints.some((joint, at) => weights[at] > 0 && (!Number.isInteger(joint) || joint >= boneCount))) throw new Error('Skin joint index exceeds skin joints');
            for (let i = 0; i < count; i++) {
              const sum = weights[i * 4] + weights[i * 4 + 1] + weights[i * 4 + 2] + weights[i * 4 + 3];
              if (!Number.isFinite(sum) || Math.abs(sum - 1) > .025 || weights.subarray(i * 4, i * 4 + 4).some(w => w < 0)) throw new Error('Skin weights are negative or not normalized');
            }
          }
        } catch (error) {boundsComplete = false; issue('mesh-data', `Mesh ${node.mesh}:${primitiveIndex}: ${error.message}`);}
      }
    }
    for (const child of node.children ?? []) walk(child, matrix);
  }
  for (const root of scene?.nodes ?? []) walk(root, new Matrix4());

  const skins = [...skinIds].map(index => {
    const skin = gltf.skins?.[index];
    if (!skin?.joints?.length) issue('skin', `Missing or empty skin ${index}`);
    for (const joint of skin?.joints ?? []) if (!nodes[joint]) issue('skin', `Skin ${index} references missing joint ${joint}`);
    if (skin?.inverseBindMatrices !== undefined) {
      try {
        const accessor = gltf.accessors?.[skin.inverseBindMatrices];
        if (accessor?.type !== 'MAT4' || accessor.count !== skin.joints.length) throw new Error('Invalid inverse bind matrix count');
        reader.read(skin.inverseBindMatrices);
      } catch (error) {issue('skin', error.message);}
    }
    return {index, name: skin?.name ?? null, bones: skin?.joints?.length ?? 0, jointNames: (skin?.joints ?? []).map(i => nodes[i]?.name ?? `node:${i}`)};
  });
  const usedImages = new Set();
  const materials = [...materialIds].map(index => {
    const material = gltf.materials?.[index];
    if (!material) issue('material', `Missing material ${index}`);
    const textures = materialTextures(material);
    for (const texture of textures) {
      const spec = gltf.textures?.[texture.texture];
      texture.image = spec?.extensions?.KHR_texture_basisu?.source ?? spec?.extensions?.EXT_texture_webp?.source ?? spec?.source;
      if (!Number.isInteger(texture.image) || !gltf.images?.[texture.image]) issue('texture', `Missing image for texture ${texture.texture}`);
      else usedImages.add(texture.image);
    }
    return {index, name: material?.name ?? null, alphaMode: material?.alphaMode ?? 'OPAQUE', doubleSided: material?.doubleSided ?? false, textures};
  });
  const images = (gltf.images ?? []).map((image, index) => {
    let data;
    try {
      if (image.bufferView !== undefined) data = reader.view(image.bufferView).bytes;
      else if (image.uri?.startsWith('data:') && image.uri.includes(';base64,')) data = Buffer.from(image.uri.split(';base64,')[1], 'base64');
    } catch (error) {issue('image-data', `Image ${index}: ${error.message}`);}
    const dimensions = data ? imageDimensions(data) : null;
    if (usedImages.has(index) && (!dimensions || dimensions.width < 1 || dimensions.height < 1)) issue('image-dimensions', `Cannot measure image ${index}`);
    return {index, name: image.name ?? null, mimeType: image.mimeType ?? null, used: usedImages.has(index), embedded: !!data, encodedBytes: data?.length ?? null,
      ...dimensions, rgba8MipBytes: dimensions?.width && dimensions?.height ? mipBytes(dimensions.width, dimensions.height) : null};
  });
  const activeImages = images.filter(image => image.used);
  const bounds = boundsComplete && finiteTriple(min) && finiteTriple(max) ? {min, max, size: max.map((v, i) => v - min[i]), space: 'default node transforms; skin and morph deformation not evaluated'} : null;
  const sum = key => primitives.reduce((total, primitive) => total + primitive[key], 0);
  return {
    file, sha256: createHash('sha256').update(bytes).digest('hex'), fileBytes: bytes.length,
    generator: gltf.asset.generator ?? null, extensionsRequired: gltf.extensionsRequired ?? [],
    totals: {triangles: sum('triangles'), vertices: sum('vertices'), primitives: primitives.length,
      drawCalls: primitives.reduce((count, primitive) => {
        const material = gltf.materials?.[primitive.material];
        return count + (material?.alphaMode === 'BLEND' && material.doubleSided ? 2 : 1);
      }, 0), materials: materials.length + (primitives.some(p => p.material === null) ? 1 : 0),
      bones: new Set([...skinIds].flatMap(id => gltf.skins?.[id]?.joints ?? [])).size,
      morphTargetsMaximum: Math.max(0, ...primitives.map(p => p.morphTargets)),
      texturePixels: activeImages.reduce((n, image) => n + (image.width ?? 0) * (image.height ?? 0), 0),
      textureRgba8MipBytes: activeImages.some(image => image.rgba8MipBytes === null) ? null : activeImages.reduce((n, image) => n + image.rgba8MipBytes, 0)},
    counting: 'Default-scene mesh instances; estimated Three.js default color draw calls include two passes for double-sided BLEND and exclude shadow/depth passes. Texture memory is unique-image RGBA8 with full mips, not measured GPU allocation.',
    bounds, proportions: {headToBody: null, requiresManualReviewAgainst: 'local-np120-j01'},
    capabilities: {skinned: skins.length > 0, normals: primitives.length > 0 && primitives.every(p => p.attributes.includes('NORMAL')),
      uv0: primitives.length > 0 && primitives.every(p => p.attributes.includes('TEXCOORD_0')),
      morphs: primitives.some(p => p.morphTargets > 0),
      blinkMorphs: [...new Set(primitives.flatMap(p => p.morphNames).filter(name => /blink|lid|闭眼|眨眼/i.test(name)))],
      blinkBoneCandidates: [...new Set(skins.flatMap(s => s.jointNames).filter(name => /blink|eyelid|(^|[\s_.:-])lids?([\s_.:-]|$)|闭眼|眨眼/i.test(name)))],
      eyeBoneCandidates: [...new Set(skins.flatMap(s => s.jointNames).filter(name => /eye|lid|眼/i.test(name)))],
      maximumSkinAttributeSets: Math.max(0, ...primitives.map(p => p.attributes.filter(a => /^JOINTS_\d+$/.test(a)).length))},
    partTriangles: Object.fromEntries([...new Set(primitives.map(p => p.part))].map(part => [part, primitives.filter(p => p.part === part).reduce((n, p) => n + p.triangles, 0)])),
    primitives, skins, materials, images,
    animations: (gltf.animations ?? []).map(a => ({name: a.name ?? null, channels: a.channels?.length ?? 0})), issues,
  };
}

export async function inspectGlbFile(file) {return inspectGlb(await readFile(file), {file});}
