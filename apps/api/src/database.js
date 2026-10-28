import pg from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;

  return new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    max: 5,
  });
}

export async function checkDatabase(pool) {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
