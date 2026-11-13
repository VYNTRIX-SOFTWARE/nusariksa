import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('aset laporan disajikan lewat allowlist dan CSP existing', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const htmlRes = await fetch(base + '/');
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-security-policy'), /script-src 'self'/);
    const html = await htmlRes.text();
    for (const id of [
      'report-menu', 'report-menu-group', 'page-reports', 'report-select',
      'report-select-area', 'report-manual-form', 'report-manual-id',
      'report-content', 'report-controls-body', 'report-distribution',
      'report-decision', 'report-progress-bar', 'report-message',
      'report-download-pdf', 'report-download-csv',
    ]) assert.ok(html.includes('id="' + id + '"'), id + ' missing');
    for (const path of ['/assets/assessment-report.js','/assets/assessment-report-model.js']) {
      const result = await fetch(base + path);
      assert.equal(result.status, 200);
      assert.match(result.headers.get('content-type'), /text\/javascript/);
      assert.match(result.headers.get('content-security-policy'), /script-src 'self'/);
    }
    const source = await (await fetch(base + '/assets/assessment-report.js')).text();
    assert.match(source, /textContent/);
    assert.doesNotMatch(source, /\.innerHTML\s*=/);
    assert.match(source, /generation/);
    assert.match(source, /report-download-pdf/);
    assert.match(source, /report-download-csv/);
    assert.match(source, /encodeURIComponent\(report\.assessment\.id\)/);
    assert.match(source, /canReadReport/);
    assert.match(source, /\$\('report-manual-form'\)\.hidden/);
    assert.doesNotMatch(source, /report-manual-area/);
    assert.equal((await fetch(base + '/assets/assessment-report-private.js')).status,404);
  } finally {
    server.close();
    await once(server,'close');
  }
});
