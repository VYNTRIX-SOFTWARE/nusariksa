import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  MaturityError, validateMaturityModel, validateMaturityDomain,
  validateLevelCriterion, createMaturityModelInTransaction,
} from '../src/maturity-models.js';

test('model maturitas membutuhkan referensi metodologi yang eksplisit',()=>{
  const good={code:'MAT_TI',title:'Metodologi TI Internal',
    methodologyReference:'Metodologi internal versi 1 (belum diverifikasi OJK)'};
  assert.deepEqual(validateMaturityModel(good),good);
  for(const value of [
    {...good,code:'bad-lower'}, {...good,code:'1ABC'}, {...good,title:'  a  '},
    {...good,methodologyReference:''},
    {...good,methodologyReference:'referensi\nbaru'},
  ])assert.throws(()=>validateMaturityModel(value),e=>e instanceof MaturityError&&e.status===400);
});

test('domain dan kriteria level divalidasi sebelum menyentuh database',async()=>{
  assert.deepEqual(validateMaturityDomain({
    code:'GOV_1',title:'Tata Kelola TI',
  }),{code:'GOV_1',title:'Tata Kelola TI',description:''});
  assert.throws(()=>validateMaturityDomain({code:'G',title:'Tata Kelola TI'}),MaturityError);
  assert.throws(()=>validateMaturityDomain({code:'GOV_1',title:'Tata Kelola TI',description:'x'.repeat(2001)}),MaturityError);
  assert.deepEqual(validateLevelCriterion({level:0,criterion:'Belum ada proses terdefinisi.'}),
    {level:0,criterion:'Belum ada proses terdefinisi.'});
  for(const level of [-1,6,'3',2.5,null])assert.throws(
    ()=>validateLevelCriterion({level,criterion:'Kriteria dengan deskripsi cukup panjang'}),MaturityError);
  assert.throws(()=>validateLevelCriterion({level:3,criterion:'lemah'}),MaturityError);

  const db={query(){throw new Error('Database should not be accessed');}};
  await assert.rejects(createMaturityModelInTransaction(db,{
    actorId:'bad',code:'BAD',title:'Metodologi',methodologyReference:'a',
  }),e=>e instanceof MaturityError&&e.status===400);
});
