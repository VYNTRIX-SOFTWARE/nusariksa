import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  PadkCyberError, padkCyberFramework, previewPadkCyberMaturity,
} from './padk-cyber-maturity.js';

const BASE = '/regulatory/padk43/cyber';
const MAX_BODY = 262144;

function respond(response, status, value) {
  response.writeHead(status);
  response.end(JSON.stringify(value));
}

async function parsePreviewBody(request) {
  const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 415 };
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY) tooLarge = true;
    else chunks.push(chunk);
  }
  if (tooLarge) return { status: 413 };
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 400 };
    }
    return { data: parsed };
  } catch {
    return { status: 400 };
  }
}

export function createPadkCyberHandler({
  db, appOrigin, framework = padkCyberFramework,
  preview = previewPadkCyberMaturity,
}) {
  return async function handlePadkCyber(request, response) {
    const path = request.url ?? '';
    const method = request.method;
    const isFramework = method === 'GET' && path === BASE + '/framework';
    const isPreview = method === 'POST' && path === BASE + '/preview';
    if (!isFramework && !isPreview) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if (isPreview && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    const requiredPermission = isPreview ? 'assessments:write' : 'assessments:read';
    if (!await userHasPermission(db, session.userId, requiredPermission)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    if (isFramework) {
      respond(response, 200, framework());
      return;
    }
    const body = await parsePreviewBody(request);
    if (body.status) {
      respond(response, body.status, { error: 'Invalid request' });
      return;
    }
    try {
      respond(response, 200, preview(body.data));
    } catch (error) {
      if (!(error instanceof PadkCyberError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
