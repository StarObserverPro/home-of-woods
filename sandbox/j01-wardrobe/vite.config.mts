import { defineConfig, type Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const project = fileURLToPath(new URL('../../', import.meta.url));

function localWardrobeAssets(): Plugin {
  const files = new Map([
    ['/reference.glb', new URL('../../.cache/j01-player/j01.glb', import.meta.url)],
    ['/wearables.glb', new URL('./.cache/wearables.glb', import.meta.url)],
    ['/wearables-before.glb', new URL('./.cache/affix-fitting/original-wearables.glb', import.meta.url)],
  ]);
  const gaitCandidate = new URL('../../.cache/j01-gait-review/j01-gait-candidate.glb', import.meta.url);
  return {
    name: 'local-j01-wardrobe-assets',
    configureServer(server) {
      server.middlewares.use('/j01-assets', async (req, res) => {
        const path = req.url?.split('?')[0] ?? '';
        const actor = path === '/actor.glb';
        const source = files.get(actor ? '/reference.glb' : path);
        if (!source || req.method !== 'GET' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
          res.writeHead(404).end();
          return;
        }
        try {
          let asset: Buffer;
          if (actor) {
            try { asset = await readFile(gaitCandidate); }
            catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
              asset = await readFile(source);
            }
          } else asset = await readFile(source);
          res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-store' }).end(asset);
        } catch (error) {
          res.writeHead((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500).end();
        }
      });
    },
  };
}

export default defineConfig({
  root,
  plugins: [localWardrobeAssets()],
  server: { host: '127.0.0.1', port: 5296, strictPort: true, fs: { allow: [project] } },
  build: { outDir: '.cache/dist', target: 'es2022' },
});
