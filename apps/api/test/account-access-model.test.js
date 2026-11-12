import assert from 'node:assert/strict';
import {test} from 'node:test';
import {invitationCodeLooksValid,passwordReadiness}
  from '../../web/assets/account-access-model.js';

test('kode undangan dikenali secara lokal tanpa memeriksa server',()=>{
  const code='A'.repeat(40)+'-_1';
  assert.equal(code.length,43);
  assert.equal(invitationCodeLooksValid(code),true);
  assert.equal(invitationCodeLooksValid('  '+code+'  '),true);
  for(const invalid of ['',code.slice(1),code+'1',code.slice(0,42)+'!',123,null]){
    assert.equal(invitationCodeLooksValid(invalid),false);
  }
});

test('panduan kata sandi mengharuskan panjang dan kecocokan sebelum submit',()=>{
  const password='CukupPanjang_2026';
  assert.deepEqual(passwordReadiness(password,password),
    {longEnough:true,match:true,ready:true});
  assert.deepEqual(passwordReadiness(password,'salah'),
    {longEnough:true,match:false,ready:false});
  assert.deepEqual(passwordReadiness('pendek','pendek'),
    {longEnough:false,match:true,ready:false});
  assert.deepEqual(passwordReadiness(password,''),
    {longEnough:true,match:false,ready:false});
  assert.equal(passwordReadiness('a'.repeat(1025),'a'.repeat(1025)).ready,false);
  assert.throws(()=>passwordReadiness(null,''),TypeError);
});
