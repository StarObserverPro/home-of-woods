/** A bounded, upper-hemisphere atlas. Image rows use PNG's top-left origin. */
export const IMPOSTOR_LAYOUT = Object.freeze({
  version: 1, azimuths: 8, elevations: [0, 30, 60] as readonly number[],
  frameSize: 128, padding: 4, columns: 8, rows: 4, frameCount: 25,
});

export interface ImpostorFrame {
  index: number;
  column: number;
  row: number;
  azimuth: number;
  elevation: number;
  direction: [number, number, number];
}

export interface ImpostorManifest {
  version: 1;
  id: string;
  source: string;
  encoding: 'linear-rgba8';
  normalSpace: 'asset';
  alpha: 'coverage';
  frameSize: number;
  padding: number;
  columns: 8;
  rows: 4;
  width: number;
  height: number;
  frameSpan: number;
  center: [number, number, number];
  bounds: {min: [number, number, number]; max: [number, number, number]};
  frames: ImpostorFrame[];
  sourceTriangles: number;
  albedo: string;
  normal: string;
}

export function impostorFrames(): ImpostorFrame[] {
  const result: ImpostorFrame[] = [];
  for (const elevation of IMPOSTOR_LAYOUT.elevations) {
    for (let a = 0; a < IMPOSTOR_LAYOUT.azimuths; a++) {
      const azimuth = a * Math.PI / 4, e = elevation * Math.PI / 180;
      const index = result.length;
      result.push({index, column: index % 8, row: Math.floor(index / 8),
        azimuth, elevation: e,
        direction: [Math.sin(azimuth) * Math.cos(e), Math.sin(e), Math.cos(azimuth) * Math.cos(e)]});
    }
  }
  result.push({index: 24, column: 0, row: 3, azimuth: 0,
    elevation: Math.PI / 2, direction: [0, 1, 0]});
  return result;
}

/** CPU equivalent of the shader selection, also used by the exporter checks. */
export function selectImpostorFrames(direction: readonly number[]) {
  if (direction.length !== 3 || !direction.every(Number.isFinite)) throw new Error('Finite view direction required');
  let azimuth = Math.atan2(direction[0], direction[2]);
  if (azimuth < 0) azimuth += Math.PI * 2;
  const elevation = Math.max(0, Math.atan2(direction[1], Math.hypot(direction[0], direction[2])));
  const az = azimuth / (Math.PI / 4), a0 = Math.floor(az) % 8, a1 = (a0 + 1) % 8, a = az - Math.floor(az);
  const ring = Math.min(3, elevation / (Math.PI / 6)), r0 = Math.floor(ring), r1 = Math.min(3, r0 + 1), e = ring - r0;
  const index = (r: number, n: number) => r === 3 ? 24 : r * 8 + n;
  return {indices: [index(r0, a0), index(r0, a1), index(r1, a0), index(r1, a1)],
    weights: [(1 - a) * (1 - e), a * (1 - e), (1 - a) * e, a * e], azimuth, elevation};
}

/** Copies edge RGB into transparent texels without expanding the alpha silhouette. */
export function dilateTransparentRgb(input: Uint8Array, width: number, height: number, passes: number) {
  if (input.length !== width * height * 4) throw new Error('RGBA dimensions do not match');
  let pixels = input.slice();
  let filled = Uint8Array.from({length: width * height}, (_, i) => input[i * 4 + 3] > 0 ? 1 : 0);
  for (let step = 0; step < passes; step++) {
    const next = pixels.slice(), nextFilled = filled.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (filled[i]) continue;
      let count = 0, r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const n = ny * width + nx;
        if (!filled[n]) continue;
        count++; r += pixels[n * 4]; g += pixels[n * 4 + 1]; b += pixels[n * 4 + 2];
      }
      if (count) {
        next[i * 4] = Math.round(r / count); next[i * 4 + 1] = Math.round(g / count); next[i * 4 + 2] = Math.round(b / count);
        nextFilled[i] = 1;
      }
    }
    pixels = next; filled = nextFilled;
  }
  return pixels;
}

export function validateImpostorManifest(value: ImpostorManifest): ImpostorManifest {
  if (value.version !== 1 || value.encoding !== 'linear-rgba8' || value.normalSpace !== 'asset' || value.alpha !== 'coverage' ||
    value.columns !== 8 || value.rows !== 4 || value.frames?.length !== 25 ||
    ![128, 256].includes(value.frameSize) || value.padding < 2 || value.padding > 8 ||
    value.width !== value.frameSize * 8 || value.height !== value.frameSize * 4 ||
    !Number.isFinite(value.frameSpan) || value.frameSpan <= 0 ||
    !Array.isArray(value.center) || value.center.length !== 3 || !value.center.every(Number.isFinite) ||
    !value.albedo || !value.normal) throw new Error('Unsupported or invalid impostor atlas');
  const expected = impostorFrames();
  if (value.frames.some((frame, i) => frame.index !== i || frame.column !== expected[i].column || frame.row !== expected[i].row ||
    !Array.isArray(frame.direction) || frame.direction.length !== 3 ||
    frame.direction.some((n, axis) => !Number.isFinite(n) || Math.abs(n - expected[i].direction[axis]) > 1e-6))) {
    throw new Error('Impostor view layout differs from its shader contract');
  }
  return value;
}
