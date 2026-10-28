import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool, checkDatabase } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';

test('migrasi dapat dijalankan ulang tanpa mengubah riwayat', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    assert.equal(await checkDatabase(pool), true);
    await runMigrations(pool);
    await runMigrations(pool);

    const migrations = await pool.query(
      'SELECT id, checksum FROM schema_migrations ORDER BY id',
    );
    assert.equal(migrations.rowCount, 1);
    assert.equal(migrations.rows[0].id, '0001_create_institutions.sql');
    assert.match(migrations.rows[0].checksum.trim(), /^[a-f0-9]{64}$/);

    const columns = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      ['institutions'],
    );
    assert.ok(columns.rows.some((row) => row.column_name === 'kind'));
  } finally {
    await pool.end();
  }
});
