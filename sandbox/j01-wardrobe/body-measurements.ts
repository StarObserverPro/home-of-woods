import * as THREE from 'three';

interface Surface {
  points: THREE.Vector3[];
  triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][];
}

const mm = (m: number) => Math.round(m * 10000) / 10;
const span = (points: readonly THREE.Vector3[], axis: 'x' | 'y' | 'z') =>
  points.length ? mm(Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis]))) : null;

/** Read the same skinned positions as the viewport, in the unscaled J01 coordinates. */
function fittedSurface(objects: readonly THREE.Object3D[], fromWorld: THREE.Matrix4): Surface {
  const result: Surface = { points: [], triangles: [] };
  for (const root of objects) root.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const geometry = object.geometry;
    const index = geometry.getIndex();
    const count = geometry.getAttribute('position').count;
    const points = new Map<number, THREE.Vector3>();
    const nextPoint = (i: number) => {
      const vertex = index ? index.getX(i) : i;
      let point = points.get(vertex);
      if (!point) {
        point = object.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(fromWorld);
        points.set(vertex, point);
      }
      return point;
    };
    for (let i = 0; i < (index?.count ?? count); i += 3) result.triangles.push([nextPoint(i), nextPoint(i + 1), nextPoint(i + 2)]);
    for (const point of points.values()) result.points.push(point);
  });
  return result;
}

function section(surface: Surface, axis: 'y' | 'z', at: number) {
  const points: THREE.Vector3[] = [];
  for (const triangle of surface.triangles) for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3];
    if ((a[axis] <= at) === (b[axis] <= at)) continue;
    points.push(a.clone().lerp(b, (at - a[axis]) / (b[axis] - a[axis])));
  }
  return points;
}

function sideCut(surface: Surface, height: number) {
  const hit = new THREE.Vector3();
  const ray = new THREE.Ray(new THREE.Vector3(.5, height, 0), new THREE.Vector3(-1, 0, 0));
  const intersections: number[] = [];
  for (const [a, b, c] of surface.triangles) if (ray.intersectTriangle(a, b, c, false, hit)) intersections.push(hit.x);
  if (!intersections.length) return null;
  const front = Math.max(...intersections), back = Math.min(...intersections);
  return { front: mm(front), back: mm(back), depth: mm(front - back) };
}

function waistWidth(surface: Surface, height: number) {
  const origin = new THREE.Vector3(.006, height, 0), ray = new THREE.Ray(origin, new THREE.Vector3());
  const hit = new THREE.Vector3();
  const distances = [-1, 1].map(sign => {
    ray.direction.set(0, 0, sign);
    let nearest = Infinity;
    for (const [a, b, c] of surface.triangles)
      if (ray.intersectTriangle(a, b, c, false, hit)) nearest = Math.min(nearest, Math.abs(hit.z));
    return nearest;
  });
  return distances.every(Number.isFinite) ? mm(distances[0] + distances[1]) : null;
}

function handLength(objects: readonly THREE.Object3D[], root: THREE.Bone, fromWorld: THREE.Matrix4) {
  const handJoints = new Set<THREE.Object3D>();
  root.traverse(joint => handJoints.add(joint));
  const wrist = root.getWorldPosition(new THREE.Vector3()).applyMatrix4(fromWorld);
  const point = new THREE.Vector3();
  let tip = 0;
  for (const part of objects) part.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const joints = new Set(object.skeleton.bones.flatMap((bone, id) => handJoints.has(bone) ? [id] : []));
    const joint = object.geometry.getAttribute('skinIndex'), weight = object.geometry.getAttribute('skinWeight');
    for (let i = 0; i < joint.count; i++) {
      let influence = 0;
      for (let n = 0; n < joint.itemSize; n++) if (joints.has(joint.getComponent(i, n))) influence += weight.getComponent(i, n);
      if (influence < .5) continue;
      object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld).applyMatrix4(fromWorld);
      tip = Math.max(tip, point.distanceTo(wrist));
    }
  });
  return tip > 0 ? mm(tip) : null;
}

export function measureFittingBody(avatar: THREE.Group, bones: ReadonlyMap<string, THREE.Bone>, parts: {
  torso: readonly THREE.Object3D[]; legs: readonly THREE.Object3D[]; shoes: readonly THREE.Object3D[];
  face: readonly THREE.Object3D[]; hair: readonly THREE.Object3D[]; shell: readonly THREE.Object3D[];
}) {
  const fromWorld = avatar.matrixWorld.clone().invert();
  const position = (name: string) => bones.get(name)!.getWorldPosition(new THREE.Vector3()).applyMatrix4(fromWorld);
  const measure = (name: keyof typeof parts) => fittedSurface(parts[name], fromWorld);
  const torso = measure('torso'), legs = measure('legs'), shoes = measure('shoes'), face = measure('face');
  const hair = measure('hair'), shell = measure('shell');
  const shoeSurface = [...shoes.points, ...face.points.filter(point => point.y < .16)];
  const ground = Math.min(...shoeSurface.map(p => p.y));
  const shoulderDrop = [-1, 1].map(sign => mm(
    Math.max(...section(torso, 'z', .037 * sign).map(p => p.y)) - Math.max(...section(torso, 'z', .112 * sign).map(p => p.y))));
  const heightRange = (surface: Surface, height: number, maxFromCenter: number) =>
    section(surface, 'y', height).filter(point => Math.abs(point.z) <= maxFromCenter);
  const shinSections = (['l', 'r'] as const).map(side => {
    const sign = side === 'l' ? -1 : 1;
    const [hip, knee, ankle] = ['thigh_', 'calf_', 'foot_'].map(joint => position(joint + side));
    const foot = shoeSurface.filter(point => point.z * sign > 0);
    const cuff = [...section(shoes, 'y', ankle.y + .022), ...section(face, 'y', ankle.y + .022)].filter(p => p.z * sign > 0);
    return { side, hipGroundMm: mm(hip.y - ground), thighMm: mm(hip.distanceTo(knee)), calfMm: mm(knee.distanceTo(ankle)),
      kneeWidthMm: span(section(legs, 'y', knee.y).filter(p => p.z * sign > 0), 'z'),
      bootCuffWidthMm: span(cuff, 'z'),
      footLengthMm: span(foot, 'x'), footWidthMm: span(foot, 'z'),
      handLengthMm: handLength(parts.face, bones.get('hand_' + side)!, fromWorld) };
  });
  const front = Object.fromEntries([.715, .74, .758, .770, .778].map(level => [mm(level), sideCut(torso, level)]));
  const midlineClearance = [.715, .74, .758, .770].flatMap(level => {
    const outer = sideCut(shell, level), inner = sideCut(torso, level);
    return outer && inner ? [{ heightMm: mm(level), frontMm: +(outer.front - inner.front).toFixed(1), backMm: +(inner.back - outer.back).toFixed(1) }] : [];
  });
  return {
    heightMm: mm(Math.max(...hair.points.map(p => p.y)) - ground),
    eyePlaneWidthMm: span(heightRange(face, .912, .135), 'z'),
    shoulderJointSpanMm: mm(position('upperarm_l').distanceTo(position('upperarm_r'))),
    shoulderDropMm: shoulderDrop,
    pelvisJointSpanMm: mm(position('thigh_l').distanceTo(position('thigh_r'))),
    waistWidthMm: waistWidth(torso, .585),
    hipsWidthMm: span(section(legs, 'y', .49), 'z'),
    neckBaseToPelvisMm: mm(position('neck_01').y - position('Pelvis').y),
    sideCutsMm: front, midlineClearance, extremities: shinSections,
  };
}
