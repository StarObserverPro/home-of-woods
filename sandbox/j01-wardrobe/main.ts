import { mountTimberTheme } from '../../src/ui/timber/mount.ts';
import '../../src/ui/timber/theme.css';
import './wardrobe.css';
import {
  cameras, chooseOutfit, dyeIds, dyes, optionalSlots, patterns, poses, slotIds, slots, styleIds, styles,
  type CameraAngle, type Dye, type Pose, type Slot, type Style,
} from './catalog.ts';
import { mountStage, type BodyView } from './stage.ts';
import { affixPanel, affixToolbar, mountAffixPanel } from './affix-panel.ts';

const app = document.querySelector<HTMLElement>('#wardrobe')!;
app.dataset.howUi = 'timber';
app.dataset.uiGridRoot = 'viewport';
const makeButton = (command: string, value: string, content: string, seed = command) =>
  `<button type="button" data-command="${command}" data-value="${value}" data-timber-surface="button" data-timber-seed="${seed}" data-timber-tone="dark" aria-pressed="false"${command === 'pose' ? ' data-timber-density="compact"' : ''}>${content}</button>`;

app.innerHTML = `
  <header class="wardrobe-title" data-ui-grid="hud">
    <h1>林工试衣间</h1>
    <span>森林之家</span>
  </header>
  <div class="wardrobe-layout" data-ui-grid="content">
    <section class="wardrobe-stage" data-ui-grid="window" aria-label="试穿预览">
      <div class="wardrobe-canvas" id="stage" tabindex="0" aria-label="角色预览，拖动或用方向键旋转"></div>
      <div id="load-state" data-ui-grid="notice" role="status">正在载入 J01 和样衣</div>
      <div class="stage-controls" data-ui-grid="row" role="group" aria-label="镜头">
        ${Object.entries(cameras).map(([id, label]) => makeButton('camera', id, label)).join('')}
        ${makeButton('detail', 'detail', '看局部')}
      </div>
      ${affixToolbar}
    </section>
    <section class="wardrobe-panel" data-ui-grid="window" data-timber-surface="panel" data-timber-material="boards" data-timber-seed="wardrobe-panel" aria-label="衣柜">
      <div class="wardrobe-pages wardrobe-trims" data-ui-grid="row" role="group" aria-label="试衣间页面">
        ${makeButton('page', 'outfit', '衣柜')}
        ${makeButton('page', 'affix', '词条试穿')}
      </div>
      <div class="controls-inner" id="outfit-panel" data-ui-grid="content">
        <fieldset>
          <legend>整套试穿</legend>
          <div class="wardrobe-three" data-ui-grid="row">
            ${styleIds.map(id => makeButton('outfit', id, styles[id])).join('')}
          </div>
        </fieldset>
        <fieldset>
          <legend>单件搭配</legend>
          <div class="wardrobe-four" data-ui-grid="row">
            ${slotIds.map(id => makeButton('slot', id, slots[id])).join('')}
          </div>
        </fieldset>
        <fieldset aria-label="版型">
          <div class="wardrobe-pieces" data-ui-grid="row">
            ${styleIds.map(id => makeButton('pattern', id, `<span data-pattern-text="${id}"></span>`)).join('')}
            ${makeButton('pattern', 'none', '取下')}
          </div>
        </fieldset>
        <fieldset>
          <legend>配色</legend>
          <div class="wardrobe-dyes" data-ui-grid="row">
            ${dyeIds.map(id => makeButton('dye', id, `<span class="dye-mark" data-dye="${id}" aria-hidden="true"></span><span>${dyes[id].name}</span>`)).join('')}
          </div>
        </fieldset>
        <div class="wardrobe-trims" data-ui-grid="row" role="group" aria-label="做工和挂件">
          ${makeButton('upgrade', 'upgrade', '<span>基础做工</span><small id="upgrade-name"></small>')}
          ${makeButton('attachment', 'attachment', '<span>挂件</span><small id="attachment-name"></small>')}
        </div>
        <fieldset>
          <legend>动作</legend>
          <div class="wardrobe-five" data-ui-grid="row">
            ${Object.entries(poses).map(([id, label]) => makeButton('pose', id, label)).join('')}
          </div>
        </fieldset>
        <div data-ui-grid="row">
          <label class="affix-field"><span>体型对照</span><select id="body-display">
            <option value="outfit">穿全套</option><option value="fitted">修整后的底衣</option><option value="source">原始底衣</option>
          </select></label>
        </div>
      </div>
      ${affixPanel}
    </section>
  </div>`;

const buttons = [...app.querySelectorAll<HTMLButtonElement>('[data-command]')];
const unmountTheme = mountTimberTheme(app);
const host = app.querySelector<HTMLElement>('#stage')!;
const notice = app.querySelector<HTMLElement>('#load-state')!;
const query = new URLSearchParams(location.search);
const verifying = query.has('verify');
const beforeFit = verifying && query.get('fit') === 'before';
const bodySelect = app.querySelector<HTMLSelectElement>('#body-display')!;
const replayButton = app.querySelector<HTMLButtonElement>('#affix-play')!;
let outfit = chooseOutfit('yard');
let slot: Slot = 'top';
let ensemble: Style | null = 'yard';
let view: CameraAngle | '' = 'quarter';
let pose: Pose = 'stand';
let detail = false;
let stage: Awaited<ReturnType<typeof mountStage>> | null = null;
let page = query.has('affix') ? 'affix' : 'outfit';
let bodyView: BodyView = 'outfit';
const affix = mountAffixPanel(app, (range, light, quality) => {
  stage?.setAffixView(page === 'affix', range, light, quality);
}, () => stage?.cancelAffix());
bodySelect.addEventListener('change', () => {
  bodyView = bodySelect.value as BodyView;
  stage?.setBodyView(bodyView);
  syncControls();
});
replayButton.addEventListener('click', () => {
  if (!stage) return;
  const { recipe, speed } = affix.selection();
  stage.playAffix(recipe, speed, phase => affix.status(phase));
});

