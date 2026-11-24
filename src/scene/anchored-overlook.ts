import {CAMERA} from '../content/world.ts';
import {OVERLOOK} from '../content/camera.ts';
import {navigationDollyScale} from './overlook-optics-rules.ts';

export type CameraPoint = {x:number;y:number;z:number};
export type OrbitPose = {yaw:number;elevation:number;zoom:number;distance:number};
export type OverlookMode = 'follow' | 'overlook' | 'returning';
export type CameraBorrower = 'scene' | 'character' | 'cabin' | null;

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const angle=(value:number)=>Math.atan2(Math.sin(value),Math.cos(value));
const approach=(current:number,goal:number,step:number)=>current+clamp(goal-current,-step,step);
const copyPoint=(point:CameraPoint)=>({x:point.x,y:point.y,z:point.z});
const defaults=():OrbitPose=>({yaw:CAMERA.yaw,elevation:CAMERA.elevation,zoom:CAMERA.zoom,distance:OVERLOOK.distance});
const elevated=(pose:OrbitPose)=>pose.elevation>OVERLOOK.enterElevation||pose.zoom<OVERLOOK.enterZoom;
type RigStep={current:OrbitPose;desired:OrbitPose;mode:OverlookMode;anchor:CameraPoint|null};

function advance(rig:RigStep,step:number,followTarget:CameraPoint,advanceScale:number){
  const {current,desired}=rig;
  const returning=rig.mode==='returning';
  const yawScale=rig.mode==='overlook'?advanceScale:1;
  const yawDelta=angle(desired.yaw-current.yaw),yawStep=OVERLOOK.yawRate*step*yawScale;
  if(yawStep>0)current.yaw=Math.abs(yawDelta)<=yawStep?desired.yaw:angle(current.yaw+clamp(yawDelta,-yawStep,yawStep));
  // Readiness throttles aerial turns and expansion. Return/reset can recover.
  const elevationScale=returning||desired.elevation<=current.elevation?1:advanceScale;
  const zoomScale=returning||desired.zoom>=current.zoom?1:advanceScale;
  current.elevation=approach(current.elevation,desired.elevation,OVERLOOK.elevationRate*step*elevationScale);
  const logZoomDelta=Math.log(desired.zoom/current.zoom),zoomStep=OVERLOOK.logZoomRate*step*zoomScale;
  current.zoom=Math.abs(logZoomDelta)<=zoomStep?desired.zoom:current.zoom*Math.exp(clamp(logZoomDelta,-zoomStep,zoomStep));
  const distanceScale=returning||desired.distance<=current.distance?1:advanceScale;
  current.distance=approach(current.distance,desired.distance,OVERLOOK.distanceRate*step*distanceScale);
  if(rig.mode==='overlook'&&!elevated(desired)&&Math.abs(current.distance-desired.distance)<1e-8)rig.mode='returning';
  if(rig.mode==='returning'&&rig.anchor){
    // No ground-center translation until the walking orbit has recovered.
    const poseReady=current.elevation<=CAMERA.elevation+1e-10&&current.zoom>=CAMERA.zoom-1e-10&&Math.abs(current.distance-OVERLOOK.distance)<1e-8;
    if(!poseReady){
      desired.elevation=Math.min(desired.elevation,CAMERA.elevation);
      desired.zoom=Math.max(desired.zoom,CAMERA.zoom);
      return;
    }
    const anchor=rig.anchor,dx=followTarget.x-anchor.x,dy=followTarget.y-anchor.y,dz=followTarget.z-anchor.z;
    const distance=Math.hypot(dx,dy,dz),travel=OVERLOOK.returnTargetSpeed*step;
    if(distance<=Math.max(travel,OVERLOOK.targetEpsilon)){rig.anchor=null;rig.mode='follow';}
    else{anchor.x+=dx/distance*travel;anchor.y+=dy/distance*travel;anchor.z+=dz/distance*travel;}
  }
}

