import assert from 'node:assert/strict';
import {test} from 'node:test';
import {configureEvidenceKeys} from '../src/evidence-keyring.js';
import {validateEvidence,encryptEvidence,decryptEvidence,EvidenceError} from '../src/assessment-evidence.js';

const legacy='ab'.repeat(32),v1='cd'.repeat(32),v2='ef'.repeat(32);
const input={...validateEvidence({
  fileName:'sop.pdf',mediaType:'application/pdf',
  contentBase64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
}),assessmentId:'11111111-1111-4111-8111-111111111111',
  controlId:'PADK43_INDICATOR_1'};
function ring(activeId='v1',keys={v1,v2},legacyKey=legacy){
  return configureEvidenceKeys({legacyKey,keysJson:JSON.stringify(keys),activeId});
}
test('old evidence remains readable after introducing a keyring',()=>{
  const old=encryptEvidence(input,configureEvidenceKeys({legacyKey:legacy}));
  assert.equal(old.key_id,null);
  assert.deepEqual(decryptEvidence(old,ring('v2')),input.bytes);
  assert.throws(()=>decryptEvidence(old,ring('v2',{v1,v2},null)),
    e=>e instanceof EvidenceError&&e.status===503);
});
test('rotated active key does not change existing ciphertext or break its reader',()=>{
  const one=encryptEvidence(input,ring('v1'));
  const two=encryptEvidence(input,ring('v2'));
  assert.equal(one.key_id,'v1');assert.equal(two.key_id,'v2');
  assert.deepEqual(decryptEvidence(one,ring('v2')),input.bytes);
  assert.deepEqual(decryptEvidence(two,ring('v2')),input.bytes);
  assert.throws(()=>decryptEvidence({...one,key_id:'v2'},ring('v2')),EvidenceError);
  assert.throws(()=>decryptEvidence({...one,key_id:null},ring('v2')),EvidenceError);
  assert.throws(()=>decryptEvidence(one,ring('v2',{v2})),
    e=>e instanceof EvidenceError&&e.status===503);
  const tag=Buffer.from(one.auth_tag);tag[0]^=1;
  assert.throws(()=>decryptEvidence({...one,auth_tag:tag},ring('v2')),EvidenceError);
});
test('misconfiguration fails closed and never silently falls back to legacy writer',()=>{
  for(const bad of [
    {legacyKey:legacy,keysJson:'{}',activeId:'v1'},
    {legacyKey:legacy,keysJson:'{"v1":"bad"}',activeId:'v1'},
    {legacyKey:legacy,keysJson:JSON.stringify({v1}),activeId:'v2'},
    {legacyKey:legacy,keysJson:'not-json',activeId:'v1'},
    {legacyKey:legacy,activeId:'v1'},
  ])assert.equal(configureEvidenceKeys(bad),null);
  assert.throws(()=>encryptEvidence(input,null),e=>e.status===503);
});
