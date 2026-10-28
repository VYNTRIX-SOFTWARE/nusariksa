import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';

test('tabel identitas menerapkan batasan dasar', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji', 'BPR')");

      const account = await client.query(
        'INSERT INTO users (email) VALUES ($1) RETURNING id, status',
        ['auditor@example.test'],
      );
      assert.equal(account.rows[0].status, 'pending');
      const userId = account.rows[0].id;

      await client.query('SAVEPOINT duplicate_email');
      await assert.rejects(
        client.query('INSERT INTO users (email) VALUES ($1)', ['auditor@example.test']),
        (error) => error.code === '23505',
      );
      await client.query('ROLLBACK TO SAVEPOINT duplicate_email');

      await client.query('SAVEPOINT invalid_email');
      await assert.rejects(
        client.query('INSERT INTO users (email) VALUES ($1)', ['Auditor@example.test']),
        (error) => error.code === '23514',
      );
      await client.query('ROLLBACK TO SAVEPOINT invalid_email');

      const session = await client.query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour') RETURNING id",
        [userId, Buffer.alloc(32, 0x5a)],
      );
      assert.ok(session.rows[0].id);

      await client.query('SAVEPOINT invalid_token_hash');
      await assert.rejects(
        client.query(
          "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
          [userId, Buffer.from([0x5a])],
        ),
        (error) => error.code === '23514',
      );
      await client.query('ROLLBACK TO SAVEPOINT invalid_token_hash');

      await client.query('SAVEPOINT invalid_expiry');
      await assert.rejects(
        client.query(
          "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() - interval '1 hour')",
          [userId, Buffer.alloc(32, 0x7b)],
        ),
        (error) => error.code === '23514',
      );
      await client.query('ROLLBACK TO SAVEPOINT invalid_expiry');

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});
