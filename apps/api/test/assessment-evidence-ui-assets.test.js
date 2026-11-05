import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('workspace evidence disajikan dengan CSP dan tanpa HTML injeksi',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(base+'/');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await response.text();
    for(const id of ['workspace-evidence-panel','workspace-evidence-heading',
      'workspace-evidence-upload','workspace-evidence-file','workspace-evidence-upload-button',
      'workspace-evidence-list','workspace-evidence-reload','workspace-evidence-message'])
      assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.match(html,/id="workspace-evidence-panel"[^>]*hidden/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    const asset=await fetch(base+'/assets/assessment-evidence.js');
    assert.equal(asset.status,200);
    assert.match(asset.headers.get('content-security-policy'),/script-src 'self'/);
    assert.match(asset.headers.get('content-type'),/text\/javascript/);
    const script=await asset.text();
    assert.match(script,/fileToBase64/);
    assert.match(script,/getPermissions/);
    assert.match(script,/createElement/);
    assert.match(script,/generation/);
    assert.doesNotMatch(script,/\.innerHTML\s*=/);
    const workspace=await (await fetch(base+'/assets/assessment-workspace.js')).text();
    assert.match(workspace,/createEvidenceUI/);
    assert.match(workspace,/evidence\.open/);
    assert.equal((await fetch(base+'/assets/internal-evidence.js')).status,404);
  }finally{
    server.close();await once(server,'close');
  }
});
