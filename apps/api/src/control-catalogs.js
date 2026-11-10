import { userHasPermission } from './authorization.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z][A-Z0-9_-]{1,31}$/;

export class CatalogError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'CatalogError';
    this.status = status;
  }
}

function validId(id) {
  return typeof id === 'string' && UUID.test(id);
}

function validText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function validateCatalog({ code, title } = {}) {
  if (typeof code !== 'string' || !CODE.test(code) || !validText(title, 3, 200)) {
    throw new CatalogError(400, 'Invalid catalog');
  }
  return { code, title };
}

export function validateControl({ code, title, description = '',
  sourceDocument = null, sourceSection = null } = {}) {
  const noSource = sourceDocument === null && sourceSection === null;
  const completeSource = validText(sourceDocument, 3, 200)
    && validText(sourceSection, 1, 100);
  if (typeof code !== 'string' || !CODE.test(code) || !validText(title, 3, 200)
    || typeof description !== 'string' || description.length > 2000
    || /[\u0000-\u001f\u007f]/.test(description)
    || (!noSource && !completeSource)) {
    throw new CatalogError(400, 'Invalid control');
  }
  return { code, title, description, sourceDocument, sourceSection };
}

async function requirePermission(db, actorId, permission) {
  if (!validId(actorId) || !await userHasPermission(db, actorId, permission)) {
    throw new CatalogError(403, 'Forbidden');
  }
}

async function institutionId(db, actorId) {
  const result = await db.query(
    "SELECT institution_id FROM users WHERE id = $1 AND status = 'active' " +
    'AND password_hash IS NOT NULL',
    [actorId],
  );
  if (result.rowCount !== 1) throw new CatalogError(403, 'Forbidden');
  return result.rows[0].institution_id;
}

