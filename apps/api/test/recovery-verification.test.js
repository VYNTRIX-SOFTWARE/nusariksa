import assert from 'node:assert/strict';
import {test} from 'node:test';
import {encryptEvidence,validateEvidence} from '../src/assessment-evidence.js';
import {configureEvidenceKeys} from '../src/evidence-keyring.js';
import {verifyEncryptedEvidence,RecoveryVerificationError} from '../src/recovery-verification.js';
import {validateRecoveryPlan,parseRecoveryUrl} from '../src/recovery-drill.js';

const old='aa'.repeat(32),next='bb'.repeat(32);
const config=configureEvidenceKeys({
  legacyKey:old,keysJson:JSON.stringify({v1:next}),activeId:'v1'});
const value=validateEvidence({fileName:'test.pdf',mediaType:'application/pdf',
  contentBase64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')});
const assessmentId='11111111-1111-4111-8111-111111111111';
const controlId='22222222-2222-4222-8222-222222222222';
function fixture(key,control,indicator){
  const r=encryptEvidence({...value,assessmentId,controlId:control},key);
  return indicator?{...r,assessment_id:assessmentId,control_id:'PADK43_INDICATOR_1'}:r;
}
function fakeDb(assessment,padk){
  return {async query(sql,params){
    const rows=sql.includes('FROM assessment_evidence')?assessment:
      sql.includes('FROM padk_indicator_evidence')?padk:null;
    if(!rows)throw new Error('Unexpected SQL');
    return {rows:params[0]?[]:rows};
  }};
}
test('restore verifier authenticates legacy and rotated evidence from both tables',async()=>{
  const a=fixture(Buffer.from(old,'hex'),controlId);
  const b=fixture(config,'PADK43_INDICATOR_1',true);
  const stats=await verifyEncryptedEvidence(fakeDb([a],[b]),config);
  assert.deepEqual(stats,{assessment:1,padk:1,legacy:1,versioned:1});
});
test('missing recovery key or altered tag fails closed',async()=>{
  const encrypted=fixture(config,controlId);
  await assert.rejects(verifyEncryptedEvidence(fakeDb([encrypted],[]),
    configureEvidenceKeys({legacyKey:old})),RecoveryVerificationError);
  const changed=Buffer.from(encrypted.auth_tag);changed[0]^=1;
  await assert.rejects(verifyEncryptedEvidence(fakeDb([{...encrypted,auth_tag:changed}],[]),config),
    RecoveryVerificationError);
});
test('only an explicitly acknowledged, local, separately named disposable target is accepted',()=>{
  const source='postgresql://u:secret@localhost:5432/nusariksa_test';
  const target='postgresql://u:secret@127.0.0.1:5432/nusariksa_recovery_test';
  assert.doesNotThrow(()=>validateRecoveryPlan({
    sourceUrl:source,targetUrl:target,confirmation:'ISOLATED_EMPTY_RECOVERY_DATABASE'}));
  for(const url of [
    source,'postgresql://u:secret@remote.example:5432/nusariksa_recovery_test',
    'postgresql://u:secret@localhost:5432/production',
  ])assert.throws(()=>validateRecoveryPlan({sourceUrl:source,targetUrl:url,
    confirmation:'ISOLATED_EMPTY_RECOVERY_DATABASE'}),RecoveryVerificationError);
  assert.throws(()=>validateRecoveryPlan({sourceUrl:source,targetUrl:target,
    confirmation:'not confirmed'}),RecoveryVerificationError);
  assert.throws(()=>parseRecoveryUrl(source+'?sslmode=invalid'),RecoveryVerificationError);
  assert.throws(()=>parseRecoveryUrl(source+'?connect_timeout=3'),RecoveryVerificationError);
});
