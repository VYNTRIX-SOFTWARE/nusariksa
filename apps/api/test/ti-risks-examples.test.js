import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RISK_EXAMPLES,riskExampleById,suggestRiskCode,localRiskLevel} from '../../web/assets/ti-risks-ui.js';

test('pustaka risiko memuat skenario BPR tanpa nilai aktual atau hasil penilaian otomatis',()=>{
  assert.ok(RISK_EXAMPLES.length>=15);
  assert.equal(new Set(RISK_EXAMPLES.map(x=>x.id)).size,RISK_EXAMPLES.length);
  for(const x of RISK_EXAMPLES){
    assert.ok(x.id&&x.group&&x.title&&x.scenario.length>=20);
    assert.equal(Object.hasOwn(x,'likelihood'),false);
    assert.equal(Object.hasOwn(x,'impact'),false);
    assert.equal(Object.hasOwn(x,'residualLikelihood'),false);
    assert.equal(Object.hasOwn(x,'mitigation'),false);
  }
  assert.match(riskExampleById('CBS_GANGGUAN').scenario,/transaksi/);
  assert.match(riskExampleById('RANSOMWARE').title,/ransomware/);
  assert.equal(riskExampleById('NOT_EXIST'),null);
});
test('saran kode risiko tidak menentukan tingkat risiko',()=>{
  assert.equal(suggestRiskCode('Gangguan CBS'),'RSK-GANGGUAN-CBS');
  assert.equal(suggestRiskCode(''),'');
  assert.ok(suggestRiskCode('Potensi Gangguan Operasional dan Teknologi Informasi dalam Jangka Panjang').length<=32);
  assert.equal(localRiskLevel(0,0),null);
  assert.deepEqual(localRiskLevel(4,5),{score:20,level:'critical'});
});
