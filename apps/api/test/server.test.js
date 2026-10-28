import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { createServer } from '../src/server.js';

const server = createServer();
let baseUrl;

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

test('endpoint health mengembalikan respons yang benar', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('rute yang tidak dikenal mengembalikan 404', async () => {
  const response = await fetch(`${baseUrl}/unknown`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('metode POST tidak diterima pada endpoint health', async () => {
  const response = await fetch(`${baseUrl}/health`, { method: 'POST' });
  assert.equal(response.status, 404);
});
