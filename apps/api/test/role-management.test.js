import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRoleChangeInTransaction, changeUserRole, RoleChangeError } from '../src/role-management.js';

test('parameter tidak sah ditolak sebelum mengakses database', async () => {
  const client = { query() { throw new Error('Unexpected query'); } };
  await assert.rejects(
    applyRoleChangeInTransaction(client, {
      actorId: 'not-a-uuid', targetId: 'not-a-uuid', role: 'ROOT', action: 'GRANT',
    }),
    (error) => error instanceof RoleChangeError && error.status === 400,
  );
});

test('kegagalan menyimpan audit membatalkan perubahan peran dalam transaksi', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(statement) {
      queries.push(statement);
      if (statement.startsWith('SELECT 1 FROM users')) return { rowCount: 1, rows: [{}] };
      if (statement.startsWith('SELECT status, password_hash')) {
        return { rowCount: 1, rows: [{ status: 'active', password_hash: 'hash-uji' }] };
      }
      if (statement.startsWith('INSERT INTO user_roles')) return { rowCount: 1, rows: [{}] };
      if (statement.startsWith('INSERT INTO role_change_events')) {
        throw new Error('Audit storage unavailable');
      }
      return { rowCount: 0, rows: [] };
    },
    release() { released = true; },
  };
  const pool = { async connect() { return client; } };
  await assert.rejects(
    changeUserRole(pool, {
      actorId: '00000000-0000-4000-8000-000000000001',
      targetId: '00000000-0000-4000-8000-000000000002',
      role: 'VIEWER',
      action: 'GRANT',
    }),
    /Audit storage unavailable/,
  );
  assert.equal(queries[0], 'BEGIN');
  assert.ok(queries.some((sql) => sql.startsWith('INSERT INTO user_roles')));
  assert.ok(queries.some((sql) => sql.startsWith('INSERT INTO role_change_events')));
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(queries.includes('COMMIT'), false);
  assert.equal(released, true);
});
