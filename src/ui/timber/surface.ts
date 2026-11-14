/**
 * Home of Woods' original, low-frequency timber surfaces.
 *
 * SVG is a paint layer, never the control's hit shape. The caller owns layout,
 * focus, interaction states and caching. There are no images, filters, fonts,
 * animation, global random state or external SVG references here.
 */
export type TimberMaterial = 'plank' | 'endgrain' | 'bark' | 'shaving' | 'recess';
export type TimberRole = 'button' | 'panel' | 'heading' | 'slot' | 'badge';
export type TimberShape = 'plank' | 'block' | 'post' | 'panel';
export type TimberTone = 'warm' | 'dark' | 'light' | 'moss';

export interface TimberSurfaceOptions {
  width: number;
  height: number;
  material?: TimberMaterial;
  role?: TimberRole;
  seed?: string | number;
  tone?: TimberTone;
}

export interface TimberSurface {
  svg: string;
  dataUri: string;
  shape: TimberShape;
  facetCount: number;
  width: number;
  height: number;
  /** CSS-pixel dimensions, independent of the surface's long axis. */
  corner: number;
  depth: number;
}

/** Face colours stay dark enough for cream labels. Bright cuts sit at edges. */
export const TIMBER_PALETTE = {
  warm: { face: '#795333', grain: '#976c42', cut: '#b78b54', shade: '#513923', depth: '#30271d' },
  dark: { face: '#4d3b29', grain: '#6c5134', cut: '#967448', shade: '#372c21', depth: '#231e17' },
  light: { face: '#87603b', grain: '#a57949', cut: '#c69a60', shade: '#614226', depth: '#382c1d' },
  moss: { face: '#354c36', grain: '#4b6040', cut: '#778158', shade: '#263829', depth: '#17251c' },
  recess: { face: '#21372a', grain: '#30452f', cut: '#506044', shade: '#17281f', depth: '#101e18' },
  bark: { face: '#513b29', grain: '#775436', cut: '#997144', shade: '#382b20', depth: '#261f17' },
  ink: '#f5eacf',
} as const;

type Point = readonly [number, number];
type Paint = { face: string; grain: string; cut: string; shade: string; depth: string };
const MATERIALS: readonly TimberMaterial[] = ['plank', 'endgrain', 'bark', 'shaving', 'recess'];
const ROLES: readonly TimberRole[] = ['button', 'panel', 'heading', 'slot', 'badge'];
const TONES: readonly TimberTone[] = ['warm', 'dark', 'light', 'moss'];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const px = (n: number) => Math.round(n * 10) / 10;
const size = (n: number, fallback: number) => Math.round(clamp(Number.isFinite(n) ? n : fallback, 16, 4096));

