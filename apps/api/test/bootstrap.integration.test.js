import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { initializeInstitutionInTransaction, bootstrapInstitution } from '../src/bootstrap.js';
import { verifyPassword } from '../src/passwords.js';

const setup = {
  institutionName: 'BPR Pengujian Awal', institutionKind: 'BPR',
  email: 'Admin@Example.test', password: 'Password-admin-test-2026',
};

test('first administrator and institution are created atomically', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await initializeInstitutionInTransaction(client, setup);
      assert.equal(created.email, 'admin@example.test');
      const user = await client.query('SELECT status, password_hash FROM users WHERE id = $1', [created.userId]);
      assert.equal(user.rows[0].status, 'active');
      assert.equal(await verifyPassword(setup.password, user.rows[0].password_hash), true);
      const role = await client.query(
        "SELECT role, assigned_by FROM user_roles WHERE user_id = $1",
        [created.userId],
      );
      assert.deepEqual(role.rows, [{ role: 'SUPER_ADMIN', assigned_by: created.userId }]);
      const events = await client.query(
        'SELECT actor_user_id, target_user_id, role, action, source FROM role_change_events',
      );
      assert.equal(events.rowCount, 1);
      assert.deepEqual(events.rows[0], {
        actor_user_id: created.userId, target_user_id: created.userId,
        role: 'SUPER_ADMIN', action: 'GRANT', source: 'BOOTSTRAP',
      });
      await assert.rejects(
        initializeInstitutionInTransaction(client, setup),
        /already been completed or database is not empty/,
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});

test('initial setup rejects weak passwords and invalid institution names', async () => {
  const fakePool = { async connect() { throw new Error('Database must not be accessed'); } };
  await assert.rejects(bootstrapInstitution(fakePool, { ...setup, password: '123' }), /Invalid initial setup/);
  await assert.rejects(bootstrapInstitution(fakePool, { ...setup, institutionName: '' }), /Invalid initial setup/);
  await assert.rejects(bootstrapInstitution(fakePool, { ...setup, institutionKind: 'UNKNOWN' }), /Invalid initial setup/);
});
