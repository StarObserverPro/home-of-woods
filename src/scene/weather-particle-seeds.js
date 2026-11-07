/** Independent stable density per particle; paired rain vertices share the same sample. */
export function seedArray(count, paired = false) {
  const vertices = paired ? count * 2 : count;
  const values = new Float32Array(vertices * 3);
  const tips = new Float32Array(vertices);
  const density = new Float32Array(vertices);
  let spatialSeed = 48123;
  const random = () => {
    spatialSeed = (Math.imul(spatialSeed, 1664525) + 1013904223) >>> 0;
    return spatialSeed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const point = [random(), random(), random()];
    let hash = i + 0x6d2b79f5;
    hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
    hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
    const threshold = ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
    const offset = paired ? i * 2 : i;
    values.set(point, offset * 3);
    density[offset] = threshold;
    if (paired) {
      values.set(point, (offset + 1) * 3);
      density[offset + 1] = threshold;
      tips[offset + 1] = 1;
    }
  }
  return { values, tips, density };
}
