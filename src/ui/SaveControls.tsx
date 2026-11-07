import {ItemBrowser,ItemHeading,MenuAction,TextPages} from './ItemBrowser.tsx';
import { useState } from 'react';
import type { SaveStatus } from '../app/save-controller.ts';
export function SaveControls({ status, onSave, onReload, onRestore, onExport }: {
  status: SaveStatus; onSave: () => Promise<unknown>; onReload: () => Promise<unknown>;
  onRestore: () => Promise<unknown>; onExport: (which: 'primary' | 'backup') => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const waiting = busy || status.state === 'loading' || status.state === 'saving';
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setNotice('');
    try { await operation(); } catch (error) { setNotice(`操作未完成：${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };
  const download = async (which: 'primary' | 'backup') => {
    const raw = await onExport(which);
    if (raw === null) { setNotice('尚无这份存档记录。'); return; }
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `home-of-woods-${which}.json`; link.click();
    URL.revokeObjectURL(url);
  };
  const actions=[{id:'save',name:'保存世界',run:onSave,disabled:!status.canSave},{id:'load',name:'重新读取',run:onReload,disabled:false},{id:'primary',name:'导出主档',run:()=>download('primary'),disabled:!status.hasPrimary},{id:'backup',name:'导出备份',run:()=>download('backup'),disabled:!status.hasBackup},{id:'restore',name:'恢复副本',run:onRestore,disabled:!status.canRestore}];
  return <section className="save-controls" aria-label="世界存档"><ItemBrowser pageSize={4} label="存档操作" items={actions.map(a=>({...a,icon:'blueprint' as const}))} renderDetail={action=><><ItemHeading name={action.name} icon={action.icon}/>{action.id==='load'&&<p className="wood-note">回到最近保存的状态</p>}{action.id==='restore'&&<p className="wood-note">有效副本将替换主档与备份；可先导出。</p>}<MenuAction disabled={waiting||action.disabled} onClick={()=>void run(action.run)}>{action.name}</MenuAction></>}/><TextPages text={notice||status.message} size={60}/>{status.diagnostics.length>0&&<TextPages text={status.diagnostics.join('；')} size={60}/>}</section>;
}
