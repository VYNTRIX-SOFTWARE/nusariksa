import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ReviewError, validateDecision, submitAssessmentInTransaction,
} from '../src/assessment-reviews.js';

test('keputusan review dan alasan pengembalian divalidasi', () => {
  assert.deepEqual(validateDecision({ decision: 'approve', note: '' }), {
    decision: 'approve', note: '',
  });
  assert.deepEqual(validateDecision({
    decision: 'request_changes', note: 'Harap perbaiki penilaian.',
  }), { decision: 'request_changes', note: 'Harap perbaiki penilaian.' });
  for (const value of [
    { decision: 'reject', note: 'Tidak sesuai' },
    { decision: 'request_changes', note: '' },
    { decision: 'request_changes', note: 'singkat' },
    { decision: 'approve', note: 'x'.repeat(2001) },
    { decision: 'approve', note: 22 },
    { decision: 'approve', note: '\u0000' },
  ]) {
    assert.throws(() => validateDecision(value),
      (e) => e instanceof ReviewError && e.status === 400);
  }
});

test('ID pengajuan tidak valid ditolak tanpa query', async () => {
  const db = { query() { throw new Error('Unexpected query'); } };
  await assert.rejects(submitAssessmentInTransaction(db, {
    actorId: '00000000-0000-4000-8000-000000000001',
    assessmentId: 'not-an-id',
  }), (e) => e instanceof ReviewError && e.status === 400);
});