function switchPage() {
  const showAffix = page === 'affix';
  app.querySelector<HTMLElement>('#outfit-panel')!.hidden = showAffix;
  app.querySelector<HTMLElement>('#affix-panel')!.hidden = !showAffix;
  app.querySelector<HTMLElement>('#affix-toolbar')!.hidden = !showAffix;
  app.querySelectorAll<HTMLInputElement>('#affix-panel select, #affix-toolbar select').forEach(select => { select.disabled = !stage; });
  replayButton.disabled = !stage;
  stage?.setBodyView(showAffix ? 'outfit' : bodyView);
  stage?.detail(showAffix || !detail ? null : slot);
  affix.applyOptions();
  syncControls();
}

function syncControls() {
  const selected = outfit[slot];
  const active = selected.style === 'none' ? null : patterns[slot][selected.style];
  for (const id of styleIds) app.querySelector<HTMLElement>(`[data-pattern-text="${id}"]`)!.textContent = patterns[slot][id].name;
  app.querySelector<HTMLElement>('#upgrade-name')!.textContent = active?.upgrade ?? '取下中';
  app.querySelector<HTMLElement>('#attachment-name')!.textContent = active?.attachment ?? '取下中';
  for (const button of buttons) {
    const { command, value } = button.dataset;
    const picked = {
      outfit: ensemble === value, slot: slot === value, pattern: selected.style === value,
      dye: !!active && selected.dye === value, upgrade: selected.upgraded, attachment: selected.attached,
      camera: view === value, pose: pose === value, detail, page: page === value,
    }[command!];
    button.setAttribute('aria-pressed', String(!!picked));
    button.dataset.timberTone = picked ? 'moss' : 'dark';
    button.disabled = !stage || (!active && (command === 'dye' || command === 'upgrade' || command === 'attachment'));
    if (command === 'pose' && value === 'run') button.disabled = !stage?.hasNativeRun;
    if (command === 'detail') button.hidden = page === 'affix';
    if (command === 'pattern' && value === 'none') button.hidden = !optionalSlots.includes(slot);
    if (command === 'detail') button.textContent = detail ? '看全身' : '看局部';
    if (command === 'upgrade') button.firstElementChild!.textContent = selected.upgraded ? '精制做工' : '基础做工';
  }
  bodySelect.disabled = !stage;
  app.dataset.ready = stage ? 'true' : 'false';
}

switchPage();
app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-command]');
  if (!stage || !button || button.disabled) return;
  const { command, value } = button.dataset;
  const choice = outfit[slot];
  switch (command) {
    case 'page':
      page = value!;
      switchPage();
      return;
    case 'outfit':
      ensemble = value as Style;
      outfit = chooseOutfit(ensemble);
      stage.paintOutfit(outfit);
      break;
    case 'slot':
      slot = value as Slot;
      if (detail) stage.detail(slot);
      break;
    case 'pattern':
      outfit[slot] = { ...choice, style: value as Style | 'none', upgraded: false, attached: false };
      ensemble = null;
      stage.paintOutfit(outfit);
      break;
    case 'dye':
      outfit[slot] = { ...choice, dye: value as Dye };
      ensemble = null;
      stage.paintOutfit(outfit);
      break;
    case 'upgrade':
    case 'attachment': {
      const key = command === 'upgrade' ? 'upgraded' : 'attached';
      outfit[slot] = { ...choice, [key]: !choice[key] };
      ensemble = null;
      stage.paintOutfit(outfit);
      break;
    }
    case 'camera':
      view = value as CameraAngle;
      stage.setCamera(view);
      break;
    case 'detail':
      detail = !detail;
      stage.detail(detail ? slot : null);
      break;
    case 'pose':
      pose = value as Pose;
      stage.setPose(pose);
      break;
  }
  syncControls();
});

let drag: { id: number; x: number; y: number } | null = null;
host.addEventListener('pointerdown', event => {
  if (!stage || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
  host.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
host.addEventListener('pointermove', event => {
  if (!stage || drag?.id !== event.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (dx === 0 && dy === 0) return;
  stage.orbit(-dx * .012, dy * .006);
  drag = { ...drag, x: event.clientX, y: event.clientY };
  if (view) { view = ''; syncControls(); }
});
host.addEventListener('lostpointercapture', () => { drag = null; });
host.addEventListener('keydown', event => {
  if (!stage || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
  event.preventDefault();
  stage.orbit(event.key === 'ArrowLeft' ? .18 : -.18, 0);
  view = '';
  syncControls();
});

try {
  stage = await mountStage(host, outfit, beforeFit);
  if (verifying) {
    Object.assign(window, { wardrobePreview: { stats: stage.stats, phase: stage.setPhase, affixTime: stage.seekAffix, measureBody: stage.measureBody } });
  }
  notice.hidden = true;
  switchPage();
} catch (error) {
  console.error(error);
  notice.textContent = '试穿模型加载失败。请确认本地 J01 和样衣 GLB 已就绪，然后刷新。';
}

window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  stage?.dispose();
  unmountTheme();
});
