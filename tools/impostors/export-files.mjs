import fs from 'node:fs/promises';
import path from 'node:path';

export const EXPORTED_ASSET_ROUTE = '/__impostor_export/';

/** Serve only this bake's three files, including files written after Vite starts. */
export function createExportFileMiddleware(directory, id = 'rainier-conifer-cluster') {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error('Invalid impostor export id');
  const files = new Map([
    [`${id}.json`, 'application/json; charset=utf-8'],
    [`${id}-albedo.png`, 'image/png'],
    [`${id}-normal.png`, 'image/png'],
  ]);
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] ?? '';
    if (!pathname.startsWith(EXPORTED_ASSET_ROUTE)) return next();
    const name = pathname.slice(EXPORTED_ASSET_ROUTE.length), type = files.get(name);
    const fail = (status, message) => {
      response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'});
      response.end(message);
    };
    if (!type) return fail(404, 'Unknown impostor export file');
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Read-only impostor export');
    try {
      const bytes = await fs.readFile(path.join(directory, name));
      response.writeHead(200, {'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store'});
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      fail(error.code === 'ENOENT' ? 404 : 500, 'Impostor export file unavailable');
    }
  };
}
