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
  ReviewError, submitAssessmentInTransaction, reviewAssessmentInTransaction,
  listReviewHistory,
} from '../src/assessment-reviews.js';

test('maker–checker menolak penilaian belum lengkap, review sendiri, dan perubahan setelah approval', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank Uji Maker Checker','BPR')");
      const users = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('maker-checker@example.test','active','hash-uji')," +
        "('review-checker@example.test','active','hash-uji')," +
        "('viewer-checker@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(users.rows.map(u => [u.email,u.id]));
      const maker = ids['maker-checker@example.test'];
      const reviewer = ids['review-checker@example.test'];
      const viewer = ids['viewer-checker@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES " +
        "($1,'IT_OFFICER'), ($1,'REVIEWER'), ($2,'REVIEWER'), ($3,'VIEWER')",
        [maker, reviewer, viewer],
      );
      const catalog = await createCatalogInTransaction(db, {
        actorId: maker, code: 'CHECKER2027', title: 'Katalog maker checker',
      });
      const versionId = catalog.currentVersion.id;
      const first = await addControlInTransaction(db, {
        actorId: maker, versionId, code: 'CTRL_01', title: 'Kontrol audit pertama',
      });
      const second = await addControlInTransaction(db, {
        actorId: maker, versionId, code: 'CTRL_02', title: 'Kontrol audit kedua',
      });
      await publishVersionInTransaction(db, { actorId: maker, versionId });
      const assessment = await createAssessmentInTransaction(db, {
        actorId: maker, title: 'Asesmen untuk maker checker',
        periodStart: '2027-01-01', periodEnd: '2027-06-30',
      });
      const id = assessment.id;
      await assignCatalogInTransaction(db, { actorId: maker, assessmentId: id, versionId });
      await startAssessmentInTransaction(db, { actorId: maker, id });
      await assert.rejects(submitAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id,
      }), (e) => e.status === 409);

      const firstRating = await writeAssessmentResultInTransaction(db, {
        actorId: maker, assessmentId: id, controlId: first.id,
        rating: 'non_compliant', note: 'Belum ada pengendalian lengkap.',
        expectedRevision: 0,
      });
      assert.equal(firstRating.revision, 1);
      await assert.rejects(submitAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id,
      }), (e) => e.status === 409);

      await writeAssessmentResultInTransaction(db, {
        actorId: maker, assessmentId: id, controlId: second.id,
        rating: 'compliant', note: '', expectedRevision: 0,
      });
      await assert.rejects(submitAssessmentInTransaction(db, {
        actorId: viewer, assessmentId: id,
      }), (e) => e.status === 403);
      await assert.rejects(reviewAssessmentInTransaction(db, {
        actorId: reviewer, assessmentId: id, decision: 'approve', note: '',
      }), (e) => e.status === 409);

      const submitted = await submitAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id,
      });
      assert.deepEqual(submitted, {
        assessmentId: id, status: 'submitted', submissionCycle: 1,
      });
      await assert.rejects(submitAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id,
      }), (e) => e.status === 409);
      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: maker, assessmentId: id, controlId: first.id,
        rating: 'compliant', note: '', expectedRevision: 1,
      }), (e) => e.status === 409);
      await assert.rejects(reviewAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id, decision: 'approve', note: '',
      }), (e) => e instanceof ReviewError && e.status === 403);
      await assert.rejects(reviewAssessmentInTransaction(db, {
        actorId: viewer, assessmentId: id, decision: 'approve', note: '',
      }), (e) => e.status === 403);

      const returned = await reviewAssessmentInTransaction(db, {
        actorId: reviewer, assessmentId: id, decision: 'request_changes',
        note: 'Perlu perbaikan penjelasan pengendalian.',
      });
      assert.equal(returned.status, 'changes_requested');
      await assert.rejects(reviewAssessmentInTransaction(db, {
        actorId: reviewer, assessmentId: id, decision: 'approve', note: '',
      }), (e) => e.status === 409);
      const revised = await writeAssessmentResultInTransaction(db, {
        actorId: maker, assessmentId: id, controlId: first.id,
        rating: 'compliant', note: 'Dokumen pengendalian sudah lengkap.',
        expectedRevision: 1,
      });
      assert.equal(revised.revision, 2);

      const resubmitted = await submitAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id,
      });
      assert.equal(resubmitted.submissionCycle, 2);
      const approved = await reviewAssessmentInTransaction(db, {
        actorId: reviewer, assessmentId: id, decision: 'approve', note: '',
      });
      assert.equal(approved.status, 'approved');
      assert.equal(approved.submissionCycle, 2);

      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: maker, assessmentId: id, controlId: first.id,
        rating: 'non_compliant', note: 'Coba mengubah hasil disetujui.',
        expectedRevision: 2,
      }), (e) => e.status === 409);
      await assert.rejects(submitAssessmentInTransaction(db, {
        actorId: maker, assessmentId: id,
      }), (e) => e.status === 409);
      const history = await listReviewHistory(db, viewer, id);
      assert.equal(history.status, 'approved');
      assert.equal(history.submissionCycle, 2);
      assert.deepEqual(history.events.map(e => [e.action,e.submission_cycle]), [
        ['APPROVED',2], ['SUBMITTED',2], ['CHANGES_REQUESTED',1], ['SUBMITTED',1],
      ]);
      assert.equal(history.events[0].actor_user_id, reviewer);
      await db.query('SAVEPOINT protected_history');
      await assert.rejects(
        db.query("DELETE FROM assessment_review_events WHERE assessment_id = $1", [id]),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT protected_history');
      await db.query('SAVEPOINT protected_result');
      await assert.rejects(
        db.query(
          "UPDATE assessment_control_results SET rating = 'non_compliant', " +
          "note = 'Mengubah hasil yang disetujui', revision = revision + 1 WHERE assessment_id = $1",
          [id],
        ),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT protected_result');
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
