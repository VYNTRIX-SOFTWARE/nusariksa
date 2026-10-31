import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { verifyPassword } from '../src/passwords.js';
import { createSession, findSession } from '../src/sessions.js';
import {
  AccountError, createPendingAccountInTransaction, activatePendingAccountInTransaction,
  disableAccountInTransaction, listAccounts, createPendingAccount,
} from '../src/user-accounts.js';

test('akun pending diaktifkan dengan token sekali pakai tanpa menyimpan token atau password asli', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Akun', 'BPR')");
      const admin = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES ('admin-account@example.test', 'active', 'hash-uji') RETURNING id",
      );
      const adminId = admin.rows[0].id;
      await db.query(
        "INSERT INTO user_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')",
        [adminId],
      );
      const pending = await createPendingAccountInTransaction(db, {
        actorId: adminId, email: ' Staff@Example.test ',
      });
      assert.equal(pending.email, 'staff@example.test');
      assert.match(pending.invitationToken, /^[A-Za-z0-9_-]{43}$/);
      const saved = await db.query(
        'SELECT token_hash, consumed_at FROM account_invitations WHERE user_id = $1',
        [pending.userId],
      );
      assert.equal(saved.rows[0].token_hash.length, 32);
      assert.notEqual(saved.rows[0].token_hash.toString(), pending.invitationToken);
      assert.ok(saved.rows[0].token_hash.equals(createHash('sha256').update(
        Buffer.from(pending.invitationToken, 'base64url'),
      ).digest()));
      assert.equal(saved.rows[0].consumed_at, null);

      const password = 'Sandi-Pengguna-2026!';
      await assert.rejects(
        activatePendingAccountInTransaction(db, {
          token: pending.invitationToken, password: 'pendek',
        }),
        (e) => e instanceof AccountError && e.status === 400,
      );
      await assert.rejects(
        activatePendingAccountInTransaction(db, {
          token: 'A'.repeat(43), password,
        }),
        (e) => e.status === 401,
      );
      const activated = await activatePendingAccountInTransaction(db, {
        token: pending.invitationToken, password,
      });
      assert.deepEqual(activated, { userId: pending.userId, activated: true });
      const account = await db.query(
        'SELECT status, password_hash FROM users WHERE id = $1',
        [pending.userId],
      );
      assert.equal(account.rows[0].status, 'active');
      assert.equal(await verifyPassword(password, account.rows[0].password_hash), true);
      assert.notEqual(account.rows[0].password_hash, password);

      await assert.rejects(
        activatePendingAccountInTransaction(db, { token: pending.invitationToken, password }),
        (e) => e.status === 401,
      );
      const events = await db.query(
        'SELECT action, actor_user_id, target_user_id FROM user_account_events ORDER BY id',
      );
      assert.deepEqual(events.rows.map((x) => x.action), ['CREATE', 'ACTIVATE']);
      assert.equal(events.rows[0].actor_user_id, adminId);
      assert.equal(events.rows[1].actor_user_id, pending.userId);
      await db.query('SAVEPOINT audit_no_delete');
      await assert.rejects(
        db.query("DELETE FROM user_account_events WHERE action = 'CREATE'"),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT audit_no_delete');
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});

test('hanya admin aktif dapat membuat akun; duplikasi email, akun dinonaktifkan, dan sesi dicabut', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Disable', 'BPR')");
      const accounts = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('owner@example.test', 'active', 'hash-uji'), " +
        "('other@example.test', 'active', 'hash-uji') RETURNING id, email",
      );
      const ids = Object.fromEntries(accounts.rows.map((a) => [a.email, a.id]));
      const adminId = ids['owner@example.test'];
      const otherId = ids['other@example.test'];
      await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'SUPER_ADMIN')", [adminId]);
      await assert.rejects(
        createPendingAccountInTransaction(db, { actorId: otherId, email: 'some@example.test' }),
        (e) => e.status === 403,
      );
      await assert.rejects(
        createPendingAccountInTransaction(db, { actorId: adminId, email: 'invalid-email' }),
        (e) => e.status === 400,
      );
      const invite = await createPendingAccountInTransaction(db, {
        actorId: adminId, email: 'new@example.test',
      });
      await db.query('SAVEPOINT repeated_email');
      await assert.rejects(
        createPendingAccountInTransaction(db, { actorId: adminId, email: 'NEW@example.test' }),
        (e) => e.status === 409,
      );
      await db.query('ROLLBACK TO SAVEPOINT repeated_email');

      const session = await createSession(db, otherId);
      assert.ok(await findSession(db, session.token));
      await assert.rejects(
        disableAccountInTransaction(db, { actorId: adminId, targetId: adminId }),
        (e) => e.status === 403,
      );
      const disabled = await disableAccountInTransaction(db, {
        actorId: adminId, targetId: otherId,
      });
      assert.deepEqual(disabled, { userId: otherId, status: 'disabled' });
      assert.equal(await findSession(db, session.token), null);
      await assert.rejects(
        disableAccountInTransaction(db, { actorId: adminId, targetId: otherId }),
        (e) => e.status === 409,
      );
      await disableAccountInTransaction(db, { actorId: adminId, targetId: invite.userId });
      await assert.rejects(
        activatePendingAccountInTransaction(db, {
          token: invite.invitationToken, password: 'sandi-aman-untuk-uji',
        }),
        (e) => e.status === 401,
      );
      assert.deepEqual(await listAccounts(db, adminId).then((x) =>
        x.users.find((u) => u.id === invite.userId)?.status), 'disabled');
      await assert.rejects(listAccounts(db, otherId), (e) => e.status === 403);
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});

test('gagal menulis audit membatalkan pembuatan akun sebelum commit', async () => {
  const actions = [];
  let released = false;
  const client = {
    async query(sql) {
      actions.push(sql);
      if (sql.startsWith('SELECT 1 FROM users')) return { rowCount: 1, rows: [{}] };
      if (sql.startsWith('INSERT INTO users')) return {
        rowCount: 1, rows: [{ id: '00000000-0000-4000-8000-000000000002' }],
      };
      if (sql.startsWith('INSERT INTO user_account_events')) throw new Error('Audit unavailable');
      return { rowCount: 1, rows: [] };
    },
    release() { released = true; },
  };
  await assert.rejects(
    createPendingAccount({ async connect() { return client; } }, {
      actorId: '00000000-0000-4000-8000-000000000001',
      email: 'pending@example.test',
    }),
    /Audit unavailable/,
  );
  assert.equal(actions[0], 'BEGIN');
  assert.equal(actions.at(-1), 'ROLLBACK');
  assert.ok(actions.some((x) => x.startsWith('INSERT INTO account_invitations')));
  assert.equal(actions.includes('COMMIT'), false);
  assert.equal(released, true);
});
