import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

const MEMORY_KIB = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;
const HASH_PATTERN = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;

function validPassword(password) {
  return typeof password === 'string'
    && Buffer.byteLength(password, 'utf8') > 0
    && Buffer.byteLength(password, 'utf8') <= 1024;
}

function decodeBase64(value, length) {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== length || decoded.toString('base64').replace(/=+$/, '') !== value) {
    return null;
  }
  return decoded;
}

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    argon2('argon2id', {
      message: Buffer.from(password, 'utf8'),
      nonce: salt,
      memory: MEMORY_KIB,
      passes: PASSES,
      parallelism: PARALLELISM,
      tagLength: HASH_LENGTH,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password) {
  if (!validPassword(password)) throw new TypeError('Invalid password');

  const salt = randomBytes(SALT_LENGTH);
  const hash = await deriveKey(password, salt);
  const encodedSalt = salt.toString('base64').replace(/=+$/, '');
  const encodedHash = hash.toString('base64').replace(/=+$/, '');

  return '$argon2id$v=19$m=19456,t=2,p=1$' + encodedSalt + '$' + encodedHash;
}

export async function verifyPassword(password, encodedHash) {
  if (!validPassword(password) || typeof encodedHash !== 'string') return false;

  const match = HASH_PATTERN.exec(encodedHash);
  if (!match) return false;

  const salt = decodeBase64(match[1], SALT_LENGTH);
  const expected = decodeBase64(match[2], HASH_LENGTH);
  if (!salt || !expected) return false;

  const candidate = await deriveKey(password, salt);
  return timingSafeEqual(candidate, expected);
}
