import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { changeUserRole, RoleChangeError } from './role-management.js';
import { findSession } from './sessions.js';

const ROUTE = /^\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/roles$/i;
const MAX_BODY = 1024;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function readChange(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { error: 415 };
  let size = 0;
  const chunks = [];
  let tooLarge = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) tooLarge = true;
    else chunks.push(chunk);
  }
  if (tooLarge) return { error: 413 };
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object'
      || Object.keys(parsed).length !== 2 || typeof parsed.role !== 'string'
      || !['GRANT', 'REVOKE'].includes(parsed.action)) return { error: 400 };
    return { role: parsed.role, action: parsed.action };
  } catch {
    return { error: 400 };
  }
}

export function createRolesHandler({ db, appOrigin, changeRole = changeUserRole }) {
  return async function handleRoles(request, response) {
    const match = typeof request.url === 'string' ? ROUTE.exec(request.url) : null;
    if (!match || request.method !== 'PATCH') {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if (!originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    if (!await userHasPermission(db, session.userId, 'users:manage')) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    const change = await readChange(request);
    if (change.error) {
      respond(response, change.error, { error: 'Invalid request' });
      return;
    }
    try {
      const result = await changeRole(db, {
        actorId: session.userId,
        targetId: match[1],
        role: change.role,
        action: change.action,
      });
      respond(response, 200, result);
    } catch (error) {
      if (error instanceof RoleChangeError) {
        respond(response, error.status, { error: error.message });
        return;
      }
      throw error;
    }
  };
}
