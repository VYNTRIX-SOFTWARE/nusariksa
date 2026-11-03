import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('menu dan aset katalog mengikuti CSP, izin dan endpoint yang tersedia', async () => {
  const server = createServer();
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    const html = await page.text();
    for (const id of [
      'catalog-menu','page-catalogs','catalog-list','catalog-versions',
      'catalog-active-title','catalog-create-form','catalog-add-form',
      'catalog-publish','catalog-next-version','catalog-controls-body',
    ]) assert.ok(html.includes('id="' + id + '"'), id + ' missing');
    assert.match(html,/id="catalog-menu"[^>]*hidden/);
    assert.match(html,/id="page-catalogs"[^>]*hidden/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);

    for (const path of ['/assets/control-catalog.js','/assets/control-catalog-model.js']) {
      const asset = await fetch(base + path);
      assert.equal(asset.status,200);
      assert.match(asset.headers.get('content-type'),/text\/javascript/);
      assert.match(asset.headers.get('content-security-policy'),/script-src 'self'/);
    }
    const frontend = await(await fetch(base+'/assets/control-catalog.js')).text();
    assert.match(frontend,/assessments:read|canReadCatalogs/);
    assert.match(frontend,/\/catalog-versions\//);
    assert.match(frontend,/\/catalogs/);
    assert.match(frontend,/window\.confirm/);
    assert.match(frontend,/onAuthFailure/);
    assert.match(frontend,/generation/);
    assert.doesNotMatch(frontend,/\.innerHTML\s*=/);
    assert.equal((await fetch(base+'/assets/control-catalog-internal.js')).status,404);
  } finally {
    server.close();await once(server,'close');
  }
});
