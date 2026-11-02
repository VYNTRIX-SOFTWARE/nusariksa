import { userHasPermission } from './authorization.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATINGS = Object.freeze([
  'compliant', 'partially_compliant', 'non_compliant', 'not_applicable',
]);

export class ReportError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ReportError';
    this.status = status;
  }
}

export function summarizeControls(controls) {
  const ratings = Object.fromEntries(RATINGS.map((rating) => [rating, 0]));
  let assessed = 0;
  for (const control of controls) {
    if (RATINGS.includes(control.rating)) {
      ratings[control.rating] += 1;
      assessed += 1;
    }
  }
  return {
    total: controls.length,
    assessed,
    notAssessed: controls.length - assessed,
    completionPercent: controls.length === 0 ? 0
      : Math.round(100 * assessed / controls.length),
    ratings,
  };
}

export async function buildAssessmentReportInTransaction(db, { actorId, assessmentId }) {
  if (typeof assessmentId !== 'string' || !UUID_PATTERN.test(assessmentId)) {
    throw new ReportError(400, 'Invalid assessment ID');
  }
  if (typeof actorId !== 'string' || !UUID_PATTERN.test(actorId)
    || !await userHasPermission(db, actorId, 'reports:read')) {
    throw new ReportError(403, 'Forbidden');
  }

  const found = await db.query(
    'SELECT a.id, a.title, to_char(a.period_start, ' +
    "'YYYY-MM-DD') AS period_start, to_char(a.period_end, 'YYYY-MM-DD') AS period_end, " +
    'a.status, a.owner_user_id, a.submission_cycle, a.created_at, a.started_at, ' +
    'i.name AS institution_name, i.kind AS institution_kind, ' +
    'v.id AS catalog_version_id, v.version AS catalog_version, ' +
    'v.published_at AS catalog_published_at, ' +
    'c.code AS catalog_code, c.title AS catalog_title ' +
    'FROM assessments a ' +
    'JOIN users reader ON reader.id = $1 AND reader.institution_id = a.institution_id ' +
    'JOIN institutions i ON i.id = a.institution_id ' +
    'LEFT JOIN assessment_catalog_assignments aca ON aca.assessment_id = a.id ' +
    'LEFT JOIN control_catalog_versions v ON v.id = aca.catalog_version_id ' +
    'LEFT JOIN control_catalogs c ON c.id = v.catalog_id ' +
    'WHERE a.id = $2',
    [actorId, assessmentId],
  );
  if (found.rowCount !== 1) throw new ReportError(404, 'Assessment not found');
  const a = found.rows[0];

  let controls = [];
  if (a.catalog_version_id) {
    const rows = await db.query(
      'SELECT c.control_code, c.title, c.description, c.position, ' +
      'c.source_document, c.source_section, ' +
      "coalesce(r.rating, 'not_assessed') AS rating, " +
      "coalesce(r.note, '') AS note, coalesce(r.revision, 0) AS revision, " +
      'r.updated_by, r.updated_at ' +
      'FROM control_definitions c ' +
      'LEFT JOIN assessment_control_results r ON r.assessment_id = $1 ' +
      'AND r.control_id = c.id AND r.catalog_version_id = c.version_id ' +
      'WHERE c.version_id = $2 ORDER BY c.position',
      [assessmentId, a.catalog_version_id],
    );
    controls = rows.rows;
  }

  const lastReview = await db.query(
    'SELECT actor_user_id, action, note, submission_cycle, occurred_at ' +
    'FROM assessment_review_events ' +
    "WHERE assessment_id = $1 AND action IN ('APPROVED', 'CHANGES_REQUESTED') " +
    'ORDER BY id DESC LIMIT 1',
    [assessmentId],
  );

  return {
    generatedAt: new Date().toISOString(),
    reportType: 'internal_assessment',
    final: a.status === 'approved',
    assessment: {
      id: a.id,
      title: a.title,
      periodStart: a.period_start,
      periodEnd: a.period_end,
      status: a.status,
      ownerUserId: a.owner_user_id,
      submissionCycle: a.submission_cycle,
      createdAt: a.created_at,
      startedAt: a.started_at,
    },
    institution: { name: a.institution_name, kind: a.institution_kind },
    catalog: a.catalog_version_id ? {
      versionId: a.catalog_version_id,
      code: a.catalog_code,
      title: a.catalog_title,
      version: a.catalog_version,
      publishedAt: a.catalog_published_at,
    } : null,
    summary: summarizeControls(controls),
    controls,
    latestReviewDecision: lastReview.rows[0] ?? null,
    note: 'Penilaian internal; bukan bukti kepatuhan yang disahkan regulator.',
  };
}

export async function getAssessmentReport(pool, args) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const report = await buildAssessmentReportInTransaction(db, args);
    await db.query('COMMIT');
    return report;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
