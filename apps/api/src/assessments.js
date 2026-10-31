import { userHasPermission } from './authorization.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const COLUMNS = "a.id, a.title, to_char(a.period_start, 'YYYY-MM-DD') AS period_start, " +
  "to_char(a.period_end, 'YYYY-MM-DD') AS period_end, a.owner_user_id, " +
  "a.status, a.created_at, a.started_at";

export class AssessmentError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AssessmentError';
    this.status = status;
  }
}

function validDate(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, yy, mm, dd] = match;
  const year = Number(yy);
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateAssessment({ title, periodStart, periodEnd } = {}) {
  if (typeof title !== 'string' || title.length < 3 || title.length > 200
    || title.trim() !== title || /[\u0000-\u001f\u007f]/.test(title)
    || !validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart) {
    throw new AssessmentError(400, 'Invalid assessment data');
  }
  return { title, periodStart, periodEnd };
}

function validId(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

async function requirePermission(db, actorId, permission) {
  if (!validId(actorId) || !await userHasPermission(db, actorId, permission)) {
    throw new AssessmentError(403, 'Forbidden');
  }
}

export async function createAssessmentInTransaction(db, { actorId, ...input }) {
  const data = validateAssessment(input);
  await requirePermission(db, actorId, 'assessments:write');
  const result = await db.query(
    'INSERT INTO assessments (institution_id, title, period_start, period_end, owner_user_id, created_by) ' +
    "SELECT institution_id, $2, $3::date, $4::date, id, id FROM users " +
    "WHERE id = $1 AND status = 'active' AND password_hash IS NOT NULL " +
    'RETURNING id',
    [actorId, data.title, data.periodStart, data.periodEnd],
  );
  if (result.rowCount !== 1) throw new AssessmentError(403, 'Forbidden');
  const id = result.rows[0].id;
  await db.query(
    "INSERT INTO assessment_events (assessment_id, actor_user_id, action) VALUES ($1, $2, 'CREATED')",
    [id, actorId],
  );
  return getAssessment(db, actorId, id);
}

export async function listAssessments(db, actorId) {
  await requirePermission(db, actorId, 'assessments:read');
  const result = await db.query(
    'SELECT ' + COLUMNS + ' FROM assessments a ' +
    'JOIN users viewer ON viewer.institution_id = a.institution_id AND viewer.id = $1 ' +
    'ORDER BY a.created_at DESC, a.id DESC LIMIT 50',
    [actorId],
  );
  return { assessments: result.rows };
}

export async function getAssessment(db, actorId, id) {
  if (!validId(id)) throw new AssessmentError(400, 'Invalid assessment ID');
  await requirePermission(db, actorId, 'assessments:read');
  const result = await db.query(
    'SELECT ' + COLUMNS + ' FROM assessments a ' +
    'JOIN users viewer ON viewer.institution_id = a.institution_id AND viewer.id = $1 ' +
    'WHERE a.id = $2',
    [actorId, id],
  );
  if (result.rowCount !== 1) throw new AssessmentError(404, 'Assessment not found');
  return result.rows[0];
}

export async function startAssessmentInTransaction(db, { actorId, id }) {
  if (!validId(id)) throw new AssessmentError(400, 'Invalid assessment ID');
  await requirePermission(db, actorId, 'assessments:write');
  const found = await db.query(
    'SELECT a.owner_user_id, a.status FROM assessments a ' +
    'JOIN users actor ON actor.institution_id = a.institution_id AND actor.id = $1 ' +
    'WHERE a.id = $2 FOR UPDATE OF a',
    [actorId, id],
  );
  if (found.rowCount !== 1) throw new AssessmentError(404, 'Assessment not found');
  if (found.rows[0].owner_user_id !== actorId) {
    throw new AssessmentError(403, 'Only the owner can start an assessment');
  }
  if (found.rows[0].status !== 'draft') {
    throw new AssessmentError(409, 'Assessment has already started');
  }
  await db.query(
    "UPDATE assessments SET status = 'in_progress', started_at = now() WHERE id = $1",
    [id],
  );
  await db.query(
    "INSERT INTO assessment_events (assessment_id, actor_user_id, action) VALUES ($1, $2, 'STARTED')",
    [id, actorId],
  );
  return getAssessment(db, actorId, id);
}

async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function createAssessment(pool, args) {
  return transaction(pool, (db) => createAssessmentInTransaction(db, args));
}

export function startAssessment(pool, args) {
  return transaction(pool, (db) => startAssessmentInTransaction(db, args));
}
