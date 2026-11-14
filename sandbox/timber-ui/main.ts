/// <reference types="vite/client" />
import {mountTimberTheme} from '../../src/ui/timber/mount.ts';
import {timberSurface} from '../../src/ui/timber/surface.ts';
import type {TimberMaterial, TimberRole} from '../../src/ui/timber/surface.ts';
import '../../src/ui/timber/theme.css';
import themeCss from '../../src/ui/timber/theme.css?inline';
import './style.css';

const root = document.querySelector<HTMLElement>('#timber-lab')!;
const icon = (name: string, size = 36) => `<img src="/assets/ui-r1/icons/${name}-128.png" width="${size}" height="${size}" alt="" aria-hidden="true" draggable="false" />`;

root.innerHTML = `
  <header class="lab-masthead">
    <a class="lab-brand" href="/" aria-label="返回森林之家">
      <svg viewBox="0 0 36 44" aria-hidden="true"><path d="M18 1 7 18h6L3 32h11v11h8V32h11L23 18h6Z" fill="currentColor"/></svg>
      <span>森林之家<small>HOME OF WOODS</small></span>
    </a>
    <nav class="lab-links" aria-label="样板台导航">
      <a href="/" data-timber-surface="button" data-timber-tone="moss">回到营地</a>
      <a href="/sandbox/cabin-interior/" data-timber-surface="button" data-timber-tone="dark">木屋展台</a>
    </nav>
  </header>

  <main>
    <section class="lab-intro" aria-labelledby="lab-title">
      <div><p class="lab-eyebrow">同一块木料，不同的用法</p><h1 id="lab-title">木作样板台</h1><p class="lab-lead">看轮廓、摸按钮，也看看一块木板变长以后是什么样子。</p></div>
      <div class="lab-switches" role="group" aria-label="检视条件">
        <button id="change-seed" data-timber-surface="button">换块木料 <span aria-hidden="true">↻</span></button>
        <button id="long-text" data-timber-surface="button" data-timber-tone="dark" aria-pressed="false">长文字</button>
        <button id="texture-toggle" data-timber-surface="button" data-timber-tone="dark" aria-pressed="false">纯色回退</button>
      </div>
    </section>

    <div class="lab-workspace">
      <section class="lab-camp" data-timber-surface="panel" data-timber-seed="camp-window" aria-labelledby="camp-title">
        <header class="lab-window-heading" data-timber-surface="heading" data-timber-tone="light">
          ${icon('workbench', 38)}<div><small>营地工作台</small><h2 id="camp-title" data-short="营地木作" data-long="为山间小屋做一张能坐两个人的木凳">营地木作</h2></div>
          <span class="lab-window-sign" aria-hidden="true">◆</span>
        </header>
        <nav class="lab-camp-tabs" aria-label="示例配方类别">
          <button data-timber-surface="button" data-timber-tone="moss" data-camp-tab="furniture" aria-pressed="true">家具</button>
          <button data-timber-surface="button" data-timber-tone="dark" data-camp-tab="daily" aria-pressed="false">日用</button>
          <button data-timber-surface="button" data-timber-tone="dark" data-camp-tab="kitchen" aria-pressed="false">餐厨</button>
        </nav>
        <div class="lab-craft-body">
          <div class="lab-inventory" role="group" aria-label="示例图纸">
            <button class="lab-item" data-timber-surface="slot" data-item="木凳" data-icon="guest-bench" aria-label="木凳图纸" aria-pressed="true">${icon('guest-bench', 72)}<span>木凳</span><span class="lab-selected" aria-hidden="true">◆</span></button>
            <button class="lab-item" data-timber-surface="slot" data-item="小几" data-icon="prep-table" aria-label="小几图纸" aria-pressed="false">${icon('prep-table', 72)}<span>小几</span></button>
            <button class="lab-item" data-timber-surface="slot" data-item="木碗" data-icon="wooden-bowl" aria-label="木碗图纸" aria-pressed="false">${icon('wooden-bowl', 72)}<span>木碗</span></button>
            <div class="lab-item lab-empty-slot" data-timber-surface="slot" aria-label="空图纸格"><span aria-hidden="true">·</span></div>
          </div>
          <section class="lab-recipe" aria-label="选中图纸">
            <div class="lab-recipe-title">${icon('guest-bench', 46)}<div><small>已学会的图纸</small><h3 id="recipe-name">木凳</h3></div></div>
            <p id="recipe-note">两个人坐，也放得下一篮松果。</p>
            <div class="lab-material-count">${icon('small-wood', 42)}<div><span>样料</span><strong><output id="material-count">3</output> / 4</strong></div></div>
            <p id="craft-reason" class="lab-reason">还差 1 份木料</p>
            <div class="lab-actions">
              <button id="take-material" data-timber-surface="button" data-short="取出一根" data-long="从样料架取出一根木料">取出一根</button>
              <button id="craft-item" data-timber-surface="button" data-timber-tone="moss" disabled>制作</button>
            </div>
          </section>
        </div>
        <footer class="lab-camp-footer"><span id="craft-status" role="status" aria-live="polite">先取一根样料，试试按钮的变化。</span><button id="reset-craft" data-timber-surface="button" data-timber-tone="dark">重置样料</button></footer>
        <p class="lab-footnote">此处仅演示界面状态，不读取或改变游戏存档。</p>
      </section>

      <section class="lab-proportions" aria-labelledby="proportions-title">
        <div class="lab-section-heading"><span class="lab-section-number">01</span><div><h2 id="proportions-title">木料的比例</h2><p>长边增加，切角和厚度仍然收得住。</p></div></div>
        <div class="lab-shape-tabs" role="group" aria-label="轮廓比例">
          <button data-shape="block" data-timber-surface="button" aria-pressed="false">短块</button>
          <button data-shape="plank" data-timber-surface="button" aria-pressed="true">长板</button>
          <button data-shape="post" data-timber-surface="button" aria-pressed="false">竖条</button>
          <button data-shape="panel" data-timber-surface="button" aria-pressed="false">大窗</button>
        </div>
        <div class="lab-shape-stage" aria-live="polite">
          <div id="shape-sample" class="lab-shape-sample is-plank" data-timber-surface="heading" data-timber-material="plank" data-timber-seed="shape"><span id="shape-label">顺着木纹，做成长板</span></div>
        </div>
        <p id="shape-metrics" class="lab-shape-metrics"></p>
        <p class="lab-small-note">大窗用框和安静内面；年轮留给小端头。文字始终落在平整处。</p>
      </section>
    </div>

    <section class="lab-materials-section" aria-labelledby="materials-title">
      <div class="lab-section-heading"><span class="lab-section-number">02</span><div><h2 id="materials-title">五种表面，各有位置</h2><p>同一套色板，靠切面、方向和厚度认出材料。</p></div></div>
      <div class="lab-materials">
        <article><div class="lab-material-swatch" data-timber-surface="heading" data-timber-material="plank" data-timber-seed="material-plank"><span>顺纹木板</span></div><h3>纵剖</h3><p>标题与主动作。纤维顺着长边，中央留给字。</p></article>
        <article><div class="lab-material-swatch lab-endgrain" data-timber-surface="badge" data-timber-material="endgrain" data-timber-seed="material-endgrain"><span aria-hidden="true">◆</span></div><h3>横截</h3><p>小端头与短木块。几层粗年轮，不铺满窗口。</p></article>
        <article><div class="lab-material-swatch" data-timber-surface="heading" data-timber-material="bark" data-timber-seed="material-bark"><span>外缘树皮</span></div><h3>树皮</h3><p>外框和少量分组。方向明确，边缘粗而有序。</p></article>
        <article><div class="lab-material-swatch lab-shaving" data-timber-surface="badge" data-timber-material="shaving" data-timber-seed="material-shaving"><span aria-hidden="true">＋</span></div><h3>刨花</h3><p>完成与增量提示。小而轻，不承担整面墙。</p></article>
        <article><div class="lab-material-swatch" data-timber-surface="slot" data-timber-material="recess" data-timber-seed="material-recess">${icon('wood-log', 58)}</div><h3>凹槽</h3><p>物品和次级信息。压低纹理，让内容更清楚。</p></article>
      </div>
    </section>

    <section class="lab-interactions-section" aria-labelledby="states-title">
      <div class="lab-section-heading"><span class="lab-section-number">03</span><div><h2 id="states-title">手感与状态</h2><p>用鼠标或触控按下；用 Tab 巡检键盘焦点。</p></div></div>
      <div class="lab-states">
        <div><button id="state-normal" data-timber-surface="button">按一下木块</button><span>悬停 · 按下</span></div>
        <div><button id="state-selected" data-timber-surface="button" data-timber-tone="moss" aria-pressed="true">◆ 已选中</button><span>可切换选择</span></div>
        <div><button id="state-focus" data-timber-surface="button">键盘也能找到</button><span>Tab · Enter · 空格</span></div>
        <div><button data-timber-surface="button" disabled>材料不足</button><span>禁用 · 保留原因</span></div>
        <div><button id="state-busy" data-timber-surface="button" aria-busy="false">试做木钉</button><span>忙碌 · 完成</span></div>
      </div>
      <p id="state-message" class="lab-state-message" role="status" aria-live="polite">按钮状态变化在这里回应。</p>
    </section>

    <section class="lab-isolation" aria-labelledby="isolation-title">
      <div class="lab-section-heading"><span class="lab-section-number">04</span><div><h2 id="isolation-title">搬到另一个小屋</h2><p>这个小窗口在独立的 Shadow DOM 里，仍使用同一份木料与按钮。</p></div></div>
      <div id="shadow-host"></div>
    </section>
  </main>
  <footer class="lab-footer"><span>粗犷在木头，清楚在操作。</span><span id="seed-label">木料种子 1</span></footer>
`;

