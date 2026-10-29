import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginLimiter } from '../src/login-limiter.js';

test('pembatasan percobaan diterapkan pada akun dan pulih setelah jendela waktu', () => {
  let time = 0;
  const limiter = createLoginLimiter({ now: () => time, windowMs: 1000 });
  for (let index = 0; index < 5; index++) {
    assert.equal(limiter.allow('127.0.0.1', 'a@example.test'), true);
    limiter.failure('127.0.0.1', 'a@example.test');
  }
  assert.equal(limiter.allow('127.0.0.1', 'a@example.test'), false);
  assert.equal(limiter.allow('127.0.0.1', 'b@example.test'), true);
  time = 1001;
  assert.equal(limiter.allow('127.0.0.1', 'a@example.test'), true);
});

test('pembatasan IP tetap berlaku lintas akun', () => {
  const limiter = createLoginLimiter();
  for (let index = 0; index < 30; index++) {
    const email = 'user' + index + '@example.test';
    assert.equal(limiter.allow('127.0.0.1', email), true);
    limiter.failure('127.0.0.1', email);
  }
  assert.equal(limiter.allow('127.0.0.1', 'new@example.test'), false);
  assert.equal(limiter.allow('127.0.0.2', 'new@example.test'), true);
});
