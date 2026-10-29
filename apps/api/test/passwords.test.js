import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/passwords.js';

const password = 'NusaRiksa!password-2026';
const knownHash = '$argon2id$v=19$m=19456,t=2,p=1$ABEiM0RVZneImaq7zN3u/w$rUrgmTkzYhpz/R7JFWFucqjLiMOLqKHCduVKOGt2ILI';

test('Argon2id cocok dengan vektor pengujian independen', async () => {
  assert.equal(await verifyPassword(password, knownHash), true);
  assert.equal(await verifyPassword('password-yang-salah', knownHash), false);
});

test('password yang sama menghasilkan salt dan hash berbeda', async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);

  assert.match(first, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password, second), true);
  assert.equal(await verifyPassword('salah', first), false);
});

test('hash yang rusak, algoritme lain, dan input tak valid ditolak', async () => {
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, 'hash-biasa'), false);
  assert.equal(await verifyPassword(password, knownHash.replace('argon2id', 'argon2i')), false);
  assert.equal(await verifyPassword(password, knownHash.replace('m=19456', 'm=99999999')), false);
  assert.equal(await verifyPassword(password, knownHash.slice(0, -1)), false);
  assert.equal(await verifyPassword('', knownHash), false);
  assert.equal(await verifyPassword('x'.repeat(1025), knownHash), false);
  await assert.rejects(hashPassword(''), TypeError);
  await assert.rejects(hashPassword('x'.repeat(1025)), TypeError);
});
