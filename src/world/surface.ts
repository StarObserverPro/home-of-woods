import { HOME, PATH, WORLD, RIVER_KNOTS } from "../content/world.ts";
import type { Point } from "../content/world.ts";
import valley from "../content/valley-r3.json" with { type: "json" };
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function riverX(z: number) {
  // Creek knots traced from unoccluded R3 RGBD water samples; endpoints extended for scenery.
  const knots = RIVER_KNOTS;
  const next=knots.findIndex(p=>p.z>z);
  const i = next<0 ? knots.length-2 : Math.max(0,next-1);
  const a=knots[i], b=knots[i+1];
  return a.x + (b.x-a.x)*(z-a.z)/(b.z-a.z);
}
function rawHeight(x: number, z: number) {
  const columns=(valley.max-valley.min)/valley.step+1;
  const xi=Math.round(clamp((x-valley.min)/valley.step,0,columns-1));
  const zi=Math.round(clamp((z-valley.min)/valley.step,0,columns-1));
  let h=valley.heights[zi*columns+xi];
  const river = 1 - smooth(3.2, 20, Math.abs(x - riverX(z)));
  h = h * (1 - river) + 0.7 * river;
  const camp = 1 - smooth(12, 22, Math.hypot((x - HOME.x) * 0.92, (z - HOME.z)*0.67));
  return h * (1 - camp) + 21.5 * camp;
}
// Mesh vertices and every consumer use this exact triangulated surface, including its diagonal.
export function heightAt(x: number, z: number) {
  const gx = clamp(
    (x - WORLD.minX) / WORLD.step,
    0,
    (WORLD.maxX - WORLD.minX) / WORLD.step - 0.00001,
  );
  const gz = clamp(
    (z - WORLD.minZ) / WORLD.step,
    0,
    (WORLD.maxZ - WORLD.minZ) / WORLD.step - 0.00001,
  );
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    u = gx - ix,
    v = gz - iz;
  const ax = WORLD.minX + ix * WORLD.step,
    az = WORLD.minZ + iz * WORLD.step;
  const a = rawHeight(ax, az),
    b = rawHeight(ax + WORLD.step, az),
    c = rawHeight(ax, az + WORLD.step),
    d = rawHeight(ax + WORLD.step, az + WORLD.step);
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export const vertexHeight = rawHeight;
export function slopeAt(x: number, z: number) {
  return Math.hypot(
    (heightAt(x + 0.3, z) - heightAt(x - 0.3, z)) / 0.6,
    (heightAt(x, z + 0.3) - heightAt(x, z - 0.3)) / 0.6,
  );
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz),
    0,
    1,
  );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
export function pathDistance(x: number, z: number) {
  return Math.min(
    ...PATH.slice(1).map((p, i) => segmentDistance({ x, z }, PATH[i], p)),
  );
}
export function inOpenArea(x: number, z: number) {
  return (
    x > -79 &&
    x < riverX(z) - 4.6 &&
    z > WORLD.minOpenZ &&
    z < 66 &&
    heightAt(x, z) > WORLD.waterY + 0.15
  );
}
export function zoneName(x: number, z: number) {
  if (z < -40) return "宅后望台";
  if (Math.hypot(x - HOME.x, z - HOME.z) < 18) return "山间营地";
  if (z > 36) return "溪谷河岸";
  return "下坡混交林";
}
