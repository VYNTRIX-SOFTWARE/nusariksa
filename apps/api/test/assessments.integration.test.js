import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import {
  AssessmentError, createAssessmentInTransaction, getAssessment, listAssessments,
  startAssessmentInTransaction,
} from '../src/assessments.js';

test('asesmen mencatat periode, pemilik, dan perubahan status secara aman', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Asesmen', 'BPR')");
      const users = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('owner-assessment@example.test','active','hash-uji'), " +
        "('review-assessment@example.test','active','hash-uji'), " +
        "('other-assessment@example.test','active','hash-uji'), " +
        "('inactive-assessment@example.test','disabled','hash-uji') RETURNING id, email",
      );
      const ids = Object.fromEntries(users.rows.map((row) => [row.email, row.id]));
      const owner = ids['owner-assessment@example.test'];
      const reviewer = ids['review-assessment@example.test'];
      const other = ids['other-assessment@example.test'];
      const inactive = ids['inactive-assessment@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1,'IT_OFFICER'), " +
        "($2,'REVIEWER'), ($3,'COMPLIANCE_OFFICER'), ($4,'IT_OFFICER')",
        [owner, reviewer, other, inactive],
      );

      const input = {
        title: 'Asesmen TI Semester I 2027',
        periodStart: '2027-01-01',
        periodEnd: '2027-06-30',
      };
      await assert.rejects(
        createAssessmentInTransaction(db, { actorId: reviewer, ...input }),
        (error) => error instanceof AssessmentError && error.status === 403,
      );
      await assert.rejects(
        createAssessmentInTransaction(db, { actorId: inactive, ...input }),
        (error) => error.status === 403,
      );

      const created = await createAssessmentInTransaction(db, { actorId: owner, ...input });
      assert.equal(created.status, 'draft');
      assert.equal(created.title, input.title);
      assert.equal(created.period_start, input.periodStart);
      assert.equal(created.period_end, input.periodEnd);
      assert.equal(created.owner_user_id, owner);
      assert.equal(created.started_at, null);

      const asReviewer = await getAssessment(db, reviewer, created.id);
      assert.equal(asReviewer.id, created.id);
      assert.equal((await listAssessments(db, reviewer)).assessments.length, 1);
      await assert.rejects(
        startAssessmentInTransaction(db, { actorId: reviewer, id: created.id }),
        (error) => error.status === 403,
      );
      await assert.rejects(
        startAssessmentInTransaction(db, { actorId: other, id: created.id }),
        (error) => error.status === 403,
      );
      await assert.rejects(
        getAssessment(db, owner, 'invalid-id'),
        (error) => error.status === 400,
      );
      await assert.rejects(
        getAssessment(db, owner, '11111111-1111-4111-8111-111111111111'),
        (error) => error.status === 404,
      );

      const started = await startAssessmentInTransaction(db, { actorId: owner, id: created.id });
      assert.equal(started.status, 'in_progress');
      assert.ok(started.started_at);
      await assert.rejects(
        startAssessmentInTransaction(db, { actorId: owner, id: created.id }),
        (error) => error.status === 409,
      );

      const events = await db.query(
        'SELECT actor_user_id, action FROM assessment_events WHERE assessment_id = $1 ORDER BY id',
        [created.id],
      );
      assert.deepEqual(events.rows, [
        { actor_user_id: owner, action: 'CREATED' },
        { actor_user_id: owner, action: 'STARTED' },
      ]);
      await db.query('SAVEPOINT audit_no_delete');
      await assert.rejects(
        db.query('DELETE FROM assessment_events WHERE assessment_id = $1', [created.id]),
        (error) => error.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT audit_no_delete');
      await db.query('SAVEPOINT invalid_period');
      await assert.rejects(
        db.query("UPDATE assessments SET period_end = '2026-01-01' WHERE id = $1", [created.id]),
        (error) => error.code === '23514',
      );
      await db.query('ROLLBACK TO SAVEPOINT invalid_period');
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