async function withTransaction(pool, callback) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await callback(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function createCatalogInTransaction(db, { actorId, ...data }) {
  const { code, title } = validateCatalog(data);
  await requirePermission(db, actorId, 'assessments:write');
  const institution = await institutionId(db, actorId);
  let catalog;
  try {
    catalog = await db.query(
      'INSERT INTO control_catalogs (institution_id, code, title, created_by) ' +
      'VALUES ($1, $2, $3, $4) RETURNING id, code, title',
      [institution, code, title, actorId],
    );
  } catch (error) {
    if (error.code === '23505') throw new CatalogError(409, 'Catalog code exists');
    throw error;
  }
  const version = await db.query(
    "INSERT INTO control_catalog_versions (catalog_id, version, created_by) " +
    'VALUES ($1, 1, $2) RETURNING id, version, status',
    [catalog.rows[0].id, actorId],
  );
  return { ...catalog.rows[0], currentVersion: version.rows[0] };
}

export async function listCatalogs(db, actorId) {
  await requirePermission(db, actorId, 'assessments:read');
  const result = await db.query(
    'SELECT c.id, c.code, c.title, c.origin FROM control_catalogs c ' +
    'JOIN users u ON u.institution_id = c.institution_id AND u.id = $1 ' +
    "ORDER BY CASE WHEN c.origin = 'builtin' THEN 0 ELSE 1 END, c.code LIMIT 50",
    [actorId],
  );
  return { catalogs: result.rows };
}

export async function listVersions(db, actorId, catalogId) {
  if (!validId(catalogId)) throw new CatalogError(400, 'Invalid catalog ID');
  await requirePermission(db, actorId, 'assessments:read');
  const catalog = await db.query(
    'SELECT 1 FROM control_catalogs c ' +
    'JOIN users u ON u.institution_id = c.institution_id AND u.id = $1 WHERE c.id = $2',
    [actorId, catalogId],
  );
  if (catalog.rowCount !== 1) throw new CatalogError(404, 'Catalog not found');
  const versions = await db.query(
    'SELECT id, version, status, created_at, published_at FROM control_catalog_versions ' +
    'WHERE catalog_id = $1 ORDER BY version DESC LIMIT 50',
    [catalogId],
  );
  return { versions: versions.rows };
}

export async function createNextVersionInTransaction(db, { actorId, catalogId }) {
  if (!validId(catalogId)) throw new CatalogError(400, 'Invalid catalog ID');
  await requirePermission(db, actorId, 'assessments:write');
  const catalog = await db.query(
    'SELECT c.id FROM control_catalogs c ' +
    'JOIN users u ON u.institution_id = c.institution_id AND u.id = $1 ' +
    'WHERE c.id = $2 FOR UPDATE OF c',
    [actorId, catalogId],
  );
  if (catalog.rowCount !== 1) throw new CatalogError(404, 'Catalog not found');
  const latest = await db.query(
    'SELECT id, version, status FROM control_catalog_versions ' +
    'WHERE catalog_id = $1 ORDER BY version DESC LIMIT 1',
    [catalogId],
  );
  if (latest.rowCount !== 1 || latest.rows[0].status !== 'published') {
    throw new CatalogError(409, 'Publish the current draft first');
  }
  const created = await db.query(
    'INSERT INTO control_catalog_versions (catalog_id, version, created_by) ' +
    'VALUES ($1, $2, $3) RETURNING id, version, status',
    [catalogId, latest.rows[0].version + 1, actorId],
  );
  await db.query(
    'INSERT INTO control_definitions (version_id, control_code, title, description, ' +
    'source_document, source_section, position) ' +
    'SELECT $1, control_code, title, description, source_document, source_section, position ' +
    'FROM control_definitions WHERE version_id = $2',
    [created.rows[0].id, latest.rows[0].id],
  );
  return created.rows[0];
}

export async function addControlInTransaction(db, { actorId, versionId, ...input }) {
  if (!validId(versionId)) throw new CatalogError(400, 'Invalid version ID');
  const data = validateControl(input);
  await requirePermission(db, actorId, 'assessments:write');
  const version = await db.query(
    'SELECT v.status FROM control_catalog_versions v ' +
    'JOIN control_catalogs c ON c.id = v.catalog_id ' +
    'JOIN users u ON u.institution_id = c.institution_id AND u.id = $1 ' +
    'WHERE v.id = $2 FOR UPDATE OF v',
    [actorId, versionId],
  );
  if (version.rowCount !== 1) throw new CatalogError(404, 'Version not found');
  if (version.rows[0].status !== 'draft') {
    throw new CatalogError(409, 'Published version is immutable');
  }
  const next = await db.query(
    'SELECT coalesce(max(position), 0) + 1 AS position ' +
    'FROM control_definitions WHERE version_id = $1',
    [versionId],
  );
  const position = next.rows[0].position;
  if (position > 200) throw new CatalogError(409, 'Maximum 200 controls per version');
  try {
    const result = await db.query(
      'INSERT INTO control_definitions (version_id, control_code, title, description, ' +
      'source_document, source_section, position) ' +
      'VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, control_code, title, description, ' +
      'source_document, source_section, position',
      [versionId, data.code, data.title, data.description, data.sourceDocument,
        data.sourceSection, position],
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw new CatalogError(409, 'Control code already exists');
    throw error;
  }
}

export async function publishVersionInTransaction(db, { actorId, versionId }) {
  if (!validId(versionId)) throw new CatalogError(400, 'Invalid version ID');
  await requirePermission(db, actorId, 'assessments:write');
  const version = await db.query(
    'SELECT v.status FROM control_catalog_versions v ' +
    'JOIN control_catalogs c ON c.id = v.catalog_id ' +
    'JOIN users u ON u.institution_id = c.institution_id AND u.id = $1 ' +
    'WHERE v.id = $2 FOR UPDATE OF v',
    [actorId, versionId],
  );
  if (version.rowCount !== 1) throw new CatalogError(404, 'Version not found');
  if (version.rows[0].status !== 'draft') throw new CatalogError(409, 'Already published');
  const count = await db.query(
    'SELECT count(*)::int AS count FROM control_definitions WHERE version_id = $1',
    [versionId],
  );
  if (count.rows[0].count === 0) throw new CatalogError(409, 'A version needs controls');
  const result = await db.query(
    "UPDATE control_catalog_versions SET status = 'published', published_at = now() " +
    'WHERE id = $1 RETURNING id, version, status, published_at',
    [versionId],
  );
  return result.rows[0];
}

export async function listControls(db, actorId, versionId) {
  if (!validId(versionId)) throw new CatalogError(400, 'Invalid version ID');
  await requirePermission(db, actorId, 'assessments:read');
  const version = await db.query(
    'SELECT v.id, v.version, v.status, c.code AS catalog_code FROM control_catalog_versions v ' +
    'JOIN control_catalogs c ON c.id = v.catalog_id ' +
    'JOIN users u ON u.institution_id = c.institution_id AND u.id = $1 WHERE v.id = $2',
    [actorId, versionId],
  );
  if (version.rowCount !== 1) throw new CatalogError(404, 'Version not found');
  const controls = await db.query(
    'SELECT id, control_code, title, description, source_document, source_section, position ' +
    'FROM control_definitions WHERE version_id = $1 ORDER BY position',
    [versionId],
  );
  return { version: version.rows[0], controls: controls.rows };
}

export async function assignCatalogInTransaction(db, { actorId, assessmentId, versionId }) {
  if (!validId(assessmentId) || !validId(versionId)) {
    throw new CatalogError(400, 'Invalid assessment or version ID');
  }
  await requirePermission(db, actorId, 'assessments:write');
  const assessment = await db.query(
    'SELECT a.institution_id, a.owner_user_id, a.status FROM assessments a ' +
    'JOIN users u ON u.institution_id = a.institution_id AND u.id = $1 ' +
    'WHERE a.id = $2 FOR UPDATE OF a',
    [actorId, assessmentId],
  );
  if (assessment.rowCount !== 1) throw new CatalogError(404, 'Assessment not found');
  if (assessment.rows[0].owner_user_id !== actorId) {
    throw new CatalogError(403, 'Only the owner can attach a catalog');
  }
  if (assessment.rows[0].status !== 'draft') {
    throw new CatalogError(409, 'Catalog must be assigned while assessment is draft');
  }
  const version = await db.query(
    'SELECT v.id, v.version, c.code AS catalog_code, v.status ' +
    'FROM control_catalog_versions v JOIN control_catalogs c ON c.id = v.catalog_id ' +
    'WHERE v.id = $1 AND c.institution_id = $2 FOR SHARE OF v',
    [versionId, assessment.rows[0].institution_id],
  );
  if (version.rowCount !== 1) throw new CatalogError(404, 'Catalog version not found');
  if (version.rows[0].status !== 'published') {
    throw new CatalogError(409, 'Only published versions may be attached');
  }
  const result = await db.query(
    'INSERT INTO assessment_catalog_assignments ' +
    '(assessment_id, catalog_version_id, assigned_by) VALUES ($1, $2, $3) ' +
    'ON CONFLICT DO NOTHING RETURNING assessment_id, assigned_at',
    [assessmentId, versionId, actorId],
  );
  if (result.rowCount !== 1) throw new CatalogError(409, 'Assessment already has a catalog');
  return { assessmentId, catalogVersion: version.rows[0], assignedAt: result.rows[0].assigned_at };
}

export async function getChecklist(db, actorId, assessmentId) {
  if (!validId(assessmentId)) throw new CatalogError(400, 'Invalid assessment ID');
  await requirePermission(db, actorId, 'assessments:read');
  const assessment = await db.query(
    'SELECT a.id FROM assessments a ' +
    'JOIN users u ON u.institution_id = a.institution_id AND u.id = $1 WHERE a.id = $2',
    [actorId, assessmentId],
  );
  if (assessment.rowCount !== 1) throw new CatalogError(404, 'Assessment not found');
  const assignment = await db.query(
    'SELECT v.id, v.version, c.code AS catalog_code FROM assessment_catalog_assignments aa ' +
    'JOIN control_catalog_versions v ON v.id = aa.catalog_version_id ' +
    'JOIN control_catalogs c ON c.id = v.catalog_id WHERE aa.assessment_id = $1',
    [assessmentId],
  );
  if (assignment.rowCount !== 1) return { catalogVersion: null, controls: [] };
  const result = await db.query(
    'SELECT id, control_code, title, description, source_document, source_section, position ' +
    'FROM control_definitions WHERE version_id = $1 ORDER BY position',
    [assignment.rows[0].id],
  );
  return { catalogVersion: assignment.rows[0], controls: result.rows };
}

export const createCatalog = (pool, args) => withTransaction(pool, (db) => createCatalogInTransaction(db, args));
export const createNextVersion = (pool, args) => withTransaction(pool, (db) => createNextVersionInTransaction(db, args));
export const addControl = (pool, args) => withTransaction(pool, (db) => addControlInTransaction(db, args));
export const publishVersion = (pool, args) => withTransaction(pool, (db) => publishVersionInTransaction(db, args));
export const assignCatalog = (pool, args) => withTransaction(pool, (db) => assignCatalogInTransaction(db, args));
