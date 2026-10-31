import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAuthHandler } from './auth-http.js';
import { checkDatabase, createPool } from './database.js';
import { createLoginLimiter } from './login-limiter.js';
import { createRolesHandler } from './roles-http.js';

export function createServer({
  checkReadiness = async () => false,
  authDb = null,
  appOrigin = null,
  loginLimiter = createLoginLimiter(),
  changeRole,
} = {}) {
  const handleAuth = createAuthHandler({ db: authDb, appOrigin, limiter: loginLimiter });
  const handleRoles = createRolesHandler({ db: authDb, appOrigin, changeRole });
  return createHttpServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
      let ready = false;
      try {
        ready = await checkReadiness();
      } catch {
        // Informasi koneksi database tidak boleh muncul dalam respons HTTP.
      }
      response.writeHead(ready ? 200 : 503);
      response.end(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }));
      return;
    }

    if (request.url === '/auth/login' || request.url === '/auth/logout'
      || request.url === '/auth/session' || request.url === '/auth/permissions') {
      try {
        await handleAuth(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url?.startsWith('/users/')) {
      try {
        await handleRoles(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT harus berupa bilangan bulat antara 1 dan 65535.');
    process.exitCode = 1;
  } else {
    const pool = createPool();
    const server = createServer({
      checkReadiness: () => checkDatabase(pool),
      authDb: pool,
      appOrigin: process.env.APP_ORIGIN,
    });
    server.on('close', () => { if (pool) void pool.end(); });
    server.listen(port, '127.0.0.1', () => {
      console.log('API pengembangan tersedia di http://127.0.0.1:' + port);
    });
  }
}
