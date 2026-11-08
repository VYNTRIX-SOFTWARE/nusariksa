import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  SOURCE_SHA,CrosswalkError,parseMappingNumber,
  validateMappingReview,loadCrosswalkCandidates,
} from '../src/padk-crosswalk-reviews.js';
import {validateCrosswalkReviewResponse}
  from '../../web/assets/padk-crosswalk-review-ui.js';

test('60 PADK category 2 mappings are candidates only and seven need source review',async()=>{
  const rows=await loadCrosswalkCandidates();
  assert.equal(rows.length,60);
  assert.equal(rows.filter(x=>x.risk==='SOURCE_REVIEW_REQUIRED').length,7);
  assert.deepEqual(rows.filter(x=>x.risk==='SOURCE_REVIEW_REQUIRED')
    .map(x=>x.category2Number),[3,18,19,20,24,29,32]);
  assert.deepEqual(rows.map(x=>x.category2Number),Array.from({length:60},(_,i)=>i+1));
  for(const x of rows){
    assert.ok(x.category2PdfPage>=147&&x.category2PdfPage<=156);
    assert.ok(x.table3PdfPage>=157&&x.table3PdfPage<=198);
    assert.ok(x.workingSummaryDraft.length>8);
  }
});
test('mapping review validates choice, source hash, page and revision',async()=>{
  const candidate=(await loadCrosswalkCandidates())[23];
  const valid={reviewTrack:'SUBSTANCE',decision:'ACCEPT_CANDIDATE',
    proposedTable3Number:candidate.table3CandidateNumber,
    proposedPdfPage:candidate.table3PdfPage,basis:'PDF halaman 150 dan 169 sudah dibandingkan secara visual.',
    sourcePdfSha256:SOURCE_SHA,expectedLatestEventId:0};
  assert.equal(validateMappingReview(valid,candidate).decision,'ACCEPT_CANDIDATE');
  for(const body of [
    {...valid,sourcePdfSha256:'a'.repeat(64)},
    {...valid,proposedTable3Number:26},
    {...valid,reviewTrack:'ADMIN'},
    {...valid,basis:'short'},
    {...valid,expectedLatestEventId:-1},
    {...valid,extra:true},
    {...valid,decision:'REMAP_PROPOSAL'},
    {...valid,decision:'ESCALATE'},
  ])assert.throws(()=>validateMappingReview(body,candidate),CrosswalkError);
  assert.equal(parseMappingNumber('60'),60);
  for(const id of ['0','01','61','1.0'])assert.throws(()=>parseMappingNumber(id));
});
test('review browser parser rejects scoring availability and fake approval',async()=>{
  const candidates=await loadCrosswalkCandidates();
  const data={status:'DRAFT_UNVERIFIED',sourcePdfSha256:SOURCE_SHA,
    sourceAuthenticityVerified:false,fullCriteriaVerified:false,
    productionScoringAvailable:false,items:candidates.map(x=>({
      ...x,reviews:{},mappingReviewStatus:'PENDING',
      fullCriteriaVerified:false,productionScoringAvailable:false,
    }))};
  assert.equal(validateCrosswalkReviewResponse(data).length,60);
  assert.throws(()=>validateCrosswalkReviewResponse({
    ...data,productionScoringAvailable:true,
  }));
  assert.throws(()=>validateCrosswalkReviewResponse({
    ...data,items:data.items.map((x,i)=>i===0?{...x,fullCriteriaVerified:true}:x),
  }));
});
