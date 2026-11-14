import {mountCabinAudit} from './app.ts';
import type {CabinAuditHandle} from './app.ts';
import './style.css';
import '../../../src/ui/timber/theme.css';

const host=document.querySelector<HTMLElement>('#cabin-audit')!;
let retired=false;
let mounted:CabinAuditHandle|undefined;
if(import.meta.hot)import.meta.hot.dispose(()=>{retired=true;mounted?.dispose();});
mountCabinAudit(host).then(api=>{
  if(retired)api.dispose();else mounted=api;
}).catch(error=>{
  if(retired)return;
  console.error(error);
  host.innerHTML='<main class="fatal"><h1>木屋暂时没有加载完成</h1><p></p><button onclick="location.reload()">重新加载</button></main>';
  host.querySelector('p')!.textContent=error instanceof Error?error.message:String(error);
});
