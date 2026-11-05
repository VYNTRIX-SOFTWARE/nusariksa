import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createServer} from '../src/server.js';

test('halaman penilaian maturitas memakai izin, CSP, dan render DOM aman',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const home=await fetch(base+'/');
    assert.equal(home.status,200);
    assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await home.text();
    for(const id of [
      'maturity-assessments-menu','page-maturity-assessments','ma-assessment-select',
      'ma-create-form','ma-create-model','ma-create-version','ma-create-title',
      'ma-detail','ma-domain-list','ma-criteria','ma-rating-form',
      'ma-rating-level','ma-rating-justification','ma-rating-evidence',
      'ma-history','ma-overall','maturity-policy-form','maturity-policy-method',
    ])assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.match(html,/id="maturity-assessments-menu"[^>]*hidden/);
    assert.match(html,/id="page-maturity-assessments"[^>]*hidden/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    for(const path of [
      '/assets/maturity-assessment-model.js','/assets/maturity-assessment-ui.js',
    ]){
      const asset=await fetch(base+path);
      assert.equal(asset.status,200);
      assert.match(asset.headers.get('content-type'),/text\/javascript/);
      assert.match(asset.headers.get('content-security-policy'),/script-src 'self'/);
    }
    const ui=await(await fetch(base+'/assets/maturity-assessment-ui.js')).text();
    assert.match(ui,/expectedRevision/);
    assert.match(ui,/generation/);
    assert.match(ui,/confirmLeave/);
    assert.match(ui,/createElement/);
    assert.match(ui,/maturity-assessments/);
    assert.match(ui,/onAuthFailure/);
    assert.doesNotMatch(ui,/\.innerHTML\s*=/);
    assert.equal((await fetch(base+'/assets/maturity-engine-internal.js')).status,404);
  }finally{server.close();await once(server,'close');}
});
