import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AssessmentResultError, validateResult, writeAssessmentResultInTransaction,
} from '../src/assessment-results.js';

test('hasil kontrol dan nomor revisi harus valid', () => {
  const valid = { rating: 'compliant', note: '', expectedRevision: 0 };
  assert.deepEqual(validateResult(valid), valid);
  for (const input of [
    { ...valid, rating: 'not_assessed' },
    { ...valid, rating: 'unknown' },
    { ...valid, note: 'x'.repeat(2001) },
    { ...valid, note: '\u0000' },
    { ...valid, expectedRevision: -1 },
    { ...valid, expectedRevision: 1.5 },
    { ...valid, expectedRevision: '0' },
    { ...valid, rating: 'non_compliant', note: '' },
    { ...valid, rating: 'partially_compliant', note: 'singkat' },
    { ...valid, rating: 'not_applicable', note: 'singkat' },
  ]) {
    assert.throws(() => validateResult(input),
      (error) => error instanceof AssessmentResultError && error.status === 400);
  }
  assert.equal(validateResult({
    rating: 'not_applicable', note: 'Tidak relevan untuk proses ini',
    expectedRevision: 1,
  }).expectedRevision, 1);
});

test('ID tidak valid ditolak sebelum menyentuh database', async () => {
  const db = { query() { throw new Error('Unexpected query'); } };
  // A syntactically valid UUID must reach authorization, not fail ID parsing.
  await assert.rejects(writeAssessmentResultInTransaction(db, {
    actorId: '00000000-0000-4000-8000-000000000001',
    assessmentId: '00000000-0000-4000-8000-000000000002',
    controlId: '00000000-0000-4000-8000-000000000003',
    rating: 'compliant', note: '', expectedRevision: 0,
  }), /Unexpected query/);
  await assert.rejects(writeAssessmentResultInTransaction(db, {
    actorId: '00000000-0000-4000-8000-000000000001',
    assessmentId: 'invalid', controlId: '00000000-0000-4000-8000-000000000002',
    rating: 'compliant', note: '', expectedRevision: 0,
  }), (error) => error instanceof AssessmentResultError && error.status === 400);
});
