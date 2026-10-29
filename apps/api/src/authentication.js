import { verifyPassword } from './passwords.js';

// Hash uji tetap untuk menyamakan pekerjaan verifikasi ketika akun tidak ditemukan.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$ABEiM0RVZneImaq7zN3u/w$rUrgmTkzYhpz/R7JFWFucqjLiMOLqKHCduVKOGt2ILI';

export async function authenticateUser(db, email, password) {
  if (typeof email !== 'string' || email.length > 254) return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254) return null;

  const result = await db.query(
    'SELECT id, status, password_hash FROM users WHERE email = $1',
    [normalizedEmail],
  );

  const account = result.rows[0];
  const verified = await verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
  if (!verified || account?.status !== 'active') return null;

  return { userId: account.id };
}
