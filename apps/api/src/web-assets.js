import { readFile } from 'node:fs/promises';

const WEB_ROOT = new URL('../../web/', import.meta.url);
const ASSETS = new Map([
  ['/', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['/assets/styles.css', { file: 'assets/styles.css', type: 'text/css; charset=utf-8' }],
  ['/assets/app.js', { file: 'assets/app.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/admin-onboarding-ui.js', { file: 'assets/admin-onboarding-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/ti-assets-ui.js', { file: 'assets/ti-assets-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/ti-risks-ui.js', { file: 'assets/ti-risks-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/ti-incidents-ui.js', { file: 'assets/ti-incidents-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/ti-findings-ui.js', { file: 'assets/ti-findings-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/session.js', { file: 'assets/session.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-model.js', { file: 'assets/assessment-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-workspace-model.js', { file: 'assets/assessment-workspace-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-workspace.js', { file: 'assets/assessment-workspace.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/control-guidance.js', { file: 'assets/control-guidance.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-review-model.js', { file: 'assets/assessment-review-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-report-model.js', { file: 'assets/assessment-report-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-report.js', { file: 'assets/assessment-report.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/assessment-evidence.js', { file: 'assets/assessment-evidence.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/maturity-model.js', { file: 'assets/maturity-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/maturity-ui.js', { file: 'assets/maturity-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/maturity-assessment-model.js', { file: 'assets/maturity-assessment-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/maturity-assessment-ui.js', { file: 'assets/maturity-assessment-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/padk-preparation-ui.js', { file: 'assets/padk-preparation-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/padk-score-preview-ui.js', { file: 'assets/padk-score-preview-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/padk-indicator-note-ui.js', { file: 'assets/padk-indicator-note-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/padk-criteria-panel.js', { file: 'assets/padk-criteria-panel.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/padk-evidence-ui.js', { file: 'assets/padk-evidence-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/padk-crosswalk-review-ui.js', { file: 'assets/padk-crosswalk-review-ui.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/control-catalog-model.js', { file: 'assets/control-catalog-model.js', type: 'text/javascript; charset=utf-8' }],
  ['/assets/control-catalog.js', { file: 'assets/control-catalog.js', type: 'text/javascript; charset=utf-8' }],
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
