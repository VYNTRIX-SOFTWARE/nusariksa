import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createServer} from '../src/server.js';
import {validatePreparationInput,validatePreparationResponse,validatePadkReviewQueue,
  suggestPadkAnnualPreparation,suggestPadkTitleFromEnd}
  from '../../web/assets/padk-preparation-ui.js';

test('PADK preparation page and module are served with CSP',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const home=await fetch(base+'/');
    assert.equal(home.status,200);
    assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await home.text();
    for(const id of [
      'page-padk-preparations','padk-preparations-menu',
      'first-run-card','first-run-action','pdk-first-run','pdk-empty-start',
      'admin-setup-menu','page-admin-onboarding','admin-invite-form',
      'admin-invite-email','admin-invite-result','admin-invite-token',
      'admin-users-list','admin-users-refresh','activation-open',
      'activation-form','activation-token','activation-password',
      'activation-confirm','activation-success',
      'pdk-create-toggle','pdk-create-form','pdk-title','pdk-category',
      'pdk-title-suggest','pdk-category-help','pdk-period-help',
      'pdk-period-start','pdk-period-end','pdk-list','pdk-detail',
      'pdk-note-form','pdk-notes','pdk-evidence-plan','pdk-save','pdk-history',
      'pdk-evidence-panel','pdk-evidence-upload','pdk-evidence-file',
      'pdk-evidence-list','pdk-evidence-message',
      'pdk-draft-review-panel','pdk-review-submit','pdk-review-state',
      'pdk-review-form','pdk-review-decision','pdk-review-note',
      'pdk-score-preview','pdk-score-status','pdk-score-domains',
      'pdk-score-composite','pdk-score-refresh',
      'pdk-criteria-panel','pdk-criteria-status','pdk-criteria-source',
      'pdk-criteria-list',
      'pdk-indicator-progress','pdk-indicator-prev','pdk-indicator-next',
      'pdk-indicator-search','pdk-indicator-status-filter','pdk-indicator-filter-reset',
      'pdk-indicator-match-count','pdk-guide-rank','pdk-guide-reason',
      'pdk-guide-save','pdk-guide-next','pdk-indicator-reason-counter',
      'pdk-indicator-next-pending','pdk-indicator-position',
      'pdk-indicator-state','pdk-indicator-title','pdk-indicator-save-state',
      'pdk-indicator-save-next','pdk-indicator-ready-hint','pdk-indicator-optional',
      'pdk-jump-review','pdk-review-queue','pdk-review-queue-refresh','pdk-review-queue-list',
    ])assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.match(html,/Belum dapat dinilai atau disahkan/);
    assert.ok(html.indexOf('id="pdk-indicator-section"')<
      html.indexOf('id="pdk-draft-review-panel"'),
      'PADK primary input must precede review and auxiliary sections');
    assert.match(html,/Simpan &amp; lanjut|Simpan & lanjut/);
    assert.doesNotMatch(html,/Fitur pengisian peringkat, review, approval dan PDF final belum diaktifkan/);
    assert.match(html,/aria-label="Lima kriteria peringkat, gulir untuk membaca semuanya"/);
    const module=await fetch(base+'/assets/padk-preparation-ui.js');
    assert.equal(module.status,200);
    assert.match(module.headers.get('content-security-policy'),/script-src 'self'/);
    const adminModule=await fetch(base+'/assets/admin-onboarding-ui.js');
    assert.equal(adminModule.status,200);
    assert.match(adminModule.headers.get('content-type'),/javascript/);
  }finally{server.close();await once(server,'close');}
});
test('PADK prep UI refuses malformed states and invalid category',()=>{
  const input={title:'Penilaian 2026',category:1,
    periodStart:'2026-01-01',periodEnd:'2026-12-31'};
  assert.deepEqual(validatePreparationInput(input),input);
  assert.throws(()=>validatePreparationInput({...input,category:3}));
  assert.throws(()=>validatePreparationResponse({
    id:'11111111-1111-4111-8111-111111111111',
    title:'Penilaian',category:1,revision:1,
    ownerUserId:'22222222-2222-4222-8222-222222222222',
    preparationNotes:'',evidencePlan:'',status:'PREPARATION_ONLY',
    scoringAvailable:true,submissionAvailable:false,finalReportAvailable:false,
  }));
});

test('PADK review queue accepts only scoped submitted-draft metadata',()=>{
  const sample={draftOnly:true,officialApprovalAvailable:false,
    regulatoryPackVerified:false,hasMore:false,drafts:[{
      preparationId:'11111111-1111-4111-8111-111111111111',
      ownerUserId:'22222222-2222-4222-8222-222222222222',
      title:'Asesmen PADK draft',category:2,status:'submitted',submissionCycle:1,
      submittedAt:'2026-11-09T04:00:00Z',
    }]};
  assert.equal(validatePadkReviewQueue(sample).drafts.length,1);
  for(const changed of [
    {...sample,officialApprovalAvailable:true},
    {...sample,draftOnly:false},
    {...sample,drafts:[{...sample.drafts[0],status:'draft_accepted'}]},
    {...sample,drafts:[{...sample.drafts[0],ownerUserId:'invalid'}]},
    {...sample,drafts:[{...sample.drafts[0],submittedAt:'not a date'}]},
    {...sample,drafts:Array(51).fill(sample.drafts[0])},
  ])assert.throws(()=>validatePadkReviewQueue(changed),TypeError);
});

test('saran PADK menggunakan tahun posisi Desember tanpa memilih kategori otomatis',()=>{
  const recommendation=suggestPadkAnnualPreparation(new Date(2026,10,12));
  assert.deepEqual(recommendation,{title:'Penilaian Maturitas Keamanan Siber — 2026',
    periodStart:'2026-01-01',periodEnd:'2026-12-31'});
  assert.equal(suggestPadkTitleFromEnd('2027-12-31'),
    'Penilaian Maturitas Keamanan Siber — 2027');
  assert.throws(()=>suggestPadkTitleFromEnd('next december'),TypeError);
  assert.throws(()=>suggestPadkAnnualPreparation(new Date(NaN)),TypeError);
  assert.deepEqual(validatePreparationInput({...recommendation,category:2}),
    {...recommendation,category:2});
});
