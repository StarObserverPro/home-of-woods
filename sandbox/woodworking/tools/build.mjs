import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const inlineCss = {
  name: 'woodwork-css',
  setup(plugin) {
    plugin.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -7)),
      namespace: 'wood-css',
    }))
    plugin.onLoad({ filter: /.*/, namespace: 'wood-css' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }))
  },
}
const notices = 'Three.js — MIT license\n\n'
  + await readFile(resolve(root, '../../node_modules/three/LICENSE'), 'utf8')
  + '\n\nPoly Haven: Handsaw Wood by Konrad Szałankiewicz; Wood Table by Dimitrios Savva. CC0-1.0; modified.\n\n'
  + await readFile(resolve(root, '../../sources/polyhaven/woodworking/CC0-1.0.txt'), 'utf8')
const shared = {
  absWorkingDir: root,
  bundle: true,
  legalComments: 'inline',
  banner: { js: '/*!\n' + notices.replace(/\*\//g, '* /') + '\n*/' },
  target: 'es2022',
  charset: 'utf8',
  plugins: [inlineCss],
  loader: { '.glb': 'binary', '.jpg': 'dataurl' },
}
await build({ ...shared, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/woodworking.js' })
const demo = await build({
  ...shared,
  entryPoints: ['demo/main.ts'],
  format: 'iife',
  minify: true,
  write: false,
})
const template = await readFile(resolve(root, 'demo/page.html'), 'utf8')
const script = demo.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
await writeFile(
  resolve(root, 'dist/woodworking.html'),
  template.replace('<!-- APPLICATION -->', () => '<script>' + script + '</script>'),
)
await writeFile(resolve(root, 'dist/THIRD_PARTY_NOTICES.txt'), notices)
