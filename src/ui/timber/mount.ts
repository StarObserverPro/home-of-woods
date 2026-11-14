import {timberSurface} from './surface.ts';
import type {TimberMaterial,TimberRole,TimberSurface,TimberTone} from './surface.ts';

const SELECTOR = '[data-timber-surface]';
const cache = new Map<string, TimberSurface>();
const CACHE_LIMIT = 96;
let generated = 0, cacheHits = 0;

/** The cache owns strings only, never DOM nodes or a running animation loop. */
export function timberThemeStats() {
  return {generated,cacheHits,entries:cache.size,svgBytes:[...cache.values()].reduce((n,s)=>n+s.svg.length*2,0)};
}

export type TimberMountOptions = {
  /** A migration adapter can label existing nodes; new modules label their own markup. */
  decorate?: (node: ParentNode) => void;
};

/** Shared by React, native DOM and isolated Shadow DOM. Returns an idempotent disposer. */
export function mountTimberTheme(root: HTMLElement | ShadowRoot, options: TimberMountOptions = {}): () => void {
  const nodes = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  const painted = new WeakMap<HTMLElement,string>();
  let frame = 0, disposed = false;
  const view = root.ownerDocument.defaultView!;
  const inside = (node: Node) => node === root || root.contains(node);
  function paint(node: HTMLElement) {
    if (!inside(node) || !node.isConnected) return;
    // offset size is unaffected by the pressed/hover transform, so states never redraw grain.
    const width = Math.round(node.offsetWidth), height = Math.round(node.offsetHeight);
    if (width < 1 || height < 1) return;
    const role = node.dataset.timberSurface as TimberRole;
    const material = (node.dataset.timberMaterial ?? (role === 'slot' ? 'recess' : 'plank')) as TimberMaterial;
    const tone = (node.dataset.timberTone ?? (role === 'heading' ? 'light' : 'warm')) as TimberTone;
    const seed = node.dataset.timberSeed ?? `how:${role}:${material}`;
    const key = `${width}:${height}:${role}:${material}:${tone}:${seed}`;
    if (painted.get(node) === key) return;
    try {
      let surface = cache.get(key);
      if (surface) { cacheHits++; cache.delete(key); cache.set(key,surface); }
      else {
        surface = timberSurface({width,height,role,material,tone,seed});
        generated++; cache.set(key,surface);
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      }
      node.style.setProperty('--how-surface-image',`url("${surface.dataUri}")`);
      node.dataset.timberShape = surface.shape;
      node.dataset.timberPaint = 'ready';
      painted.set(node,key);
    } catch {
      // A failed ornament never removes the CSS fallback, label, focus or hit target.
      node.style.removeProperty('--how-surface-image');
      node.dataset.timberPaint = 'fallback';
      painted.delete(node);
    }
  }
  function flush() {
    frame = 0;
    if (disposed) return;
    for (const node of pending) paint(node);
    pending.clear();
  }
  function queue(node: HTMLElement) {
    pending.add(node);
    if (!frame) frame = view.requestAnimationFrame(flush);
  }
  const resize = new ResizeObserver(entries => {
    for (const entry of entries) queue(entry.target as HTMLElement);
  });
  function add(node: HTMLElement) {
    if (!nodes.has(node)) { nodes.add(node); resize.observe(node); }
    queue(node);
  }
  function scan(node: ParentNode) {
    options.decorate?.(node);
    if (node instanceof HTMLElement && node.matches(SELECTOR)) add(node);
    node.querySelectorAll<HTMLElement>(SELECTOR).forEach(add);
  }
  const mutations = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof HTMLElement) {
        const node = record.target;
        if (node.matches(SELECTOR)) add(node);
        else { resize.unobserve(node); nodes.delete(node); pending.delete(node); }
      }
      for (const node of record.addedNodes) if (node instanceof HTMLElement) scan(node);
    }
    // Removed components must not retain observers or DOM references after a route change.
    for (const node of nodes) if (!inside(node)) {
      resize.unobserve(node); nodes.delete(node); pending.delete(node);
    }
  });
  scan(root);
  mutations.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:[
    'data-timber-surface','data-timber-material','data-timber-tone','data-timber-seed',
  ]});
  return () => {
    if (disposed) return;
    disposed = true; resize.disconnect(); mutations.disconnect();
    if (frame) view.cancelAnimationFrame(frame);
    nodes.clear(); pending.clear();
  };
}
