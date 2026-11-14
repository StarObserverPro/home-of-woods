import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import sawBytes from '../assets/hand-saw.glb'
import tableColor from '../assets/table-color.jpg'
import tableNormal from '../assets/table-normal.jpg'
import { grainTexture } from './stage-materials.ts'

export interface StageProps { scene: THREE.Group; saw: THREE.Group; ready: Promise<void>; dispose(): void }
/** One simple bench, a quiet static forest, and an actual CC0 tool mesh. No background animation. */
export function createStageProps(invalidate: () => void): StageProps {
  const group = new THREE.Group(), saw = new THREE.Group()
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>()
  let disposed = false
  const ownMaterial = <T extends THREE.Material>(m:T): T => { materials.add(m); return m }
  const wood = ownMaterial(new THREE.MeshStandardMaterial({ color: '#ac865a', roughness: .86 }))
  const fallback = grainTexture(); textures.add(fallback); wood.map=fallback
  const loader = new THREE.TextureLoader()
  loader.load(tableColor,t=>{if(disposed){t.dispose();return}t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;textures.add(t);wood.map=t;wood.needsUpdate=true;invalidate()})
  loader.load(tableNormal,t=>{if(disposed){t.dispose();return}t.wrapS=t.wrapT=THREE.RepeatWrapping;textures.add(t);wood.normalMap=t;wood.normalScale.set(.12,.12);wood.needsUpdate=true;invalidate()})
  const darkWood = ownMaterial(new THREE.MeshStandardMaterial({ color:'#5e4933',roughness:.91,map:fallback }))
  const box = (w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material=wood,r=.7) => {
    const geometry = new RoundedBoxGeometry(w,h,d,1,Math.min(r,w/6,h/6,d/6));geometries.add(geometry)
    const mesh=new THREE.Mesh(geometry,m);mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);return mesh
  }
  // Five thick boards. No unseen tessellation, interior joinery or ornate workshop shell.
  for(let i=0;i<5;i++)box(490,12,59,-8,-7,-115+i*60)
  box(490,26,10,-8,-24,150,darkWood); box(490,24,10,-8,-24,-150,darkWood)
  for(const x of [-180,180])for(const z of [-110,110])box(22,130,24,x,-79,z,darkWood)
  box(380,16,18,0,-105,110,darkWood)
  // Bench dog holes are shallow dark insets, not another high-resolution table mesh.
  const holeMat=ownMaterial(new THREE.MeshStandardMaterial({color:'#322a21',roughness:1}))
  const holeGeo=new THREE.CylinderGeometry(3.2,3.2,.4,12);geometries.add(holeGeo)
  for(const x of [-150,-105,-60,-15,30,75,120,165]){const m=new THREE.Mesh(holeGeo,holeMat);m.position.set(x,-.7,95);group.add(m)}
  // A proper try square: a thick fence and a thin steel blade, perpendicular and flush.
  const steel=ownMaterial(new THREE.MeshStandardMaterial({color:'#a8b4ac',roughness:.56,metalness:.18}))
  const square=new THREE.Group(); square.position.set(56,.6,49); square.rotation.y=-.22; group.add(square)
  const toolBox=(w:number,h:number,d:number,x:number,z:number,m:THREE.Material)=>{const geo=new RoundedBoxGeometry(w,h,d,1,Math.min(.4,h/4));geometries.add(geo);const mesh=new THREE.Mesh(geo,m);mesh.position.set(x,h/2,z);mesh.castShadow=true;square.add(mesh)}
  toolBox(10,6,42,0,0,darkWood);toolBox(57,.7,9,23,-16,steel)
  // Static wood curls: sparse, small and only decorative, never inventory objects.
  const shaving=ownMaterial(new THREE.MeshStandardMaterial({color:'#d9b279',roughness:.9,side:THREE.DoubleSide}))
  for(let i=0;i<6;i++){const geo=new THREE.TorusGeometry(2+i%3,.22,3,10,4.4);geometries.add(geo);const m=new THREE.Mesh(geo,shaving);m.position.set(67+i*6,.9+(i%2)*2,-16+i*5);m.rotation.set(.2+i,.1*i,.7*i);group.add(m)}
  // Soft distant trunks / crowns. One static arrangement, no simulated wind or idle RAF.
  const bark=ownMaterial(new THREE.MeshStandardMaterial({color:'#43503b',roughness:1}))
  const leaves=['#344c3e','#49614a','#566b4e'].map(color=>ownMaterial(new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true})))
  for(let i=0;i<14;i++){
    const x=-450+i*69,z=-285-(i%3)*36,h=145+(i%4)*32
    const trunk=new THREE.CylinderGeometry(6,10,h,5);geometries.add(trunk);const tree=new THREE.Mesh(trunk,bark);tree.position.set(x,h/2-100,z);group.add(tree)
    const crown=new THREE.IcosahedronGeometry(62+(i%3)*12,0);geometries.add(crown);const top=new THREE.Mesh(crown,leaves[i%3]);top.scale.set(.85,1.25,.8);top.position.set(x,h-90,z);group.add(top)
  }
  const ready=new GLTFLoader().parseAsync(sawBytes.buffer.slice(sawBytes.byteOffset,sawBytes.byteOffset+sawBytes.byteLength) as ArrayBuffer,'').then(gltf=>{
    if(disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)v.dispose()});m.dispose()})}});return}
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);o.castShadow=true;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){materials.add(m);Object.values(m).forEach(v=>{if(v instanceof THREE.Texture){textures.add(v);v.anisotropy=4}})}}})
    saw.add(gltf.scene);invalidate()
  })
  return { scene:group,saw,ready,dispose(){disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.clear();saw.clear()} }
}
