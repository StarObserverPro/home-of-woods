import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {createExportFileMiddleware, EXPORTED_ASSET_ROUTE} from './export-files.mjs';
import {encodeRgbaPng, decodeRgbaPng} from './rgba-png.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(root, process.argv[2] ?? 'public/assets/forest-impostors');
const evidence = path.resolve(process.env.IMPOSTOR_EVIDENCE_DIR ?? process.env.EVIDENCE_DIR ?? path.join(os.tmpdir(), 'how-impostor-review'));
assert.ok(!evidence.startsWith(root + path.sep), 'Inspection images belong outside the source tree');
const frameSize = Number(process.env.IMPOSTOR_FRAME_SIZE ?? 128);
assert.ok(frameSize === 128 || frameSize === 256, 'Only 128 or 256 pixel frames are supported');
const server = await createServer({configFile: false, root, logLevel: 'error',
  plugins: [{name: 'impostor-export-files', configureServer(vite) {
    // Public-directory discovery is asynchronous. Newly baked files must not
    // depend on a watcher event or fall through to the application's HTML.
    vite.middlewares.use(createExportFileMiddleware(out));
  }}],
  server: {host: '127.0.0.1', port: 5194, strictPort: true}});
let browser, page;
const errors = [], diagnostics = {};
try {
  await server.listen();
  const executablePath = process.env.CHROMIUM_EXECUTABLE ?? (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({headless: true, executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  page = await browser.newPage({viewport: {width: 960, height: 600}, deviceScaleFactor: 1});
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  page.on('response', response => {if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);});
  await page.goto('http://127.0.0.1:5194/tools/impostors/entry.html');
  await page.waitForFunction(() => window.__IMPOSTOR_TOOL__, undefined, {timeout: 30000});
  const result = await page.evaluate(size => window.__IMPOSTOR_TOOL__.bake(size), frameSize);
  diagnostics.checks = result.checks;
  assert.ok(result.checks.deterministic, 'Repeated bakes have identical pixels');
  assert.ok(result.checks.restored, 'Baker restores renderer state');
  assert.ok(result.checks.bakerMemoryRestored, 'Baker returns to the warmed renderer resource baseline');
  assert.ok(result.checks.coverage.every(frame => frame.opaque > 100 && frame.borderAlpha === 0), 'Every view has a silhouette with a clear gutter');
  assert.ok(result.checks.dilatedTexels.albedo > 0 && result.checks.dilatedTexels.normal > 0, 'Both raw atlases have transparent RGB padding');
  assert.deepEqual(result.checks.errors, []);
  const digest = data => createHash('sha256').update(data).digest('hex');
  const rgba = {albedo: Buffer.from(result.albedo, 'base64'), normal: Buffer.from(result.normal, 'base64')};
  const albedo = encodeRgbaPng(rgba.albedo, result.manifest.width, result.manifest.height);
  const normal = encodeRgbaPng(rgba.normal, result.manifest.width, result.manifest.height);
  assert.deepEqual(decodeRgbaPng(albedo).rgba, rgba.albedo, 'Albedo PNG preserves every dilated RGBA byte');
  assert.deepEqual(decodeRgbaPng(normal).rgba, rgba.normal, 'Normal PNG preserves every dilated RGBA byte');
  const sources = ['src/content/rainier-ecology.ts', 'src/scene/outer-forest.js', 'src/scene/impostors/atlas-layout.ts',
    'src/scene/impostors/bake.ts', 'tools/impostors/source.ts', 'tools/impostors/browser.ts', 'tools/impostors/rgba-png.mjs',
    'tools/impostors/export.mjs', 'tools/impostors/export-files.mjs'];
  const sourceHashes = {};
  for (const file of sources) sourceHashes[file] = digest(await fs.readFile(path.join(root, file)));
  const manifest = {...result.manifest, build: {three: JSON.parse(await fs.readFile(path.join(root, 'node_modules/three/package.json'), 'utf8')).version,
    tool: 'tools/impostors/export.mjs', sourceSha256: sourceHashes,
    files: {[result.manifest.albedo]: digest(albedo), [result.manifest.normal]: digest(normal)}}};
  await fs.mkdir(out, {recursive: true}); await fs.mkdir(evidence, {recursive: true});
  await fs.writeFile(path.join(out, manifest.albedo), albedo);
  await fs.writeFile(path.join(out, manifest.normal), normal);
  const manifestName = `${manifest.id}.json`;
  await fs.writeFile(path.join(out, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  const manifestUrl = `http://127.0.0.1:5194${EXPORTED_ASSET_ROUTE}${manifestName}`;
  const response = await fetch(manifestUrl);
  assert.equal(response.status, 200, `Exported manifest HTTP status: ${manifestUrl}`);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/, 'Export route must return JSON, never SPA HTML');
  assert.deepEqual(await response.json(), manifest, 'Export route serves the just-written manifest');
  const verification = await page.evaluate(url => window.__IMPOSTOR_TOOL__.review(url), manifestUrl);
  diagnostics.verification = verification;
  await page.screenshot({path: path.join(evidence, 'source-and-impostor-albedo.png')});
  const disposed = await page.evaluate(() => window.__IMPOSTOR_TOOL__.disposeReview());
  diagnostics.disposed = disposed;
  assert.deepEqual(verification.errors, []); assert.deepEqual(disposed.errors, []); assert.deepEqual(errors, []);
  assert.ok(verification.texturePadding.albedo > 0 && verification.texturePadding.normal > 0, 'Actual GPU textures retain transparent RGB padding');
  assert.equal(verification.batch.triangles, 2); assert.equal(verification.batch.textureBytes, manifest.width * manifest.height * 8);
  assert.equal(disposed.textures, disposed.rendererBaseline.textures, 'Atlas textures return to the warmed renderer baseline');
  assert.equal(disposed.geometries, disposed.rendererBaseline.geometries, 'Runtime geometry returns to the warmed renderer baseline');
  const report = {result: 'passed', frameSize, checks: {...result.checks, pngRgbaRoundtrip: true}, verification, disposed,
    note: 'Unlit data and shader validation in Chromium/SwiftShader; gameplay composition and physical-device GPU performance require main-scene review.'};
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({out, evidence, manifest: manifestName, atlasSize: [manifest.width, manifest.height],
    files: {albedoBytes: albedo.length, normalBytes: normal.length}, sourceTriangles: manifest.sourceTriangles,
    textureMiB: verification.batch.textureBytes / 1048576, views: 25, result: report.result}, null, 2));
} catch (error) {
  await fs.mkdir(evidence, {recursive: true});
  await fs.writeFile(path.join(evidence, 'failure.json'), JSON.stringify({result: 'failed', error: String(error.stack ?? error), errors, diagnostics}, null, 2) + '\n');
  if (page && !page.isClosed()) await page.screenshot({path: path.join(evidence, 'failure.png'), timeout: 10000}).catch(() => {});
  throw error;
} finally {await browser?.close(); await server.close();}
