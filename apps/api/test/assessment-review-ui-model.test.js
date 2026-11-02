import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REVIEW_ACTION_LABELS, canDecideReview, canSubmitReview, maySubmitReview,
  pendingReviewQueue, validateReviewDecision,
} from '../../web/assets/assessment-review-model.js';

const maker='11111111-1111-4111-8111-111111111111';
const reviewer='22222222-2222-4222-8222-222222222222';
const draft={id:'draft',owner_user_id:maker,status:'draft'};
const started={id:'started',owner_user_id:maker,status:'in_progress'};
const submitted={id:'submit',owner_user_id:maker,status:'submitted'};
const returned={id:'returned',owner_user_id:maker,status:'changes_requested'};
const approved={id:'approved',owner_user_id:maker,status:'approved'};
const write=['assessments:read','assessments:write'];
const approve=['assessments:read','assessments:approve'];
const catalog={id:'catalog-id'};
const full=[{revision:1},{revision:2},{revision:1}];

test('maker hanya bisa mengajukan hasil lengkap pada status tepat',()=>{
  assert.equal(maySubmitReview(started,maker,write,catalog),true);
  assert.equal(canSubmitReview(started,maker,write,catalog,full),true);
  assert.equal(canSubmitReview(returned,maker,write,catalog,full),true);
  assert.equal(canSubmitReview(started,maker,write,catalog,[...full,{revision:0}]),false);
  assert.equal(canSubmitReview(started,maker,write,catalog,[]),false);
  assert.equal(canSubmitReview(started,maker,write,catalog,null),false);
  assert.equal(canSubmitReview(draft,maker,write,catalog,full),false);
  assert.equal(canSubmitReview(submitted,maker,write,catalog,full),false);
  assert.equal(canSubmitReview(approved,maker,write,catalog,full),false);
  assert.equal(canSubmitReview(started,maker,write,null,full),false);
  assert.equal(canSubmitReview(started,reviewer,write,catalog,full),false);
  assert.equal(canSubmitReview(started,maker,['assessments:read'],catalog,full),false);
});

test('reviewer wajib berbeda dari maker dan punya izin approve',()=>{
  assert.equal(canDecideReview(submitted,reviewer,approve),true);
  assert.equal(canDecideReview(submitted,maker,approve),false);
  assert.equal(canDecideReview(submitted,reviewer,write),false);
  assert.equal(canDecideReview(submitted,reviewer,['users:manage','assessments:read']),false);
  assert.equal(canDecideReview(started,reviewer,approve),false);
  assert.equal(canDecideReview(returned,reviewer,approve),false);
  assert.equal(canDecideReview(approved,reviewer,approve),false);
  assert.equal(canDecideReview(submitted,'',approve),false);
  assert.equal(canDecideReview(null,reviewer,approve),false);
});

test('antrean dari API mengecualikan asesmen sendiri',()=>{
  const list=[submitted,{...submitted,id:'self',owner_user_id:reviewer},
    {...submitted,id:'other'},started,draft,approved,returned,null];
  assert.deepEqual(pendingReviewQueue(list,reviewer,approve).map(x=>x.id),['submit','other']);
  assert.deepEqual(pendingReviewQueue(list,reviewer,write),[]);
  assert.deepEqual(pendingReviewQueue([],reviewer,approve),[]);
  assert.deepEqual(pendingReviewQueue(null,reviewer,approve),[]);
});

test('keputusan kembalikan mensyaratkan alasan yang cukup',()=>{
  assert.equal(validateReviewDecision({decision:'approve',note:''}),null);
  assert.equal(validateReviewDecision({decision:'approve',note:'Pemeriksaan selesai.'}),null);
  assert.equal(validateReviewDecision({decision:'request_changes',note:'Dokumen perlu perbaikan.'}),null);
  for(const bad of [
    {decision:'request_changes',note:''},
    {decision:'request_changes',note:'singkat'},
    {decision:'cancel',note:'Pengembalian bukan status'},
    {decision:'approve',note:'x'.repeat(2001)},
    {decision:'approve',note:'\u0000'},
    {decision:'approve',note:123},
  ])assert.ok(validateReviewDecision(bad));
  assert.equal(REVIEW_ACTION_LABELS.APPROVED,'Disetujui');
});
