import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  canSubmitMaturityAssessment,canReviewMaturityAssessment,
  validMaturityReviewQueue,reviewDecisionPayload,validMaturityReviewHistory,
} from '../../web/assets/maturity-assessment-model.js';

const maker='11111111-1111-4111-8111-111111111111';
const reviewer='22222222-2222-4222-8222-222222222222';
const aid='33333333-3333-4333-8333-333333333333';
const read=['assessments:read'];
const write=[...read,'assessments:write'];
const approve=[...read,'assessments:approve'];

test('maturity reviewer and maker controls require distinct identities and valid state',()=>{
  const detail={id:aid,ownerUserId:maker,review:{status:'submitted'},summary:{complete:true}};
  assert.equal(canReviewMaturityAssessment(approve,reviewer,detail),true);
  assert.equal(canReviewMaturityAssessment(approve,maker,detail),false);
  assert.equal(canReviewMaturityAssessment(read,reviewer,detail),false);
  assert.equal(canSubmitMaturityAssessment(write,maker,detail),false);
  detail.review.status='changes_requested';
  assert.equal(canSubmitMaturityAssessment(write,maker,detail),true);
  assert.equal(canReviewMaturityAssessment(approve,reviewer,detail),false);
  detail.summary.complete=false;
  assert.equal(canSubmitMaturityAssessment(write,maker,detail),false);
});

test('maturity reviewer queue rejects malformed results and accepts safe rows',()=>{
  const row={id:aid,ownerUserId:maker,title:'Uji tata kelola',
    periodStart:'2026-01-01',periodEnd:'2026-12-31',submissionCycle:2};
  assert.deepEqual(validMaturityReviewQueue({assessments:[row]}),[row]);
  assert.throws(()=>validMaturityReviewQueue({assessments:[{...row,submissionCycle:0}]}));
  assert.throws(()=>validMaturityReviewQueue({assessments:[{...row,ownerUserId:'bad'}]}));
  assert.throws(()=>validMaturityReviewQueue({assessments:Array(51).fill(row)}));
});

test('maturity review decision validates server-aligned note boundaries',()=>{
  assert.deepEqual(reviewDecisionPayload('approve',''),{decision:'approve',note:''});
  assert.deepEqual(reviewDecisionPayload('request_changes','Bukti kurang lengkap.'),
    {decision:'request_changes',note:'Bukti kurang lengkap.'});
  assert.throws(()=>reviewDecisionPayload('request_changes','Singkat'));
  assert.throws(()=>reviewDecisionPayload('approve','x'.repeat(2001)));
  assert.throws(()=>reviewDecisionPayload('approve','Catatan'+String.fromCharCode(1)));
  assert.throws(()=>reviewDecisionPayload('invalid','Apa pun'));
});

test('maturity reviewer history validates trusted response shapes',()=>{
  const event={action:'SUBMITTED',submission_cycle:1,note:''};
  assert.equal(validMaturityReviewHistory({assessmentId:aid,status:'submitted',
    events:[event]},aid).events[0].action,'SUBMITTED');
  assert.throws(()=>validMaturityReviewHistory({assessmentId:aid,status:'fake',
    events:[event]},aid));
});
