import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadPadkPreviewManifest} from '../src/padk-saved-score-preview.js';
import {previewPadkCyberMaturity} from '../src/padk-cyber-maturity.js';
import {validatePadkSavedPreview} from '../../web/assets/padk-score-preview-ui.js';

const ID='11111111-1111-4111-8111-111111111111';
const wrap=result=>({
  preparationId:ID,sourceStatus:'DRAFT_UNVERIFIED',
  criteriaVerified:false,roundingPolicyVerified:false,
  officialScoreAvailable:false,officialApprovalAvailable:false,
  finalReportAvailable:false,...result,
});
test('preview server manifest is 80/60 and has all five domain codes',async()=>{
  for(const c of [1,2]){
    const m=await loadPadkPreviewManifest(c);
    assert.equal(m.indicators.length,c===1?80:60);
    assert.deepEqual(new Set(m.indicators.map(x=>x.domain)),
      new Set(['TK','ID','PL','DT','PP']));
  }
});
test('complete draft rank 2 yields 2.00 but is never a regulatory result',async()=>{
  const m=await loadPadkPreviewManifest(2);
  const ratings=m.indicators.map(item=>({number:item.number,rank:2}));
  const result=wrap(previewPadkCyberMaturity({manifest:m,ratings}));
  assert.equal(result.complete,true);
  assert.equal(result.compositePreview.valueTwoDecimals,'2.00');
  assert.equal(result.compositePreview.rank,2);
  assert.equal(result.regulatoryResult,false);
  assert.equal(validatePadkSavedPreview(result,ID,2),result);
  assert.throws(()=>validatePadkSavedPreview({...result,officialScoreAvailable:true},ID,2));
  assert.throws(()=>validatePadkSavedPreview({...result,criteriaVerified:true},ID,2));
});
test('incomplete drafts have no composite; rounding remains unverified',async()=>{
  const m=await loadPadkPreviewManifest(1);
  const result=wrap(previewPadkCyberMaturity({
    manifest:m,ratings:[{number:1,rank:5}],
  }));
  assert.equal(result.ratedIndicators,1);
  assert.equal(result.compositeRaw,null);
  assert.equal(result.compositePreview,null);
  assert.equal(result.roundingPolicyVerified,false);
  assert.equal(validatePadkSavedPreview(result,ID,1),result);
  assert.throws(()=>validatePadkSavedPreview({
    ...result,compositePreview:{rank:1,valueTwoDecimals:'1.00'},
  },ID,1));
});
