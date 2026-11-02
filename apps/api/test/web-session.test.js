import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ApiError, requestJson, getSession, getPermissions, signIn, signOut,
} from '../../web/assets/session.js';

test('client API hanya menerima path pada origin yang sama', async () => {
  await assert.rejects(requestJson('https://example.com'), TypeError);
  await assert.rejects(requestJson('//example.com'), TypeError);
});

test('login mengirim JSON dan credential same-origin tanpa menyimpan sesi di JavaScript', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ authenticated: true, userId: 'example' }) };
  };
  try {
    const login = await signIn('staff@example.test', 'long-password');
    assert.equal(login.authenticated, true);
    const request = calls[0];
    assert.equal(request.url, '/auth/login');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.credentials, 'same-origin');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(request.options.body), {
      email: 'staff@example.test', password: 'long-password',
    });
    await getSession();
    await getPermissions();
    await signOut();
    assert.deepEqual(calls.slice(1).map((x) => [x.url, x.options.method]), [
      ['/auth/session', 'GET'],
      ['/auth/permissions', 'GET'],
      ['/auth/logout', 'POST'],
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('kesalahan HTTP mempertahankan status untuk login dan sesi yang sudah habis', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 401,
    json: async () => ({ error: 'Unauthorized' }),
  });
  try {
    await assert.rejects(getSession(), (error) =>
      error instanceof ApiError && error.status === 401);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
