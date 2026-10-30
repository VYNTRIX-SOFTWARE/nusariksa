import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createServer } from '../src/server.js';
import { createSession } from '../src/sessions.js';

test('endpoint izin memerlukan sesi aktif dan membaca peran dari database', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank RBAC HTTP', 'BPR')");
      const { rows } = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES ($1, 'active', $2) RETURNING id",
        ['rbac-http@example.test', 'hash-sintetis-untuk-tes'],
      );
      const userId = rows[0].id;
      const { token } = await createSession(db, userId);
      const server = createServer({ authDb: db, appOrigin: 'http://127.0.0.1:3000' });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = 'http://127.0.0.1:' + server.address().port + '/auth/permissions';
      try {
        assert.equal((await fetch(url)).status, 401);
        const cookie = '__Host-nusariksa_session=' + token;
        const response = await fetch(url, { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { permissions: [] });

        await db.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [userId, 'AUDITOR']);
        const allowed = await fetch(url, { headers: { Cookie: cookie } });
        assert.equal(allowed.status, 200);
        const payload = await allowed.json();
        assert.ok(payload.permissions.includes('audit:read'));
        assert.ok(!payload.permissions.includes('users:manage'));
        assert.ok(!payload.permissions.includes('assessments:approve'));

        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [userId]);
        assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 401);
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
