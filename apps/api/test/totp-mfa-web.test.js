import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createServer} from '../src/server.js';
import {getMfaStatus,setupMfa,confirmMfa,verifyMfaLogin}
  from '../../web/assets/session.js';

test('MFA UI controls are present with CSP and no inline event handlers',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const response=await fetch(base+'/');
    const html=await response.text();
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
    for(const id of [
      'mfa-login-form','mfa-login-code','mfa-login-error','mfa-login-cancel',
      'mfa-open','mfa-dialog','mfa-setup-form','mfa-current-password',
      'mfa-enroll-step','mfa-setup-secret','mfa-setup-uri',
      'mfa-confirm-form','mfa-confirm-code','mfa-recovery-step',
      'mfa-recovery-codes','mfa-finish','mfa-error',
    ])assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.doesNotMatch(html,/\bonclick=/i);
  }finally{server.close();await once(server,'close');}
});
test('MFA client requests stay same-origin and never use JS credential storage',async()=>{
  const oldFetch=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>({enabled:true})};
  };
  try{
    await getMfaStatus();
    await setupMfa('current-password');
    await confirmMfa('123456');
    await verifyMfaLogin('challenge-token','ABCDEF0123456789ABCDEF0123456789');
    assert.deepEqual(calls.map(x=>[x.url,x.options.method]),[
      ['/auth/mfa/status','GET'],['/auth/mfa/setup','POST'],
      ['/auth/mfa/confirm','POST'],['/auth/mfa/login','POST'],
    ]);
    for(const req of calls){
      assert.equal(req.options.credentials,'same-origin');
      assert.equal(req.options.cache,'no-store');
      assert.equal(req.options.redirect,'error');
    }
  }finally{globalThis.fetch=oldFetch;}
});
