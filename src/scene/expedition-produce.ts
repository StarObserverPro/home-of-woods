import * as THREE from 'three';
import type {ExpeditionId, ExpeditionResourceSite, ExpeditionTree} from '../content/forest-expedition.ts';
import type {createExpeditionVegetation} from './expedition-vegetation.ts';
import {V, VegetationBuilder} from './expedition-vegetation-geometry.ts';
import type {Resources} from './resources.ts';

type Fungus = 'oyster' | 'shelf' | 'ear';
type Vegetation = ReturnType<typeof createExpeditionVegetation>;
const fruitColours = {
  upper: ['#ad3f55', '#ce5962', '#88324c'],
  mixed: ['#a74155', '#c85c61', '#893849'],
  lower: ['#47538a', '#6577af', '#384474'],
};
const juneberry = ['#572d57', '#83395a', '#a95766'];
const hazelnut = ['#a57945', '#c69b62', '#8b673c'];
const palettes = {
  oyster: ['#cdbca9', '#eadbba', '#efdfc1'],
  shelf: ['#d17433', '#eead46', '#efd16a'],
  ear: ['#794337', '#aa6860', '#553329'],
};

function addMesh(builder: VegetationBuilder, group: THREE.Group, resources: Resources) {
  const geometry = builder.finish();
  if (!geometry) return;
  const material = resources.material('#ffffff', .78);
  material.vertexColors = true;
  material.flatShading = true;
  const mesh = new THREE.Mesh(resources.own(geometry), material);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

/** Closed, asymmetric fans. Wood ear uses a steep, cupped rim; the other two grow horizontally. */
function fungusBody(builder: VegetationBuilder, kind: Fungus, at: THREE.Vector3, outward: THREE.Vector3, scale: number, skew: number) {
  const ear = kind === 'ear', shelf = kind === 'shelf';
  const segments = 10, rows = 4, span = ear ? 1.57 : shelf ? 1.36 : 1.22;
  const colour = palettes[kind];
  const point = (row: number, col: number, top: boolean) => {
    const t = Math.max(.018, row / rows), u = col / segments * 2 - 1, angle = u * span;
    const wave = 1 + Math.sin(col * 2.1 + skew) * (ear ? .105 : .052) * t;
    const x = (Math.sin(angle) * t * wave * (ear ? .47 : .65) + skew * t * .08);
    const z = Math.cos(angle) * t * wave * (ear ? .35 : .69) + t * .085;
    const rise = ear ? t ** 2 * (.54 + Math.abs(u) * .13) : t * .095 + Math.sin(t * Math.PI) * (shelf ? .045 : .13);
    const thickness = ear ? .028 : shelf ? .075 : .10;
    const y = rise + (top ? thickness : -thickness) * (1 - .6 * t);
    return V(x, y, z - .025).multiplyScalar(scale).applyAxisAngle(V(0, 1, 0), Math.atan2(outward.x, outward.z)).add(at);
  };
  function patch(points: THREE.Vector3[], paint: string) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(v => v.toArray()), 3));
    geometry.computeVertexNormals();
    builder.add(geometry, paint);
  }
  for (const [top, band, paint] of [[true, [0, 3], colour[0]], [true, [3, 4], colour[1]], [false, [0, 4], colour[2]]] as const) {
    const points: THREE.Vector3[] = [];
    for (let row = band[0]; row < band[1]; row++) for (let col = 0; col < segments; col++) {
      const a = point(row, col, top), b = point(row, col + 1, top);
      const c = point(row + 1, col, top), d = point(row + 1, col + 1, top);
      points.push(...(top ? [a,c,b,b,c,d] : [a,b,c,b,d,c]));
    }
    patch(points, paint);
  }
  const rim: THREE.Vector3[] = [];
  const edge = (r1: number, c1: number, r2: number, c2: number) => {
    const a=point(r1,c1,true), b=point(r2,c2,true), c=point(r1,c1,false), d=point(r2,c2,false);
    rim.push(a,b,c,b,d,c);
  };
  for(let col=0;col<segments;col++){edge(rows,col+1,rows,col);edge(0,col,0,col+1);}
  for(let row=0;row<rows;row++){edge(row+1,0,row,0);edge(row,segments,row+1,segments);}
  patch(rim,colour[1]);
}

function growFruit(builder: VegetationBuilder, twigs: THREE.Vector3[], palette: string[], mode: 'tree' | 'bush' | 'nut') {
  const radius = mode === 'tree' ? .125 : mode === 'bush' ? .115 : .135;
  for (const [i, twig] of twigs.entries()) {
    const stem = twig.clone().add(V(0, -.095, 0));
    builder.branch([twig, stem], [.022, .018], '#7f7850', 0, 4);
    for (let j = 0; j < (mode === 'nut' ? 2 : 3); j++) {
      const angle = j * 2.4 + i * .9;
      const center = stem.clone().add(V(Math.cos(angle) * .12, -.13 - j * .036, Math.sin(angle) * .12));
      builder.branch([stem, center], [.016, .009], '#7f7850', 0, 4);
      builder.cluster(center, V(radius, radius * (mode === 'nut' ? 1.23 : .98), radius), palette[(i+j)%3], i * 19 + j, 0);
      if (mode === 'bush' && palette === fruitColours.lower) {
        builder.cluster(center.clone().add(V(0, radius*.87, 0)), V(.043,.019,.047), '#44517a', j, 0);
      }
      if (mode === 'nut') {
        builder.cluster(center.clone().add(V(0, radius*.59, 0)), V(.121,.075,.121), '#87964f', j, 0);
      }
    }
  }
}

