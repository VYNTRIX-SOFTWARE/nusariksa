import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createAssessmentInTransaction, startAssessmentInTransaction } from '../src/assessments.js';
import {
  createCatalogInTransaction, addControlInTransaction, publishVersionInTransaction,
  assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import { writeAssessmentResultInTransaction } from '../src/assessment-results.js';
import {
  submitAssessmentInTransaction, reviewAssessmentInTransaction,
} from '../src/assessment-reviews.js';
import {
  buildAssessmentReportInTransaction, ReportError,
} from '../src/assessment-reports.js';

test('laporan membedakan preview dari persetujuan akhir dan menampilkan data aktual', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank Laporan Uji','BPR')");
      const people = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('author-report@example.test','active','hash-uji')," +
        "('checker-report@example.test','active','hash-uji')," +
        "('viewer-report@example.test','active','hash-uji')," +
        "('none-report@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(people.rows.map(row => [row.email,row.id]));
      const author = ids['author-report@example.test'];
      const checker = ids['checker-report@example.test'];
      const viewer = ids['viewer-report@example.test'];
      const noRole = ids['none-report@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER')," +
        "($2,'REVIEWER'),($3,'VIEWER')",
        [author, checker, viewer],
      );
      const assessment = await createAssessmentInTransaction(db, {
        actorId: author, title: 'Laporan uji teknologi informasi',
        periodStart: '2027-01-01', periodEnd: '2027-06-30',
      });
      const id = assessment.id;
      const draft = await buildAssessmentReportInTransaction(db, {
        actorId: viewer, assessmentId: id,
      });
      assert.equal(draft.final, false);
      assert.equal(draft.assessment.status, 'draft');
      assert.equal(draft.catalog, null);
      assert.deepEqual(draft.controls, []);
      assert.deepEqual(draft.summary, {
        total: 0, assessed: 0, notAssessed: 0, completionPercent: 0,
        ratings: { compliant: 0, partially_compliant: 0,
          non_compliant: 0, not_applicable: 0 },
      });
      assert.equal(draft.institution.name, 'Bank Laporan Uji');
      assert.equal(draft.latestReviewDecision, null);
      assert.equal(draft.note.includes('bukan bukti kepatuhan'), true);
      await assert.rejects(buildAssessmentReportInTransaction(db, {
        actorId: noRole, assessmentId: id,
      }), (e) => e instanceof ReportError && e.status === 403);

      const catalog = await createCatalogInTransaction(db, {
        actorId: author, code: 'REPORT27', title: 'Katalog laporan uji',
      });
      const versionId = catalog.currentVersion.id;
      const first = await addControlInTransaction(db, {
        actorId: author, versionId, code: 'REP_01',
        title: 'Kontrol dokumen TI',
        sourceDocument: 'Standar internal', sourceSection: 'Bagian 2',
      });
      const second = await addControlInTransaction(db, {
        actorId: author, versionId, code: 'REP_02',
        title: 'Kontrol pengelolaan risiko TI',
      });
      await publishVersionInTransaction(db, { actorId: author, versionId });
      await assignCatalogInTransaction(db, { actorId: author, assessmentId: id, versionId });
      await startAssessmentInTransaction(db, { actorId: author, id });

      let report = await buildAssessmentReportInTransaction(db, {
        actorId: viewer, assessmentId: id,
      });
      assert.equal(report.final, false);
      assert.equal(report.catalog.versionId, versionId);
      assert.equal(report.catalog.code, 'REPORT27');
      assert.equal(report.controls[0].control_code, 'REP_01');
      assert.equal(report.controls[0].source_document, 'Standar internal');
      assert.equal(report.summary.total, 2);
      assert.equal(report.summary.notAssessed, 2);

      await writeAssessmentResultInTransaction(db, {
        actorId: author, assessmentId: id, controlId: first.id,
        rating: 'partially_compliant', note: 'Bukti uji perlu dilengkapi.',
        expectedRevision: 0,
      });
      report = await buildAssessmentReportInTransaction(db, {
        actorId: checker, assessmentId: id,
      });
      assert.equal(report.summary.completionPercent, 50);
      assert.equal(report.summary.ratings.partially_compliant, 1);
      assert.equal(report.summary.notAssessed, 1);
      await writeAssessmentResultInTransaction(db, {
        actorId: author, assessmentId: id, controlId: second.id,
        rating: 'not_applicable', note: 'Kondisi sistem tidak relevan.',
        expectedRevision: 0,
      });
      await submitAssessmentInTransaction(db, { actorId: author, assessmentId: id });
      await reviewAssessmentInTransaction(db, {
        actorId: checker, assessmentId: id, decision: 'request_changes',
        note: 'Tinjau ulang kelengkapan dokumentasi.',
      });
      await writeAssessmentResultInTransaction(db, {
        actorId: author, assessmentId: id, controlId: first.id,
        rating: 'compliant', note: 'Pemeriksaan ulang selesai.',
        expectedRevision: 1,
      });
      await submitAssessmentInTransaction(db, { actorId: author, assessmentId: id });
      await reviewAssessmentInTransaction(db, {
        actorId: checker, assessmentId: id, decision: 'approve', note: 'Hasil sesuai.',
      });
      const finished = await buildAssessmentReportInTransaction(db, {
        actorId: viewer, assessmentId: id,
      });
      assert.equal(finished.final, true);
      assert.equal(finished.assessment.status, 'approved');
      assert.equal(finished.assessment.submissionCycle, 2);
      assert.equal(finished.summary.assessed, 2);
      assert.equal(finished.summary.notAssessed, 0);
      assert.equal(finished.summary.completionPercent, 100);
      assert.equal(finished.summary.ratings.compliant, 1);
      assert.equal(finished.summary.ratings.not_applicable, 1);
      assert.equal(finished.controls[0].revision, 2);
      assert.equal(finished.controls[0].note, 'Pemeriksaan ulang selesai.');
      assert.equal(finished.latestReviewDecision.action, 'APPROVED');
      assert.equal(finished.latestReviewDecision.actor_user_id, checker);
      assert.equal(finished.latestReviewDecision.submission_cycle, 2);
      assert.equal(finished.reportType, 'internal_assessment');
      assert.ok(!('complianceScore' in finished));

      await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [viewer]);
      await assert.rejects(buildAssessmentReportInTransaction(db, {
        actorId: viewer, assessmentId: id,
      }), (e) => e.status === 403);
      await assert.rejects(buildAssessmentReportInTransaction(db, {
        actorId: author, assessmentId: '11111111-1111-4111-8111-111111111111',
      }), (e) => e.status === 404);
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
