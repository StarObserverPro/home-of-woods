import { AFFIX_EMISSION_PATTERNS, AFFIX_PARTICLE_SHAPES, AFFIX_TRIGGER_LIBRARY, LOW_TIER_AFFIX_CANDIDATES,
  type AffixEmissionPatternId, type AffixParticleShapeId, type AffixTriggerId } from '../../src/content/affix-vfx-library.ts';
import { AFFIX_COLOR_DUOS, AFFIX_COLOR_FAMILIES, AFFIX_SWATCH_BY_ID, AFFIX_SWATCHES } from '../../src/content/affix-vfx-palette.ts';
import type { AffixSpeed } from './affix-events.ts';
import type { AffixLight, AffixQuality, AffixRecipe, AffixView, TintTarget } from './affix-presentation.ts';
import type { AffixPhase } from './stage.ts';

const familyNames = ['麦浪与灯火', '炉火与晚霞', '莓花与春信', '暮紫与梦影', '晴空与溪蓝', '青岚与浅潮', '松荫与苔绿', '霜露与月白'];
const triggers = new Map(AFFIX_TRIGGER_LIBRARY.map(trigger => [trigger.id, trigger]));
const candidates = new Map(LOW_TIER_AFFIX_CANDIDATES.map(affix => [affix.id, affix]));
const duos = new Map<string, readonly string[]>(AFFIX_COLOR_DUOS.map(duo => [duo.id, duo.colors]));
const options = (entries: readonly { id: string; name: string }[]) => entries.map(({ id, name }) => `<option value="${id}">${name}</option>`).join('');
const entries = (record: Record<string, string>) => Object.entries(record).map(([id, name]) => ({ id, name }));
const field = (id: string, label: string, values: string, wrap = '') =>
  `<label class="affix-field" ${wrap ? `id="${wrap}"` : ''}><span>${label}</span><select id="${id}">${values}</select></label>`;

const swatchOptions = AFFIX_COLOR_FAMILIES.map((family, i) =>
  `<optgroup label="${familyNames[i]}">${options(AFFIX_SWATCHES.filter(swatch => swatch.family === family))}</optgroup>`).join('');
const duoOptions = `<optgroup label="双色组合" id="affix-duos">${options(AFFIX_COLOR_DUOS)}</optgroup>`;
export const affixToolbar = `
  <div class="affix-replay-row" data-ui-grid="row" id="affix-toolbar" hidden>
    ${field('affix-view', '视距', options(entries({ fitting: '试穿近看', near: '拉近游玩', game: '默认游玩' })))}
    <button type="button" id="affix-play" data-timber-surface="button" data-timber-seed="affix-replay" data-timber-tone="moss">重放触发</button>
  </div>`;

export const affixPanel = `
  <div class="controls-inner affix-panel" id="affix-panel" data-ui-grid="content" hidden>
    <div class="wardrobe-trims" data-ui-grid="row" role="group" aria-label="词条选择方式">
      <button type="button" data-affix-edit="preset" aria-pressed="true" data-timber-surface="button" data-timber-tone="moss">词条样例</button>
      <button type="button" data-affix-edit="lab" aria-pressed="false" data-timber-surface="button" data-timber-tone="dark">素材检视</button>
    </div>
    <div data-ui-grid="row" id="affix-preset">
      ${field('affix-candidate', '词条', options(LOW_TIER_AFFIX_CANDIDATES))}
      <p id="affix-imagery" class="affix-copy"></p>
    </div>
    <div id="affix-lab" hidden>
      <div class="affix-field-row" data-ui-grid="row">
        ${field('affix-kind', '呈现方式', options(entries({ particles: '粒子', tint: '衣物变色' })))}
        ${field('affix-palette', '色彩', swatchOptions + duoOptions)}
      </div>
      <div class="affix-field-row" data-ui-grid="row">
        ${field('affix-glyph', '粒形', options(AFFIX_PARTICLE_SHAPES), 'affix-glyph-field')}
        ${field('affix-layout', '排布', options(AFFIX_EMISSION_PATTERNS), 'affix-layout-field')}
        ${field('affix-target', '衣物部位', options(entries({ 'upper-body': '上衣', 'lower-body': '裤装', headwear: '帽子', footwear: '鞋靴' })), 'affix-target-field')}
        ${field('affix-trigger', '触发条件', options(AFFIX_TRIGGER_LIBRARY))}
      </div>
    </div>
    <div class="affix-color-row" data-ui-grid="row" id="affix-colors" aria-label="词条色样"></div>
    <div class="affix-field-row" data-ui-grid="row">
      ${field('affix-light', '照明', options(entries({ condition: '随触发场景', day: '日光', night: '月光' })))}
      ${field('affix-quality', '动效', options(entries({ full: '完整', quiet: '精简', off: '关闭' })))}
      ${field('affix-clock', '时钟倍率', options(entries({ 1: '1×', 12: '12×' })), 'affix-clock-field')}
    </div>
    <p id="affix-status" class="affix-copy" role="status" data-ui-grid="notice"></p>
  </div>`;

