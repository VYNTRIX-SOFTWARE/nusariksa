import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  AssessmentResultError, listAssessmentResults,
  resultHistory, writeAssessmentResult,
} from './assessment-results.js';

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const LIST = new RegExp('^/assessments/' + ID + '/results$', 'i');
const DETAIL = new RegExp('^/assessments/' + ID + '/results/' + ID + '$', 'i');
const HISTORY = new RegExp('^/assessments/' + ID + '/results/' + ID + '/history$', 'i');
const MAX_BODY = 4096;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function parseResultBody(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { error: 415 };

  const chunks = [];
  let size = 0;
  let oversized = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) return { error: 413 };

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 3
      || typeof value.rating !== 'string' || typeof value.note !== 'string'
      || !Number.isSafeInteger(value.expectedRevision)) return { error: 400 };
    return { value };
  } catch {
    return { error: 400 };
  }
}

export function createAssessmentResultsHandler({
  db, appOrigin,
  list = listAssessmentResults, write = writeAssessmentResult,
  history = resultHistory,
}) {
  return async function handleResults(request, response) {
    const path = request.url ?? '';
    const listMatch = request.method === 'GET' ? LIST.exec(path) : null;
    const writeMatch = request.method === 'PUT' ? DETAIL.exec(path) : null;
    const historyMatch = request.method === 'GET' ? HISTORY.exec(path) : null;

    if (!listMatch && !writeMatch && !historyMatch) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if (writeMatch && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    const permission = writeMatch ? 'assessments:write' : 'assessments:read';
    if (!await userHasPermission(db, session.userId, permission)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    try {
      if (listMatch) {
        respond(response, 200, await list(db, session.userId, listMatch[1]));
        return;
      }
      if (historyMatch) {
        respond(response, 200, await history(db, session.userId,
          historyMatch[1], historyMatch[2]));
        return;
      }
      const parsed = await parseResultBody(request);
      if (parsed.error) {
        respond(response, parsed.error, { error: 'Invalid request' });
        return;
      }
      const result = await write(db, {
        actorId: session.userId, assessmentId: writeMatch[1], controlId: writeMatch[2],
        ...parsed.value,
      });
      respond(response, 200, result);
    } catch (error) {
      if (!(error instanceof AssessmentResultError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
