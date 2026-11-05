import assert from 'node:assert/strict';
import {test} from 'node:test';
import {MaturityError} from '../src/maturity-models.js';
import {
  validateMaturityAssessment,validateMaturityRating,calculateMaturitySummary,
  setMaturityPolicyInTransaction,rateMaturityDomainInTransaction,
} from '../src/maturity-assessments.js';

const id='11111111-1111-4111-8111-111111111111';
const note='Prosedur dan bukti telah diperiksa oleh assessor internal.';

test('perhitungan maturitas konservatif dengan metode yang tersimpan',()=>{
  const data=[{level:1},{level:3},{level:4}];
  const min=calculateMaturitySummary(data,'minimum');
  assert.equal(min.overallLevel,1);
  assert.equal(min.complete,true);
  assert.equal(min.totalDomains,3);
  assert.equal(min.method,'minimum');
  assert.equal(min.note.includes('OJK'),true);
  const mean=calculateMaturitySummary(data,'mean_floor');
  assert.equal(mean.overallLevel,2);
  assert.equal(mean.assessedDomains,3);
  assert.equal(calculateMaturitySummary([{level:0},{level:5}], 'mean_floor').overallLevel,2);
  assert.equal(calculateMaturitySummary([{level:0},{level:5}], 'minimum').overallLevel,0);
});
test('tidak menghasilkan tingkat agregat bila satu domain belum dinilai',()=>{
  const incomplete=calculateMaturitySummary([{level:2},{level:null}],'mean_floor');
  assert.deepEqual({
    complete:incomplete.complete,overallLevel:incomplete.overallLevel,
    assessedDomains:incomplete.assessedDomains,unassessedDomains:incomplete.unassessedDomains,
  },{complete:false,overallLevel:null,assessedDomains:1,unassessedDomains:1});
  assert.equal(calculateMaturitySummary([], 'minimum').overallLevel,null);
  assert.throws(()=>calculateMaturitySummary([{level:6}],'minimum'),MaturityError);
  assert.throws(()=>calculateMaturitySummary([{level:2}],'weighted'),MaturityError);
  assert.throws(()=>calculateMaturitySummary(null,'minimum'),MaturityError);
});
test('penilaian memerlukan kriteria, justifikasi, dan revision counter',()=>{
  const good={level:3,justification:note,evidenceId:null,expectedRevision:0};
  assert.deepEqual(validateMaturityRating(good),good);
  for(const data of [
    {...good,level:6},{...good,level:'3'},
    {...good,expectedRevision:-1},{...good,expectedRevision:0.5},
    {...good,justification:'short'},
    {...good,justification:'x'.repeat(2001)},
    {...good,evidenceId:'invalid-id'},
  ])assert.throws(()=>validateMaturityRating(data),e=>e instanceof MaturityError&&e.status===400);
  assert.deepEqual(validateMaturityAssessment({
    modelVersionId:id,title:'Uji maturitas TI',periodStart:'2027-01-01',periodEnd:'2027-12-31',
  }).title,'Uji maturitas TI');
  assert.throws(()=>validateMaturityAssessment({
    modelVersionId:id,title:'Uji maturitas TI',periodStart:'2027-02-30',periodEnd:'2027-12-31',
  }),MaturityError);
});
test('request invalid ditolak sebelum menyentuh database',async()=>{
  const db={query(){throw new Error('unexpected DB access');}};
  await assert.rejects(setMaturityPolicyInTransaction(db,{
    actorId:id,versionId:id,method:'arbitrary',
  }),e=>e.status===400);
  await assert.rejects(rateMaturityDomainInTransaction(db,{
    actorId:id,assessmentId:'bad',domainId:id,
    level:2,justification:note,expectedRevision:0,
  }),e=>e.status===400);
});
