import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function createServer() {
  return createHttpServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok' }));
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
    const server = createServer();
    server.listen(port, '127.0.0.1', () => {
      console.log(`API pengembangan tersedia di http://127.0.0.1:${port}`);
    });
  }
}
