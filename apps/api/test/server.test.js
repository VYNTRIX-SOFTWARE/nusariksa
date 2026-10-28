import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { once } from 'node:events';
import { buatServer } from '../src/server.js';

const server = buatServer();
let alamat;

before(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  alamat = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

test('endpoint kesehatan memberikan status yang benar', async () => {
  const respons = await fetch(`${alamat}/kesehatan`);
  assert.equal(respons.status, 200);
  assert.equal(respons.headers.get('cache-control'), 'no-store');
  assert.equal(respons.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await respons.json(), { status: 'berjalan' });
});

test('rute yang tidak tersedia mengembalikan 404', async () => {
  const respons = await fetch(`${alamat}/tidak-ada`);
  assert.equal(respons.status, 404);
  assert.deepEqual(await respons.json(), { kesalahan: 'Rute tidak ditemukan' });
});

test('metode POST tidak diterima oleh endpoint kesehatan', async () => {
  const respons = await fetch(`${alamat}/kesehatan`, { method: 'POST' });
  assert.equal(respons.status, 404);
});
