import assert from 'node:assert/strict';
import {test} from 'node:test';
import {evaluatePilotConfiguration,summarizePilotChecks} from '../src/pilot-preflight.js';

const key='0123456789abcdef'.repeat(4);
const fixtures=()=>({
  APP_ORIGIN:'http://127.0.0.1:3000',
  DATABASE_URL:'postgresql://operator:never-print-this@127.0.0.1:5432/nusariksa_test',
  EVIDENCE_KEYRING:JSON.stringify({v1:key}),
  EVIDENCE_ACTIVE_KEY_ID:'v1',
  NUSARIKSA_PILOT_DATA_MODE:'synthetic',
});
const state=(result,id)=>result.checks.find(x=>x.id===id).state;
test('preflight konfigurasi valid hanya lolos setelah pemeriksaan DB terpisah',()=>{
  const report=evaluatePilotConfiguration(fixtures(),'v24.7.0');
  assert.ok(report.checks.every(x=>x.state==='PASS'));
  assert.equal(report.overall,'REVIEW_REQUIRED');
  assert.equal(summarizePilotChecks(report.checks,{databaseRequested:true}),
    'PREFLIGHT_CHECKS_PASSED');
  assert.equal(evaluatePilotConfiguration(fixtures(),'v26.0.0').checks[0].state,'PASS');
  assert.equal(evaluatePilotConfiguration(fixtures(),'v22.1.0').checks[0].state,'BLOCK');
  assert.equal(evaluatePilotConfiguration(fixtures(),'v24.6.9').checks[0].state,'BLOCK');
  assert.equal(evaluatePilotConfiguration(fixtures(),'v27.0.0').checks[0].state,'BLOCK');
});
test('preflight menolak origin yang tidak aman atau membawa bagian URL tambahan',()=>{
  for(const v of ['http://example.org','http://127.0.0.1:3000/admin',
    'http://name:password@localhost:3000','ftp://localhost:3000',
    'https://example.org?token=secret','not a URL']){
    assert.equal(state(evaluatePilotConfiguration({...fixtures(),APP_ORIGIN:v},'v24.9.0'),
      'app_origin'),'BLOCK',v);
  }
  const publicResult=evaluatePilotConfiguration({
    ...fixtures(),APP_ORIGIN:'https://staging.example.test'},'v24.9.0');
  assert.equal(state(publicResult,'app_origin'),'WARN');
});
test('preflight mengingatkan SSL DB remote dan memblokir konfigurasi tidak valid',()=>{
  const env=fixtures();
  assert.equal(state(evaluatePilotConfiguration({...env,
    DATABASE_URL:'postgresql://u:p@db.example.test/demo'},'v24.9.0'),
  'database_config'),'WARN');
  assert.equal(state(evaluatePilotConfiguration({...env,
    DATABASE_URL:'postgresql://u:p@db.example.test/demo?sslmode=verify-full'},'v24.9.0'),
  'database_config'),'PASS');
  for(const url of ['https://example.test','postgresql://host','postgresql://']){
    assert.equal(state(evaluatePilotConfiguration({...env,DATABASE_URL:url},'v24.9.0'),
    'database_config'),'BLOCK');
  }
});
test('preflight memblokir keyring rusak, kunci contoh berulang, dan scope tidak sintetis',()=>{
  const env=fixtures();
  assert.equal(state(evaluatePilotConfiguration({...env,EVIDENCE_KEYRING:'{}'},
    'v24.9.0'),'evidence_keys'),'BLOCK');
  assert.equal(state(evaluatePilotConfiguration({...env,EVIDENCE_KEYRING:JSON.stringify({
    v1:'aa'.repeat(32)})},'v24.9.0'),'evidence_keys'),'BLOCK');
  assert.equal(state(evaluatePilotConfiguration({...env,EVIDENCE_ACTIVE_KEY_ID:'other'},
    'v24.9.0'),'evidence_keys'),'BLOCK');
  assert.equal(state(evaluatePilotConfiguration({...env,
    NUSARIKSA_PILOT_DATA_MODE:'production'},'v24.9.0'),'data_scope'),'BLOCK');
  assert.equal(state(evaluatePilotConfiguration({...env,EVIDENCE_KEYRING:undefined,
    EVIDENCE_ACTIVE_KEY_ID:undefined,EVIDENCE_ENCRYPTION_KEY:key},'v24.9.0'),
    'evidence_keys'),'WARN');
});
test('preflight menyembunyikan kredensial dan nilai kunci di seluruh laporan',()=>{
  const env=fixtures(),result=evaluatePilotConfiguration(env,'v24.9.0');
  const printed=JSON.stringify(result);
  assert.equal(printed.includes('never-print-this'),false);
  assert.equal(printed.includes(key),false);
  const bad=evaluatePilotConfiguration({
    ...env,DATABASE_URL:'postgres://user:my-secret@',
    EVIDENCE_KEYRING:'{"v1":"my-secret"}',
  },'v24.9.0');
  assert.equal(JSON.stringify(bad).includes('my-secret'),false);
  assert.equal(bad.overall,'BLOCKED');
});
test('port hanya menerima bilangan integer dalam rentang',()=>{
  const env=fixtures();
  for(const value of ['3000','65535',undefined])
    assert.equal(state(evaluatePilotConfiguration({...env,PORT:value},'v24.9.0'),
      'port'),'PASS');
  for(const value of ['0','65536','-1','3000x','3.0'])
    assert.equal(state(evaluatePilotConfiguration({...env,PORT:value},'v24.9.0'),
      'port'),'BLOCK');
});
