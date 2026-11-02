import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createSession } from '../src/sessions.js';
import { createAssessmentInTransaction, startAssessmentInTransaction } from '../src/assessments.js';
import {
  createCatalogInTransaction, addControlInTransaction, publishVersionInTransaction,
  assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import { writeAssessmentResultInTransaction } from '../src/assessment-results.js';
import { createServer } from '../src/server.js';

const ORIGIN = 'http://127.0.0.1:3000';

test('API hasil asesmen memeriksa izin, origin dan nomor revisi', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank HTTP Hasil','BPR')");
      const users = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('maker-result@example.test','active','hash-uji')," +
        "('viewer-result@example.test','active','hash-uji')," +
        "('none-result@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(users.rows.map(row => [row.email,row.id]));
      const maker = ids['maker-result@example.test'];
      const viewer = ids['viewer-result@example.test'];
      const none = ids['none-result@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [maker,viewer],
      );
      const catalog = await createCatalogInTransaction(db, {
        actorId: maker, code: 'TESTRESULT', title: 'Kontrol hasil HTTP',
      });
      const versionId = catalog.currentVersion.id;
      const control = await addControlInTransaction(db, {
        actorId: maker, versionId, code: 'GOV_01', title: 'Uji kontrol asesmen',
      });
      await publishVersionInTransaction(db, { actorId: maker, versionId });
      const assessment = await createAssessmentInTransaction(db, {
        actorId: maker, title: 'Asesmen HTTP Hasil',
        periodStart: '2027-01-01', periodEnd: '2027-12-31',
      });
      await assignCatalogInTransaction(db, {
        actorId: maker, assessmentId: assessment.id, versionId,
      });
      await startAssessmentInTransaction(db, { actorId: maker, id: assessment.id });

      const cookies = {};
      for (const [name,id] of [['maker',maker],['viewer',viewer],['none',none]]) {
        cookies[name] = '__Host-nusariksa_session=' + (await createSession(db,id)).token;
      }
      const server = createServer({
        authDb: db, appOrigin: ORIGIN,
        resultHandlers: { write: (client, args) =>
          writeAssessmentResultInTransaction(client, args) },
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const listUrl = '/assessments/' + assessment.id + '/results';
      const editUrl = listUrl + '/' + control.id;
      const send = (path, method = 'GET', cookie, body, requestOrigin = ORIGIN,
        type = 'application/json') => fetch(base + path, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(method === 'PUT' ? { Origin: requestOrigin, 'Content-Type': type } : {}),
        },
        ...(body !== undefined ? {
          body: typeof body === 'string' ? body : JSON.stringify(body),
        } : {}),
      });
      const input = {
        rating: 'non_compliant', note: 'Belum tersedia dokumen pendukung.',
        expectedRevision: 0,
      };
      try {
        assert.equal((await send(listUrl)).status, 401);
        assert.equal((await send(listUrl, 'GET', cookies.none)).status, 403);
        assert.equal((await send(editUrl, 'PUT', cookies.viewer, input)).status, 403);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, input,
          'https://malicious.example')).status, 403);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, input,
          ORIGIN, 'text/plain')).status, 415);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, '{')).status, 400);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, {
          ...input, unwanted: true,
        })).status, 400);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, {
          ...input, note: 'x'.repeat(5000),
        })).status, 413);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, {
          ...input, rating: 'invalid',
        })).status, 400);

        const first = await send(editUrl, 'PUT', cookies.maker, input);
        assert.equal(first.status, 200);
        assert.equal((await first.json()).revision, 1);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, input)).status, 409);
        const revised = await send(editUrl, 'PUT', cookies.maker, {
          rating: 'compliant', note: 'Sudah diperbaiki.',
          expectedRevision: 1,
        });
        assert.equal(revised.status, 200);
        assert.equal((await revised.json()).revision, 2);
        const listed = await send(listUrl, 'GET', cookies.viewer);
        assert.equal(listed.status, 200);
        const payload = await listed.json();
        assert.equal(payload.summary.assessed, 1);
        assert.equal(payload.controls[0].rating, 'compliant');
        const history = await send(editUrl + '/history', 'GET', cookies.viewer);
        assert.equal(history.status, 200);
        assert.deepEqual((await history.json()).history.map(x => x.revision), [2, 1]);
        assert.equal((await send(listUrl + '/not-a-control',
          'PUT', cookies.maker, input)).status, 404);
        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [maker]);
        assert.equal((await send(editUrl, 'PUT', cookies.maker, input)).status, 401);
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

test('API hasil tidak diaktifkan tanpa database', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port +
      '/assessments/00000000-0000-4000-8000-000000000001/results');
    assert.equal(response.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
