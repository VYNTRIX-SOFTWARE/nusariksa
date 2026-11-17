import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validatePadkEvidenceCoverage} from '../../web/assets/padk-evidence-coverage-ui.js';

const id='11111111-1111-4111-8111-111111111111';
function fixture(category=2){
  const total=category===1?80:60;
  const indicators=Array.from({length:total},(_,i)=>({
    number:i+1,fileCount:0,
  }));
  indicators[0].fileCount=2;
  indicators[total-1].fileCount=1;
  return {preparationId:id,category,totalIndicators:total,
    coveredIndicators:2,uncoveredIndicators:total-2,totalFiles:3,indicators,
    status:'DRAFT_EVIDENCE_COVERAGE',regulatoryPackVerified:false,
    evidenceRequiredForDraftSubmission:false};
}
test('cakupan bukti indikator 60 dan 80 diverifikasi tanpa klaim hasil resmi',()=>{
  for(const category of [1,2]){
    const input=fixture(category);
    const result=validatePadkEvidenceCoverage(input,{id,category});
    assert.equal(result.coveredIndicators,2);
    assert.equal(result.uncoveredIndicators,category===1?78:58);
    assert.equal(result.totalFiles,3);
    assert.equal(result.evidenceRequiredForDraftSubmission,false);
    assert.equal(result.regulatoryPackVerified,false);
  }
});
test('respons bukti ditolak bila jumlah, urutan, atau batas tidak konsisten',()=>{
  const mutations=[
    x=>x.totalFiles++,
    x=>x.coveredIndicators++,
    x=>x.uncoveredIndicators--,
    x=>x.indicators.pop(),
    x=>x.indicators[1].number=1,
    x=>x.indicators[0].fileCount=11,
    x=>x.indicators[0].fileCount=-1,
    x=>x.status='OFFICIAL_APPROVED',
    x=>x.regulatoryPackVerified=true,
    x=>x.evidenceRequiredForDraftSubmission=true,
    x=>x.category=1,
    x=>x.preparationId='22222222-2222-4222-8222-222222222222',
  ];
  for(const mutate of mutations){
    const data=fixture();mutate(data);
    assert.throws(()=>validatePadkEvidenceCoverage(data,{id,category:2}),TypeError);
  }
});
test('nol bukti sah sebagai status informasi; bukan syarat wajib submit',()=>{
  const data=fixture();
  data.indicators.forEach(x=>x.fileCount=0);
  data.totalFiles=0;data.coveredIndicators=0;data.uncoveredIndicators=60;
  const result=validatePadkEvidenceCoverage(data,{id,category:2});
  assert.equal(result.coveredIndicators,0);
  assert.equal(result.evidenceRequiredForDraftSubmission,false);
  assert.throws(()=>validatePadkEvidenceCoverage(data,{id:'invalid',category:2}),
    TypeError);
});
