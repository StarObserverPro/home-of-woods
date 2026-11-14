import fs from 'node:fs/promises';
import path from 'node:path';

const registry = JSON.parse(await fs.readFile('tools/ui-contract.json','utf8'));
const errors = [];
async function files(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    if (['node_modules','dist','vendor','evidence','.cache'].includes(entry.name)) continue;
    const name = path.join(dir,entry.name);
    if (entry.isDirectory()) result.push(...await files(name)); else result.push(name);
  }
  return result;
}
for (const module of registry.active) {
  const entry = await fs.readFile(module.entry,'utf8').catch(()=>null);
  if (!entry?.includes(module.themeOwner)) errors.push(`${module.entry}: missing shared theme owner ${module.themeOwner}`);
  for (const name of (await files(module.root)).filter(name=>name.endsWith('.css'))) {
    const css = await fs.readFile(name,'utf8');
    if (!/@layer how-(layout|timber)/.test(css)) errors.push(`${name}: place styles in the shared layer order`);
    if (/border-image\s*:[^;{}]*url\(/.test(css) || /url\([^)]*ui-r2\//.test(css)) errors.push(`${name}: stretched legacy timber image`);
    // Drawing strokes and grid lines are semantic SVG/technical diagrams, not container chrome.
    const regular = css.replace(/@media\s*\(forced-colors:[\s\S]*$/,'');
    const thin = [...regular.matchAll(/border(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)px\s+(solid|dashed|dotted)/g)].some(m=>Number(m[1])>0 && Number(m[1])<3);
    if (thin) errors.push(`${name}: thin decorative border; use spacing, depth or a shared surface`);
  }
}
for (const directory of await fs.readdir('sandbox',{withFileTypes:true})) {
  if (!directory.isDirectory()) continue;
  if (!registry.archivedSandboxes.includes(directory.name) && !registry.active.some(module=>module.root===`sandbox/${directory.name}`)) errors.push(`sandbox/${directory.name}: register a shared-theme active entry or an explicit archive`);
}
const generator = await fs.readFile('src/ui/timber/surface.ts','utf8');
if (/Math\.random\s*\(|Date\.now\s*\(/.test(generator)) errors.push('surface.ts: ornament must have deterministic inputs');
if (errors.length) {console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`UI contract: ${registry.active.length} active entries share timber; archived tools remain explicit.`);
