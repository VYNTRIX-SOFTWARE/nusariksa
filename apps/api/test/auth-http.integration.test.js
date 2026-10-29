import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { hashPassword } from '../src/passwords.js';
import { createServer } from '../src/server.js';

const origin = 'http://127.0.0.1:3000';

test('login, pemeriksaan sesi, logout, dan penolakan request tidak aman', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji HTTP', 'BPR')");
      await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES ($1, 'active', $2)",
        ['login-http@example.test', await hashPassword('Password-login-aman')],
      );
      const server = createServer({ authDb: db, appOrigin: origin });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = 'http://127.0.0.1:' + server.address().port;
      const loginBody = JSON.stringify({
        email: 'login-http@example.test',
        password: 'Password-login-aman',
      });
      const requestLogin = (body, headers = {}) => fetch(url + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
        body,
      });

      try {
        const deniedOrigin = await requestLogin(loginBody, { Origin: 'https://attacker.example' });
        assert.equal(deniedOrigin.status, 403);

        const malformed = await requestLogin('{');
        assert.equal(malformed.status, 400);

        const wrong = await requestLogin(JSON.stringify({
          email: 'login-http@example.test', password: 'salah',
        }));
        assert.equal(wrong.status, 401);

        const login = await requestLogin(loginBody);
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie');
        assert.match(cookie, /^__Host-nusariksa_session=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800$/);
        const cookiePair = cookie.split(';')[0];

        const session = await fetch(url + '/auth/session', {
          headers: { Cookie: cookiePair },
        });
        assert.equal(session.status, 200);
        assert.equal((await session.json()).authenticated, true);

        const missingCookie = await fetch(url + '/auth/session');
        assert.equal(missingCookie.status, 401);
        const duplicate = await fetch(url + '/auth/session', {
          headers: { Cookie: cookiePair + '; ' + cookiePair },
        });
        assert.equal(duplicate.status, 401);

        const deniedLogout = await fetch(url + '/auth/logout', {
          method: 'POST',
          headers: { Cookie: cookiePair, Origin: 'https://attacker.example' },
        });
        assert.equal(deniedLogout.status, 403);

        const logout = await fetch(url + '/auth/logout', {
          method: 'POST',
          headers: { Cookie: cookiePair, Origin: origin },
        });
        assert.equal(logout.status, 200);
        assert.match(logout.headers.get('set-cookie'), /Max-Age=0$/);

        const revoked = await fetch(url + '/auth/session', {
          headers: { Cookie: cookiePair },
        });
        assert.equal(revoked.status, 401);

        const noOrigin = await fetch(url + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: loginBody,
        });
        assert.equal(noOrigin.status, 403);

        const wrongType = await requestLogin(loginBody, { 'Content-Type': 'text/plain' });
        assert.equal(wrongType.status, 415);

        const oversized = await requestLogin(JSON.stringify({
          email: 'login-http@example.test', password: 'x'.repeat(5000),
        }));
        assert.equal(oversized.status, 413);

        const unknownAccount = JSON.stringify({
          email: 'missing@example.test', password: 'salah',
        });
        for (let attempt = 0; attempt < 5; attempt++) {
          assert.equal((await requestLogin(unknownAccount)).status, 401);
        }
        const limited = await requestLogin(unknownAccount);
        assert.equal(limited.status, 429);
        assert.equal(limited.headers.get('retry-after'), '900');

        const stored = await db.query('SELECT token_hash, revoked_at FROM sessions');
        assert.equal(stored.rowCount, 1);
        assert.ok(stored.rows[0].revoked_at);
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

test('login tanpa konfigurasi auth tidak diaktifkan', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
