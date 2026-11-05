import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createServer } from '../src/server.js';
import { createSession } from '../src/sessions.js';
import {
  createCatalogInTransaction, addControlInTransaction, publishVersionInTransaction,
  assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import { createAssessmentInTransaction, startAssessmentInTransaction } from '../src/assessments.js';
import {
  EvidenceError, getEvidence, listEvidence, uploadEvidenceInTransaction,
} from '../src/assessment-evidence.js';

const ORIGIN = 'http://127.0.0.1:3000';
const KEY = 'ad'.repeat(32);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

test('API bukti menyimpan ciphertext immutable dan membatasi akses serta status asesmen', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank Uji Bukti','BPR')");
      const inserted = await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('maker-evidence@example.test','active','hash-uji')," +
        "('reviewer-evidence@example.test','active','hash-uji')," +
        "('viewer-evidence@example.test','active','hash-uji')," +
        "('unassigned-evidence@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids=Object.fromEntries(inserted.rows.map(row=>[row.email,row.id]));
      const maker=ids['maker-evidence@example.test'];
      const reviewer=ids['reviewer-evidence@example.test'];
      const viewer=ids['viewer-evidence@example.test'];
      const none=ids['unassigned-evidence@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER')," +
        "($2,'REVIEWER'),($3,'VIEWER')", [maker,reviewer,viewer],
      );
      const catalog=await createCatalogInTransaction(db,{
        actorId:maker,code:'EVIDENCE_TI',title:'Katalog bukti internal',
      });
      const versionId=catalog.currentVersion.id;
      const ctrl=await addControlInTransaction(db,{
        actorId:maker,versionId,code:'FILE_01',title:'Bukti pengendalian TI',
      });
      await publishVersionInTransaction(db,{actorId:maker,versionId});
      const assessment=await createAssessmentInTransaction(db,{
        actorId:maker,title:'Uji bukti asesmen',periodStart:'2027-01-01',periodEnd:'2027-12-31',
      });
      await assignCatalogInTransaction(db,{actorId:maker,assessmentId:assessment.id,versionId});
      await startAssessmentInTransaction(db,{actorId:maker,id:assessment.id});

      const path='/assessments/'+assessment.id+'/controls/'+ctrl.id+'/evidence';
      const payload={
        fileName:'dokumen uji.pdf', mediaType:'application/pdf',
        contentBase64:pdf.toString('base64'),
      };
      await assert.rejects(
        uploadEvidenceInTransaction(db,{actorId:reviewer,assessmentId:assessment.id,
          controlId:ctrl.id,...payload,key:Buffer.from(KEY,'hex')}),
        e=>e instanceof EvidenceError&&e.status===403,
      );
      await assert.rejects(
        listEvidence(db,{actorId:none,assessmentId:assessment.id,controlId:ctrl.id}),
        e=>e instanceof EvidenceError&&e.status===403,
      );
      const record=await uploadEvidenceInTransaction(db,{
        actorId:maker,assessmentId:assessment.id,controlId:ctrl.id,
        ...payload,key:Buffer.from(KEY,'hex'),
      });
      assert.equal(record.fileName,payload.fileName);
      assert.equal(record.uploadedBy,maker);
      const raw=await db.query('SELECT ciphertext,nonce,auth_tag,sha256 FROM assessment_evidence WHERE id=$1',[record.id]);
      assert.equal(raw.rowCount,1);
      assert.equal(raw.rows[0].ciphertext.equals(pdf),false);
      assert.equal(raw.rows[0].nonce.length,12);
      const listing=await listEvidence(db,{
        actorId:viewer,assessmentId:assessment.id,controlId:ctrl.id,
      });
      assert.equal(listing.evidence.length,1);
      assert.equal(JSON.stringify(listing).includes('ciphertext'),false);
      const downloaded=await getEvidence(db,{
        actorId:reviewer,assessmentId:assessment.id,evidenceId:record.id,
        key:Buffer.from(KEY,'hex'),
      });
      assert.deepEqual(downloaded.data,pdf);
      await assert.rejects(getEvidence(db,{
        actorId:reviewer,assessmentId:'11111111-1111-4111-8111-111111111111',
        evidenceId:record.id,key:Buffer.from(KEY,'hex'),
      }),e=>e.status===404);

      await db.query('SAVEPOINT evidence_immutable');
      await assert.rejects(db.query('UPDATE assessment_evidence SET file_name=$2 WHERE id=$1',
        [record.id,'changed.pdf']),e=>e.code==='P0001');
      await db.query('ROLLBACK TO SAVEPOINT evidence_immutable');
      await db.query('SAVEPOINT evidence_delete');
      await assert.rejects(db.query('DELETE FROM assessment_evidence WHERE id=$1',[record.id]),
        e=>e.code==='P0001');
      await db.query('ROLLBACK TO SAVEPOINT evidence_delete');

      for(let i=1;i<10;i++)await uploadEvidenceInTransaction(db,{
        actorId:maker,assessmentId:assessment.id,controlId:ctrl.id,
        ...payload,fileName:'file'+i+'.pdf',key:Buffer.from(KEY,'hex'),
      });
      await assert.rejects(uploadEvidenceInTransaction(db,{
        actorId:maker,assessmentId:assessment.id,controlId:ctrl.id,
        ...payload,key:Buffer.from(KEY,'hex'),
      }),e=>e.status===409);
      await db.query("UPDATE assessments SET status='submitted' WHERE id=$1",[assessment.id]);
      await assert.rejects(uploadEvidenceInTransaction(db,{
        actorId:maker,assessmentId:assessment.id,controlId:ctrl.id,
        ...payload,key:Buffer.from(KEY,'hex'),
      }),e=>e.status===409);

      // Share the transaction client with HTTP handler to keep test data isolated.
      const cookies={};
      for(const [name,id] of [['maker',maker],['viewer',viewer],['none',none]]) {
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      }
      const server=createServer({
        authDb:db, appOrigin:ORIGIN, evidenceKey:KEY,
        evidenceHandlers:{upload:(client,args)=>uploadEvidenceInTransaction(client,args)},
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const list=(cookie)=>fetch(base+path,{headers:cookie?{Cookie:cookie}:{}});
      const send=(url,method,cookie,body,origin=ORIGIN,type='application/json')=>fetch(base+url,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method==='POST'?{Origin:origin,'Content-Type':type}:{}),
        },
        ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
      });
      try {
        assert.equal((await list()).status,401);
        assert.equal((await list(cookies.none)).status,403);
        assert.equal((await send(path,'POST',cookies.maker,payload,'https://evil.example')).status,403);
        assert.equal((await send(path,'POST',cookies.viewer,payload)).status,403);
        assert.equal((await send(path,'POST',cookies.maker,payload,ORIGIN,'text/plain')).status,415);
        assert.equal((await send(path,'POST',cookies.maker,payload)).status,409);
        const listResponse=await list(cookies.viewer);
        assert.equal(listResponse.status,200);
        const result=await listResponse.json();
        assert.equal(result.evidence.length,10);
        const downloadUrl='/assessments/'+assessment.id+'/evidence/'+record.id+'/download';
        assert.equal((await send(downloadUrl,'GET',cookies.none)).status,403);
        const response=await send(downloadUrl,'GET',cookies.viewer);
        assert.equal(response.status,200);
        assert.equal(response.headers.get('content-type'),'application/octet-stream');
        assert.match(response.headers.get('content-disposition'),/^attachment;/);
        assert.equal(response.headers.get('content-security-policy'),'sandbox');
        assert.equal(response.headers.get('cache-control'),'no-store');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
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

test('endpoint bukti tidak aktif tanpa konfigurasi database',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+
      '/assessments/11111111-1111-4111-8111-111111111111/controls/'+
      '22222222-2222-4222-8222-222222222222/evidence');
    assert.equal(response.status,503);
  }finally{
    server.close();await once(server,'close');
  }
});
