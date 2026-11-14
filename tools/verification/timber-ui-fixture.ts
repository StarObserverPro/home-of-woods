/// <reference types="vite/client" />
/** Real App/runtime, synthetic stock, and an exclusively in-memory save adapter. */
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from '../../src/ui/App.tsx';
import {createStarterState} from '../../src/domain/state.ts';
import {inventoryTransaction} from '../../src/domain/inventory.ts';
import type {SaveRecords,WorldSaveStore} from '../../src/app/world-save-store.ts';
import '../../src/ui/style.css';
import '../../src/ui/hud-layout.css';
import '../../src/ui/menu-art.css';
import '../../src/ui/rustic-ui.css';

export function mountTimberReview(host:HTMLElement){
  const state=createStarterState();
  state.time=0; // Production calendar starts at 14:00.
  state.clock.speed=0;
  state.selected=null;
  state.inventory=inventoryTransaction(state.inventory,[
    'wood','branch','scrap-fuel','mushroom','dried-mushroom',
    'canvas-roll','hardware-kit','food-rice','food-oats','food-black-bread',
  ].map((itemId,index)=>({itemId,qualityId:'ordinary',delta:3+index})));
  let records:SaveRecords={primary:null,backup:null};
  const noticeReview=new URLSearchParams(location.search).get('gridNotice')==='1';
  const store:WorldSaveStore={
    async read(){
      // A stable, production-owned alert for cross-layer layout review. No real save is read.
      if(noticeReview)throw new Error('UI grid review: in-memory store unavailable');
      return {...records};
    },
    async compareAndSwap(expected,next){
      if(records.primary!==expected.primary||records.backup!==expected.backup)return false;
      records={...next};return true;
    },
  };
  const root=createRoot(host);
  root.render(createElement<{review:{state:typeof state;store:WorldSaveStore}}>(App,{review:{state,store}}));
  return ()=>root.unmount();
}

const host=document.getElementById('root');
if(host){
  const dispose=mountTimberReview(host);
  import.meta.hot?.dispose(dispose);
}
