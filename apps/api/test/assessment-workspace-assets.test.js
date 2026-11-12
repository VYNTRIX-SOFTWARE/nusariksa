import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('assessment workspace disajikan dalam shell dan modul same-origin yang aman',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(base+'/');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await response.text();
    for(const id of ['assessment-create','assessment-create-dialog','assessment-create-form',
      'page-workspace','workspace-catalog','workspace-attach','workspace-start',
      'workspace-result-form','workspace-rating','workspace-note',
      'workspace-note-feedback','workspace-save',
      'workspace-history','workspace-reload','workspace-back']){
      assert.ok(html.includes('id="'+id+'"'),id+' is missing');
    }
    assert.match(html,/class="workspace-list-inner"/);
    assert.match(html,/aria-describedby="workspace-note-feedback"/);
    assert.match(html,/aria-invalid="false"/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    for(const asset of ['/assets/assessment-workspace.js',
      '/assets/assessment-workspace-model.js']){
      const res=await fetch(base+asset);
      assert.equal(res.status,200);
      assert.match(res.headers.get('content-type'),/text\/javascript/);
      assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);
      assert.match(res.headers.get('cache-control'),/no-store/);
    }
    const js=await (await fetch(base+'/assets/assessment-workspace.js')).text();
    assert.match(js,/expectedRevision:control\.revision/);
    assert.match(js,/method:'PUT'/);
    assert.match(js,/getPermissions\(\)/);
    assert.match(js,/state\.conflict=true/);
    assert.match(js,/response\.versions/);
    assert.match(js,/onCreated/);
    assert.equal((await fetch(base+'/assets/assessment-workspace-hidden.js')).status,404);
  }finally{
    server.close();await once(server,'close');
  }
});
