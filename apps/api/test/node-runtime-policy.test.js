import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isSupportedNodeVersion,assertSupportedNodeVersion,MINIMUM_NODE_VERSION}
  from '../src/node-runtime-policy.js';
import {evaluatePilotConfiguration} from '../src/pilot-preflight.js';

test('baseline keamanan Node.js berlaku tepat pada batas patch LTS',()=>{
  assert.equal(MINIMUM_NODE_VERSION,'24.22.3');
  for(const value of ['v24.22.3','24.22.3','v24.22.4','v24.23.0','v24.99.99']){
    assert.equal(isSupportedNodeVersion(value),true,value);
    assert.doesNotThrow(()=>assertSupportedNodeVersion(value));
  }
  for(const value of ['v24.22.2','v24.22.1','v24.7.0','v24.0.0',
    'v25.0.0','v26.13.1','v22.23.4','v27.0.0','v24.22.3-rc.1',
    'v24.22.3+modified','v024.22.3','24.22','foo',undefined]){
    assert.equal(isSupportedNodeVersion(value),false,String(value));
    assert.throws(()=>assertSupportedNodeVersion(value),/Node.js 24.22.3/);
  }
});

test('preflight menolak runtime rentan meskipun konfigurasi lain valid',()=>{
  const cfg={
    APP_ORIGIN:'http://127.0.0.1:3000',
    DATABASE_URL:'postgresql://u:p@127.0.0.1:5432/nusariksa_test',
    EVIDENCE_KEYRING:JSON.stringify({v1:'0123456789abcdef'.repeat(4)}),
    EVIDENCE_ACTIVE_KEY_ID:'v1',
    MFA_ENCRYPTION_KEY:Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    NUSARIKSA_PILOT_DATA_MODE:'synthetic',
  };
  const report=evaluatePilotConfiguration(cfg,'v24.22.2');
  assert.equal(report.checks.find(c=>c.id==='node').state,'BLOCK');
  assert.equal(report.overall,'BLOCKED');
  assert.equal(evaluatePilotConfiguration(cfg,'v24.22.3').checks[0].state,'PASS');
});
