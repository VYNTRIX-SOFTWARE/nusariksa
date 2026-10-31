import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { getUserPermissions, userHasPermission } from '../src/authorization.js';

test('peran menerapkan batasan database dan menolak akses secara default', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank RBAC Uji', 'BPR')");
      const { rows } = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES ($1, 'active', $2) RETURNING id",
        ['rbac-user@example.test', 'hash-sintetis-untuk-tes'],
      );
      const userId = rows[0].id;
      assert.deepEqual(await getUserPermissions(db, userId), []);
      assert.equal(await userHasPermission(db, userId, 'users:manage'), false);

      await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, 'VIEWER']);
      assert.equal(await userHasPermission(db, userId, 'assessments:read'), true);
      assert.equal(await userHasPermission(db, userId, 'assessments:write'), false);
      assert.equal(await userHasPermission(db, userId, 'assessments:approve'), false);

      await db.query('SAVEPOINT duplicate_role');
      await assert.rejects(
        db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, 'VIEWER']),
        (error) => error.code === '23505',
      );
      await db.query('ROLLBACK TO SAVEPOINT duplicate_role');

      await db.query('SAVEPOINT invalid_role');
      await assert.rejects(
        db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, 'ROOT']),
        (error) => error.code === '23514',
      );
      await db.query('ROLLBACK TO SAVEPOINT invalid_role');

      await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, 'REVIEWER']);
      assert.equal(await userHasPermission(db, userId, 'assessments:approve'), true);
      assert.equal(await userHasPermission(db, userId, 'users:manage'), false);

      await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [userId]);
      assert.deepEqual(await getUserPermissions(db, userId), []);
      assert.equal(await userHasPermission(db, userId, 'assessments:approve'), false);
      await db.query("UPDATE users SET status = 'active', password_hash = NULL WHERE id = $1", [userId]);
      assert.deepEqual(await getUserPermissions(db, userId), []);
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
