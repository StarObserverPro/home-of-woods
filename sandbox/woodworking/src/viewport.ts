import * as THREE from 'three'
import { bounds, EPS, patchVertices, surfaces } from './solid.ts'
import type { Box, Surface, Vec3 } from './solid.ts'
import type { OperationPreview, SawOperation, Workpiece } from './machining.ts'
import { createStageProps } from './stage-props.ts'
import { workpieceMaterial } from './stage-materials.ts'
import { worldPerPixel, clamp } from './view-state.ts'

export interface WorkView {
  piece: Workpiece; selectedSurface: string | null; operation?: SawOperation; preview?: OperationPreview
  conflictSurfaces?: string[]; paint?: string | null; setup?: boolean
  socket?: { fits: boolean; width: number; depth: number }
}
export interface WorkbenchViewport {
  update(view: WorkView): void
  orient(mode:'iso'|'face'|'depth',surfaceId?:string|null): void
  turn(direction:'left'|'right'|'up'|'down'):void
  zoom(factor:number):void
  cancelGesture():void
  setPaused(value:boolean):void
  destroy():void
}
export function surfaceName(s: Surface,p: Workpiece):string {
  const size=[p.stock.length,p.stock.height,p.stock.width]
  const exterior=Math.abs(s.plane-(s.sign===1?size[s.axis]:0))<EPS
  if(s.axis===0)return s.sign<0?'基准端':exterior?'端面':'新端面'
  if(s.axis===1)return s.sign>0?(exterior?'顶面':'槽底'):'底面'
  return `${s.sign<0?'近':'远'}${exterior?'侧面':'切面'}`
}
/** Demand-rendered 3D inspection stage. Viewing never executes a tool operation. */
export function createWorkbenchViewport(canvas:HTMLCanvasElement,onSelect:(id:string)=>void):WorkbenchViewport {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'})
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor('#536b51')
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap
  const scene=new THREE.Scene();scene.fog=new THREE.Fog('#536b51',420,850)
  const camera=new THREE.OrthographicCamera(-100,100,80,-80,.1,1500)
  camera.position.set(0,145,230);camera.lookAt(0,17,0)
  scene.add(new THREE.HemisphereLight('#fff4db','#484734',2.2))
  const sun=new THREE.DirectionalLight('#fff0cf',3.2);sun.position.set(-110,190,100);sun.castShadow=true
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-220,right:220,top:200,bottom:-200,near:1,far:600});sun.shadow.normalBias=.3;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun)
  const fill=new THREE.DirectionalLight('#bdd6d9',.55);fill.position.set(100,80,-70);scene.add(fill)
  const pivot=new THREE.Group(), stockRoot=new THREE.Group(), previewRoot=new THREE.Group(), fitRoot=new THREE.Group()
  pivot.add(stockRoot,previewRoot,fitRoot);scene.add(pivot)
  const wood=workpieceMaterial(), tint=new THREE.MeshBasicMaterial({color:'#f5d181',transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2})
  const conflict=new THREE.MeshBasicMaterial({color:'#cf5d42',transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3})
  const previewMat=new THREE.MeshBasicMaterial({color:'#eadc9e',transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide})
  const cutLineMat=new THREE.LineBasicMaterial({color:'#fff2bc',transparent:true,opacity:.85,depthTest:false})
  const fitMat=new THREE.MeshStandardMaterial({color:'#8b6948',roughness:.85})
  const rootMaterials=[wood,tint,conflict,previewMat,cutLineMat,fitMat]
  const surfacesMeshes:THREE.Mesh[]=[];let hover:string|null=null,view:WorkView|null=null,geometryKey='',stockKey=''
  let frame=0,disposed=false,paused=false,contextUnavailable=false,zoom=1,size=[90,30,30],wpp=1
  let drag:{id:number;x:number;y:number;sx:number;sy:number;moved:boolean}|null=null
  let cue:{start:number;operation:SawOperation;preview:OperationPreview}|null=null
  const home=()=>new THREE.Quaternion().setFromEuler(new THREE.Euler(.12,-.42,0,'YXZ'))
  pivot.quaternion.copy(home())
  const props=createStageProps(invalidate);scene.add(props.scene)
  const parked=new THREE.Group();parked.add(props.saw);parked.position.set(-65,2,-67);parked.rotation.set(-Math.PI/2,0,.1);parked.scale.setScalar(.5);scene.add(parked)
  let activeSaw:THREE.Object3D|null=null
  props.ready.then(()=>{if(disposed)return;canvas.dataset.assets='ready';activeSaw=props.saw.clone(true);activeSaw.visible=false;activeSaw.scale.setScalar(1);pivot.add(activeSaw);invalidate()}).catch(()=>{if(!disposed){canvas.dataset.assets='failed';canvas.setAttribute('aria-description','手锯未能载入，请重新打开工作台')}})
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2()
  const front=new THREE.Vector3().subVectors(camera.position,new THREE.Vector3(0,17,0)).normalize()
  const camRight=new THREE.Vector3(1,0,0),camUp=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion)
  const targetCenter=new THREE.Vector3()
  function invalidate(){if(!disposed&&!paused&&!contextUnavailable&&!frame)frame=requestAnimationFrame(draw)}
  function clearGroup(g:THREE.Group){g.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)o.geometry.dispose()});g.clear()}
  function faceGeometry(s:Surface){
    const vertices:number[]=[],normals:number[]=[],uv:number[]=[]
    for(const patch of s.patches){const points=patchVertices(patch,s.axis);const normal=new THREE.Vector3();normal.setComponent(s.axis,s.sign)
      const cross=new THREE.Vector3().crossVectors(new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])),new THREE.Vector3(...points[2]).sub(new THREE.Vector3(...points[0])))
      const indices=cross.dot(normal)>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]
      for(const i of indices){vertices.push(...points[i]);normals.push(...normal.toArray());uv.push(points[i][0]*.02,points[i][2]*.02)}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geometry
  }
  function highlight(){for(const m of surfacesMeshes){const overlay=m.children[0] as THREE.Mesh;const id=m.userData.surfaceId;overlay.visible=id===view?.selectedSurface||id===hover||!!view?.conflictSurfaces?.includes(id);overlay.material=view?.conflictSurfaces?.includes(id)?conflict:tint}}
  function rebuild(){if(!view)return;const p=view.piece
    const key=JSON.stringify(p.geometry.boxes)
    if(key!==geometryKey){geometryKey=key;clearGroup(stockRoot);surfacesMeshes.length=0
      for(const s of surfaces(p.geometry.boxes)) {const geo=faceGeometry(s),m=new THREE.Mesh(geo,wood);m.userData.surfaceId=s.id;m.castShadow=true;m.receiveShadow=true
        const over=new THREE.Mesh(geo.clone(),tint);over.renderOrder=3;over.visible=false;m.add(over);stockRoot.add(m);surfacesMeshes.push(m)}
    }
    wood.color.set(view.paint??'#d9af75');highlight();clearGroup(previewRoot)
    const preview=view.preview
    if(preview?.allowed&&preview.sweep){const b=preview.sweep,sizeB=b.max.map((n,i)=>n-b.min[i])
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(...sizeB as Vec3),previewMat);mesh.position.set(...b.min.map((n,i)=>(n+b.max[i])/2) as Vec3);previewRoot.add(mesh)
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),cutLineMat);edges.position.copy(mesh.position);edges.renderOrder=4;previewRoot.add(edges)
      if(preview.feedAxis!==undefined&&view.operation){const a=b.min.map((n,i)=>(n+b.max[i])/2) as Vec3;const entry=surfaces(p.geometry.boxes).find(s=>s.id===view!.operation!.entrySurface)
        if(entry){a[entry.axis]=entry.plane;const end=[...a] as Vec3;end[entry.axis]+=preview.feedSign!*view.operation.depth
          // One clearly visible feed guide on the near side of the stock, not a second geometry source.
          if(preview.strokeAxis!==undefined){a[preview.strokeAxis]=b.min[preview.strokeAxis]-1;end[preview.strokeAxis]=a[preview.strokeAxis]}
          const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...end)]);previewRoot.add(new THREE.LineSegments(geo,cutLineMat))
        }
      }
    }
    clearGroup(fitRoot)
    if(view.socket){const b=bounds(p.geometry.boxes),L=b.max[0],slot=view.socket,near=(p.stock.width-slot.width)/2
      const start=slot.fits?L-slot.depth:L+7
      for(const [x,y,z,dx,dy,dz] of [[start,0,-8,slot.depth,p.stock.height,near+8],[start,0,near+slot.width,slot.depth,p.stock.height,near+8],[start+slot.depth,0,-8,4,p.stock.height,p.stock.width+16]]){
        const m=new THREE.Mesh(new THREE.BoxGeometry(dx,dy,dz),fitMat);m.position.set(x+dx/2,y+dy/2,z+dz/2);m.castShadow=true;m.receiveShadow=true;fitRoot.add(m)
      }
    }
    for(const group of [stockRoot,previewRoot,fitRoot])group.position.set(-size[0]/2,-size[1]/2,-size[2]/2)
  }
  function updatePlacement(){
    // Rotate the inspected item, not the quiet surrounding workshop. Keep the lower corner on the table.
    let minY=Infinity;for(const x of [-size[0]/2,size[0]/2])for(const y of [-size[1]/2,size[1]/2])for(const z of [-size[2]/2,size[2]/2])minY=Math.min(minY,new THREE.Vector3(x,y,z).applyQuaternion(pivot.quaternion).y)
    pivot.position.set(0,1-minY,8);pivot.updateMatrixWorld(true)
  }
  function frameCamera(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return
    renderer.setSize(r.width,r.height,false)
    wpp=worldPerPixel(size[0],size[1],size[2],r.width,r.height,zoom)
    camera.left=-r.width*wpp/2;camera.right=r.width*wpp/2;camera.top=r.height*wpp/2;camera.bottom=-r.height*wpp/2;camera.updateProjectionMatrix()
    canvas.dataset.viewScale=String(1/wpp);canvas.dataset.viewZoom=String(zoom)
  }
  function draw(now:number){frame=0;if(disposed||paused||contextUnavailable)return
    updatePlacement()
    if(cue&&activeSaw){const t=clamp((now-cue.start)/620,0,1),op=cue.operation,pr=cue.preview
      parked.visible=false;activeSaw.visible=true
      const stroke=new THREE.Vector3().setComponent(pr.strokeAxis!,1),up=new THREE.Vector3().setComponent(pr.feedAxis!,-pr.feedSign!),normal=new THREE.Vector3().crossVectors(stroke,up)
      activeSaw.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(stroke,up,normal))
      const center=pr.sweep!.min.map((n,i)=>(n+pr.sweep!.max[i])/2) as Vec3
      center[pr.feedAxis!]=pr.feedSign === 1?pr.sweep!.min[pr.feedAxis!]+op.depth*t:pr.sweep!.max[pr.feedAxis!]-op.depth*t
      const tooth=new THREE.Vector3(105,0,0).applyQuaternion(activeSaw.quaternion)
      activeSaw.position.set(center[0]-size[0]/2,center[1]-size[1]/2,center[2]-size[2]/2).sub(tooth).addScaledVector(stroke,Math.sin(t*6*Math.PI)*7)
      if(t<1)invalidate();else{cue=null;activeSaw.visible=false;parked.visible=true}
    }
    renderer.render(scene,camera)
    canvas.dataset.renderCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles)
    canvas.dataset.viewQuaternion=pivot.quaternion.toArray().join(',')
  }
  function pick(x:number,y:number){const r=canvas.getBoundingClientRect();pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);pivot.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(surfacesMeshes,false)[0]?.object.userData.surfaceId as string|undefined}
  function rotate(dx:number,dy:number){pivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(camUp,dx));pivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(camRight,dy));invalidate()}
  function down(e:PointerEvent){if(paused||e.button!==0||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);e.preventDefault()}
  function move(e:PointerEvent){if(paused)return;if(drag&&drag.id===e.pointerId){if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>5)drag.moved=true;if(drag.moved)rotate((e.clientX-drag.x)*.009,(e.clientY-drag.y)*.009);drag.x=e.clientX;drag.y=e.clientY}else{const id=pick(e.clientX,e.clientY)??null;if(id!==hover){hover=id;highlight();invalidate()}}}
  function up(e:PointerEvent){if(!drag||drag.id!==e.pointerId)return;const old=drag;drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!old.moved&&e.type==='pointerup'){const id=pick(e.clientX,e.clientY);if(id)onSelect(id)}}
  function leave(){if(!drag&&hover){hover=null;highlight();invalidate()}}
  const resize=new ResizeObserver(()=>{frameCamera();invalidate()});resize.observe(canvas)
  for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['pointerleave',leave]] as const)canvas.addEventListener(name,handler as EventListener)
  const contextLost=(e:Event)=>{e.preventDefault();canvas.dataset.context='lost';contextUnavailable=true;if(frame)cancelAnimationFrame(frame);frame=0}
  const contextRestored=()=>{canvas.dataset.context='ready';contextUnavailable=false;frameCamera();invalidate()}
  canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored)
  function cancelGesture(){if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null;cue=null;parked.visible=true;if(activeSaw)activeSaw.visible=false}
  return {
    update(next){if(disposed)return;const prev=view;view=next;const key=`${next.piece.stock.id}:${next.piece.stock.length}:${next.piece.stock.height}:${next.piece.stock.width}`
      if(key!==stockKey){stockKey=key;size=[next.piece.stock.length,next.piece.stock.height,next.piece.stock.width];zoom=1;pivot.quaternion.copy(home());frameCamera()}
      if(prev?.preview?.allowed&&prev.operation&&next.piece.operations.length===prev.piece.operations.length+1&&next.piece.operations.at(-1)?.kind==='saw.sweep'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)cue={start:performance.now(),operation:prev.operation,preview:prev.preview}
      rebuild();invalidate()
    },
    orient(mode,surfaceId){if(mode==='iso')pivot.quaternion.copy(home());else if(view){const s=surfaces(view.piece.geometry.boxes).find(s=>s.id===(surfaceId??view!.selectedSurface));if(s){let axis=s.axis,sign=s.sign;if(mode==='depth'){axis=view.preview?.strokeAxis??([0,1,2].find(a=>a!==s.axis&&a!==view!.operation?.planeAxis)??2) as 0|1|2;sign=1}pivot.quaternion.setFromUnitVectors(new THREE.Vector3().setComponent(axis,sign),front)}}invalidate()},
    turn(d){rotate(d==='left'?-.25:d==='right'?.25:0,d==='up'?-.2:d==='down'?.2:0)},
    zoom(factor){zoom=clamp(zoom*factor,.65,1.75);frameCamera();invalidate()},cancelGesture,
    setPaused(v){paused=v;cancelGesture();if(v&&frame){cancelAnimationFrame(frame);frame=0}else invalidate()},
    destroy(){if(disposed)return;disposed=true;cancelGesture();if(frame)cancelAnimationFrame(frame);resize.disconnect();for(const [n,h]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['pointerleave',leave]] as const)canvas.removeEventListener(n,h as EventListener);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);clearGroup(stockRoot);clearGroup(previewRoot);clearGroup(fitRoot);rootMaterials.forEach(m=>m.dispose());props.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear()}
  }
}
