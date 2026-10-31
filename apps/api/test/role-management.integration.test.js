import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { applyRoleChangeInTransaction, RoleChangeError } from '../src/role-management.js';

test('hanya admin aktif dapat mengubah peran dan semua perubahan memiliki jejak audit', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Role', 'BPR')");
      const accounts = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('admin-role@example.test', 'active', 'hash-uji'), " +
        "('target-role@example.test', 'active', 'hash-uji'), " +
        "('viewer-role@example.test', 'active', 'hash-uji') RETURNING id, email",
      );
      const byEmail = Object.fromEntries(accounts.rows.map((x) => [x.email, x.id]));
      const adminId = byEmail['admin-role@example.test'];
      const targetId = byEmail['target-role@example.test'];
      const viewerId = byEmail['viewer-role@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')",
        [adminId],
      );
      const grant = { actorId: adminId, targetId, role: 'VIEWER', action: 'GRANT' };
      await assert.rejects(
        applyRoleChangeInTransaction(db, { ...grant, actorId: viewerId }),
        (e) => e instanceof RoleChangeError && e.status === 403,
      );
      await assert.rejects(
        applyRoleChangeInTransaction(db, { ...grant, targetId: adminId }),
        (e) => e.status === 403,
      );
      await assert.rejects(
        applyRoleChangeInTransaction(db, { ...grant, role: 'ROOT' }),
        (e) => e.status === 400,
      );

      const first = await applyRoleChangeInTransaction(db, grant);
      assert.ok(first.eventId);
      await assert.rejects(
        applyRoleChangeInTransaction(db, grant),
        (e) => e.status === 409,
      );
      const storedRole = await db.query(
        "SELECT assigned_by FROM user_roles WHERE user_id = $1 AND role = 'VIEWER'",
        [targetId],
      );
      assert.equal(storedRole.rows[0].assigned_by, adminId);

      const removed = await applyRoleChangeInTransaction(db, { ...grant, action: 'REVOKE' });
      assert.ok(removed.eventId);
      await assert.rejects(
        applyRoleChangeInTransaction(db, { ...grant, action: 'REVOKE' }),
        (e) => e.status === 404,
      );

      const events = await db.query(
        'SELECT actor_user_id, target_user_id, role, action FROM role_change_events ORDER BY id',
      );
      assert.deepEqual(events.rows.map((x) => x.action), ['GRANT', 'REVOKE']);
      for (const row of events.rows) {
        assert.equal(row.actor_user_id, adminId);
        assert.equal(row.target_user_id, targetId);
        assert.equal(row.role, 'VIEWER');
      }
      await db.query('SAVEPOINT immutable_events');
      await assert.rejects(
        db.query("DELETE FROM role_change_events WHERE action = 'GRANT'"),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT immutable_events');
      await db.query('SAVEPOINT immutable_updates');
      await assert.rejects(
        db.query("UPDATE role_change_events SET role = 'AUDITOR' WHERE action = 'GRANT'"),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT immutable_updates');
      await db.query('SAVEPOINT immutable_truncate');
      await assert.rejects(db.query('TRUNCATE role_change_events'), (e) => e.code === 'P0001');
      await db.query('ROLLBACK TO SAVEPOINT immutable_truncate');
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});

test('peran admin dapat dicabut oleh admin lain tanpa memberikan akses ke akun nonaktif', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Admin', 'BPR')");
      const accounts = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('admin1@example.test', 'active', 'hash-uji'), " +
        "('admin2@example.test', 'active', 'hash-uji'), " +
        "('inactive@example.test', 'disabled', 'hash-uji') RETURNING id, email",
      );
      const byEmail = Object.fromEntries(accounts.rows.map((x) => [x.email, x.id]));
      const admin1 = byEmail['admin1@example.test'];
      const admin2 = byEmail['admin2@example.test'];
      const inactive = byEmail['inactive@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN'), ($2, 'SUPER_ADMIN')",
        [admin1, admin2],
      );
      await assert.rejects(
        applyRoleChangeInTransaction(db, {
          actorId: admin1, targetId: inactive, role: 'VIEWER', action: 'GRANT',
        }),
        (e) => e.status === 409,
      );
      const revoked = await applyRoleChangeInTransaction(db, {
        actorId: admin1, targetId: admin2, role: 'SUPER_ADMIN', action: 'REVOKE',
      });
      assert.ok(revoked.eventId);
      await assert.rejects(
        applyRoleChangeInTransaction(db, {
          actorId: admin2, targetId: admin1, role: 'VIEWER', action: 'GRANT',
        }),
        (e) => e.status === 403,
      );
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