export function mountAffixPanel(app: HTMLElement, onOptions: (view: AffixView, light: AffixLight, quality: AffixQuality) => void, onSelectionChange: () => void) {
  const get = <T extends HTMLElement>(id: string) => app.querySelector<T>(`#${id}`)!;
  const read = <T extends string>(id: string) => get<HTMLSelectElement>(id).value as T;
  const switched = ['affix-candidate', 'affix-kind', 'affix-palette', 'affix-glyph', 'affix-layout', 'affix-target', 'affix-trigger'];
  let editing = false;
  get<HTMLSelectElement>('affix-palette').value = 'tone-220';
  get<HTMLSelectElement>('affix-layout').value = 'body-orbit';
  get<HTMLSelectElement>('affix-glyph').value = 'four-star';
  function selection() {
    const candidate = candidates.get(read('affix-candidate'))!;
    const kind = read<'tint' | 'particles'>('affix-kind');
    const palette = read('affix-palette');
    const colors = (editing ? duos.get(palette) ?? [palette] : candidate.colorIds).map(id => AFFIX_SWATCH_BY_ID.get(id)!);
    const visual: AffixRecipe['visual'] = !editing ? candidate.visual : kind === 'tint'
      ? { kind, target: read<TintTarget>('affix-target') }
      : { kind, shapeId: read<AffixParticleShapeId>('affix-glyph'), patternId: read<AffixEmissionPatternId>('affix-layout') };
    const trigger = editing ? read<AffixTriggerId>('affix-trigger') : candidate.triggerId;
    const name = !editing ? candidate.name : visual.kind === 'tint' ? '衣物变色' : AFFIX_PARTICLE_SHAPES.find(shape => shape.id === visual.shapeId)!.name;
    const recipe: AffixRecipe = { name, visual, colors: colors.map(swatch => swatch.hex), trigger };
    return { candidate, colors, recipe, speed: Number(read('affix-clock')) as AffixSpeed };
  }
  function status(phase?: AffixPhase) {
    const trigger = triggers.get(selection().recipe.trigger)!;
    const messages = {
      waiting: `等候${trigger.name}…`, fired: `已触发${trigger.name}`, finished: `${trigger.name}回放结束`,
    };
    get('affix-status').textContent = phase ? messages[phase] : `触发条件 · ${trigger.name}`;
  }
  function refresh() {
    const tint = read('affix-kind') === 'tint';
    const palette = get<HTMLSelectElement>('affix-palette');
    if (tint && duos.has(palette.value)) palette.value = duos.get(palette.value)![0];
    get<HTMLOptGroupElement>('affix-duos').disabled = tint;
    get('affix-preset').hidden = editing;
    get('affix-lab').hidden = !editing;
    get('affix-glyph-field').hidden = tint;
    get('affix-layout-field').hidden = tint;
    get('affix-target-field').hidden = !tint;
    const { candidate, colors, recipe } = selection();
    get('affix-clock-field').hidden = triggers.get(recipe.trigger)!.family !== 'time';
    get('affix-imagery').textContent = candidate.imagery;
    const chips = colors.map(swatch => {
      const chip = document.createElement('span');
      chip.className = 'affix-chip';
      const mark = document.createElement('i');
      mark.setAttribute('aria-hidden', 'true');
      mark.style.backgroundColor = swatch.hex;
      chip.append(mark, swatch.name);
      return chip;
    });
    get('affix-colors').replaceChildren(...chips);
    status();
  }
  const edit = [...app.querySelectorAll<HTMLButtonElement>('[data-affix-edit]')];
  for (const button of edit) button.addEventListener('click', () => {
    editing = button.dataset.affixEdit === 'lab';
    for (const other of edit) {
      other.setAttribute('aria-pressed', String(other === button));
      other.dataset.timberTone = other === button ? 'moss' : 'dark';
    }
    onSelectionChange();
    refresh();
  });
  for (const id of switched) get(id).addEventListener('change', () => { onSelectionChange(); refresh(); });
  const applyOptions = () => onOptions(read<AffixView>('affix-view'), read<AffixLight>('affix-light'), read<AffixQuality>('affix-quality'));
  for (const id of ['affix-view', 'affix-light', 'affix-quality']) get(id).addEventListener('change', applyOptions);
  refresh();
  return { selection, status, applyOptions };
}
