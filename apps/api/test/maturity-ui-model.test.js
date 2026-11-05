import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  mayReadMaturity,mayWriteMaturity,modelDraft,domainDraft,criterionDraft,
  parseMaturityModels,parseMaturityVersions,parseMaturityRubric,rubricComplete,
} from '../../web/assets/maturity-model.js';

const id='11111111-1111-4111-8111-111111111111',v='22222222-2222-4222-8222-222222222222';
const d='33333333-3333-4333-8333-333333333333';

test('menu dan mutasi model maturitas mengikuti permission existing',()=>{
  assert.equal(mayReadMaturity(['assessments:read']),true);
  assert.equal(mayReadMaturity(['reports:read']),false);
  assert.equal(mayWriteMaturity(['assessments:write']),false);
  assert.equal(mayWriteMaturity(['assessments:read','assessments:write']),true);
});
test('validasi input tidak mengarang sumber metodologi',()=>{
  assert.deepEqual(modelDraft({
    code:'mati',title:'Metodologi Internal',methodologyReference:'  Dokumen internal  '}),
  {code:'MATI',title:'Metodologi Internal',methodologyReference:'Dokumen internal'});
  assert.throws(()=>modelDraft({code:'A',title:'Contoh',methodologyReference:'Sumber'}));
  assert.throws(()=>modelDraft({code:'GOOD',title:'Contoh',methodologyReference:''}));
  assert.deepEqual(domainDraft({code:'gov_01',title:'Tata Kelola TI'}),
    {code:'GOV_01',title:'Tata Kelola TI',description:''});
  assert.throws(()=>domainDraft({code:'X',title:'Tata Kelola TI'}));
  assert.equal(criterionDraft('Kriteria objektif minimal sepuluh karakter.'),
    'Kriteria objektif minimal sepuluh karakter.');
  assert.throws(()=>criterionDraft('lemah'));
});
test('data API dan kelengkapan kriteria divalidasi tanpa skor agregat',()=>{
  const models=parseMaturityModels({models:[{id,code:'MAT_TI',title:'Metodologi',
    methodology_reference:'Dokumen internal'}]});
  assert.equal(models.length,1);
  const versions=parseMaturityVersions({versions:[{id:v,version:1,status:'draft'}]});
  assert.equal(versions.length,1);
  const levels=Array.from({length:6},(_,level)=>({
    level,criterion:'Kriteria internal di level '+level,
  }));
  const rubric=parseMaturityRubric({
    version:{id:v,version:1,status:'draft',methodology_reference:'Dokumen internal'},
    domains:[{id:d,code:'GOV_01',title:'Tata Kelola TI',levels}],
  },v);
  assert.equal(rubricComplete(rubric.domains),true);
  assert.equal(rubricComplete([{id:d,levels:levels.slice(1)}]),false);
  assert.equal(rubricComplete([]),false);
  assert.equal(rubricComplete([{id:d,levels:[...levels.slice(0,5),levels[0]]}]),false);
  assert.equal(Object.hasOwn(rubric,'score'),false);
  assert.throws(()=>parseMaturityModels({models:null}));
  assert.throws(()=>parseMaturityVersions({versions:[{id:v,version:0,status:'draft'}]}));
  assert.throws(()=>parseMaturityRubric({version:{id:v,status:'draft'},domains:[]},v));
});
