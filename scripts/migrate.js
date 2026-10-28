import { createPool } from '../apps/api/src/database.js';
import { runMigrations } from '../apps/api/src/migrations.js';

const pool = createPool();

if (!pool) {
  console.error('DATABASE_URL belum disetel.');
  process.exitCode = 1;
} else {
  try {
    await runMigrations(pool);
    console.log('Database migrations completed.');
  } catch (error) {
    console.error('Migrasi database gagal:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
