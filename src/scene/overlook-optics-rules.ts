import {CAMERA} from '../content/world.ts';
import {OVERLOOK} from '../content/camera.ts';
import {OVERLOOK_OPTICS as O} from '../content/overlook-optics.ts';
import type {OrbitPose} from './anchored-overlook.ts';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{
  const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);
};

/** No temporal state: actual and predicted navigation use precisely this lens. */
export function overlookAmount(pose:Pick<OrbitPose,'elevation'|'zoom'>){
  if(!Number.isFinite(pose.elevation)||!Number.isFinite(pose.zoom))return 0;
  return Math.max(smooth(OVERLOOK.enterElevation,O.fullElevation,pose.elevation),
    1-smooth(O.fullZoom,OVERLOOK.enterZoom,pose.zoom));
}

export function navigationOpticsProjection(pose:Pick<OrbitPose,'elevation'|'zoom'>,aspect:number,mobile:boolean){
  const safeAspect=Number.isFinite(aspect)&&aspect>0?aspect:1;
  const poseZoom=Number.isFinite(pose.zoom)?Math.max(.01,pose.zoom):CAMERA.zoom;
  const amount=overlookAmount(pose);
  const defaultZoom=poseZoom*(mobile?1.45:1);
  const wideFraction=clamp((poseZoom-CAMERA.minZoom)/(CAMERA.zoom-CAMERA.minZoom),0,1);
  const focalLengthMm=(O.widestFocalLengthMm+(O.overviewFocalLengthMm-O.widestFocalLengthMm)*wideFraction)
    *Math.max(1,poseZoom/CAMERA.zoom);
  const baseTan=Math.tan(O.baseVerticalFov*Math.PI/360);
  const viewHeightMm=O.filmLongEdgeMm/Math.max(1,safeAspect);
  const aerialTan=viewHeightMm/(2*focalLengthMm);
  // Interpolating the image-plane extent avoids two stacked camera smoothers.
  const tanHalf=baseTan/defaultZoom+(aerialTan-baseTan/defaultZoom)*amount;
  const zoom=amount===0?defaultZoom:baseTan/tanHalf;
  return {fov:O.baseVerticalFov,zoom,amount,focalLengthMm,
    verticalFov:2*Math.atan(tanHalf)*180/Math.PI,
    horizontalFov:2*Math.atan(tanHalf*safeAspect)*180/Math.PI};
}

export function overlookFocusBands(focusDistance:number){
  const focus=Number.isFinite(focusDistance)?Math.max(1,focusDistance):110;
  return {focus,nearFull:focus*O.nearFullFocusRatio,nearSharp:focus*O.nearSharpFocusRatio,
    farSharp:focus*O.farSharpFocusRatio,farFull:focus*O.farFullFocusRatio};
}

/** Signed normalized blur: negative foreground, positive far field, zero sky/sharp band. */
export function overlookCoC(viewDepth:number,focusDistance:number,amount=1,sky=false){
  if(sky||!Number.isFinite(viewDepth)||viewDepth<=0||!Number.isFinite(amount)||amount<=0)return 0;
  const b=overlookFocusBands(focusDistance);
  return (smooth(b.farSharp,b.farFull,viewDepth)-(1-smooth(b.nearFull,b.nearSharp,viewDepth)))
    *clamp(Number.isFinite(amount)?amount:0,0,1);
}

export function overlookBufferSize(width:number,height:number,compact:boolean){
  const w=Math.max(1,Math.round(Number.isFinite(width)?width:1));
  const h=Math.max(1,Math.round(Number.isFinite(height)?height:1));
  const scale=compact?O.compactBlurScale:O.blurScale;
  const blurWidth=Math.max(1,Math.ceil(w*scale)),blurHeight=Math.max(1,Math.ceil(h*scale));
  // RGBA16F scene + DEPTH_COMPONENT24 (budgeted as 32 bits), RGBA16F blur.
  return {width:w,height:h,blurWidth,blurHeight,estimatedBytes:w*h*12+blurWidth*blurHeight*8};
}

/** Perspective depth is non-linear; mirror of packing.glsl's reconstruction. */
export function perspectiveViewDistance(depth:number,near:number,far:number){
  return near*far/(far-(far-near)*clamp(depth,0,1));
}
