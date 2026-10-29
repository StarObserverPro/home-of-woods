import { createGame } from './app/create-game';
import './style.css';

const host = document.getElementById('game')!, hud = document.getElementById('hud')!;
let game: ReturnType<typeof createGame> | undefined;
try { game = createGame(host, hud); }
catch (error) {
  const panel = document.createElement('div'); panel.className = 'startup-error';
  const title = document.createElement('h1'); title.textContent = '森林还没有展开';
  const message = document.createElement('p'); message.textContent = '请开启浏览器的图形加速，再重新打开森林之家。已有存档会保留在这台设备上。';
  const button = document.createElement('button'); button.textContent = '再试一次'; button.onclick = () => location.reload();
  panel.append(title, message, button); host.replaceChildren(panel); console.error(error);
}
if (import.meta.hot) import.meta.hot.dispose(() => game?.destroy());
