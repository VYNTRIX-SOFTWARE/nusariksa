import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssessmentError, validateAssessment, createAssessmentInTransaction } from '../src/assessments.js';

test('periode dan judul asesmen diperiksa sebelum query database', () => {
  const valid = { title: 'Asesmen TI Semester I', periodStart: '2027-01-01', periodEnd: '2027-06-30' };
  assert.deepEqual(validateAssessment(valid), valid);
  for (const invalid of [
    { ...valid, title: '  Salah  ' },
    { ...valid, title: '' },
    { ...valid, title: 'a'.repeat(201) },
    { ...valid, title: 'Teks\nlain' },
    { ...valid, periodStart: '2027-02-29' },
    { ...valid, periodEnd: '2027-02-30' },
    { ...valid, periodEnd: '2026-12-31' },
    { ...valid, periodStart: '2027-1-1' },
    { ...valid, periodStart: '1900-00-01' },
  ]) {
    assert.throws(() => validateAssessment(invalid), (error) =>
      error instanceof AssessmentError && error.status === 400);
  }
  assert.equal(validateAssessment({
    title: 'Periode Kabisat', periodStart: '2028-02-29', periodEnd: '2028-02-29',
  }).periodStart, '2028-02-29');
});

test('pembuatan dengan tanggal invalid tidak menyentuh database', async () => {
  const db = { query() { throw new Error('Unexpected query'); } };
  await assert.rejects(createAssessmentInTransaction(db, {
    actorId: '00000000-0000-4000-8000-000000000001',
    title: 'Asesmen Uji', periodStart: '2027-02-30', periodEnd: '2027-04-01',
  }), (error) => error instanceof AssessmentError && error.status === 400);
});
