import fs from 'node:fs/promises';
import path from 'node:path';

const registry = JSON.parse(await fs.readFile('tools/ui-contract.json','utf8'));
const errors = [];
function withoutForcedColors(css) {
  // Mask strings/comments only while locating braces; never exempt the rest of a file.
  const structure = css.replace(/\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, value=>' '.repeat(value.length));
  const active = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/gi;
  const parts = [];
  let cursor = 0;
  for (let match; (match = active.exec(structure));) {
    let depth = 1;
    let end = active.lastIndex;
    while (end < structure.length && depth) {
      if (structure[end] === '{') depth++;
      else if (structure[end] === '}') depth--;
      end++;
    }
    if (depth) continue;
    parts.push(css.slice(cursor,match.index),' '.repeat(end-match.index));
    cursor = end;
    active.lastIndex = end;
  }
  parts.push(css.slice(cursor));
  return parts.join('');
}
function checkCss(name,css) {
  if (!/@layer how-(layout|timber)/.test(css)) errors.push(`${name}: place styles in the shared layer order`);
  if (/border-image\s*:[^;{}]*url\(/.test(css) || /url\([^)]*ui-r2\//.test(css)) errors.push(`${name}: stretched legacy timber image`);
  // Drawing strokes and grid lines are semantic SVG/technical diagrams, not container chrome.
  const regular = withoutForcedColors(css);
  const thin = [...regular.matchAll(/border(?:-(?:top|right|bottom|left))?\s*:\s*([\d.]+)px\s+(solid|dashed|dotted)/g)].some(m=>Number(m[1])>0 && Number(m[1])<3);
  if (thin) errors.push(`${name}: thin decorative border; use spacing, depth or a shared surface`);
}
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
    checkCss(name,css);
  }
}
for (const name of registry.inlineStyleSources ?? []) {
  const source = await fs.readFile(name,'utf8');
  const importedCss = new Set([...source.matchAll(/import\s+([\w$]+)\s+from\s+['"][^'"]+\.css\?inline['"]/g)].map(match=>match[1]));
  const blocks = [...source.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi)];
  if (!blocks.length) errors.push(`${name}: registered inline styles are missing`);
  for (const [index,block] of blocks.entries()) {
    // An imported CSS binding is already checked in its source file; inspect every literal block here.
    const imported = block[1].match(/^\s*\$\{\s*([\w$]+)\s*\}\s*$/);
    if (imported && importedCss.has(imported[1])) continue;
    checkCss(`${name}:inline-style-${index+1}`,block[1]);
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
