const ROLES = new Set([
  'SUPER_ADMIN', 'IT_OFFICER', 'COMPLIANCE_OFFICER', 'REVIEWER', 'AUDITOR', 'VIEWER',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RoleChangeError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RoleChangeError';
    this.status = status;
  }
}

// This function expects a client with an open transaction.
export async function applyRoleChangeInTransaction(client, {
  actorId, targetId, role, action,
}) {
  if (!UUID_PATTERN.test(actorId) || !UUID_PATTERN.test(targetId)
    || !ROLES.has(role) || !['GRANT', 'REVOKE'].includes(action)) {
    throw new RoleChangeError(400, 'Invalid role change');
  }
  if (actorId === targetId) {
    throw new RoleChangeError(403, 'Self-service role changes are not allowed');
  }

  // Serialize all role modifications made through this service.
  await client.query('SELECT pg_advisory_xact_lock(8472932)');

  const actor = await client.query(
    'SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id = u.id ' +
    "WHERE u.id = $1 AND u.status = 'active' AND u.password_hash IS NOT NULL " +
    "AND ur.role = 'SUPER_ADMIN'",
    [actorId],
  );
  if (actor.rowCount !== 1) {
    throw new RoleChangeError(403, 'Not allowed');
  }

  const target = await client.query(
    'SELECT status, password_hash FROM users WHERE id = $1 FOR UPDATE',
    [targetId],
  );
  if (target.rowCount !== 1) {
    throw new RoleChangeError(404, 'User not found');
  }
  if (target.rows[0].status !== 'active' || target.rows[0].password_hash === null) {
    throw new RoleChangeError(409, 'Target user is not active');
  }

  if (action === 'GRANT') {
    const inserted = await client.query(
      'INSERT INTO user_roles (user_id, role, assigned_by) VALUES ($1, $2, $3) ' +
      'ON CONFLICT DO NOTHING RETURNING user_id',
      [targetId, role, actorId],
    );
    if (inserted.rowCount !== 1) {
      throw new RoleChangeError(409, 'Role is already assigned');
    }
  } else {
    if (role === 'SUPER_ADMIN') {
      const active = await client.query(
        'SELECT count(*)::int AS total FROM user_roles ur JOIN users u ON u.id = ur.user_id ' +
        "WHERE ur.role = 'SUPER_ADMIN' AND u.status = 'active' AND u.password_hash IS NOT NULL",
      );
      if (active.rows[0].total <= 1) {
        throw new RoleChangeError(409, 'At least one active administrator is required');
      }
    }
    const removed = await client.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND role = $2 RETURNING user_id',
      [targetId, role],
    );
    if (removed.rowCount !== 1) {
      throw new RoleChangeError(404, 'Role assignment not found');
    }
  }

  const audit = await client.query(
    'INSERT INTO role_change_events (actor_user_id, target_user_id, role, action) ' +
    'VALUES ($1, $2, $3, $4) RETURNING id',
    [actorId, targetId, role, action],
  );
  return { targetId, role, action, eventId: audit.rows[0].id };
}

export async function changeUserRole(pool, change) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applyRoleChangeInTransaction(client, change);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
