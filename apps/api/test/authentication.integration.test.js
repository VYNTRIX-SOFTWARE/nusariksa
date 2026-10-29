import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { authenticateUser } from '../src/authentication.js';
import { hashPassword } from '../src/passwords.js';

test('autentikasi hanya menerima akun aktif dan password yang benar', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Login', 'BPR')");
      const password = 'Sandi-uji-keamanan-2026';
      const encodedHash = await hashPassword(password);
      const active = await client.query(
        "INSERT INTO users (email, status, password_hash) VALUES ($1, 'active', $2) RETURNING id",
        ['active@example.test', encodedHash],
      );
      await client.query(
        "INSERT INTO users (email, status, password_hash) VALUES ($1, 'pending', $2)",
        ['pending@example.test', encodedHash],
      );
      await client.query(
        "INSERT INTO users (email, status, password_hash) VALUES ($1, 'disabled', $2)",
        ['disabled@example.test', encodedHash],
      );

      assert.deepEqual(
        await authenticateUser(client, ' ACTIVE@EXAMPLE.TEST ', password),
        { userId: active.rows[0].id },
      );
      assert.equal(await authenticateUser(client, 'active@example.test', 'salah'), null);
      assert.equal(await authenticateUser(client, 'pending@example.test', password), null);
      assert.equal(await authenticateUser(client, 'disabled@example.test', password), null);
      assert.equal(await authenticateUser(client, 'tidak-ada@example.test', password), null);
      assert.equal(await authenticateUser(client, 'active@example.test', ''), null);

      const stored = await client.query(
        'SELECT password_hash FROM users WHERE email = $1',
        ['active@example.test'],
      );
      assert.equal(stored.rows[0].password_hash, encodedHash);
      assert.notEqual(stored.rows[0].password_hash, password);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});
