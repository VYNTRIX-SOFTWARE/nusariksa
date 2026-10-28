import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { checkDatabase, createPool } from './database.js';

export function createServer({ checkReadiness = async () => false } = {}) {
  return createHttpServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

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
    const server = createServer({ checkReadiness: () => checkDatabase(pool) });
    server.on('close', () => { if (pool) void pool.end(); });
    server.listen(port, '127.0.0.1', () => {
      console.log(`API pengembangan tersedia di http://127.0.0.1:${port}`);
    });
  }
}
