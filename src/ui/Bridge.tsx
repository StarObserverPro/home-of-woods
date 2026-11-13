import {CREEK_BRIDGE} from '../content/regions.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';

export function BridgeControls({view,disabled,onBuild,onCancel}:{view:WorkshopSnapshot;disabled:boolean;onBuild:()=>void;onCancel:()=>void}){
  const bridge=view.upgrade;
  if(bridge?.targetId!==CREEK_BRIDGE.id||!bridge.near||bridge.level>0)return null;
  const working=view.job?.kind==='upgrade'&&view.job.targetId===CREEK_BRIDGE.id;
  return <div className="tree-work">
    {working?<><p>正在搭建木桥…</p><progress aria-label="修桥进度" value={view.job!.progress} max={1}/><button className="context-button" onClick={onCancel}>取消施工</button></>:<>
      <p className="tree-cost">{bridge.materials.map(material=>`${material.name} ${material.available}/${material.required} ${material.unit}`).join(' · ')}</p>
      <button className="context-button" disabled={disabled||!bridge.canStart} onClick={onBuild}>修建木桥</button>
      {!bridge.canStart&&bridge.reason&&<p className="action-reason">{bridge.reason}</p>}
    </>}
  </div>;
}
