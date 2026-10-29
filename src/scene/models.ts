import * as THREE from 'three';
import type { BuildingKind, Tool, Tree } from '../domain/types';
import { Resources } from './resources';

const leafColors = ['#79ad49', '#5f9846', '#8abd54', '#4e935b'];

export function treeModel(resources: Resources, tree: Tree): THREE.Group {
  const root = new THREE.Group();
  const treeScale = tree.stage === 'sapling' ? 0.24 : tree.stage === 'young' ? 0.54 : 1;
  root.scale.setScalar(treeScale);
  root.add(resources.mesh('cylinder', '#a16a41', [0.46, 1.75, 0.46], [0, 0.88, 0]));
  const branch = resources.mesh('cylinder', '#a16a41', [0.2, 0.85, 0.2], [0.28, 1.45, 0]);
  branch.rotation.z = -0.6; root.add(branch);
  const leaf = leafColors[tree.variant % leafColors.length];
  root.add(resources.mesh('ico', leaf, [2.15, 2.05, 1.95], [0, 2.65, 0], 0.38));
  root.add(resources.mesh('ico', leaf, [1.6, 1.5, 1.6], [-0.65, 2.15, 0.14], 0.38));
  root.add(resources.mesh('ico', leaf, [1.6, 1.65, 1.65], [0.66, 2.25, 0.1], 0.38));
  root.add(resources.mesh('ico', '#a6c76a', [0.85, 0.65, 0.9], [-0.3, 3.37, -0.05], 0.42));
  if (tree.variant % 3 === 0 && tree.stage === 'mature') {
    for (const p of [[-0.65, 2.3, 0.84], [0.56, 2.65, 0.8], [0.1, 1.95, 0.81]] as [number, number, number][]) {
      root.add(resources.mesh('ball', '#dc8656', [0.23, 0.26, 0.23], p, 0.36));
    }
  }
  return root;
}

export function cabinModel(r: Resources): THREE.Group {
  const g = new THREE.Group();
  g.add(r.mesh('round', '#cdbb88', [2.95, 0.25, 2.95], [0, 0.13, 0]));
  g.add(r.mesh('round', '#f1d6a0', [2.55, 1.85, 2.4], [0, 1.07, 0]));
  for (const x of [-1.2, 1.2]) for (const z of [-1.1, 1.1])
    g.add(r.mesh('round', '#a5724e', [0.21, 1.95, 0.21], [x, 1.1, z]));
  const roofShape = r.geometry('cabin-gable', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.49, 0); shape.lineTo(0, 1.04); shape.lineTo(1.49, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.06, bevelThickness: 0.06 });
    geometry.translate(0, 0, -1.45); return geometry;
  });
  const roof = new THREE.Mesh(roofShape, r.material('#ba674c', 0.4));
  roof.position.y = 1.98; roof.castShadow = true; roof.receiveShadow = true; g.add(roof);
  for (const z of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) {
    const a = r.mesh('round', '#d68054', [1.85, 0.11, 0.12], [-0.75, 2.51, z]); a.rotation.z = 0.61; g.add(a);
    const b = r.mesh('round', '#d68054', [1.85, 0.11, 0.12], [0.75, 2.51, z]); b.rotation.z = -0.61; g.add(b);
  }
  g.add(r.mesh('round', '#8d6347', [0.8, 1.28, 0.13], [-0.33, 0.89, 1.24]));
  g.add(r.mesh('round', '#b58657', [0.57, 1.11, 0.16], [-0.33, 0.88, 1.31]));
  g.add(r.mesh('ball', '#f0cd72', [0.1, 0.1, 0.1], [-0.12, 0.9, 1.41]));
  for (const x of [0.66]) {
    g.add(r.mesh('round', '#a86e49', [0.76, 0.73, 0.15], [x, 1.32, 1.24]));
    g.add(r.mesh('round', '#9bcac1', [0.54, 0.5, 0.17], [x, 1.32, 1.29], 0.22));
    g.add(r.mesh('round', '#f3dfb3', [0.07, 0.57, 0.1], [x, 1.32, 1.41]));
    g.add(r.mesh('round', '#f3dfb3', [0.57, 0.07, 0.1], [x, 1.32, 1.41]));
    g.add(r.mesh('round', '#a96f4c', [0.85, 0.16, 0.29], [x, 0.95, 1.33]));
  }
  g.add(r.mesh('round', '#e6bd85', [0.93, 0.16, 0.42], [-0.33, 0.18, 1.48]));
  g.add(r.mesh('round', '#d6b487', [0.42, 0.87, 0.45], [0.8, 2.76, -0.6]));
  g.add(r.mesh('round', '#b66b4b', [0.57, 0.17, 0.59], [0.8, 3.2, -0.6]));
  const attic = r.mesh('ball', '#7e9f9a', [0.39, 0.39, 0.11], [0, 2.42, 1.53]); g.add(attic);
  return g;
}

