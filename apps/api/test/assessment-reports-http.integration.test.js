import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createAssessmentInTransaction } from '../src/assessments.js';
import { buildAssessmentReportInTransaction } from '../src/assessment-reports.js';
import { createSession } from '../src/sessions.js';
import { createServer } from '../src/server.js';

test('API laporan mengharuskan sesi dan izin membaca laporan', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank HTTP Laporan','BPR')");
      const people = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('maker-report-http@example.test','active','hash-uji')," +
        "('viewer-report-http@example.test','active','hash-uji')," +
        "('unauthorized-report-http@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(people.rows.map(row => [row.email,row.id]));
      const maker = ids['maker-report-http@example.test'];
      const viewer = ids['viewer-report-http@example.test'];
      const other = ids['unauthorized-report-http@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [maker,viewer],
      );
      const assessment = await createAssessmentInTransaction(db, {
        actorId: maker, title: 'Asesmen HTTP laporan',
        periodStart: '2027-01-01', periodEnd: '2027-12-31',
      });
      const cookies = {};
      for (const [name,id] of [['maker',maker],['viewer',viewer],['other',other]]) {
        cookies[name] = '__Host-nusariksa_session=' + (await createSession(db,id)).token;
      }
      const server = createServer({
        authDb: db, appOrigin: 'http://127.0.0.1:3000',
        reportHandler: (conn, args) => buildAssessmentReportInTransaction(conn, args),
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const url = '/assessments/' + assessment.id + '/report';
      const send = (cookie, method = 'GET', path = url) => fetch(base + path, {
        method, headers: cookie ? { Cookie: cookie } : {},
      });
      try {
        assert.equal((await send()).status, 401);
        assert.equal((await send(cookies.other)).status, 403);
        assert.equal((await send(cookies.viewer, 'POST')).status, 404);
        const result = await send(cookies.viewer);
        assert.equal(result.status, 200);
        assert.equal(result.headers.get('Cache-Control'), 'no-store');
        const body = await result.json();
        assert.equal(body.final, false);
        assert.equal(body.assessment.id, assessment.id);
        assert.equal(body.summary.total, 0);
        assert.equal(body.institution.kind, 'BPR');
        assert.equal((await send(cookies.maker, 'GET',
          '/assessments/invalid/report')).status, 404);
        assert.equal((await send(cookies.viewer, 'GET',
          '/assessments/11111111-1111-4111-8111-111111111111/report')).status, 404);
        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [viewer]);
        assert.equal((await send(cookies.viewer)).status, 401);
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

test('endpoint laporan tidak aktif tanpa konfigurasi database', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const res = await fetch('http://127.0.0.1:' + server.address().port
      + '/assessments/00000000-0000-4000-8000-000000000001/report');
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
