const ROLE_PERMISSIONS = Object.freeze({
  SUPER_ADMIN: [
    'users:manage', 'assessments:read', 'evidence:read', 'reports:read', 'audit:read',
  ],
  IT_OFFICER: [
    'assessments:read', 'assessments:write', 'evidence:read', 'evidence:write', 'reports:read',
  ],
  COMPLIANCE_OFFICER: [
    'assessments:read', 'assessments:write', 'evidence:read', 'evidence:write',
    'reports:read', 'audit:read',
  ],
  REVIEWER: [
    'assessments:read', 'assessments:approve', 'evidence:read', 'reports:read', 'audit:read',
  ],
  AUDITOR: [
    'assessments:read', 'evidence:read', 'reports:read', 'audit:read',
  ],
  VIEWER: [
    'assessments:read', 'evidence:read', 'reports:read',
  ],
});

const KNOWN_PERMISSIONS = new Set(Object.values(ROLE_PERMISSIONS).flat());
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function permissionsForRoles(roles) {
  if (!Array.isArray(roles)) return [];
  const permissions = new Set();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) permissions.add(permission);
  }
  return [...permissions].sort();
}

export async function getUserPermissions(db, userId) {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) return [];

  const result = await db.query(
    'SELECT ur.role FROM user_roles ur JOIN users u ON u.id = ur.user_id ' +
    "WHERE ur.user_id = $1 AND u.status = 'active' AND u.password_hash IS NOT NULL",
    [userId],
  );
  return permissionsForRoles(result.rows.map((row) => row.role));
}

export async function userHasPermission(db, userId, permission) {
  if (!KNOWN_PERMISSIONS.has(permission)) return false;
  const permissions = await getUserPermissions(db, userId);
  return permissions.includes(permission);
}
