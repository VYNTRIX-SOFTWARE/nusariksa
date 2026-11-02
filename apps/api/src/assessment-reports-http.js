import { tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import { getAssessmentReport, ReportError } from './assessment-reports.js';

const REPORT_PATH = /^\/assessments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/report$/i;

function respond(response, status, payload) {
  response.writeHead(status);
  response.end(JSON.stringify(payload));
}

export function createAssessmentReportsHandler({
  db, appOrigin, report = getAssessmentReport,
}) {
  return async function handleReport(request, response) {
    const match = request.method === 'GET' ? REPORT_PATH.exec(request.url ?? '') : null;
    if (!match) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    if (!await userHasPermission(db, session.userId, 'reports:read')) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    try {
      respond(response, 200, await report(db, {
        actorId: session.userId, assessmentId: match[1],
      }));
    } catch (error) {
      if (!(error instanceof ReportError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
