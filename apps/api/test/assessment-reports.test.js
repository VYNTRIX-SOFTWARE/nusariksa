import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAssessmentReportInTransaction, getAssessmentReport,
  ReportError, summarizeControls,
} from '../src/assessment-reports.js';

test('ringkasan menghitung progres dan kategori secara terpisah', () => {
  assert.deepEqual(summarizeControls([]), {
    total: 0, assessed: 0, notAssessed: 0, completionPercent: 0,
    ratings: {
      compliant: 0, partially_compliant: 0, non_compliant: 0, not_applicable: 0,
    },
  });
  const rows = [
    { rating: 'compliant' },
    { rating: 'non_compliant' },
    { rating: 'not_applicable' },
    { rating: 'not_assessed' },
  ];
  assert.deepEqual(summarizeControls(rows), {
    total: 4, assessed: 3, notAssessed: 1, completionPercent: 75,
    ratings: {
      compliant: 1, partially_compliant: 0, non_compliant: 1, not_applicable: 1,
    },
  });
});

test('ID asesmen tidak sah ditolak sebelum query database', async () => {
  const db = { query() { throw new Error('Unexpected database query'); } };
  await assert.rejects(
    buildAssessmentReportInTransaction(db, {
      actorId: '00000000-0000-4000-8000-000000000001',
      assessmentId: 'invalid',
    }),
    (e) => e instanceof ReportError && e.status === 400,
  );
});

test('laporan dibaca lewat transaksi snapshot dan rollback saat gagal', async () => {
  const statements = [];
  let released = false;
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') return {};
      if (sql === 'ROLLBACK') return {};
      throw new Error('Simulated read failure');
    },
    release() { released = true; },
  };
  await assert.rejects(
    getAssessmentReport({ async connect() { return client; } }, {
      actorId: '00000000-0000-4000-8000-000000000001',
      assessmentId: '00000000-0000-4000-8000-000000000002',
    }),
    /Simulated read failure/,
  );
  assert.equal(statements[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.ok(!statements.includes('COMMIT'));
  assert.equal(released, true);
});
