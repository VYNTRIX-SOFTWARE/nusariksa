import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export function buatServer() {
  return createServer((permintaan, respons) => {
    respons.setHeader('Content-Type', 'application/json; charset=utf-8');
    respons.setHeader('Cache-Control', 'no-store');
    respons.setHeader('X-Content-Type-Options', 'nosniff');

    if (permintaan.method === 'GET' && permintaan.url === '/kesehatan') {
      respons.writeHead(200);
      respons.end(JSON.stringify({ status: 'berjalan' }));
      return;
    }

    respons.writeHead(404);
    respons.end(JSON.stringify({ kesalahan: 'Rute tidak ditemukan' }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT harus berupa bilangan bulat antara 1 dan 65535.');
    process.exitCode = 1;
  } else {
    const server = buatServer();
    server.listen(port, '127.0.0.1', () => {
      console.log(`API pengembangan tersedia di http://127.0.0.1:${port}`);
    });
  }
}