const shadowHost = root.querySelector<HTMLElement>('#shadow-host')!;
const shadow = shadowHost.attachShadow({mode: 'open'});
shadow.innerHTML = `<style>${themeCss}</style><style>
  @layer how-layout {
  :host{display:block;min-width:0}section{padding:18px;max-width:560px;box-sizing:border-box}header{display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px}h3,p{margin:0}h3{font-size:18px}p{color:var(--how-muted);line-height:1.6;margin-bottom:14px}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px}button{font:inherit;padding:10px 18px;min-width:44px;min-height:44px}output{color:var(--how-ink);font-size:14px}.mark{font-size:23px;color:var(--how-ink)}@media(max-width:400px){section{padding:14px}header{padding:10px}.actions{gap:10px}}
  }
  </style><div data-how-ui="timber"><section data-timber-surface="panel" data-timber-seed="shadow-window"><header data-timber-surface="heading"><span class="mark" aria-hidden="true">✦</span><h3>林间的小木屋</h3></header><p>换一个模块，木头的边缘和按钮的手感都一样。</p><div class="actions"><button id="shadow-light" data-timber-surface="button" data-timber-tone="moss" aria-pressed="false">点亮灯火</button><output id="shadow-status" role="status" aria-live="polite">灯火未亮</output></div></section></div>`;
