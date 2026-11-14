import {mountTimberTheme} from './mount.ts';
import type {TimberMaterial,TimberRole,TimberTone} from './surface.ts';

type Rule = {selector:string;role:TimberRole;material?:TimberMaterial;tone?:TimberTone};
/** One bounded migration map. Feature modules must use the shared attributes/components. */
const RULES:readonly Rule[] = [
  {selector:'.target-card,.warehouse-dock,.route-sheet,.help-sheet,.pause-dialog,.forest-reader,.weather-panel,.evening-arrival,.placement-panel,.wood-drop-panel,.clock-menu .hourglass,.item-drag-ghost',role:'panel'},
  {selector:'.target-top,.wood-heading,.panel-heading,.forest-reader-heading',role:'heading'},
  {selector:'.camera-tools,.wood-slot,.wood-detail,.wood-stock-item,.housing-recipe,.owned-card,.upgrade-module,.nearby-wood-card,.rarity-vfx-options label',role:'slot'},
  {selector:'.message,.whimsy-notice,.save-warning,.active-work',role:'badge',material:'shaving',tone:'dark'},
  {selector:'.wood-info,.wood-close,.menu-close,.target-top>button,.panel-heading>button,.forest-reader-heading>button',role:'button',material:'endgrain'},
  {selector:'button,summary',role:'button'},
];
const GRID_RULES = [
  ['window','.target-card,.warehouse-dock,.route-sheet,.help-sheet,.pause-dialog,.forest-reader,.weather-panel,.evening-arrival,.placement-panel,.wood-drop-panel,.clock-menu .hourglass'],
  ['content','.target-top,.wood-heading,.panel-heading,.forest-reader-heading,.browser-body,.browser-toolbar,.warehouse-tools,.wood-detail,.forest-reader-paper'],
  ['row','.wood-tabs,.browser-slots,.wood-actions,.wood-pager,.wood-quantity,.bottom-toolbar,.camera-tools,.weather-options,.forest-reader-actions,.save-actions'],
  ['notice','.message,.whimsy-notice,.save-warning,.active-work,.wood-status,.action-message,.weather-work-notice,.rarity-vfx-controls [role="status"]'],
  ['hud','.topbar,.hud-dock,.minimap-card,.hud-notices,.run-toggle'],
] as const;

function label(node: HTMLElement, rule: Rule) {
  if (node.dataset.timberSurface || node.closest('.diagnostics,.scene-inspector')) return;
  node.dataset.timberSurface = rule.role;
  if (rule.material) node.dataset.timberMaterial = rule.material;
  if (rule.tone) node.dataset.timberTone = rule.tone;
  // Class/semantic ID is stable across quantity and eligibility updates.
  node.dataset.timberSeed ??= node.id || node.className || node.getAttribute('aria-label') || `how:${rule.role}`;
}
export function decorateGameTimber(root: ParentNode) {
  for (const [kind,selector] of GRID_RULES) {
    if (root instanceof HTMLElement && root.matches(selector)) root.dataset.uiGrid ??= kind;
    root.querySelectorAll<HTMLElement>(selector).forEach(node=>{node.dataset.uiGrid ??= kind;});
  }
  for (const rule of RULES) {
    if (root instanceof HTMLElement && root.matches(rule.selector)) label(root,rule);
    root.querySelectorAll<HTMLElement>(rule.selector).forEach(node=>label(node,rule));
  }
}
export function mountGameTimber(root: HTMLElement) {
  return mountTimberTheme(root,{decorate:decorateGameTimber});
}
