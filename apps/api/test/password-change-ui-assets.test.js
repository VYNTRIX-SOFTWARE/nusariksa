import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createServer} from '../src/server.js';

test('ganti password tersedia di web tanpa melemahkan CSP',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base+'/');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await response.text();
    for(const id of [
      'change-password-open','change-password-dialog','change-password-form',
      'current-password','new-password','confirm-password','change-password-error',
      'change-password-submit','change-password-cancel','change-password-close',
    ])assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.match(html,/autocomplete="current-password"/);
    assert.match(html,/autocomplete="new-password"/);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  }finally{server.close();await once(server,'close');}
});
