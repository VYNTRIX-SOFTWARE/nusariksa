import { userHasPermission } from './authorization.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATINGS = new Set([
  'compliant', 'partially_compliant', 'non_compliant', 'not_applicable',
]);

export class AssessmentResultError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AssessmentResultError';
    this.status = status;
  }
}

function validId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function validateResult({ rating, note, expectedRevision } = {}) {
  if (!RATINGS.has(rating) || typeof note !== 'string'
    || note.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
    || (rating !== 'compliant' && note.trim().length < 10)
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new AssessmentResultError(400, 'Invalid assessment result');
  }
  return { rating, note, expectedRevision };
}

async function requirePermission(db, actorId, permission) {
  if (!validId(actorId) || !await userHasPermission(db, actorId, permission)) {
    throw new AssessmentResultError(403, 'Forbidden');
  }
}

async function findAssessment(db, actorId, assessmentId, lock = false) {
  const found = await db.query(
    'SELECT a.id, a.status, a.owner_user_id, aa.catalog_version_id ' +
    'FROM assessments a ' +
    'JOIN users u ON u.id = $1 AND u.institution_id = a.institution_id ' +
    'LEFT JOIN assessment_catalog_assignments aa ON aa.assessment_id = a.id ' +
    'WHERE a.id = $2 ' + (lock ? 'FOR UPDATE OF a' : ''),
    [actorId, assessmentId],
  );
  if (found.rowCount !== 1) throw new AssessmentResultError(404, 'Assessment not found');
  return found.rows[0];
}

export async function listAssessmentResults(db, actorId, assessmentId) {
  if (!validId(assessmentId)) throw new AssessmentResultError(400, 'Invalid assessment ID');
  await requirePermission(db, actorId, 'assessments:read');
  const assessment = await findAssessment(db, actorId, assessmentId);
  if (!assessment.catalog_version_id) return {
    assessmentId, status: assessment.status, catalogVersionId: null,
    controls: [], summary: { total: 0, assessed: 0, notAssessed: 0 },
  };
  const results = await db.query(
    'SELECT c.id AS control_id, c.control_code, c.title, c.position, ' +
    "coalesce(r.rating, 'not_assessed') AS rating, coalesce(r.note, '') AS note, " +
    'coalesce(r.revision, 0) AS revision, r.updated_by, r.updated_at ' +
    'FROM control_definitions c ' +
    'LEFT JOIN assessment_control_results r ON r.control_id = c.id ' +
    'AND r.assessment_id = $1 AND r.catalog_version_id = c.version_id ' +
    'WHERE c.version_id = $2 ORDER BY c.position',
    [assessmentId, assessment.catalog_version_id],
  );
  const controls = results.rows;
  const assessed = controls.filter((row) => row.revision !== 0).length;
  return {
    assessmentId, status: assessment.status,
    catalogVersionId: assessment.catalog_version_id,
    controls, summary: { total: controls.length, assessed,
      notAssessed: controls.length - assessed },
  };
}

export async function writeAssessmentResultInTransaction(db, {
  actorId, assessmentId, controlId, ...input
}) {
  if (!validId(assessmentId) || !validId(controlId)) {
    throw new AssessmentResultError(400, 'Invalid assessment or control ID');
  }
  const { rating, note, expectedRevision } = validateResult(input);
  await requirePermission(db, actorId, 'assessments:write');

  // Lock the assessment before checking its status and current result revision.
  const assessment = await findAssessment(db, actorId, assessmentId, true);
  if (assessment.owner_user_id !== actorId) {
    throw new AssessmentResultError(403, 'Only the owner can enter results');
  }
  if (assessment.status !== 'in_progress' || !assessment.catalog_version_id) {
    throw new AssessmentResultError(409, 'Assessment must be started with a catalog');
  }

  const control = await db.query(
    'SELECT 1 FROM control_definitions WHERE id = $1 AND version_id = $2',
    [controlId, assessment.catalog_version_id],
  );
  if (control.rowCount !== 1) throw new AssessmentResultError(404, 'Control not in assessment');

  const old = await db.query(
    'SELECT revision FROM assessment_control_results ' +
    'WHERE assessment_id = $1 AND control_id = $2 FOR UPDATE',
    [assessmentId, controlId],
  );
  const actualRevision = old.rowCount === 0 ? 0 : old.rows[0].revision;
  if (expectedRevision !== actualRevision) {
    throw new AssessmentResultError(409, 'Assessment result revision conflict');
  }

  const result = old.rowCount === 0
    ? await db.query(
      'INSERT INTO assessment_control_results ' +
      '(assessment_id, catalog_version_id, control_id, rating, note, updated_by) ' +
      'VALUES ($1, $2, $3, $4, $5, $6) ' +
      'RETURNING control_id, rating, note, revision, updated_by, updated_at',
      [assessmentId, assessment.catalog_version_id, controlId, rating, note, actorId],
    )
    : await db.query(
      'UPDATE assessment_control_results SET rating = $3, note = $4, ' +
      'revision = revision + 1, updated_by = $5, updated_at = now() ' +
      'WHERE assessment_id = $1 AND control_id = $2 ' +
      'RETURNING control_id, rating, note, revision, updated_by, updated_at',
      [assessmentId, controlId, rating, note, actorId],
    );
  return result.rows[0];
}

export async function resultHistory(db, actorId, assessmentId, controlId) {
  if (!validId(assessmentId) || !validId(controlId)) {
    throw new AssessmentResultError(400, 'Invalid assessment or control ID');
  }
  await requirePermission(db, actorId, 'assessments:read');
  const assessment = await findAssessment(db, actorId, assessmentId);
  if (!assessment.catalog_version_id) {
    throw new AssessmentResultError(404, 'Control not in assessment');
  }
  const control = await db.query(
    'SELECT 1 FROM control_definitions WHERE id = $1 AND version_id = $2',
    [controlId, assessment.catalog_version_id],
  );
  if (control.rowCount !== 1) {
    throw new AssessmentResultError(404, 'Control not in assessment');
  }
  const history = await db.query(
    'SELECT revision, rating, note, actor_user_id, recorded_at ' +
    'FROM assessment_control_result_events ' +
    'WHERE assessment_id = $1 AND control_id = $2 ORDER BY revision DESC LIMIT 100',
    [assessmentId, controlId],
  );
  return { assessmentId, controlId, history: history.rows };
}

export async function writeAssessmentResult(pool, args) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await writeAssessmentResultInTransaction(db, args);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
