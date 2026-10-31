import { hashPassword } from './passwords.js';

function validateSetup({ institutionName, institutionKind, email, password }) {
  const name = typeof institutionName === 'string' ? institutionName.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 200 || /[\u0000-\u001f]/.test(name)
    || !['BPR', 'BPRS'].includes(institutionKind)
    || normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    || typeof password !== 'string'
    || Buffer.byteLength(password, 'utf8') < 12
    || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new Error('Invalid initial setup');
  }
  return { name, institutionKind, email: normalizedEmail, password };
}

// Use only with a trusted local PostgreSQL connection and an open transaction.
export async function initializeInstitutionInTransaction(client, setup) {
  const { name, institutionKind, email, password } = validateSetup(setup);
  await client.query('SELECT pg_advisory_xact_lock(8472932)');
  const existing = await client.query(
    'SELECT (SELECT count(*)::int FROM institutions) AS institutions, ' +
    '(SELECT count(*)::int FROM users) AS users',
  );
  if (existing.rows[0].institutions !== 0 || existing.rows[0].users !== 0) {
    throw new Error('Initial setup has already been completed or database is not empty');
  }

  const passwordHash = await hashPassword(password);
  await client.query(
    'INSERT INTO institutions (name, kind) VALUES ($1, $2)',
    [name, institutionKind],
  );
  const account = await client.query(
    "INSERT INTO users (email, status, password_hash) VALUES ($1, 'active', $2) RETURNING id",
    [email, passwordHash],
  );
  const userId = account.rows[0].id;
  await client.query(
    "INSERT INTO user_roles (user_id, role, assigned_by) VALUES ($1, 'SUPER_ADMIN', $1)",
    [userId],
  );
  await client.query(
    'INSERT INTO role_change_events (actor_user_id, target_user_id, role, action, source) ' +
    "VALUES ($1, $1, 'SUPER_ADMIN', 'GRANT', 'BOOTSTRAP')",
    [userId],
  );
  return { userId, email, institutionName: name, institutionKind };
}

export async function bootstrapInstitution(pool, setup) {
  validateSetup(setup);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await initializeInstitutionInTransaction(client, setup);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
