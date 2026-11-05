import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createServer} from '../src/server.js';

test('model maturitas punya menu tersembunyi, UI dan allowlist CSP',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base+'/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await page.text();
    for(const id of [
      'maturity-menu','page-maturity','maturity-model-select','maturity-version-select',
      'maturity-model-reference','maturity-domain-list','maturity-criteria-list',
      'maturity-create-form','maturity-domain-form','maturity-publish',
      'maturity-next-version','maturity-message',
    ])assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.match(html,/id="maturity-menu"[^>]*hidden/);
    assert.match(html,/id="page-maturity"[^>]*hidden/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    for(const path of ['/assets/maturity-model.js','/assets/maturity-ui.js']){
      const asset=await fetch(base+path);
      assert.equal(asset.status,200);
      assert.match(asset.headers.get('content-type'),/text\/javascript/);
      assert.match(asset.headers.get('content-security-policy'),/script-src 'self'/);
    }
    const js=await(await fetch(base+'/assets/maturity-ui.js')).text();
    assert.match(js,/generation/);
    assert.match(js,/mayReadMaturity/);
    assert.match(js,/methodologyReference/);
    assert.match(js,/createElement/);
    assert.doesNotMatch(js,/\.innerHTML\s*=/);
    assert.equal((await fetch(base+'/assets/maturity-private.js')).status,404);
  }finally{server.close();await once(server,'close');}
});
