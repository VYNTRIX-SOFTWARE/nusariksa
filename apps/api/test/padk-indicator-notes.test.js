import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  PadkPreparationError,
} from '../src/padk-preparations.js';
import {
  parseIndicatorNumber,validateIndicatorWorkingNotes,
} from '../src/padk-preparation-indicators.js';
import {validateDraftIndicatorList,isDraftIndicatorComplete,
  summarizeDraftIndicatorProgress,nextPendingDraftIndicator,filterDraftIndicators}
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

test('MVP PADK resume navigation follows exact draft submission readiness',()=>{
  const incomplete=(number,revision=0)=>({number,revision,provisionalRank:null,justification:''});
  const done=(number)=>({number,revision:2,provisionalRank:3,
    justification:'Alasan pemeriksaan internal yang telah memenuhi minimal 20 karakter.'});
  const items=[done(1),incomplete(2,1),done(3),incomplete(4)];
  assert.deepEqual(summarizeDraftIndicatorProgress(items),
    {total:4,complete:2,pending:2,noted:3});
  assert.equal(nextPendingDraftIndicator(items),2);
  assert.equal(nextPendingDraftIndicator(items,2),4);
  assert.equal(nextPendingDraftIndicator(items,4),2);
  assert.equal(nextPendingDraftIndicator(items,1),2);
  assert.equal(isDraftIndicatorComplete({...done(5),justification:'terlalu pendek'}),false);
  assert.equal(isDraftIndicatorComplete({...done(5),provisionalRank:null}),false);
  assert.equal(nextPendingDraftIndicator([done(1),done(2)],1),null);
  assert.deepEqual(summarizeDraftIndicatorProgress([]),
    {total:0,complete:0,pending:0,noted:0});
  assert.throws(()=>summarizeDraftIndicatorProgress(null),TypeError);
});

test('filter indikator mendukung pencarian nomor, teks dan kelengkapan tanpa mengubah data',()=>{
  const done={number:1,workingSummary:'Kebijakan keamanan siber',
    provisionalRank:2,justification:'Dokumen pengujian telah diperiksa bersama unit terkait.'};
  const pending={number:2,workingSummary:'Pencadangan data penting',
    provisionalRank:null,justification:''};
  const noted={number:3,workingSummary:'Prosedur pencadangan dan recovery',
    provisionalRank:3,justification:'Kurang cukup'};
  const indicators=[done,pending,noted];
  assert.deepEqual(filterDraftIndicators(indicators,{query:'2'}),[pending]);
  assert.deepEqual(filterDraftIndicators(indicators,{query:'PENCADANGAN'}),[pending,noted]);
  assert.deepEqual(filterDraftIndicators(indicators,{status:'complete'}),[done]);
  assert.deepEqual(filterDraftIndicators(indicators,{status:'pending'}),[pending,noted]);
  assert.deepEqual(filterDraftIndicators(indicators,{query:'kebijakan',status:'pending'}),[]);
  assert.equal(filterDraftIndicators(indicators).length,3);
  assert.deepEqual(indicators,[done,pending,noted]);
  assert.throws(()=>filterDraftIndicators(null),TypeError);
  assert.throws(()=>filterDraftIndicators(indicators,{status:'invalid'}),TypeError);
  assert.throws(()=>filterDraftIndicators(indicators,{query:12}),TypeError);
});
