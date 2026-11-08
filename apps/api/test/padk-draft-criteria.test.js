import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readExtractedTable3} from '../src/padk-draft-criteria.js';
import {validateDraftCriteriaResponse} from '../../web/assets/padk-criteria-panel.js';

const ID='11111111-1111-4111-8111-111111111111';
const BASE={
  preparationId:ID,category:1,indicatorNumber:1,table3CandidateNumber:1,
  table3PdfPages:[157],category2MappingRisk:null,
  status:'EXTRACTED_SOURCE_UNVERIFIED',
  sourcePdfSha256:'63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b',
  mappingVerified:false,criteriaVerified:false,sourceTextVerified:false,
  sourceAuthenticityVerified:false,officialScoreAvailable:false,finalReportAvailable:false,
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
  ])assert.throws(()=>validateDraftCriteriaResponse({...valid,...change},context));
});
test('category 2 validation requires explicit candidate-mapping risk',async()=>{
  const row=(await readExtractedTable3())[35];
  const value={...BASE,category:2,indicatorNumber:32,
    table3CandidateNumber:36,table3PdfPages:row.pdfPages,
    category2MappingRisk:'SOURCE_REVIEW_REQUIRED',criteria:row.ranks};
  assert.equal(validateDraftCriteriaResponse(value,{id:ID,category:2,number:32}),value);
  assert.throws(()=>validateDraftCriteriaResponse({...value,category2MappingRisk:null},
    {id:ID,category:2,number:32}));
});
