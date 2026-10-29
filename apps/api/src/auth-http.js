import { authenticateUser } from './authentication.js';
import { createSession, findSession, revokeSession } from './sessions.js';

const COOKIE_NAME = '__Host-nusariksa_session';
const COOKIE_OPTIONS = '; Path=/; Secure; HttpOnly; SameSite=Strict';
const MAX_BODY_BYTES = 4096;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

function tokenFromCookies(header) {
  if (typeof header !== 'string') return null;
  const candidates = header.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(COOKIE_NAME + '='));
  if (candidates.length !== 1) return null;
  return candidates[0].slice(COOKIE_NAME.length + 1);
}

function originAccepted(request, appOrigin) {
  return typeof appOrigin === 'string'
    && request.headers.origin === appOrigin
    && request.headers['sec-fetch-site'] !== 'cross-site';
}

async function readLoginPayload(request) {
  const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 415 };

  let length = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      oversized = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (oversized) return { status: 413 };

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return { status: 400 };
  }
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || typeof body.email !== 'string' || body.email.length > 254
    || typeof body.password !== 'string'
    || Buffer.byteLength(body.password, 'utf8') > 1024
    || body.password.length === 0) {
    return { status: 400 };
  }

  return { email: body.email.trim().toLowerCase(), password: body.password };
}

export function createAuthHandler({ db, appOrigin, limiter }) {
  return async function handleAuth(request, response) {
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }

    if (request.method === 'GET' && request.url === '/auth/session') {
      const token = tokenFromCookies(request.headers.cookie);
      const session = token ? await findSession(db, token) : null;
      if (!session) {
        respond(response, 401, { authenticated: false });
        return;
      }
      respond(response, 200, { authenticated: true, userId: session.userId });
      return;
    }

    if (!originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    if (request.method === 'POST' && request.url === '/auth/logout') {
      const token = tokenFromCookies(request.headers.cookie);
      if (token) await revokeSession(db, token);
      response.setHeader('Set-Cookie', COOKIE_NAME + '=' + COOKIE_OPTIONS + '; Max-Age=0');
      respond(response, 200, { authenticated: false });
      return;
    }

    if (request.method === 'POST' && request.url === '/auth/login') {
      const payload = await readLoginPayload(request);
      if (payload.status) {
        respond(response, payload.status, { error: 'Invalid request' });
        return;
      }

      const address = request.socket.remoteAddress ?? 'unknown';
      if (!limiter.allow(address, payload.email)) {
        response.setHeader('Retry-After', '900');
        respond(response, 429, { error: 'Too many attempts' });
        return;
      }

      const user = await authenticateUser(db, payload.email, payload.password);
      if (!user) {
        limiter.failure(address, payload.email);
        respond(response, 401, { error: 'Invalid credentials' });
        return;
      }

      const session = await createSession(db, user.userId);
      limiter.success(address, payload.email);
      const previousToken = tokenFromCookies(request.headers.cookie);
      if (previousToken) await revokeSession(db, previousToken);
      response.setHeader('Set-Cookie',
        COOKIE_NAME + '=' + session.token + COOKIE_OPTIONS + '; Max-Age=28800');
      respond(response, 200, { authenticated: true, userId: user.userId });
      return;
    }

    respond(response, 404, { error: 'Not found' });
  };
}