const shadowRoot = shadow.querySelector<HTMLElement>('[data-how-ui]')!;
const disposeTheme = mountTimberTheme(root);
const disposeShadowTheme = mountTimberTheme(shadowRoot);
const disposers: (() => void)[] = [];
const timers = new Set<ReturnType<typeof setTimeout>>();
const on = (element: EventTarget, name: string, handler: EventListener) => {
  element.addEventListener(name, handler);
  disposers.push(() => element.removeEventListener(name, handler));
};
const after = (fn: () => void, delay: number) => {
  const timer = setTimeout(() => {timers.delete(timer); fn();}, delay);
  timers.add(timer);
};
const find = <T extends HTMLElement = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;

let seed = 1;
const paintNodes = [...root.querySelectorAll<HTMLElement>('[data-timber-surface]'), ...shadowRoot.querySelectorAll<HTMLElement>('[data-timber-surface]')];
paintNodes.forEach((node, index) => {node.dataset.labSeed = node.dataset.timberSeed ?? `part-${index}`;});
on(find('#change-seed'), 'click', () => {
  seed++;
  paintNodes.forEach(node => {node.dataset.timberSeed = `${node.dataset.labSeed}:${seed}`;});
  find('#seed-label').textContent = `木料种子 ${seed}`;
  updateMetrics();
});
on(find('#long-text'), 'click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  root.querySelectorAll<HTMLElement>('[data-short]').forEach(node => {node.textContent = active ? node.dataset.long! : node.dataset.short!;});
});
on(find('#texture-toggle'), 'click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  root.classList.toggle('how-texture-off', active);
  shadowRoot.classList.toggle('how-texture-off', active);
});

const sample = find('#shape-sample');
const sampleLabels: Record<string, string> = {block: '一块短木', plank: '顺着木纹，做成长板', post: '竖向木条', panel: '大窗里，留一块安静地方'};
on(find('.lab-shape-tabs'), 'click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-shape]');
  if (!button) return;
  const kind = button.dataset.shape!;
  root.querySelectorAll('[data-shape]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
  sample.className = `lab-shape-sample is-${kind}`;
  sample.dataset.timberSurface = kind === 'panel' ? 'panel' : kind === 'plank' ? 'heading' : 'badge';
  sample.dataset.timberMaterial = kind === 'block' ? 'endgrain' : kind === 'post' ? 'bark' : 'plank';
  find('#shape-label').textContent = sampleLabels[kind];
});
function updateMetrics() {
  const rect = sample.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const paint = timberSurface({width: rect.width, height: rect.height, role: sample.dataset.timberSurface as TimberRole, material: sample.dataset.timberMaterial as TimberMaterial, seed: sample.dataset.timberSeed});
  find('#shape-metrics').textContent = `${paint.width} × ${paint.height} px · 切角 ${paint.corner} px · 厚度 ${paint.depth} px · ${paint.facetCount} 个色面`;
}
const sampleObserver = new ResizeObserver(updateMetrics);
sampleObserver.observe(sample);
updateMetrics();

