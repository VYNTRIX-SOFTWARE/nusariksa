import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('antarmuka web dan aset dimuat dari origin API dengan header keamanan', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const html = await fetch(base + '/');
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.equal(html.headers.get('cache-control'), 'no-store');
    assert.equal(html.headers.get('x-frame-options'), 'DENY');
    assert.equal(html.headers.get('cross-origin-resource-policy'), 'same-origin');
    const csp = html.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    const source = await html.text();
    assert.match(source, /<html lang="id">/);
    assert.match(source, /id="login-form"/);
    assert.match(source, /id="app-screen"/);
    assert.match(source,/id="assessment-quick-start"/);
    assert.match(source,/id="assessment-quick-start-hint"/);
    assert.match(source,/Buat &amp; mulai asesmen TI/);
    assert.match(source,/id="assessment-create-form"/);
    const page=source.indexOf('id="page-workspace"');
    assert.ok(page>=0);
    assert.ok(source.indexOf('id="workspace-control-position"',page)<
      source.indexOf('id="workspace-review-panel"',page),
      'assessment input must precede internal reviewer panel');
    for(const id of ['workspace-prev','workspace-next','workspace-next-pending',
      'workspace-save-next','workspace-remaining-hint','workspace-save-indicator']){
      assert.match(source,new RegExp('id="'+id+'"'));
    }
    assert.match(source, /src="\/assets\/app\.js"/);
    assert.doesNotMatch(source, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    assert.doesNotMatch(source, /on(?:click|submit|load)\s*=/i);
    assert.equal((await fetch(base + '/index.html')).status, 200);

    const css = await fetch(base + '/assets/styles.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.match(await css.text(), /@media \(max-width: 760px\)/);
    const app = await fetch(base + '/assets/app.js');
    assert.equal(app.status, 200);
    assert.match(app.headers.get('content-type'), /text\/javascript/);
    assert.match(await app.text(), /restoreSession/);
    for(const id of ['workspace-guidance','workspace-guide-question','workspace-guide-evidence',
      'workspace-note-helper','workspace-observed-condition','workspace-observed-evidence',
      'workspace-observed-followup','workspace-compose-note','workspace-guide-regulation']){
      assert.match(source,new RegExp('id="'+id+'"'));
    }
    const guide=await fetch(base+'/assets/control-guidance.js');
    assert.equal(guide.status,200);
    assert.match(guide.headers.get('content-type'),/javascript/);
    assert.match(await guide.text(),/GUIDANCE_CODES/);
    assert.doesNotMatch(source,/TEMPLATE SIAP PAKAI · PERSIAPAN REGULASI/);
    const session = await fetch(base + '/assets/session.js');
    assert.equal(session.status, 200);
    assert.match(await session.text(), /credentials: 'same-origin'/);

    const head = await fetch(base + '/assets/app.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.text()).length, 0);

    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/assets/secret.js')).status, 404);
    assert.equal((await fetch(base + '/assets/../../package.json')).status, 404);
    assert.equal((await fetch(base + '/unknown')).status, 404);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('HTML tidak mengubah respons JSON untuk API yang sudah tersedia', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.match(health.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const auth = await fetch(base + '/auth/session');
    assert.equal(auth.status, 503);
    assert.match(auth.headers.get('content-type'), /application\/json/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
