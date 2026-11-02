import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createAssessmentInTransaction, startAssessmentInTransaction } from '../src/assessments.js';
import {
  createCatalogInTransaction, addControlInTransaction, publishVersionInTransaction,
  assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import { writeAssessmentResultInTransaction } from '../src/assessment-results.js';
import {
  submitAssessmentInTransaction, reviewAssessmentInTransaction,
} from '../src/assessment-reviews.js';
import { createSession } from '../src/sessions.js';
import { createServer } from '../src/server.js';

const ORIGIN = 'http://127.0.0.1:3000';

test('HTTP maker–checker menolak sesi atau izin yang tidak sah dan menjaga alur keputusan', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank HTTP Reviewer','BPR')");
      const users = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('maker-review-http@example.test','active','hash-uji')," +
        "('checker-review-http@example.test','active','hash-uji')," +
        "('viewer-review-http@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(users.rows.map(row=>[row.email,row.id]));
      const maker = ids['maker-review-http@example.test'];
      const reviewer = ids['checker-review-http@example.test'];
      const viewer = ids['viewer-review-http@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER')," +
        "($2,'REVIEWER'),($3,'VIEWER')",
        [maker,reviewer,viewer],
      );
      const catalog = await createCatalogInTransaction(db, {
        actorId: maker, code: 'REVIEWHTTP', title: 'Katalog pengujian HTTP',
      });
      const versionId = catalog.currentVersion.id;
      const control = await addControlInTransaction(db, {
        actorId: maker, versionId, code: 'TEST_1', title: 'Pengendalian pengujian',
      });
      await publishVersionInTransaction(db, { actorId: maker, versionId });
      const assessment = await createAssessmentInTransaction(db, {
        actorId: maker, title: 'Asesmen HTTP reviewer',
        periodStart: '2027-01-01', periodEnd: '2027-06-30',
      });
      await assignCatalogInTransaction(db, {
        actorId: maker, assessmentId: assessment.id, versionId,
      });
      await startAssessmentInTransaction(db, { actorId: maker, id: assessment.id });
      await writeAssessmentResultInTransaction(db, {
        actorId: maker, assessmentId: assessment.id, controlId: control.id,
        rating: 'compliant', note: '', expectedRevision: 0,
      });

      const cookies = {};
      for (const [name,id] of [['maker',maker],['reviewer',reviewer],['viewer',viewer]]) {
        cookies[name] = '__Host-nusariksa_session=' + (await createSession(db,id)).token;
      }
      const server = createServer({
        authDb: db, appOrigin: ORIGIN,
        reviewHandlers: {
          submit: (client,arg) => submitAssessmentInTransaction(client,arg),
          review: (client,arg) => reviewAssessmentInTransaction(client,arg),
        },
      });
      server.listen(0,'127.0.0.1');
      await once(server,'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const path = '/assessments/' + assessment.id;
      const send = (endpoint,method='GET',cookie,body,origin=ORIGIN,type='application/json') =>
        fetch(base+endpoint,{
          method,headers:{
            ...(cookie ? {Cookie:cookie} : {}),
            ...(method==='POST' ? {Origin:origin,'Content-Type':type} : {}),
          },
          ...(body !== undefined ? {body:typeof body==='string'?body:JSON.stringify(body)} : {}),
        });
      try {
        assert.equal((await send(path+'/reviews')).status,401);
        assert.equal((await send(path+'/submit','POST',cookies.viewer)).status,403);
        assert.equal((await send(path+'/submit','POST',cookies.maker,undefined,
          'https://evil.example')).status,403);
        assert.equal((await send(path+'/review','POST',cookies.maker,{
          decision:'approve',note:'',
        })).status,403);
        const submit = await send(path+'/submit','POST',cookies.maker);
        assert.equal(submit.status,200);
        assert.equal((await submit.json()).submissionCycle,1);
        assert.equal((await send(path+'/review','POST',cookies.reviewer,{
          decision:'request_changes',note:'terlalu singkat',
        },ORIGIN,'text/plain')).status,415);
        assert.equal((await send(path+'/review','POST',cookies.reviewer,'{')).status,400);
        assert.equal((await send(path+'/review','POST',cookies.reviewer,{
          decision:'request_changes',note:'tidak',
        })).status,400);
        assert.equal((await send(path+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'',extra:true,
        })).status,400);
        assert.equal((await send(path+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'x'.repeat(5000),
        })).status,413);
        const approved = await send(path+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'',
        });
        assert.equal(approved.status,200);
        assert.equal((await approved.json()).status,'approved');
        assert.equal((await send(path+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'',
        })).status,409);
        const history = await send(path+'/reviews','GET',cookies.viewer);
        assert.equal(history.status,200);
        assert.deepEqual((await history.json()).events.map(e=>e.action),
          ['APPROVED','SUBMITTED']);
        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1",[reviewer]);
        assert.equal((await send(path+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'',
        })).status,401);
        assert.equal((await send('/assessments/not-an-id/reviews','GET',cookies.viewer)).status,404);
      } finally {
        server.close();await once(server,'close');
      }
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});

test('API review tidak aktif tanpa konfigurasi database', async () => {
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const response=await fetch('http://127.0.0.1:'+server.address().port+
      '/assessments/00000000-0000-4000-8000-000000000001/reviews');
    assert.equal(response.status,503);
  } finally {
    server.close();await once(server,'close');
  }
});
