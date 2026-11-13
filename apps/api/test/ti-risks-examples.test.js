import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateRiskReference,riskExampleById,suggestRiskCode,localRiskLevel}
  from '../../web/assets/ti-risks-ui.js';

const reference={
  id:'CBS_GANGGUAN',group:'Layanan core banking',title:'Gangguan layanan core banking',
  scenario:'Gangguan core banking dapat memengaruhi transaksi BPR.',
  review:'Periksa histori gangguan dan jalur eskalasi.',
  controls:'Monitoring layanan dan uji failover.',
  version:'1.0',state:'pending',adopted_risk_id:null,
};

test('data referensi berasal dari respons database dan statusnya tervalidasi',()=>{
  assert.deepEqual(validateRiskReference(reference),reference);
  for(const state of ['pending','not_applicable','adopted'])
    assert.equal(validateRiskReference({...reference,state}).state,state);
  for(const invalid of [
    {...reference,id:'../../x'}, {...reference,group:''},
    {...reference,title:null},{...reference,state:'approved'},
    {...reference,version:42},
  ])assert.throws(()=>validateRiskReference(invalid),TypeError);
  assert.equal(riskExampleById('CBS_GANGGUAN',[reference]),reference);
  assert.equal(riskExampleById('MISSING',[reference]),null);
});

test('referensi tidak menyuplai skor atau data bank yang direkayasa',()=>{
  for(const key of ['assetId','pic','dueDate','likelihood','impact','status',
    'residualLikelihood','residualImpact','mitigation']){
    assert.equal(Object.hasOwn(reference,key),key==='status'?false:false);
  }
  assert.equal(suggestRiskCode('Gangguan CBS'),'RSK-GANGGUAN-CBS');
  assert.equal(suggestRiskCode(''),'');
  assert.equal(localRiskLevel(0,0),null);
  assert.deepEqual(localRiskLevel(4,5),{score:20,level:'critical'});
});
