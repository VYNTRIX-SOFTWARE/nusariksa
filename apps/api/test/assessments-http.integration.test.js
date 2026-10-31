import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createSession } from '../src/sessions.js';
import { createServer } from '../src/server.js';
import {
  createAssessmentInTransaction, startAssessmentInTransaction,
} from '../src/assessments.js';

const origin = 'http://127.0.0.1:3000';

test('API asesmen menegakkan sesi, izin, validasi dan status', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji HTTP Asesmen','BPR')");
      const users = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('owner-http-assessment@example.test','active','hash-uji')," +
        "('viewer-http-assessment@example.test','active','hash-uji')," +
        "('none-http-assessment@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(users.rows.map((x) => [x.email, x.id]));
      const owner = ids['owner-http-assessment@example.test'];
      const viewer = ids['viewer-http-assessment@example.test'];
      const none = ids['none-http-assessment@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [owner, viewer],
      );
      const cookies = {};
      for (const [key, userId] of [['owner',owner],['viewer',viewer],['none',none]]) {
        cookies[key] = '__Host-nusariksa_session=' + (await createSession(db, userId)).token;
      }
      const server = createServer({
        authDb: db, appOrigin: origin,
        createAssessment: (client, data) => createAssessmentInTransaction(client, data),
        startAssessment: (client, data) => startAssessmentInTransaction(client, data),
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const payload = {
        title: 'Asesmen TI 2027', periodStart: '2027-01-01', periodEnd: '2027-12-31',
      };
      const send = (url, method = 'GET', cookie, body, requestOrigin = origin, type = 'application/json') =>
        fetch(base + url, {
          method, headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(method !== 'GET' ? { Origin: requestOrigin, 'Content-Type': type } : {}),
          },
          ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
        });
      try {
        assert.equal((await send('/assessments')).status, 401);
        assert.equal((await send('/assessments', 'GET', cookies.none)).status, 403);
        assert.equal((await send('/assessments', 'POST', cookies.viewer, payload)).status, 403);
        assert.equal((await send('/assessments', 'POST', cookies.owner, payload, 'https://evil.example')).status, 403);
        assert.equal((await send('/assessments', 'POST', cookies.owner, payload, origin, 'text/plain')).status, 415);
        assert.equal((await send('/assessments', 'POST', cookies.owner, '{')).status, 400);
        assert.equal((await send('/assessments', 'POST', cookies.owner, {
          ...payload, status: 'in_progress',
        })).status, 400);
        assert.equal((await send('/assessments', 'POST', cookies.owner, {
          ...payload, periodEnd: '2026-12-31',
        })).status, 400);
        assert.equal((await send('/assessments', 'POST', cookies.owner, {
          ...payload, title: 'X'.repeat(3000),
        })).status, 413);
        const created = await send('/assessments', 'POST', cookies.owner, payload);
        assert.equal(created.status, 201);
        const assessment = await created.json();
        assert.equal(assessment.status, 'draft');
        assert.equal(assessment.owner_user_id, owner);
        assert.equal(assessment.period_start, '2027-01-01');

        const listed = await send('/assessments', 'GET', cookies.viewer);
        assert.equal(listed.status, 200);
        assert.equal((await listed.json()).assessments[0].id, assessment.id);
        assert.equal((await send('/assessments/' + assessment.id, 'GET', cookies.viewer)).status, 200);
        assert.equal((await send('/assessments/' + assessment.id + '/start', 'POST', cookies.viewer)).status, 403);
        const started = await send('/assessments/' + assessment.id + '/start', 'POST', cookies.owner);
        assert.equal(started.status, 200);
        assert.equal((await started.json()).status, 'in_progress');
        assert.equal((await send('/assessments/' + assessment.id + '/start', 'POST', cookies.owner)).status, 409);
        assert.equal((await send('/assessments/garbage', 'GET', cookies.owner)).status, 404);
        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [owner]);
        assert.equal((await send('/assessments', 'POST', cookies.owner, payload)).status, 401);
      } finally {
        server.close();
        await once(server, 'close');
      }
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});

test('endpoint asesmen tidak aktif jika database tidak dikonfigurasi', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/assessments');
    assert.equal(response.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
