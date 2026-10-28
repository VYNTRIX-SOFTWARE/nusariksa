import { createHash, randomBytes } from 'node:crypto';

const SESSION_LENGTH_MS = 8 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function getTokenHash(token) {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;

  const bytes = Buffer.from(token, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== token) return null;

  return createHash('sha256').update(bytes).digest();
}

export async function createSession(db, userId) {
  const tokenBytes = randomBytes(32);
  const token = tokenBytes.toString('base64url');
  const tokenHash = createHash('sha256').update(tokenBytes).digest();
  const expiresAt = new Date(Date.now() + SESSION_LENGTH_MS);

  const result = await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     SELECT id, $2, $3
     FROM users
     WHERE id = $1 AND status = 'active' AND password_hash IS NOT NULL
     RETURNING id, expires_at`,
    [userId, tokenHash, expiresAt],
  );

  if (result.rowCount !== 1) {
    throw new Error('User cannot create a session');
  }

  return { token, expiresAt: result.rows[0].expires_at };
}

export async function findSession(db, token) {
  const tokenHash = getTokenHash(token);
  if (!tokenHash) return null;

  const result = await db.query(
    `SELECT s.id AS session_id, u.id AS user_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.status = 'active'
       AND u.password_hash IS NOT NULL`,
    [tokenHash],
  );

  if (result.rowCount !== 1) return null;
  return { sessionId: result.rows[0].session_id, userId: result.rows[0].user_id };
}

export async function revokeSession(db, token) {
  const tokenHash = getTokenHash(token);
  if (!tokenHash) return false;

  const result = await db.query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id`,
    [tokenHash],
  );

  return result.rowCount === 1;
}
