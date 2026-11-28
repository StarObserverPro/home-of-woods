import {mountTimberTheme} from './mount.ts';
import type {TimberMaterial,TimberRole,TimberTone} from './surface.ts';

type Rule = {selector:string;role:TimberRole;material?:TimberMaterial;tone?:TimberTone;leaf?:true};
/** One bounded migration map. Feature modules must use the shared attributes/components. */
const RULES:readonly Rule[] = [
  {selector:'.target-card,.warehouse-dock,.route-sheet,.help-sheet,.pause-dialog,.forest-reader,.weather-panel,.evening-arrival,.placement-panel,.wood-drop-panel,.clock-menu .hourglass,.item-drag-ghost',role:'panel'},
  {selector:'.target-top,.wood-heading,.panel-heading,.forest-reader-heading',role:'heading'},
  {selector:'.camera-tools,.wood-slot,.wood-stock-item,.housing-recipe,.owned-card,.upgrade-module,.nearby-wood-card,.rarity-vfx-options label',role:'slot'},
  {selector:'.message,.whimsy-notice,.save-warning,.active-work',role:'badge',material:'recess'},
  {selector:'.wood-info,.wood-close,.menu-close,.target-top>button,.panel-heading>button,.forest-reader-heading>button',role:'button',material:'endgrain',tone:'dark'},
  {selector:'.weather-options button,.clock-menu .hourglass button',role:'button',tone:'moss',leaf:true},
  {selector:'.camera-tools button,.wood-pager button,.wood-quantity button,.pause-dialog>.text-button',role:'button',tone:'moss'},
  {selector:'.bottom-toolbar button',role:'button',leaf:true},
  {selector:'button,summary',role:'button'},
];
const GRID_RULES = [
  ['window','.target-card,.warehouse-dock,.route-sheet,.help-sheet,.pause-dialog,.forest-reader,.weather-panel,.evening-arrival,.placement-panel,.wood-drop-panel,.clock-menu .hourglass'],
  ['content','.target-top,.wood-heading,.panel-heading,.forest-reader-heading,.item-browser,.browser-body,.browser-toolbar,.wood-detail,.carrying-panel,.wood-shop,.save-controls,.forest-reader-paper'],
  ['row','.wood-tabs,.browser-slots,.wood-actions,.wood-pager,.wood-quantity,.warehouse-tools,.wood-pile-toolbar,.wood-shop-tools,.wood-checkout,.bottom-toolbar,.camera-tools,.weather-options,.weather-wood,.forest-reader-actions,.save-actions'],
  ['notice','.message,.whimsy-notice,.save-warning,.active-work,.wood-status,.action-message,.weather-work-notice,.weather-work-time,.rarity-vfx-controls [role="status"]'],
  ['hud','.topbar,.hud-dock,.minimap-card,.hud-notices,.run-toggle'],
] as const;

function label(node: HTMLElement, rule: Rule) {
  if (node.dataset.timberSurface || node.closest('.diagnostics,.scene-inspector')) return;
  node.dataset.timberSurface = rule.role;
  if (rule.material) node.dataset.timberMaterial = rule.material;
  if (rule.tone) node.dataset.timberTone = rule.tone;
  if (rule.leaf) node.dataset.timberSelection = 'leaf';
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
