import { readFile } from 'node:fs/promises';

const WEB_ROOT = new URL('../../web/', import.meta.url);
const ASSETS = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/assets/styles.css', { file: 'assets/styles.css', type: 'text/css; charset=utf-8' }],
  ['/assets/app.js', { file: 'assets/app.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/session.js', { file: 'assets/session.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-model.js', { file: 'assets/assessment-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-workspace-model.js', { file: 'assets/assessment-workspace-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-workspace.js', { file: 'assets/assessment-workspace.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-review-model.js', { file: 'assets/assessment-review-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-report-model.js', { file: 'assets/assessment-report-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-report.js', { file: 'assets/assessment-report.js', type: 'text/javascript; charset=utf-8' }],
]);

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export async function serveWebAsset(request, response) {
  const asset = ASSETS.get(request.url);
  if (!asset) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return true;
  }
  try {
    const contents = await readFile(new URL(asset.file, WEB_ROOT));
    response.setHeader('Content-Type', asset.type);
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(503);
    response.end(JSON.stringify({ error: 'Unavailable' }));
  }
  return true;
}