let materials = 3, made = 0, crafting = false, craftGeneration = 0;
const craftButton = find<HTMLButtonElement>('#craft-item');
const takeButton = find<HTMLButtonElement>('#take-material');
function showMaterials() {
  find('#material-count').textContent = String(materials);
  find('#craft-reason').textContent = crafting ? '正在加工这份样料' : materials < 4 ? `还差 ${4 - materials} 份木料` : '材料齐了，可以制作';
  craftButton.disabled = materials < 4 || crafting;
  craftButton.setAttribute('aria-busy', String(crafting));
  craftButton.textContent = crafting ? '加工中…' : '制作';
  takeButton.disabled = crafting || materials >= 8;
}
on(takeButton, 'click', () => {materials = Math.min(8, materials + 1); showMaterials(); find('#craft-status').textContent = '取出一根样料。';});
on(craftButton, 'click', () => {
  if (crafting || materials < 4) return;
  const generation = ++craftGeneration;
  const itemName = find('#recipe-name').textContent!;
  crafting = true;
  showMaterials();
  find('#craft-status').textContent = `正在制作${itemName}…`;
  after(() => {
    if (generation !== craftGeneration) return;
    crafting = false;
    materials -= 4;
    made++;
    showMaterials();
    find('#craft-status').textContent = `完成了${itemName}。本次试做 ${made} 件。`;
  }, 850);
});
on(find('#reset-craft'), 'click', () => {craftGeneration++; materials = 3; made = 0; crafting = false; showMaterials(); find('#craft-status').textContent = '样料回到 3 份，可以重新试按。';});
on(find('.lab-inventory'), 'click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-item]');
  if (!button || crafting) return;
  root.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(node => {
    const active = node === button;
    node.setAttribute('aria-pressed', String(active));
    node.querySelector('.lab-selected')?.remove();
    if (active) node.insertAdjacentHTML('beforeend', '<span class="lab-selected" aria-hidden="true">◆</span>');
  });
  find('#recipe-name').textContent = button.dataset.item!;
  find<HTMLImageElement>('.lab-recipe-title img').src = `/assets/ui-r1/icons/${button.dataset.icon}-128.png`;
  find('#recipe-note').textContent = button.dataset.item === '小几' ? '放一杯热茶，也放刚读到一半的书。' : button.dataset.item === '木碗' ? '木纹很轻，盛一碗热汤。' : '两个人坐，也放得下一篮松果。';
});
on(find('.lab-camp-tabs'), 'click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-camp-tab]');
  if (!button) return;
  root.querySelectorAll('[data-camp-tab]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
  find('#craft-status').textContent = `${button.textContent}分类已选中；样板保留三张代表图纸，供比较状态。`;
});

on(find('#state-normal'), 'click', () => {find('#state-message').textContent = '木块收到了这次按下。';});
on(find('#state-focus'), 'click', () => {find('#state-message').textContent = '键盘与鼠标发出同一个操作。';});
on(find('#state-selected'), 'click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  button.textContent = active ? '◆ 已选中' : '选择这块';
  find('#state-message').textContent = active ? '选择有文字和形状提示。' : '选择已取消。';
});
on(find('#state-busy'), 'click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '加工中…';
  find('#state-message').textContent = '正在试做木钉。';
  after(() => {button.setAttribute('aria-busy', 'false'); button.textContent = '再做一颗'; find('#state-message').textContent = '木钉完成。忙碌状态已结束。';}, 1000);
});
on(shadowRoot.querySelector<HTMLButtonElement>('#shadow-light')!, 'click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  button.textContent = active ? '熄灭灯火' : '点亮灯火';
  shadowRoot.querySelector('#shadow-status')!.textContent = active ? '灯火已点亮' : '灯火未亮';
});

function dispose() {
  sampleObserver.disconnect();
  disposeTheme();
  disposeShadowTheme();
  disposers.forEach(disposeListener => disposeListener());
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
}
if (import.meta.hot) import.meta.hot.dispose(dispose);

