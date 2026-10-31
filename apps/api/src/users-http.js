import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  AccountError, activatePendingAccount, createPendingAccount, disableAccount, listAccounts,
} from './user-accounts.js';

const DISABLE = /^\/users\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/disable$/i;
const MAX_BODY = 2048;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function readJson(request, expected) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { error: 415 };
  let size = 0;
  const chunks = [];
  let oversized = false;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) return { error: 413 };
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).length !== expected.length
      || !expected.every((key) => typeof body[key] === 'string')) {
      return { error: 400 };
    }
    return { body };
  } catch {
    return { error: 400 };
  }
}

export function createUserAccountsHandler({
  db, appOrigin,
  createUser = createPendingAccount,
  activateUser = activatePendingAccount,
  disableUser = disableAccount,
  listUsers = listAccounts,
}) {
  return async function handleAccounts(request, response) {
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }

    const isActivation = request.method === 'POST' && request.url === '/auth/activate';
    const isList = request.method === 'GET' && request.url === '/users';
    const isCreate = request.method === 'POST' && request.url === '/users';
    const matchDisable = request.method === 'POST' ? DISABLE.exec(request.url ?? '') : null;
    if (!isActivation && !isList && !isCreate && !matchDisable) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!isList && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    let actorId;
    if (!isActivation) {
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
      actorId = session.userId;
    }

    if (isList) {
      const result = await listUsers(db, actorId);
      respond(response, 200, result);
      return;
    }
    if (matchDisable) {
      try {
        const result = await disableUser(db, { actorId, targetId: matchDisable[1] });
        respond(response, 200, result);
      } catch (error) {
        if (!(error instanceof AccountError)) throw error;
        respond(response, error.status, { error: error.message });
      }
      return;
    }

    const input = await readJson(request, isActivation ? ['token', 'password'] : ['email']);
    if (input.error) {
      respond(response, input.error, { error: 'Invalid request' });
      return;
    }
    try {
      if (isActivation) {
        const result = await activateUser(db, input.body);
        respond(response, 200, result);
      } else {
        const result = await createUser(db, { actorId, email: input.body.email });
        respond(response, 201, result);
      }
    } catch (error) {
      if (!(error instanceof AccountError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
