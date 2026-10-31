import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createServer } from '../src/server.js';
import { createSession } from '../src/sessions.js';

test('role API checks session, role and request origin', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Role HTTP', 'BPR')");
      const accounts = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('role-admin@example.test', 'active', 'hash-uji'), " +
        "('role-viewer@example.test', 'active', 'hash-uji') RETURNING email, id",
      );
      const ids = Object.fromEntries(accounts.rows.map((x) => [x.email, x.id]));
      const admin = ids['role-admin@example.test'];
      const viewer = ids['role-viewer@example.test'];
      await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')", [admin]);
      const adminToken = (await createSession(db, admin)).token;
      const viewerToken = (await createSession(db, viewer)).token;
      const calls = [];
      const server = createServer({
        authDb: db, appOrigin: 'http://127.0.0.1:3000',
        changeRole: async (connection, change) => {
          calls.push(change);
          return { targetId: change.targetId, role: change.role, action: change.action, eventId: '1' };
        },
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = 'http://127.0.0.1:' + server.address().port + '/users/' + viewer + '/roles';
      const send = (token, body, origin = 'http://127.0.0.1:3000', options = {}) =>
        fetch(url, { method: 'PATCH', headers: {
          'Content-Type': 'application/json', Origin: origin,
          ...(token ? { Cookie: '__Host-nusariksa_session=' + token } : {}), ...options,
        }, body });
      try {
        const body = JSON.stringify({ action: 'GRANT', role: 'AUDITOR' });
        assert.equal((await send(null, body)).status, 401);
        assert.equal((await send(viewerToken, body)).status, 403);
        assert.equal((await send(adminToken, body, 'https://evil.example')).status, 403);
        assert.equal((await send(adminToken, '{')).status, 400);
        assert.equal((await send(adminToken, JSON.stringify({ role: 'AUDITOR', action: 'GRANT', extra: true }))).status, 400);
        assert.equal((await send(adminToken, body, 'http://127.0.0.1:3000', { 'Content-Type': 'text/plain' })).status, 415);
        assert.equal((await send(adminToken, 'x'.repeat(2000))).status, 413);
        const success = await send(adminToken, body);
        assert.equal(success.status, 200);
        assert.deepEqual(await success.json(), {
          targetId: viewer, role: 'AUDITOR', action: 'GRANT', eventId: '1',
        });
        assert.deepEqual(calls, [{ actorId: admin, targetId: viewer, role: 'AUDITOR', action: 'GRANT' }]);
        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [admin]);
        assert.equal((await send(adminToken, body)).status, 401);
      } finally {
        server.close();
        await once(server, 'close');
      }
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
