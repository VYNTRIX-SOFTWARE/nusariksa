import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createServer } from '../src/server.js';
import { createSession } from '../src/sessions.js';

const origin = 'http://127.0.0.1:3000';

test('pengelolaan akun HTTP membatasi akses dan memvalidasi permintaan', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji HTTP User', 'BPR')");
      const accounts = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('admin-user-http@example.test', 'active', 'hash-uji'), " +
        "('viewer-user-http@example.test', 'active', 'hash-uji') RETURNING id, email",
      );
      const ids = Object.fromEntries(accounts.rows.map((x) => [x.email, x.id]));
      const adminId = ids['admin-user-http@example.test'];
      const viewerId = ids['viewer-user-http@example.test'];
      await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')", [adminId]);
      const adminToken = (await createSession(db, adminId)).token;
      const viewerToken = (await createSession(db, viewerId)).token;
      const calls = [];
      const server = createServer({
        authDb: db, appOrigin: origin,
        createUser: async (connection, change) => {
          calls.push({ type: 'create', ...change });
          return { userId: viewerId, invitationToken: 'a'.repeat(43) };
        },
        disableUser: async (connection, change) => {
          calls.push({ type: 'disable', ...change });
          return { userId: viewerId, status: 'disabled' };
        },
        activateUser: async (connection, change) => {
          calls.push({ type: 'activate', ...change });
          return { activated: true };
        },
        listUsers: async () => ({ users: [{ id: viewerId, email: 'viewer-user-http@example.test' }] }),
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const cookie = (token) => ({ Cookie: '__Host-nusariksa_session=' + token });
      const send = (route, method, body, headers = {}) => fetch(base + route, {
        method,
        headers: {
          'Content-Type': 'application/json', Origin: origin, ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      try {
        assert.equal((await send('/users', 'POST', { email: 'test@example.test' })).status, 401);
        assert.equal((await send('/users', 'POST', { email: 'test@example.test' }, cookie(viewerToken))).status, 403);
        assert.equal((await send('/users', 'POST', { email: 'test@example.test' }, {
          ...cookie(adminToken), Origin: 'https://malicious.example',
        })).status, 403);
        assert.equal((await send('/users', 'POST', { email: 'test@example.test', admin: true }, cookie(adminToken))).status, 400);
        assert.equal((await send('/users', 'POST', { email: 'x'.repeat(2500) }, cookie(adminToken))).status, 413);
        assert.equal((await send('/users', 'POST', { email: 'test@example.test' }, {
          ...cookie(adminToken), 'Content-Type': 'text/plain',
        })).status, 415);

        assert.equal((await send('/users', 'POST', { email: 'test@example.test' }, cookie(adminToken))).status, 201);
        const listing = await send('/users', 'GET', undefined, cookie(adminToken));
        assert.equal(listing.status, 200);
        assert.equal((await listing.json()).users[0].id, viewerId);
        assert.equal((await send('/users', 'GET', undefined, cookie(viewerToken))).status, 403);

        const disable = await send('/users/' + viewerId + '/disable', 'POST', undefined, cookie(adminToken));
        assert.equal(disable.status, 200);
        assert.equal((await disable.json()).status, 'disabled');
        assert.equal((await send('/users/not-an-id/disable', 'POST', undefined, cookie(adminToken))).status, 404);
        assert.equal((await send('/auth/activate', 'POST', { token: 'x', password: 'abcdefghijkl' }, {
          Origin: 'https://malicious.example',
        })).status, 403);
        assert.equal((await send('/auth/activate', 'POST', { token: 'x', password: 'abcdefghijkl' })).status, 200);
        assert.deepEqual(calls, [
          { type: 'create', actorId: adminId, email: 'test@example.test' },
          { type: 'disable', actorId: adminId, targetId: viewerId },
          { type: 'activate', token: 'x', password: 'abcdefghijkl' },
        ]);
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

test('endpoint akun tidak diaktifkan tanpa konfigurasi database', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const result = await fetch('http://127.0.0.1:' + server.address().port + '/users', {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.test' }),
    });
    assert.equal(result.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
