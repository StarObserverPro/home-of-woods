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
  return <section className="save-controls" aria-label="世界存档">
    <h3>世界存档</h3><p role="status">{status.message}</p>
    <div className="save-actions">
      <button type="button" disabled={waiting || !status.canSave} onClick={() => void run(onSave)}>保存世界</button>
      <button type="button" disabled={waiting} onClick={() => void run(onReload)}>重新读取</button>
      <button type="button" disabled={waiting || !status.hasPrimary} onClick={() => void run(() => download('primary'))}>导出主档</button>
      <button type="button" disabled={waiting || !status.hasBackup} onClick={() => void run(() => download('backup'))}>导出备份</button>
      <button type="button" disabled={waiting || !status.canRestore} onClick={() => void run(onRestore)}>用有效副本恢复</button>
    </div>
    <small>自动保存整个世界。重新读取会回到最近保存的状态；有效副本恢复会替换主档与备份，可先导出原始数据。</small>
    {notice && <p role="alert">{notice}</p>}
    {status.diagnostics.length > 0 && <details><summary>存档检查详情</summary><p>{status.diagnostics.join('；')}</p></details>}
  </section>;
}
