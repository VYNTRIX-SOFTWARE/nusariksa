import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createAssessmentInTransaction, startAssessmentInTransaction } from '../src/assessments.js';
import {
  createCatalogInTransaction, addControlInTransaction, publishVersionInTransaction,
  assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import {
  AssessmentResultError, listAssessmentResults,
  writeAssessmentResultInTransaction, resultHistory,
} from '../src/assessment-results.js';

test('hasil kontrol memiliki revisi, audit otomatis, dan batas katalog', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Hasil Asesmen','BPR')");
      const users = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('owner-result@example.test','active','hash-uji')," +
        "('reviewer-result@example.test','active','hash-uji')," +
        "('writer-result@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(users.rows.map((row) => [row.email, row.id]));
      const owner = ids['owner-result@example.test'];
      const reviewer = ids['reviewer-result@example.test'];
      const another = ids['writer-result@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES " +
        "($1,'IT_OFFICER'),($2,'REVIEWER'),($3,'COMPLIANCE_OFFICER')",
        [owner, reviewer, another],
      );
      const catalog = await createCatalogInTransaction(db, {
        actorId: owner, code: 'ASSESS-2027', title: 'Kontrol hasil pengujian',
      });
      const v1 = catalog.currentVersion.id;
      const one = await addControlInTransaction(db, {
        actorId: owner, versionId: v1, code: 'CTRL_01',
        title: 'Pemeriksaan kontrol pertama',
      });
      const two = await addControlInTransaction(db, {
        actorId: owner, versionId: v1, code: 'CTRL_02',
        title: 'Pemeriksaan kontrol kedua',
      });
      await publishVersionInTransaction(db, { actorId: owner, versionId: v1 });

      const assessment = await createAssessmentInTransaction(db, {
        actorId: owner, title: 'Asesmen hasil tahun 2027',
        periodStart: '2027-01-01', periodEnd: '2027-12-31',
      });
      const withoutCatalog = await listAssessmentResults(db, reviewer, assessment.id);
      assert.deepEqual(withoutCatalog.summary, { total: 0, assessed: 0, notAssessed: 0 });
      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: owner, assessmentId: assessment.id, controlId: one.id,
        rating: 'compliant', note: '', expectedRevision: 0,
      }), (error) => error.status === 409);

      await assignCatalogInTransaction(db, {
        actorId: owner, assessmentId: assessment.id, versionId: v1,
      });
      let summary = await listAssessmentResults(db, reviewer, assessment.id);
      assert.equal(summary.controls.length, 2);
      assert.deepEqual(summary.summary, { total: 2, assessed: 0, notAssessed: 2 });
      assert.equal(summary.controls[0].rating, 'not_assessed');
      assert.equal(summary.controls[0].revision, 0);

      await startAssessmentInTransaction(db, { actorId: owner, id: assessment.id });
      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: reviewer, assessmentId: assessment.id, controlId: one.id,
        rating: 'compliant', note: '', expectedRevision: 0,
      }), (error) => error.status === 403);
      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: another, assessmentId: assessment.id, controlId: one.id,
        rating: 'compliant', note: '', expectedRevision: 0,
      }), (error) => error.status === 403);
      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: owner, assessmentId: assessment.id,
        controlId: '11111111-1111-4111-8111-111111111111',
        rating: 'compliant', note: '', expectedRevision: 0,
      }), (error) => error.status === 404);

      const first = await writeAssessmentResultInTransaction(db, {
        actorId: owner, assessmentId: assessment.id, controlId: one.id,
        rating: 'partially_compliant', note: 'Dokumentasi belum lengkap.',
        expectedRevision: 0,
      });
      assert.equal(first.revision, 1);
      assert.equal(first.rating, 'partially_compliant');

      await assert.rejects(writeAssessmentResultInTransaction(db, {
        actorId: owner, assessmentId: assessment.id, controlId: one.id,
        rating: 'compliant', note: '', expectedRevision: 0,
      }), (error) => error instanceof AssessmentResultError && error.status === 409);

      const second = await writeAssessmentResultInTransaction(db, {
        actorId: owner, assessmentId: assessment.id, controlId: one.id,
        rating: 'compliant', note: 'Sudah ditindaklanjuti.', expectedRevision: 1,
      });
      assert.equal(second.revision, 2);
      const history = await resultHistory(db, reviewer, assessment.id, one.id);
      assert.deepEqual(history.history.map((row) => row.revision), [2, 1]);
      assert.deepEqual(history.history.map((row) => row.rating),
        ['compliant', 'partially_compliant']);
      assert.ok(history.history.every((row) => row.actor_user_id === owner));

      summary = await listAssessmentResults(db, reviewer, assessment.id);
      assert.deepEqual(summary.summary, { total: 2, assessed: 1, notAssessed: 1 });
      assert.equal(summary.controls[0].revision, 2);
      assert.equal(summary.controls[1].control_code, 'CTRL_02');

      await db.query('SAVEPOINT changed_audit');
      await assert.rejects(db.query(
        "UPDATE assessment_control_result_events SET note = 'dimanipulasi' " +
        'WHERE assessment_id = $1 AND control_id = $2',
        [assessment.id, one.id],
      ), (error) => error.code === 'P0001');
      await db.query('ROLLBACK TO SAVEPOINT changed_audit');

      await db.query('SAVEPOINT changed_fk');
      await assert.rejects(db.query(
        'UPDATE assessment_control_results SET revision = 99 ' +
        'WHERE assessment_id = $1 AND control_id = $2',
        [assessment.id, one.id],
      ), (error) => error.code === 'P0001');
      await db.query('ROLLBACK TO SAVEPOINT changed_fk');

      await db.query('SAVEPOINT mismatched_version');
      await assert.rejects(db.query(
        'INSERT INTO assessment_control_results ' +
        '(assessment_id, catalog_version_id, control_id, rating, updated_by) ' +
        "VALUES ($1,$2,$3,'compliant',$4)",
        [assessment.id, '11111111-1111-4111-8111-111111111111', two.id, owner],
      ), (error) => error.code === '23503');
      await db.query('ROLLBACK TO SAVEPOINT mismatched_version');
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
