import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createSession } from '../src/sessions.js';
import { createAssessmentInTransaction } from '../src/assessments.js';
import {
  createCatalogInTransaction, createNextVersionInTransaction,
  addControlInTransaction, publishVersionInTransaction, assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import { createServer } from '../src/server.js';

const ORIGIN = 'http://127.0.0.1:3000';

test('katalog HTTP memerlukan sesi, izin dan Origin serta menyajikan checklist versi terkunci', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank HTTP Katalog', 'BPR')");
      const people = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('writer-control@example.test','active','hash-uji')," +
        "('reader-control@example.test','active','hash-uji')," +
        "('unauthorized-control@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(people.rows.map(u => [u.email,u.id]));
      const writer = ids['writer-control@example.test'];
      const reader = ids['reader-control@example.test'];
      const unauthorized = ids['unauthorized-control@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [writer, reader],
      );
      const cookies = {};
      for (const [key,id] of [['writer',writer],['reader',reader],['unauthorized',unauthorized]]) {
        cookies[key] = '__Host-nusariksa_session=' + (await createSession(db,id)).token;
      }
      const assessment = await createAssessmentInTransaction(db, {
        actorId: writer, title: 'Asesmen HTTP Katalog',
        periodStart: '2027-01-01', periodEnd: '2027-12-31',
      });
      const server = createServer({
        authDb: db, appOrigin: ORIGIN,
        catalogHandlers: {
          create: (client,arg) => createCatalogInTransaction(client,arg),
          nextVersion: (client,arg) => createNextVersionInTransaction(client,arg),
          add: (client,arg) => addControlInTransaction(client,arg),
          publish: (client,arg) => publishVersionInTransaction(client,arg),
          assign: (client,arg) => assignCatalogInTransaction(client,arg),
        },
      });
      server.listen(0,'127.0.0.1');
      await once(server,'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const send = (path,method='GET',cookie,body,requestOrigin=ORIGIN,type='application/json') =>
        fetch(base+path, {method, headers:{
          ...(cookie ? { Cookie: cookie } : {}),
          ...(method === 'POST' ? {Origin:requestOrigin,'Content-Type':type} : {}),
        }, ...(body !== undefined ? {body:typeof body==='string'?body:JSON.stringify(body)}:{})});
      try {
        assert.equal((await send('/catalogs')).status,401);
        assert.equal((await send('/catalogs','GET',cookies.unauthorized)).status,403);
        assert.equal((await send('/catalogs','POST',cookies.reader,{
          code:'GEN_1',title:'Kontrol internal',
        })).status,403);
        assert.equal((await send('/catalogs','POST',cookies.writer,{
          code:'GEN_1',title:'Kontrol internal',
        },'https://attacker.example')).status,403);
        assert.equal((await send('/catalogs','POST',cookies.writer,{
          code:'GEN_1',title:'Kontrol internal',
        },ORIGIN,'text/plain')).status,415);
        assert.equal((await send('/catalogs','POST',cookies.writer,'{')).status,400);
        assert.equal((await send('/catalogs','POST',cookies.writer,{
          code:'GEN_1',title:'Kontrol internal', extra:true,
        })).status,400);
        assert.equal((await send('/catalogs','POST',cookies.writer,{
          code:'GEN_1',title:'x'.repeat(6000),
        })).status,413);

        const catalogResponse = await send('/catalogs','POST',cookies.writer,{
          code:'GEN_1',title:'Kontrol internal',
        });
        assert.equal(catalogResponse.status,201);
        const catalog = await catalogResponse.json();
        const v1 = catalog.currentVersion.id;
        assert.equal((await send('/catalogs','GET',cookies.reader)).status,200);
        assert.equal((await send('/catalogs/'+catalog.id+'/versions','GET',cookies.reader)).status,200);
        assert.equal((await send('/catalog-versions/'+v1+'/publish','POST',cookies.writer)).status,409);

        const add = await send('/catalog-versions/'+v1+'/controls','POST',cookies.writer,{
          code:'OPS_01',title:'Pemeriksaan prosedur TI',
          sourceDocument:'Referensi internal',sourceSection:'Bagian 1',
        });
        assert.equal(add.status,201);
        assert.equal((await send('/catalog-versions/'+v1+'/controls','GET',cookies.reader)).status,200);
        assert.equal((await send('/assessments/'+assessment.id+'/catalog','POST',cookies.writer,{
          versionId:v1,
        })).status,409);
        assert.equal((await send('/catalog-versions/'+v1+'/publish','POST',cookies.writer)).status,200);
        assert.equal((await send('/assessments/'+assessment.id+'/catalog','POST',cookies.reader,{
          versionId:v1,
        })).status,403);
        assert.equal((await send('/assessments/'+assessment.id+'/catalog','POST',cookies.writer,{
          versionId:v1,
        })).status,201);
        const checklist = await send('/assessments/'+assessment.id+'/checklist','GET',cookies.reader);
        assert.equal(checklist.status,200);
        assert.equal((await checklist.json()).controls[0].control_code,'OPS_01');
        const clone = await send('/catalogs/'+catalog.id+'/versions','POST',cookies.writer);
        assert.equal(clone.status,201);
        assert.equal((await clone.json()).version,2);
        assert.equal((await send('/assessments/'+assessment.id+'/catalog','POST',cookies.writer,{
          versionId:v1,
        })).status,409);
        await db.query("UPDATE users SET status = 'disabled' WHERE id = $1",[writer]);
        assert.equal((await send('/catalogs','POST',cookies.writer,{
          code:'GEN_2',title:'Kontrol lanjutan',
        })).status,401);
        assert.equal((await send('/catalog-versions/invalid/controls','GET',cookies.reader)).status,404);
      } finally {
        server.close();
        await once(server,'close');
      }
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});

test('katalog tidak dibuka tanpa konfigurasi database', async () => {
  const server = createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/catalogs')).status,503);
  } finally {
    server.close();
    await once(server,'close');
  }
});
