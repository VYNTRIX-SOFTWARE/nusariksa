import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readExtractedTable3} from '../src/padk-draft-criteria.js';
import {readPadkDraftCategoryScope,resolvePadkDraftReferences} from '../src/padk-category-scope.js';
import {validateDraftCriteriaResponse} from '../../web/assets/padk-criteria-panel.js';

const ID='11111111-1111-4111-8111-111111111111';
const BASE={
  preparationId:ID,category:1,indicatorNumber:1,table3CandidateNumber:1,
  table3PdfPages:[157],category2MappingRisk:null,
  status:'EXTRACTED_SOURCE_UNVERIFIED',
  sourcePdfSha256:'63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b',
  mappingVerified:false,criteriaVerified:false,sourceTextVerified:false,
  sourceAuthenticityVerified:false,officialScoreAvailable:false,finalReportAvailable:false,
  sourceConflict:null,
  referenceComparison:{
    status:'DRAFT_UNVERIFIED',masterParameterCount:80,category2MarkerCount:60,
    referenceStatus:'INTERNAL_DRAFT_UNVERIFIED',
    comparisonTable3Number:null,candidateTable3Numbers:[1],
    candidateDisagreement:false,officialMappingAvailable:false,
  },
  supplementaryCriteria:[],
};
test('uploaded Table 3 extraction contains exactly 80 rows and 400 nonempty rank texts',async()=>{
  const rows=await readExtractedTable3();
  assert.equal(rows.length,80);
  assert.equal(rows.reduce((sum,r)=>sum+r.ranks.length,0),400);
  assert.deepEqual(rows.map(r=>r.number),Array.from({length:80},(_,i)=>i+1));
  assert.equal(rows[0].pdfPages[0],157);
  assert.equal(rows[79].pdfPages.at(-1),198);
  for(const row of rows){
    assert.equal(row.ranks.length,5);
    assert.deepEqual(row.ranks.map(x=>x.rank),[1,2,3,4,5]);
    assert.ok(row.ranks.every(x=>x.textDraft.length>=10));
  }
});
test('criteria UI accepts only an explicitly unverified extracted source',async()=>{
  const criteria=(await readExtractedTable3())[0].ranks;
  const valid={...BASE,criteria};
  const context={id:ID,category:1,number:1};
  assert.equal(validateDraftCriteriaResponse(valid,context),valid);
  for(const change of [
    {criteriaVerified:true},{mappingVerified:true},{officialScoreAvailable:true},
    {sourceTextVerified:true},{sourceAuthenticityVerified:true},
    {finalReportAvailable:true},{status:'VERIFIED'},
    {category2MappingRisk:'CANDIDATE_NOT_APPROVED'},
    {table3CandidateNumber:81},{table3PdfPages:[0]},
    {criteria:criteria.slice(1)},
    {criteria:criteria.map((x,i)=>i===0?{...x,rank:5}:x)},
    {sourceConflict:{code:'PARAMETER_KRITERIA_TIDAK_SELARAS',message:'Invalid on normal row'}},
    {referenceComparison:{...BASE.referenceComparison,officialMappingAvailable:true}},
    {referenceComparison:{...BASE.referenceComparison,candidateDisagreement:true}},
    {supplementaryCriteria:[{table3Number:32}]},
  ])assert.throws(()=>validateDraftCriteriaResponse({...valid,...change},context));
});
test('category 2 validation requires explicit candidate-mapping risk',async()=>{
  const row=(await readExtractedTable3())[35];
  const value={...BASE,category:2,indicatorNumber:32,
    table3CandidateNumber:36,table3PdfPages:row.pdfPages,
    category2MappingRisk:'SOURCE_REVIEW_REQUIRED',criteria:row.ranks,
    referenceComparison:{...BASE.referenceComparison,comparisonTable3Number:36,
      candidateTable3Numbers:[36]}};
  assert.equal(validateDraftCriteriaResponse(value,{id:ID,category:2,number:32}),value);
  assert.throws(()=>validateDraftCriteriaResponse({...value,category2MappingRisk:null},
    {id:ID,category:2,number:32}));
});

test('konflik sumber memblokir pemilihan langsung dari kriteria',async()=>{
  const rows=await readExtractedTable3();
  for(const n of [2,20,21,22,27,28,29]){
    const context={id:ID,category:1,number:n};
    const value={...BASE,indicatorNumber:n,table3CandidateNumber:n,
      referenceComparison:{...BASE.referenceComparison,candidateTable3Numbers:[n]},
      table3PdfPages:rows[n-1].pdfPages,criteria:rows[n-1].ranks,
      sourceConflict:{code:'PARAMETER_KRITERIA_TIDAK_SELARAS',
        message:'Parameter dan kriteria pada PDF Lampiran IV tidak selaras; perlu review sumber.'}};
    assert.equal(validateDraftCriteriaResponse(value,context),value);
    assert.throws(()=>validateDraftCriteriaResponse({...value,sourceConflict:null},context));
  }
});

test('master 80 mempertahankan 60 penanda kategori 2 dari referensi kerja',async()=>{
  const scope=await readPadkDraftCategoryScope();
  assert.equal(scope.status,'DRAFT_UNVERIFIED');
  assert.equal(scope.masterParameterCount,80);
  assert.equal(scope.category2Table3Numbers.length,60);
  assert.equal(new Set(scope.category2Table3Numbers).size,60);
  assert.equal(scope.category2Table3Numbers[28],32);
  assert.equal(scope.category2Table3Numbers.includes(35),false);
  const normal=resolvePadkDraftReferences(scope,{category:2,indicator:1,primaryNumber:1});
  assert.deepEqual(normal.candidateTable3Numbers,[1]);
  assert.equal(normal.candidateDisagreement,false);
  const different=resolvePadkDraftReferences(scope,{category:2,indicator:29,primaryNumber:35});
  assert.deepEqual(different.candidateTable3Numbers,[35,32]);
  assert.equal(different.comparisonTable3Number,32);
  assert.equal(different.candidateDisagreement,true);
  assert.equal(different.officialMappingAvailable,false);
  const first=resolvePadkDraftReferences(scope,{category:1,indicator:29,primaryNumber:29});
  assert.deepEqual(first.candidateTable3Numbers,[29]);
  assert.equal(first.comparisonTable3Number,null);
});

test('panel menampilkan dua set kriteria untuk mapping Kategori 2 yang berbeda',async()=>{
  const rows=await readExtractedTable3();
  const criteria=rows[34].ranks;
  const supplementary=rows[31].ranks;
  const comparison={...BASE.referenceComparison,comparisonTable3Number:32,
    candidateTable3Numbers:[35,32],candidateDisagreement:true};
  const input={...BASE,category:2,indicatorNumber:29,table3CandidateNumber:35,
    table3PdfPages:rows[34].pdfPages,category2MappingRisk:'SOURCE_REVIEW_REQUIRED',
    criteria,referenceComparison:comparison,supplementaryCriteria:[{
      table3Number:32,pdfPages:rows[31].pdfPages,criteria:supplementary,
      category2ComparisonMarker:true,sourceConflict:null,
    }]};
  assert.equal(validateDraftCriteriaResponse(input,{id:ID,category:2,number:29}),input);
  assert.throws(()=>validateDraftCriteriaResponse({...input,supplementaryCriteria:[]},
    {id:ID,category:2,number:29}));
  assert.throws(()=>validateDraftCriteriaResponse({...input,
    referenceComparison:{...comparison,candidateDisagreement:false}},
    {id:ID,category:2,number:29}));
});
