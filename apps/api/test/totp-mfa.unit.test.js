import assert from 'node:assert/strict';
import {test} from 'node:test';
import {base32Encode,base32Decode,totpForStep,matchTotp,readMfaKey,MfaError}
  from '../src/totp-mfa.js';

const secret=Buffer.from('12345678901234567890','ascii');
test('TOTP RFC 6238 6 digit with known vector',()=>{
  assert.equal(totpForStep(secret,1),'287082'); // RFC 6238: 94287082
  assert.equal(totpForStep(secret,37037036),'081804'); // RFC 6238: 07081804
  assert.equal(matchTotp(secret,'287082',{time:59000}),1);
  assert.equal(matchTotp(secret,'287082',{time:59000,afterStep:1}),null);
  assert.equal(matchTotp(secret,'287082',{time:59000,afterStep:0}),1);
  assert.equal(matchTotp(secret,'999999',{time:59000}),null);
  assert.equal(matchTotp(secret,'28708',{time:59000}),null);
});
test('base32 canonical secret roundtrip and key configuration fail closed',()=>{
  const encoded=base32Encode(secret);
  assert.equal(encoded,'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode(encoded),secret);
  assert.equal(base32Decode('invalid'),null);
  assert.deepEqual(readMfaKey(Buffer.alloc(32,9).toString('base64')),Buffer.alloc(32,9));
  assert.throws(()=>readMfaKey('wrong'),error=>error instanceof MfaError&&error.status===503);
});
