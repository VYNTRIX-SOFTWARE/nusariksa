import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  PadkPreparationError,
} from '../src/padk-preparations.js';
import {
  parseIndicatorNumber,validateIndicatorWorkingNotes,
} from '../src/padk-preparation-indicators.js';
import {validateDraftIndicatorList}
  from '../../web/assets/padk-indicator-note-ui.js';

test('indicator number must follow PADK category sizes',()=>{
  assert.equal(parseIndicatorNumber('80',1),80);
  assert.equal(parseIndicatorNumber('60',2),60);
  for(const [value,category] of [['61',2],['81',1],['0',1],['-1',2],
    ['1.5',1],['01',1],[0,1],['999',1]]){
    assert.throws(()=>parseIndicatorNumber(value,category),PadkPreparationError);
  }
});
test('working notes allow revision zero only for initial write',()=>{
  assert.deepEqual(validateIndicatorWorkingNotes({
    preparationNotes:'Kebijakan sedang ditinjau',evidencePlan:'SOP TI',expectedRevision:0,
  }),{preparationNotes:'Kebijakan sedang ditinjau',evidencePlan:'SOP TI',expectedRevision:0});
  const withRank={preparationNotes:'Catatan pemeriksaan',evidencePlan:'SOP TI',
    expectedRevision:0,provisionalRank:2,
    justification:'Memenuhi sebagian persyaratan menurut pembacaan sementara.'};
  assert.deepEqual(validateIndicatorWorkingNotes(withRank),withRank);
  for(const invalid of [
    {...withRank,provisionalRank:0},{...withRank,provisionalRank:6},
    {...withRank,provisionalRank:2.5},{...withRank,justification:'terlalu singkat'},
    {...withRank,provisionalRank:null},
    {...withRank,justification:'\u0001'.replace('\\u0001','\u0001')},
  ])assert.throws(()=>validateIndicatorWorkingNotes(invalid),PadkPreparationError);
  for(const x of [
    {preparationNotes:'x',evidencePlan:'',expectedRevision:-1},
    {preparationNotes:'x',evidencePlan:'',expectedRevision:1.5},
    {preparationNotes:'x'.repeat(4001),evidencePlan:'',expectedRevision:0},
    {preparationNotes:'x\u0001',evidencePlan:'',expectedRevision:0},
  ])assert.throws(()=>validateIndicatorWorkingNotes(x),PadkPreparationError);
});
test('UI must reject authoritative-looking or scored draft indicator payload',()=>{
  const draft={
    category:2,catalogStatus:'DRAFT_UNVERIFIED',sourcePdfVerified:false,
    scoringAvailable:false,approvalAvailable:false,
    indicators:Array.from({length:60},(_,i)=>({
      number:i+1,workingSummary:'Ringkasan kerja draft, belum diverifikasi',
      printedPage:28,revision:0,preparationNotes:'',evidencePlan:'',
      provisionalRank:null,justification:'',rankIsOfficial:false,criteriaVerified:false,
      status:'WORKING_NOTES_UNVERIFIED',scoringAvailable:false,
    })),
  };
  assert.equal(validateDraftIndicatorList(draft,2).length,60);
  assert.throws(()=>validateDraftIndicatorList({...draft,scoringAvailable:true},2));
  assert.throws(()=>validateDraftIndicatorList({...draft,
    indicators:draft.indicators.map((x,i)=>i===0?{...x,rank:1}:x)},2));
  assert.throws(()=>validateDraftIndicatorList({...draft,
    indicators:draft.indicators.slice(1)},2));
});