function collectShells(builder: VegetationBuilder) {
  for (let i = 0; i < 5; i++) {
    const center = V(Math.sin(i*2.4)*.44, .115, Math.cos(i*2.4)*.38);
    builder.cluster(center, V(.13,.11,.15), hazelnut[i%3], i, 0);
    builder.cluster(center.clone().add(V(.07,.028,0)), V(.085,.097,.12), '#6e6545', i, 0);
  }
}

function onWood(builder: VegetationBuilder, site: ExpeditionResourceSite, base: THREE.Group, host: ExpeditionTree | undefined, vegetation: Vegetation) {
  const kind: Fungus = site.role === 'wood-ear' ? 'ear' : site.role === 'shelf-fungus' ? 'shelf' : 'oyster';
  const substrate = site.substrate!;
  const surface = new THREE.Raycaster();
  const at = (origin: THREE.Vector3, direction: THREE.Vector3, wood: THREE.Object3D) => {
    surface.set(origin,direction);
    return surface.intersectObject(wood)[0]?.point;
  };
  if (substrate === 'standing-trunk' && host) {
    const outward = V(site.x-host.x,0,site.z-host.z).normalize(), side = V(outward.z,0,-outward.x);
    for (let i = 0; i < 5; i++) {
      const approach = V(site.x, site.y, site.z).addScaledVector(side, [-.4,.4,-.65,.5,-.3][i]);
      const position = vegetation.trunkSurface(host, approach, [.76,1.06,1.32,1.67,1.93][i]);
      if (position) fungusBody(builder,kind,base.worldToLocal(position),outward,[.74,.98,.67,.88,.56][i],i-2);
    }
    return;
  }
  if (substrate === 'standing-trunk') return;
  const stump = substrate === 'stump', radius = stump ? .74 : .48, rotation = .48;
  const feature = vegetation.createFeature({
    id: site.id + '-host', kind: substrate, x: 0, y: 0, z: 0, length: 3.9,
    radius, height: stump ? .97 : 1.3, rotation,
  });
  base.add(feature); base.updateMatrixWorld(true);
  const wood = feature.getObjectByName(substrate+'-wood')!;
  const towardApproach = V(site.x-base.position.x,0,site.z-base.position.z).normalize();
  const bankSide = V(Math.sin(rotation),0,Math.cos(rotation));
  if (bankSide.dot(towardApproach) < 0) bankSide.negate();
  for (let i = 0; i < 5; i++) {
    const normal = stump
      ? towardApproach.clone().applyAxisAngle(V(0,1,0),[0,-.61,.56,-1.95,2.14][i])
      : bankSide.clone().multiplyScalar(i < 3 ? 1 : -1);
    const along = stump ? 0 : (i-2)*.48;
    const height = stump ? [.43,.67,.85,.77,.54][i] : [.48,.62,.5,.68,.58][i];
    const axis = V(along*Math.cos(rotation),height,-along*Math.sin(rotation)).add(base.position);
    const position = at(axis.clone().addScaledVector(normal, 1.8),normal.clone().negate(),wood);
    if (position) fungusBody(builder,kind,base.worldToLocal(position),normal,(kind==='ear'?.66:.83)+i%3*.13,i-2);
  }
}

/** Decorate exactly one registered source. Meshes inherit the shared outdoor lighting. */
export function populateExpeditionProduce(site: ExpeditionResourceSite, mapId: ExpeditionId, base: THREE.Group, harvest: THREE.Group,
  host: ExpeditionTree | undefined, vegetation: Vegetation, resources: Resources) {
  const builder = new VegetationBuilder('mid');
  if (site.substrate) {
    onWood(builder,site,base,host,vegetation);
  } else if (site.role === 'tree-fruit' || site.role === 'berry' || site.role === 'nut') {
    if (host && ['serviceberry','berry','hazel'].includes(host.kind)) {
      base.position.set(host.x,host.y,host.z);
      base.updateMatrixWorld(true);
      const direction = V(site.x-host.x,0,site.z-host.z).normalize();
      const local = vegetation.fruitTwigsFor(host).map(twig=>base.worldToLocal(twig));
      local.sort((a,b)=>b.dot(direction)-a.dot(direction));
      const tree = site.role === 'tree-fruit', nut = site.role === 'nut';
      growFruit(builder,local.slice(0,tree?4:3),tree?juneberry:nut?hazelnut:fruitColours[mapId],tree?'tree':nut?'nut':'bush');
    } else if (site.role === 'nut') {
      collectShells(builder);
    }
  } else if (host && site.role === 'resin') {
    const outward = V(site.x-host.x,0,site.z-host.z).normalize();
    for(let i=0;i<3;i++){
      const position=vegetation.trunkSurface(host,V(site.x,site.y,site.z),.8+i*.17);
      if(!position)continue;
      const p=base.worldToLocal(position).addScaledVector(outward,.023);
      builder.cluster(p,V(.115,.18,.11),i%2?'#b87428':'#dcab55',i,1);
    }
  } else {
    return false;
  }
  addMesh(builder,harvest,resources);
  return true;
}
