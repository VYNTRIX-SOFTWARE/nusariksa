import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createSession, findSession, revokeSession } from '../src/sessions.js';

test('token sesi hanya disimpan sebagai hash dan dapat dicabut', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO institutions (name, kind) VALUES ('Bank Pengujian', 'BPR')",
      );
      const { rows } = await client.query(
        `INSERT INTO users (email, status, password_hash)
         VALUES ($1, 'active', $2) RETURNING id`,
        ['session-test@example.test', 'hash-sintetis-hanya-untuk-tes'],
      );
      const userId = rows[0].id;
      const first = await createSession(client, userId);
      const second = await createSession(client, userId);

      assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
      assert.notEqual(first.token, second.token);
      assert.ok((await findSession(client, first.token))?.userId === userId);
      assert.equal(await findSession(client, 'invalid-token'), null);

      const stored = await client.query(
        'SELECT token_hash FROM sessions WHERE user_id = $1',
        [userId],
      );
      assert.equal(stored.rowCount, 2);
      for (const row of stored.rows) assert.equal(row.token_hash.length, 32);
      assert.equal(stored.rows.some((row) => row.token_hash.equals(Buffer.from(first.token))), false);

      assert.equal(await revokeSession(client, first.token), true);
      assert.equal(await revokeSession(client, first.token), false);
      assert.equal(await findSession(client, first.token), null);
      assert.ok(await findSession(client, second.token));

      await client.query(
        "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
        [userId],
      );
      assert.equal(await findSession(client, second.token), null);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});

test('sesi tidak diberikan kepada akun yang belum aktif atau dinonaktifkan', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO institutions (name, kind) VALUES ('Bank Pengujian 2', 'BPR')");
      const { rows } = await client.query(
        'INSERT INTO users (email) VALUES ($1) RETURNING id',
        ['pending-session@example.test'],
      );
      const userId = rows[0].id;
      await assert.rejects(createSession(client, userId), /cannot create a session/);
      await client.query(
        "UPDATE users SET status = 'active', password_hash = $1 WHERE id = $2",
        ['hash-sintetis-hanya-untuk-tes', userId],
      );
      const { token } = await createSession(client, userId);
      assert.ok(await findSession(client, token));

      await client.query("UPDATE users SET status = 'disabled' WHERE id = $1", [userId]);
      assert.equal(await findSession(client, token), null);
      await assert.rejects(createSession(client, userId), /cannot create a session/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});