export function fenceModel(r: Resources): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.78, 0.78]) {
    g.add(r.mesh('round', '#d6b77e', [0.23, 0.9, 0.23], [x, 0.46, 0]));
    g.add(r.mesh('cone', '#e8c994', [0.27, 0.19, 0.27], [x, 0.98, 0]));
  }
  for (const y of [0.34, 0.68]) g.add(r.mesh('round', '#b78c59', [1.78, 0.16, 0.13], [0, y, 0]));
  return g;
}

export function buildingModel(r: Resources, kind: BuildingKind) { return kind === 'cabin' ? cabinModel(r) : fenceModel(r); }

export function cropModel(r: Resources, mature: boolean): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.22, 0.22]) for (const z of [-0.2, 0.2]) {
    if (mature) g.add(r.mesh('ball', '#ea9344', [0.22, 0.25, 0.22], [x, 0.09, z]));
    for (let i = 0; i < 3; i++) {
      const leaf = r.mesh('ico', i === 1 ? '#83b958' : '#4b9850', [0.14, mature ? 0.38 : 0.2, 0.09], [x, mature ? 0.31 : 0.16, z]);
      leaf.rotation.z = (i - 1) * 0.6; leaf.rotation.y = i * 2; g.add(leaf);
    }
  }
  return g;
}

export interface PlayerModel { root: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; arm: THREE.Group; tool: THREE.Group; setTool(tool: Tool): void }
export function playerModel(r: Resources): PlayerModel {
  const root = new THREE.Group();
  root.add(r.mesh('round', '#456f62', [0.56, 0.57, 0.39], [0, 0.76, 0]));
  root.add(r.mesh('round', '#e6d7b0', [0.61, 0.25, 0.43], [0, 1.01, 0]));
  root.add(r.mesh('round', '#bd7747', [0.41, 0.45, 0.19], [0, 0.88, -0.27]));
  root.add(r.mesh('ball', '#f3ceaa', [0.73, 0.73, 0.65], [0, 1.37, 0]));
  root.add(r.mesh('ball', '#6d4935', [0.74, 0.65, 0.65], [0, 1.48, -0.06]));
  root.add(r.mesh('round', '#f4cfac', [0.56, 0.43, 0.19], [0, 1.33, 0.26]));
  root.add(r.mesh('ball', '#eab675', [0.77, 0.39, 0.7], [0, 1.68, -0.03]));
  root.add(r.mesh('round', '#ce8d50', [0.76, 0.08, 0.72], [0, 1.57, 0.16]));
  for (const x of [-0.14, 0.14]) root.add(r.mesh('ball', '#493e35', [0.062, 0.085, 0.045], [x, 1.37, 0.367]));
  root.add(r.mesh('ball', '#e3ad87', [0.1, 0.1, 0.1], [0, 1.28, 0.38]));
  const leftLeg = new THREE.Group(); leftLeg.position.set(-0.16, 0.52, 0); root.add(leftLeg);
  const rightLeg = new THREE.Group(); rightLeg.position.set(0.16, 0.52, 0); root.add(rightLeg);
  for (const leg of [leftLeg, rightLeg]) {
    leg.add(r.mesh('round', '#456f62', [0.22, 0.31, 0.23], [0, -0.12, 0]));
    leg.add(r.mesh('round', '#5e4836', [0.25, 0.2, 0.35], [0, -0.38, 0.055]));
  }
  const leftArm = new THREE.Group(); leftArm.position.set(-0.34, 0.98, 0); root.add(leftArm);
  const arm = new THREE.Group(); arm.position.set(0.34, 0.98, 0); root.add(arm);
  for (const a of [leftArm, arm]) {
    a.add(r.mesh('round', '#e4d6ae', [0.22, 0.35, 0.25], [0, -0.12, 0]));
    a.add(r.mesh('ball', '#f3ceaa', [0.24, 0.24, 0.24], [0, -0.33, 0.04]));
  }
  const tool = new THREE.Group(); tool.position.set(0, -0.25, 0.15); arm.add(tool);
  let selected: Tool | undefined;
  const setTool = (kind: Tool) => {
    if (selected === kind) return; selected = kind; tool.clear();
    if (kind === 'axe' || kind === 'hoe' || kind === 'build') {
      tool.add(r.mesh('round', '#aa7645', [0.09, 0.68, 0.1], [0, 0.2, 0]));
      tool.add(r.mesh('round', kind === 'build' ? '#bf9460' : '#b6c6bf', kind === 'axe' ? [0.36, 0.3, 0.12] : [0.32, 0.17, 0.17], [0.08, 0.48, 0], 0.29));
    } else if (kind === 'water') {
      tool.add(r.mesh('round', '#7da9bc', [0.3, 0.3, 0.29], [0.05, 0, 0.1]));
      const spout = r.mesh('cylinder', '#97c0cd', [0.1, 0.3, 0.1], [0.05, 0.1, 0.36]); spout.rotation.x = 0.9; tool.add(spout);
    } else tool.add(r.mesh('round', '#bc9a65', [0.25, 0.3, 0.17], [0, 0, 0]));
  };
  setTool('axe');
  return { root, leftLeg, rightLeg, arm, tool, setTool };
}