/** A bounded orbit, never a free camera. It owns no world or renderer state. */
export function createAnchoredOverlook(){
  const current=defaults(),desired=defaults();
  let mode:OverlookMode='follow',anchor:CameraPoint|null=null,borrower:CameraBorrower=null;
  let returnTarget:CameraPoint={x:0,y:0,z:0};
  let advanceScale=1;
  const beginOverlook=(observedTarget:CameraPoint)=>{
    if(elevated(desired)||current.distance<OVERLOOK.distance-1e-8){
      if(mode!=='overlook')anchor=copyPoint(observedTarget);
      mode='overlook';
    }else if(mode==='overlook')mode='returning';
  };
  const pending=()=>!borrower && (mode==='returning' || Math.abs(angle(desired.yaw-current.yaw))>1e-8 ||
    Math.abs(desired.elevation-current.elevation)>1e-8 || Math.abs(desired.zoom-current.zoom)>1e-8 || Math.abs(desired.distance-current.distance)>1e-8);
  const lift=(pose:OrbitPose)=>Math.max(0,Math.sin(pose.elevation)*pose.distance-Math.sin(CAMERA.elevation)*OVERLOOK.distance);
  const groundReady=()=>mode==='follow';
  return {
    releaseFocus(pose:OrbitPose,observedTarget:CameraPoint){
      if(borrower)return;
      Object.assign(current,pose);Object.assign(desired,pose,{distance:OVERLOOK.distance*navigationDollyScale(pose.zoom)});
      anchor=copyPoint(observedTarget);mode='overlook';
    },
    rotate(amount:number){
      if(borrower||!Number.isFinite(amount))return;
      desired.yaw=angle(current.yaw+clamp(angle(desired.yaw-current.yaw)+amount,-OVERLOOK.maxQueuedYaw,OVERLOOK.maxQueuedYaw));
    },
    elevate(amount:number,observedTarget:CameraPoint){
      if(borrower||!Number.isFinite(amount))return;
      desired.elevation=clamp(desired.elevation+amount,CAMERA.minElevation,OVERLOOK.maxElevation);
      beginOverlook(observedTarget);
    },
    zoomBy(factor:number,observedTarget:CameraPoint){
      if(borrower||!Number.isFinite(factor)||factor<=0)return;
      desired.zoom=clamp(desired.zoom*factor,CAMERA.minZoom,CAMERA.maxZoom);
      desired.distance=OVERLOOK.distance*navigationDollyScale(desired.zoom);
      beginOverlook(observedTarget);
    },
    requestFollow(){
      if(mode!=='follow'){
        mode='returning';
        desired.elevation=Math.min(desired.elevation,CAMERA.elevation);
        desired.zoom=Math.max(desired.zoom,CAMERA.zoom);
        desired.distance=OVERLOOK.distance;
      }
      return groundReady();
    },
    reset(){
      Object.assign(desired,defaults());
      if(anchor)mode='returning';
    },
    setBorrower(value:CameraBorrower){borrower=value;},
    setAdvanceScale(value:number){advanceScale=Number.isFinite(value)?clamp(value,0,1):0;},
    update(dt:number,followTarget:CameraPoint){
      returnTarget=copyPoint(followTarget);
      if(borrower)return;
      const step=clamp(Number.isFinite(dt)?dt:0,0,OVERLOOK.maxDelta);
      const next={current,desired,mode,anchor};advance(next,step,followTarget,advanceScale);
      mode=next.mode;anchor=next.anchor;
    },
    forecast(seconds:number,observedTarget:CameraPoint,followFor:(pose:OrbitPose)=>CameraPoint){
      const next:RigStep={current:{...current},desired:{...desired},mode,anchor:anchor?copyPoint(anchor):null};
      let target=copyPoint(observedTarget),remaining=clamp(seconds,0,.5);
      // Prepare the allowed future even when readiness currently holds the rig.
      while(!borrower&&remaining>1e-8){
        const step=Math.min(1/60,remaining),follow=followFor(next.current),wasReturning=next.mode==='returning';
        advance(next,step,follow,1);
        if(wasReturning&&next.mode==='follow')target=copyPoint(follow);
        if(next.anchor)target=copyPoint(next.anchor);
        else{
          const destination=followFor(next.current),weight=1-Math.exp(-step*5);
          target.x+=(destination.x-target.x)*weight;target.y+=(destination.y-target.y)*weight;target.z+=(destination.z-target.z)*weight;
        }
        remaining-=step;
      }
      return {pose:next.current,target};
    },
    groundReady,
    pending,
    plan(){
      return {
        mode,borrower,advanceScale,groundReady:groundReady(),pending:pending(),
        current:{...current},desired:{...desired},
        anchor:anchor?copyPoint(anchor):null,
        destination:anchor?copyPoint(mode==='returning'?returnTarget:anchor):null,
        lift:lift(current),desiredLift:lift(desired),distance:OVERLOOK.distance,
      };
    },
  };
}
