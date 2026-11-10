import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RATING_LABELS, canWriteAssessment, canAttachCatalog, canStartAssessment,
  canEditResult, combineControls, validateAssessmentDraft, validateRatingDraft,
  nextUnassessedControl, neighborControl,
} from '../../web/assets/assessment-workspace-model.js';

const maker='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const canWrite=['assessments:read','assessments:write'];
const reviewer=['assessments:read','assessments:approve'];
const catalog={id:'version-1',version:1,catalog_code:'CAT2027'};
const draft={owner_user_id:maker,status:'draft'};
const progress={owner_user_id:maker,status:'in_progress'};

test('UI tidak memberi hak tulis hanya karena SUPER_ADMIN atau reviewer dapat membaca',()=>{
  assert.equal(canWriteAssessment(draft,maker,canWrite),true);
  assert.equal(canWriteAssessment(draft,maker,['users:manage','assessments:read']),false);
  assert.equal(canWriteAssessment(draft,maker,reviewer),false);
  assert.equal(canWriteAssessment(draft,other,canWrite),false);
  assert.equal(canWriteAssessment(null,maker,canWrite),false);
  assert.equal(canAttachCatalog(draft,maker,canWrite,null),true);
  assert.equal(canAttachCatalog(draft,maker,canWrite,catalog),false);
  assert.equal(canAttachCatalog(progress,maker,canWrite,null),false);
  assert.equal(canStartAssessment(draft,maker,canWrite,catalog),true);
  assert.equal(canStartAssessment(draft,maker,canWrite,null),false);
  assert.equal(canStartAssessment(draft,other,canWrite,catalog),false);
  assert.equal(canEditResult(progress,maker,canWrite,catalog),true);
  assert.equal(canEditResult({...draft,status:'changes_requested'},maker,canWrite,catalog),true);
  assert.equal(canEditResult({...draft,status:'submitted'},maker,canWrite,catalog),false);
  assert.equal(canEditResult({...draft,status:'approved'},maker,canWrite,catalog),false);
  assert.equal(canEditResult(progress,maker,canWrite,null),false);
  assert.equal(canEditResult(progress,other,canWrite,catalog),false);
});

test('hasil kontrol selalu terikat ke ID kontrol pada katalog yang dipilih',()=>{
  const checklist={controls:[
    {id:'c1',control_code:'SEC_01',title:'Kontrol keamanan',position:1},
    {id:'c2',control_code:'GOV_02',title:'Kontrol tata kelola',position:2},
  ]};
  const results={controls:[
    {control_id:'c1',rating:'non_compliant',note:'Belum selesai',revision:2},
    {control_id:'not-in-this-version',rating:'compliant',note:'',revision:1},
  ]};
  const joined=combineControls(checklist,results);
  assert.equal(joined.length,2);
  assert.equal(joined[0].id,'c1');
  assert.equal(joined[0].revision,2);
  assert.equal(joined[0].rating,'non_compliant');
  assert.equal(joined[1].id,'c2');
  assert.equal(joined[1].rating,'not_assessed');
  assert.equal(joined[1].revision,0);
  assert.equal(joined[1].note,'');
  assert.equal(RATING_LABELS.partially_compliant,'Memenuhi sebagian');
  assert.deepEqual(combineControls(null,null),[]);
});

test('form asesmen menggunakan aturan judul dan kalender backend',()=>{
  const good={title:'Asesmen TI Semester I',periodStart:'2027-01-01',periodEnd:'2027-06-30'};
  assert.equal(validateAssessmentDraft(good),null);
  for(const bad of [
    {...good,title:'  Salah'},
    {...good,title:'A'},
    {...good,title:'x'.repeat(201)},
    {...good,periodStart:'2027-02-29'},
    {...good,periodEnd:'2027-02-30'},
    {...good,periodEnd:'2026-12-31'},
    {...good,periodStart:'2101-01-01',periodEnd:'2101-06-01'},
    {...good,periodStart:'1899-12-31'},
  ])assert.notEqual(validateAssessmentDraft(bad),null);
  assert.equal(validateAssessmentDraft({
    title:'Periode kabisat',periodStart:'2028-02-29',periodEnd:'2028-02-29',
  }),null);
});

test('hasil selain memenuhi wajib memiliki catatan, bukan data bukti palsu',()=>{
  assert.equal(validateRatingDraft({rating:'compliant',note:''}),null);
  assert.equal(validateRatingDraft({rating:'not_applicable',note:'Tidak berlaku untuk asesmen ini'}),null);
  assert.equal(validateRatingDraft({rating:'partially_compliant',note:'Dokumen masih perlu dilengkapi.'}),null);
  assert.ok(validateRatingDraft({rating:'not_assessed',note:''}));
  assert.ok(validateRatingDraft({rating:'non_compliant',note:'singkat'}));
  assert.ok(validateRatingDraft({rating:'compliant',note:'x'.repeat(2001)}));
  assert.ok(validateRatingDraft({rating:'compliant',note:'\u0000'}));
});

test('MVP navigasi mengutamakan kontrol belum dinilai dan mempertahankan urutan stabil',()=>{
  const controls=[
    {id:'a',revision:1},{id:'b',revision:0},
    {id:'c',revision:1},{id:'d',revision:0},
  ];
  assert.equal(nextUnassessedControl(controls,'a'),'b');
  assert.equal(nextUnassessedControl(controls,'b'),'d');
  assert.equal(nextUnassessedControl(controls,'d'),'b');
  assert.equal(nextUnassessedControl(controls,'other'),'b');
  assert.equal(nextUnassessedControl([{id:'a',revision:0}],'a'),null);
  assert.equal(nextUnassessedControl(controls.map(c=>({...c,revision:1})),'a'),null);
  assert.equal(nextUnassessedControl(null,'a'),null);
  assert.equal(neighborControl(controls,'a',1),'b');
  assert.equal(neighborControl(controls,'d',-1),'c');
  assert.equal(neighborControl(controls,'d',1),null);
  assert.equal(neighborControl(controls,'a',-1),null);
  assert.equal(neighborControl(controls,'a',0),null);
});
