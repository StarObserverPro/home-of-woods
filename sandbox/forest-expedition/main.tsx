import {createRoot} from 'react-dom/client';
import {createForestExpeditionRuntime} from '../../src/app/forest-expedition-runtime.ts';
import {ForestExpeditionApp} from '../../src/ui/ForestExpedition.tsx';
import {mountTimberTheme} from '../../src/ui/timber/mount.ts';
import {mountExpeditionInspection} from '../../src/app/forest-expedition-inspection.ts';
import '../../src/ui/timber/theme.css';
import '../../src/ui/forest-expedition.css';
import './shell.css';

const host = document.querySelector<HTMLElement>('#forest-expedition')!;
host.dataset.uiGridRoot = 'viewport';
const unmountTheme = mountTimberTheme(host);
const loading = document.querySelector<HTMLElement>('#forest-loading')!;
const root = createRoot(document.querySelector('#forest-ui')!);
let runtime: Awaited<ReturnType<typeof createForestExpeditionRuntime>> | null = null;
let disposed = false;
let unmountInspection = () => {};
createForestExpeditionRuntime(document.querySelector<HTMLCanvasElement>('#forest-canvas')!).then(instance => {
  if (disposed) {instance.dispose(); return;}
  runtime = instance; loading.remove(); root.render(<ForestExpeditionApp runtime={instance} />);
  unmountInspection = mountExpeditionInspection(host);
}).catch(error => {
  const detail = error instanceof Error ? error.message : '加载失败';
  loading.textContent = /WebGL context/i.test(detail) ? '当前浏览器无法开启 WebGL 2，暂时不能显示三维林地。请在支持 WebGL 2 的浏览器中打开。' : `林地暂时未能打开：${detail}。请刷新重试。`;
  loading.setAttribute('role', 'alert'); console.error(error);
});
if (import.meta.hot) import.meta.hot.dispose(() => {disposed = true; unmountInspection(); runtime?.dispose(); root.unmount(); unmountTheme();});
