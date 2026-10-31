import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from './passwords.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const INVITATION_MS = 24 * 60 * 60 * 1000;

export class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
  }
}

function normalizedEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (normalized.length < 3 || normalized.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AccountError(400, 'Invalid email');
  }
  return normalized;
}

async function lockAndCheckAdministrator(client, actorId) {
  if (typeof actorId !== 'string' || !UUID_PATTERN.test(actorId)) {
    throw new AccountError(403, 'Forbidden');
  }
  await client.query('SELECT pg_advisory_xact_lock(8472932)');
  const actor = await client.query(
    'SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id ' +
    "WHERE u.id = $1 AND u.status = 'active' AND u.password_hash IS NOT NULL " +
    "AND ur.role = 'SUPER_ADMIN'",
    [actorId],
  );
  if (actor.rowCount !== 1) throw new AccountError(403, 'Forbidden');
}

function tokenBytes(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== token) return null;
  return bytes;
}

export async function createPendingAccountInTransaction(client, { actorId, email }) {
  const normalized = normalizedEmail(email);
  await lockAndCheckAdministrator(client, actorId);

  let account;
  try {
    account = await client.query(
      "INSERT INTO users (email, status) VALUES ($1, 'pending') RETURNING id",
      [normalized],
    );
  } catch (error) {
    if (error.code === '23505') throw new AccountError(409, 'Account already exists');
    throw error;
  }

  const userId = account.rows[0].id;
  const bytes = randomBytes(32);
  const invitationToken = bytes.toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_MS);
  await client.query(
    'INSERT INTO account_invitations (user_id, token_hash, created_by, expires_at) ' +
    'VALUES ($1, $2, $3, $4)',
    [userId, createHash('sha256').update(bytes).digest(), actorId, expiresAt],
  );
  await client.query(
    "INSERT INTO user_account_events (actor_user_id, target_user_id, action) VALUES ($1, $2, 'CREATE')",
    [actorId, userId],
  );
  return { userId, email: normalized, invitationToken, expiresAt };
}

export async function activatePendingAccountInTransaction(client, { token, password }) {
  const bytes = tokenBytes(token);
  if (!bytes || typeof password !== 'string'
    || Buffer.byteLength(password, 'utf8') < 12
    || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new AccountError(400, 'Invalid activation request');
  }
  const hash = createHash('sha256').update(bytes).digest();
  const invitation = await client.query(
    'SELECT i.user_id FROM account_invitations i JOIN users u ON u.id = i.user_id ' +
    "WHERE i.token_hash = $1 AND i.consumed_at IS NULL AND i.expires_at > now() " +
    "AND u.status = 'pending' AND u.password_hash IS NULL FOR UPDATE OF i, u",
    [hash],
  );
  if (invitation.rowCount !== 1) {
    throw new AccountError(401, 'Invalid or expired invitation');
  }
  const userId = invitation.rows[0].user_id;
  const passwordHash = await hashPassword(password);
  await client.query(
    "UPDATE users SET status = 'active', password_hash = $2 WHERE id = $1",
    [userId, passwordHash],
  );
  await client.query(
    'UPDATE account_invitations SET consumed_at = now() WHERE user_id = $1',
    [userId],
  );
  await client.query(
    "INSERT INTO user_account_events (actor_user_id, target_user_id, action) VALUES ($1, $1, 'ACTIVATE')",
    [userId],
  );
  return { userId, activated: true };
}

export async function disableAccountInTransaction(client, { actorId, targetId }) {
  if (typeof targetId !== 'string' || !UUID_PATTERN.test(targetId)) {
    throw new AccountError(400, 'Invalid user ID');
  }
  if (actorId === targetId) throw new AccountError(403, 'Self-disable is not allowed');
  await lockAndCheckAdministrator(client, actorId);

  const account = await client.query(
    'SELECT status FROM users WHERE id = $1 FOR UPDATE',
    [targetId],
  );
  if (account.rowCount !== 1) throw new AccountError(404, 'Account not found');
  if (account.rows[0].status === 'disabled') {
    throw new AccountError(409, 'Account is already disabled');
  }

  const admin = await client.query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'SUPER_ADMIN'",
    [targetId],
  );
  if (admin.rowCount === 1 && account.rows[0].status === 'active') {
    const active = await client.query(
      "SELECT count(*)::int AS total FROM user_roles ur JOIN users u ON u.id = ur.user_id " +
      "WHERE ur.role = 'SUPER_ADMIN' AND u.status = 'active' AND u.password_hash IS NOT NULL",
    );
    if (active.rows[0].total <= 1) {
      throw new AccountError(409, 'At least one active administrator is required');
    }
  }

  await client.query("UPDATE users SET status = 'disabled' WHERE id = $1", [targetId]);
  await client.query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [targetId],
  );
  await client.query(
    'UPDATE account_invitations SET consumed_at = now() ' +
    'WHERE user_id = $1 AND consumed_at IS NULL',
    [targetId],
  );
  await client.query(
    "INSERT INTO user_account_events (actor_user_id, target_user_id, action) VALUES ($1, $2, 'DISABLE')",
    [actorId, targetId],
  );
  return { userId: targetId, status: 'disabled' };
}

async function inTransaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function createPendingAccount(pool, change) {
  return inTransaction(pool, (client) => createPendingAccountInTransaction(client, change));
}

export function activatePendingAccount(pool, change) {
  return inTransaction(pool, (client) => activatePendingAccountInTransaction(client, change));
}

export function disableAccount(pool, change) {
  return inTransaction(pool, (client) => disableAccountInTransaction(client, change));
}

export async function listAccounts(db, actorId) {
  if (typeof actorId !== 'string' || !UUID_PATTERN.test(actorId)) {
    throw new AccountError(403, 'Forbidden');
  }
  const actor = await db.query(
    'SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id ' +
    "WHERE u.id = $1 AND u.status = 'active' AND u.password_hash IS NOT NULL " +
    "AND ur.role = 'SUPER_ADMIN'",
    [actorId],
  );
  if (actor.rowCount !== 1) throw new AccountError(403, 'Forbidden');
  const result = await db.query(
    'SELECT id, email, status, created_at FROM users ORDER BY created_at, id LIMIT 50',
  );
  return { users: result.rows };
}