function seedHash(value: string | number): number {
  let hash = 2166136261;
  const text = String(value).slice(0, 512);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function randomFrom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function polygon(points: readonly Point[]): string {
  return points.map(point => `${px(point[0])},${px(point[1])}`).join(' ');
}

function outline(x: number, y: number, w: number, h: number, cut: number): Point[] {
  return [
    [x, y + cut], [x + cut * .85, y], [x + w - cut * 1.25, y],
    [x + w, y + cut * .65], [x + w, y + h - cut],
    [x + w - cut * .8, y + h], [x + cut * 1.2, y + h], [x, y + h - cut * .75],
  ];
}

/** Semantics take precedence: a large square window is never a giant end cut. */
export function timberShape(width: number, height: number, role: TimberRole = 'button'): TimberShape {
  const w = size(width, 128), h = size(height, 48);
  if (role === 'panel') return 'panel';
  if (h / w >= 1.75) return 'post';
  if (w / h >= 1.75 || role === 'heading') return 'plank';
  return 'block';
}

/** A thin shaving has its own silhouette. The curls stay at the two ends. */
function shavingBadge(width: number, height: number, tone: TimberTone, seed: string | number): TimberSurface {
  const short = Math.min(width, height);
  const depth = px(clamp(short * .045, 1.5, 2.5));
  const corner = px(clamp(short * .13, 3, 10));
  const shape = timberShape(width, height, 'badge');
  const vertical = shape === 'post';
  const along = vertical ? height - depth : width;
  const across = vertical ? width : height - depth;
  const end = Math.min(along * .19, clamp(across * .32, 5, 16));
  const lift = Math.min(corner * .65, across * .14);
  const bend = (randomFrom(seedHash(seed))() - .5) * Math.min(3, lift * .65);
  const paint = TIMBER_PALETTE[tone];
  const orient = (u: number, v: number): Point => vertical ? [v, u] : [u, v];
  const front = [
    [0, across * .34], [end * .3, across * .08], [end * .85, 0],
    [end * 1.35, lift], [along - end * 1.35, lift + bend],
    [along - end * .8, 0], [along - end * .15, across * .1], [along, across * .34],
    [along - end * .1, across * .78], [along - end * .7, across],
    [along - end * 1.35, across - lift], [end * 1.2, across - lift + bend],
    [end * .35, across], [0, across * .73],
  ].map(([u, v]) => orient(u, v));
  const clipId = `shaving-${seedHash(`${width}:${height}:${tone}:${seed}`)}`;
  const shapes: string[] = [];
  let facetCount = 0;
  const addWorld = (points: readonly Point[], fill: string, opacity = 1) => {
    const bounded = points.map(([x, y]) => [clamp(x, 0, width), clamp(y, 0, height)] as Point);
    shapes.push(`<polygon points="${polygon(bounded)}" fill="${fill}"${opacity < 1 ? ` opacity="${px(opacity)}"` : ''}/>`);
    facetCount++;
  };
  const add = (points: readonly Point[], fill: string, opacity = 1) => addWorld(points.map(([u, v]) => orient(u, v)), fill, opacity);
  addWorld(front.map(([x, y]) => [x, y + depth] as Point), paint.depth);
  addWorld(front, paint.face);
  shapes.push(`<g clip-path="url(#${clipId})">`);
  // A quiet, continuous strip through the middle; no knot or curl behind text.
  add([[end * 1.35, lift], [along * .55, lift + bend], [along - end * 1.35, lift + bend], [along - end * 1.4, lift + 3], [end * 1.4, lift + 2]], paint.grain, .3);
  add([[end * 1.2, across - lift + bend], [along - end * 1.35, across - lift], [along - end * 1.4, across - lift - 2], [end * 1.35, across - lift - 2]], paint.shade, .3);
  // Left roll: raised outer face, broad inner shadow and thin returning lip.
  add([[0, across * .34], [end * .3, across * .08], [end * .85, 0], [end * 1.35, lift], [end * 1.12, across * .35], [end * .65, across * .65], [0, across * .73]], paint.grain);
  add([[end * .22, across * .32], [end * .7, across * .18], [end * 1.02, across * .3], [end * .75, across * .56], [end * .25, across * .62]], paint.shade);
  add([[0, across * .73], [end * .65, across * .65], [end * 1.2, across - lift + bend], [end * .35, across], [0, across * .87]], paint.cut, .8);
  add([[end * .3, across * .08], [end * .85, 0], [end * 1.35, lift], [end * .86, lift * .9]], paint.cut, .7);
  // Right roll mirrors the construction without repeating a central symbol.
  add([[along - end * 1.35, lift + bend], [along - end * .8, 0], [along - end * .15, across * .1], [along, across * .34], [along - end * .1, across * .78], [along - end * .65, across * .65], [along - end * 1.08, across * .32]], paint.grain);
  add([[along - end * 1.02, across * .3], [along - end * .7, across * .18], [along - end * .22, across * .32], [along - end * .25, across * .62], [along - end * .75, across * .56]], paint.shade);
  add([[along - end * .65, across * .65], [along - end * .1, across * .78], [along - end * .3, across * .92], [along - end * .7, across], [along - end * 1.35, across - lift]], paint.cut, .8);
  add([[along - end * 1.35, lift + bend], [along - end * .8, 0], [along - end * .15, across * .1], [along - end * .82, lift * .8]], paint.cut, .7);
  shapes.push('</g>');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"><defs><clipPath id="${clipId}"><polygon points="${polygon(front)}"/></clipPath></defs>${shapes.join('')}</svg>`;
  return {svg, dataUri: `data:image/svg+xml,${encodeURIComponent(svg)}`, shape, facetCount, width, height, corner, depth};
}

/**
 * Generate in CSS pixels: corners and depth stop growing, while long faces gain
 * a bounded number of broad grain facets. No fine-line wood texture is used.
 */
export function timberSurface(options: TimberSurfaceOptions): TimberSurface {
  const width = size(options.width, 128), height = size(options.height, 48);
  const role = ROLES.includes(options.role as TimberRole) ? options.role! : 'button';
  const material = MATERIALS.includes(options.material as TimberMaterial) ? options.material! : 'plank';
  const tone = TONES.includes(options.tone as TimberTone) ? options.tone! : 'warm';
  if (material === 'shaving' && role === 'badge') return shavingBadge(width, height, tone, options.seed ?? 'home-of-woods');
  const shape = timberShape(width, height, role);
  const short = Math.min(width, height);
  const corner = px(clamp(short * .13, 3, 10));
  const depth = px(clamp(short * .09, 3, role === 'panel' ? 10 : 6));
  const faceHeight = height - depth;
  const random = randomFrom(seedHash(options.seed ?? 'home-of-woods'));
  const paint: Paint = material === 'recess' || role === 'slot'
    ? TIMBER_PALETTE.recess : material === 'bark' ? TIMBER_PALETTE.bark : TIMBER_PALETTE[tone];
  const shapes: string[] = [];
  let facetCount = 0;
  const add = (points: readonly Point[], fill: string, opacity = 1) => {
    const bounded = points.map(([x, y]) => [clamp(x, 0, width), clamp(y, 0, height)] as Point);
    shapes.push(`<polygon points="${polygon(bounded)}" fill="${fill}"${opacity < 1 ? ` opacity="${px(opacity)}"` : ''}/>`);
    facetCount++;
  };
  const front = outline(0, 0, width, faceHeight, corner);
  const clipId = `wood-${seedHash(`${width}:${height}:${material}:${role}:${tone}:${options.seed ?? ''}`)}`;
  add(outline(0, depth, width, faceHeight, corner), paint.depth);
  add(front, role === 'panel' ? TIMBER_PALETTE.bark.face : paint.face);
  shapes.push(`<g clip-path="url(#${clipId})">`);

  if (role === 'panel') {
    // Rails keep their cross-section; length adds bark plates, not stretched cracks.
    const rim = px(Math.min(short * .2, clamp(short * .035, 9, 15)));
    const plates = Math.min(9, Math.max(2, Math.ceil(width / 130)));
    for (let i = 0; i < plates; i++) {
      const x = width * i / plates, length = width / plates;
      add([[x, 0], [x + length * .55, 0], [x + length, rim * .35], [x + length * .76, rim * .8], [x, rim * .6]], i % 2 ? '#725133' : '#85603b');
      add([[x, faceHeight - rim * .7], [x + length * .65, faceHeight - rim], [x + length, faceHeight - rim * .4], [x + length, faceHeight], [x, faceHeight]], i % 2 ? '#64472f' : '#705036');
    }
    const uprights = Math.min(8, Math.max(2, Math.ceil(height / 110)));
    for (let i = 0; i < uprights; i++) {
      const y = i * faceHeight / uprights, length = faceHeight / uprights;
      add([[0, y], [rim * .65, y + length * .08], [rim, y + length * .65], [rim * .4, y + length], [0, y + length]], '#87603b', .8);
      add([[width - rim * .65, y], [width, y + length * .13], [width, y + length], [width - rim, y + length * .7]], '#3d2f23');
    }
    const inner = outline(rim, rim, width - 2 * rim, faceHeight - 2 * rim, corner * .5);
    add(inner, TIMBER_PALETTE.recess.depth);
    // A broad inset floor: quiet, opaque and readable over any scene lighting.
    add(outline(rim + 2, rim + 4, width - 2 * rim - 4, faceHeight - 2 * rim - 5, corner * .4), TIMBER_PALETTE.recess.face);
    add([[rim + 3, rim + 4], [width - rim - 3, rim + 4], [width - rim - 3, rim + 13], [rim + 3, rim + 10]], TIMBER_PALETTE.recess.grain, .4);
  } else if (material === 'recess' || role === 'slot') {
    // Recessed sockets use a broad upper shadow and a subdued lower lip.
    const lip = Math.min(6, short * .12);
    add([[0, 0], [width, 0], [width - lip, lip], [lip, lip * 1.3], [0, faceHeight]], paint.shade);
    add([[0, faceHeight - lip], [width - lip, faceHeight - lip * .65], [width, faceHeight], [0, faceHeight]], paint.cut, .5);
    if (width > 100) add([[lip, faceHeight * .6], [width * .4, faceHeight * .54], [width - lip, faceHeight * .64], [width - lip, faceHeight * .68], [lip, faceHeight * .64]], paint.grain, .3);
  } else if (material === 'endgrain') {
    // Filled polygonal bands, rather than thin concentric outlines. For an
    // elongated component the end cut stays local and the rest is quiet timber.
    const radius = short * .46;
    const cx = shape === 'plank' ? radius + corner : width * .5;
    const cy = shape === 'post' ? radius + corner : faceHeight * .48;
    const angles = Array.from({length: 9}, (_, i) => i * Math.PI * 2 / 9 + (random() - .5) * .18);
    const wobble = angles.map(() => .88 + random() * .12);
    for (let layer = 0; layer < 4; layer++) {
      const r = radius * (1 - layer * .23);
      add(angles.map((angle, i) => [cx + Math.cos(angle) * r * wobble[i], cy + Math.sin(angle) * r * .84 * wobble[i]] as Point), layer % 2 ? paint.face : paint.grain, .7);
    }
    add([[cx - radius * .45, cy + radius * .35], [cx - radius * .08, cy + radius * .08], [cx - radius * .19, cy + radius * .37]], paint.shade, .7);
  } else if (material === 'bark') {
    const vertical = shape === 'post';
    const along = vertical ? faceHeight : width, across = vertical ? width : faceHeight;
    const orient = (u: number, v: number): Point => vertical ? [v, u] : [u, v];
    const lanes = Math.min(4, Math.max(2, Math.floor(across / 18)));
    const segments = Math.min(4, Math.max(1, Math.ceil(along / 110)));
    for (let lane = 0; lane < lanes; lane++) for (let segment = 0; segment < segments; segment++) {
      const start = along * segment / segments, length = along / segments;
      const v = across * (lane + .35) / lanes, band = across / lanes * .6;
      const split = .32 + random() * .3;
      add([orient(start, v), orient(start + length * .15, v + band * .7), orient(start + length * split, v + band), orient(start + length * .9, v + band * .4), orient(start + length, v - band * .12), orient(start + length * .45, v + band * .13)], (lane + segment) % 2 ? paint.grain : paint.shade, .7);
    }
  } else if (material === 'shaving') {
    // A curled shaving is a small feedback badge, not a window-wall texture.
    const x = width * .12, y = faceHeight * .2, w = width * .76, h = faceHeight * .6;
    add([[x, y + h * .4], [x + w * .35, y], [x + w * .86, y + h * .08], [x + w, y + h * .7], [x + w * .7, y + h], [x + w * .34, y + h * .83], [x + w * .17, y + h * .5]], paint.cut, .8);
    add([[x + w * .34, y + h * .83], [x + w * .7, y + h], [x + w * .82, y + h * .69], [x + w * .69, y + h * .44], [x + w * .4, y + h * .38]], paint.shade);
  } else {
    const vertical = shape === 'post';
    const along = vertical ? faceHeight : width, across = vertical ? width : faceHeight;
    const orient = (u: number, v: number): Point => vertical ? [v, u] : [u, v];
    // Two to six tapered, angular fibres; never an all-over noise field.
    const count = Math.min(6, Math.max(2, Math.ceil(across / 24)));
    for (let i = 0; i < count; i++) {
      const v = across * (.23 + .48 * i / Math.max(1, count - 1));
      const offset = (random() - .5) * Math.min(10, across * .15);
      const bend = along * (.28 + random() * .35);
      const thickness = Math.min(7, Math.max(2.5, across * .09));
      add([orient(0, v), orient(bend, v + offset), orient(along, v - offset * .25), orient(along, v + thickness), orient(bend, v + offset + thickness * .55), orient(0, v + thickness * .5)], i % 2 ? paint.shade : paint.grain, .3);
    }
    if (along > 120 && short >= 36) {
      // One low-contrast knot, located outside the central label area.
      const u = along * (.12 + random() * .06), v = across * .5;
      const r = Math.min(13, short * .24);
      add([orient(u - r * 1.5, v), orient(u - r * .35, v - r * .45), orient(u + r * 1.4, v - r * .1), orient(u + r * .4, v + r * .4)], paint.shade, .3);
      add([orient(u - r * .7, v), orient(u, v - r * .14), orient(u + r * .7, v + r * .02), orient(u, v + r * .15)], paint.grain, .5);
    }
    // End face is kept a fixed-size chip, away from the text's central area.
    const end = Math.min(12, short * .18);
    add(vertical
      ? [[0, faceHeight - end], [width, faceHeight - end * .65], [width, faceHeight], [0, faceHeight]]
      : [[width - end, 0], [width, corner * .6], [width, faceHeight - corner], [width - end * .8, faceHeight], [width - end, faceHeight * .55]], paint.shade, .7);
  }

  if (role !== 'slot' && material !== 'recess') {
    // Light catches a broad cut, not a one-pixel contour. A corner chip is a
    // filled wedge; all decorative cuts remain inside the original hit box.
    const bevel = Math.min(4, short * .08);
    add([[corner * .85, 0], [width - corner * 1.25, 0], [width - corner * 1.8, bevel], [corner * 1.35, bevel * 1.15]], paint.cut, .8);
    if (short >= 36) {
      const chipX = width * (.14 + random() * .18);
      add([[chipX, 0], [chipX + corner * 1.8, 0], [chipX + corner * .7, Math.min(5, corner * .65)]], paint.shade, .9);
    }
  }
  shapes.push('</g>');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none"><defs><clipPath id="${clipId}"><polygon points="${polygon(front)}"/></clipPath></defs>${shapes.join('')}</svg>`;
  return {svg, dataUri: `data:image/svg+xml,${encodeURIComponent(svg)}`, shape, facetCount, width, height, corner, depth};
}
