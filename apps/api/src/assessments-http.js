import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  AssessmentError, createAssessment, getAssessment, listAssessments, startAssessment,
} from './assessments.js';

const DETAILS = /^\/assessments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const START = /^\/assessments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/start$/i;
const MAX_BODY = 2048;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function readCreateBody(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { error: 415 };
  let size = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) return { error: 413 };
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 3
      || !['title', 'periodStart', 'periodEnd'].every((key) => typeof body[key] === 'string')) {
      return { error: 400 };
    }
    return { body };
  } catch {
    return { error: 400 };
  }
}

export function createAssessmentsHandler({
  db, appOrigin,
  create = createAssessment, list = listAssessments,
  get = getAssessment, start = startAssessment,
}) {
  return async function handleAssessments(request, response) {
    const isList = request.method === 'GET' && request.url === '/assessments';
    const isCreate = request.method === 'POST' && request.url === '/assessments';
    const detail = request.method === 'GET' ? DETAILS.exec(request.url ?? '') : null;
    const begin = request.method === 'POST' ? START.exec(request.url ?? '') : null;
    if (!isList && !isCreate && !detail && !begin) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if ((isCreate || begin) && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    const permission = isCreate || begin ? 'assessments:write' : 'assessments:read';
    if (!await userHasPermission(db, session.userId, permission)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    try {
      if (isList) {
        respond(response, 200, await list(db, session.userId));
        return;
      }
      if (detail) {
        respond(response, 200, await get(db, session.userId, detail[1]));
        return;
      }
      if (begin) {
        respond(response, 200, await start(db, { actorId: session.userId, id: begin[1] }));
        return;
      }
      const input = await readCreateBody(request);
      if (input.error) {
        respond(response, input.error, { error: 'Invalid request' });
        return;
      }
      const result = await create(db, { actorId: session.userId, ...input.body });
      respond(response, 201, result);
    } catch (error) {
      if (!(error instanceof AssessmentError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
