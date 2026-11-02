import { userHasPermission } from './authorization.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECISIONS = new Set(['approve', 'request_changes']);

export class ReviewError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ReviewError';
    this.status = status;
  }
}

function isUuid(id) {
  return typeof id === 'string' && UUID.test(id);
}

function validateNote(note, required) {
  if (typeof note !== 'string' || note.length > 2000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
    || (required && note.trim().length < 10)) {
    throw new ReviewError(400, 'Invalid review note');
  }
}

export function validateDecision({ decision, note } = {}) {
  if (!DECISIONS.has(decision)) throw new ReviewError(400, 'Invalid review decision');
  validateNote(note, decision === 'request_changes');
  return { decision, note };
}

async function requirePermission(db, actorId, permission) {
  if (!isUuid(actorId) || !await userHasPermission(db, actorId, permission)) {
    throw new ReviewError(403, 'Forbidden');
  }
}

async function assessmentForActor(db, actorId, id, lock = false) {
  const result = await db.query(
    'SELECT a.id, a.status, a.owner_user_id, a.submission_cycle, aa.catalog_version_id ' +
    'FROM assessments a ' +
    'JOIN users actor ON actor.id = $1 AND actor.institution_id = a.institution_id ' +
    'LEFT JOIN assessment_catalog_assignments aa ON aa.assessment_id = a.id ' +
    'WHERE a.id = $2 ' + (lock ? 'FOR UPDATE OF a' : ''),
    [actorId, id],
  );
  if (result.rowCount !== 1) throw new ReviewError(404, 'Assessment not found');
  return result.rows[0];
}

export async function submitAssessmentInTransaction(db, { actorId, assessmentId }) {
  if (!isUuid(assessmentId)) throw new ReviewError(400, 'Invalid assessment ID');
  await requirePermission(db, actorId, 'assessments:write');
  const assessment = await assessmentForActor(db, actorId, assessmentId, true);
  if (assessment.owner_user_id !== actorId) {
    throw new ReviewError(403, 'Only the assessment owner can submit');
  }
  if (!['in_progress', 'changes_requested'].includes(assessment.status)) {
    throw new ReviewError(409, 'Assessment cannot be submitted in this state');
  }
  if (!assessment.catalog_version_id) {
    throw new ReviewError(409, 'An assessment needs a published catalog');
  }
  const coverage = await db.query(
    'SELECT (SELECT count(*)::int FROM control_definitions WHERE version_id = $2) AS total, ' +
    '(SELECT count(*)::int FROM assessment_control_results ' +
    'WHERE assessment_id = $1 AND catalog_version_id = $2) AS assessed',
    [assessmentId, assessment.catalog_version_id],
  );
  const { total, assessed } = coverage.rows[0];
  if (total < 1 || assessed !== total) {
    throw new ReviewError(409, 'All controls must be assessed before submission');
  }

  const changed = await db.query(
    "UPDATE assessments SET status = 'submitted', submission_cycle = submission_cycle + 1 " +
    'WHERE id = $1 RETURNING submission_cycle',
    [assessmentId],
  );
  const cycle = changed.rows[0].submission_cycle;
  await db.query(
    "INSERT INTO assessment_review_events " +
    "(assessment_id, submission_cycle, actor_user_id, action) VALUES ($1, $2, $3, 'SUBMITTED')",
    [assessmentId, cycle, actorId],
  );
  return { assessmentId, status: 'submitted', submissionCycle: cycle };
}

export async function reviewAssessmentInTransaction(db, {
  actorId, assessmentId, ...input
}) {
  if (!isUuid(assessmentId)) throw new ReviewError(400, 'Invalid assessment ID');
  const { decision, note } = validateDecision(input);
  await requirePermission(db, actorId, 'assessments:approve');
  const assessment = await assessmentForActor(db, actorId, assessmentId, true);
  if (assessment.owner_user_id === actorId) {
    throw new ReviewError(403, 'The maker cannot review their own assessment');
  }
  if (assessment.status !== 'submitted') {
    throw new ReviewError(409, 'Only submitted assessments can be reviewed');
  }
  const approved = decision === 'approve';
  const status = approved ? 'approved' : 'changes_requested';
  const action = approved ? 'APPROVED' : 'CHANGES_REQUESTED';
  await db.query(
    'UPDATE assessments SET status = $2 WHERE id = $1',
    [assessmentId, status],
  );
  await db.query(
    'INSERT INTO assessment_review_events ' +
    '(assessment_id, submission_cycle, actor_user_id, action, note) ' +
    'VALUES ($1, $2, $3, $4, $5)',
    [assessmentId, assessment.submission_cycle, actorId, action, note],
  );
  return {
    assessmentId, status,
    submissionCycle: assessment.submission_cycle, reviewedBy: actorId,
  };
}

export async function listReviewHistory(db, actorId, assessmentId) {
  if (!isUuid(assessmentId)) throw new ReviewError(400, 'Invalid assessment ID');
  await requirePermission(db, actorId, 'assessments:read');
  const assessment = await assessmentForActor(db, actorId, assessmentId);
  const history = await db.query(
    'SELECT submission_cycle, actor_user_id, action, note, occurred_at ' +
    'FROM assessment_review_events WHERE assessment_id = $1 ORDER BY id DESC LIMIT 100',
    [assessmentId],
  );
  return {
    assessmentId, status: assessment.status,
    submissionCycle: assessment.submission_cycle, events: history.rows,
  };
}

async function transaction(pool, action) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await action(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export function submitAssessment(pool, args) {
  return transaction(pool, (db) => submitAssessmentInTransaction(db, args));
}

export function reviewAssessment(pool, args) {
  return transaction(pool, (db) => reviewAssessmentInTransaction(db, args));
}
