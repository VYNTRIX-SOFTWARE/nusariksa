import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));

export async function runMigrations(pool, directory = migrationsDirectory) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(8472931)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const recorded = await client.query('SELECT id, checksum FROM schema_migrations');
    const applied = new Map(recorded.rows.map((row) => [row.id, row.checksum.trim()]));
    const filenames = (await readdir(directory))
      .filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
      .sort();

    for (const filename of filenames) {
      const sql = await readFile(join(directory, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) {
          throw new Error(`Migration has changed: ${filename}`);
        }
        continue;
      }

      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
