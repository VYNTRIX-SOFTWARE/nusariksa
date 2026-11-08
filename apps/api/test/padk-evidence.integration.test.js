import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createPadkPreparationInTransaction} from '../src/padk-preparations.js';
import {savePadkIndicatorNoteInTransaction} from '../src/padk-preparation-indicators.js';
import {uploadPadkEvidenceInTransaction} from '../src/padk-evidence.js';
import {validatePadkEvidenceListing} from '../../web/assets/padk-evidence-ui.js';

const URL='/regulatory/padk43/cyber/preparations/';
const ORIGIN='http://127.0.0.1:3000';
const KEY='ab'.repeat(32);
const PDF=Buffer.from('%PDF-1.4\n1 0 obj\n<</Type/Catalog>>\nendobj\n%%EOF\n');
test('PADK evidence validation keeps files scoped to preparation and indicator',()=>{
  const fixture={preparationId:'11111111-1111-4111-8111-111111111111',
    indicatorNumber:1,status:'DRAFT_EVIDENCE',regulatoryPackVerified:false,
    evidence:[{id:'22222222-2222-4222-8222-222222222222',
      fileName:'sop.pdf',sizeBytes:PDF.length}]};
  assert.equal(validatePadkEvidenceListing(fixture,fixture.preparationId,1).length,1);
  assert.throws(()=>validatePadkEvidenceListing({...fixture,
    regulatoryPackVerified:true},fixture.preparationId,1));
  assert.throws(()=>validatePadkEvidenceListing({...fixture,
    evidence:[{id:'not-a-uuid',fileName:'sop.pdf',sizeBytes:10}]},
    fixture.preparationId,1));
});
test('PADK actual evidence is encrypted, immutable, maker-only upload, viewer download', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PADK Evidence Test','BPR')");
      const users=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('padk-proof-maker@example.test','active','test-hash'),"+
        "('padk-proof-viewer@example.test','active','test-hash'),"+
        "('padk-proof-other@example.test','active','test-hash'),"+
        "('padk-proof-guest@example.test','active','test-hash') RETURNING id,email",
      );
      const ids=Object.fromEntries(users.rows.map(u=>[u.email,u.id]));
      const maker=ids['padk-proof-maker@example.test'];
      await db.query("INSERT INTO user_roles(user_id,role) VALUES "+
        "($1,'IT_OFFICER'),($2,'VIEWER'),($3,'IT_OFFICER')",
        [maker,ids['padk-proof-viewer@example.test'],ids['padk-proof-other@example.test']],
      );
      const prep=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Asesmen PADK Bukti Aktual',category:2,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      const cookies={};
      for(const u of users.rows){
        cookies[u.email]='__Host-nusariksa_session='+(await createSession(db,u.id)).token;
      }
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,evidenceKey:KEY,
        padkEvidenceHandlers:{
          upload:(client,args)=>uploadPadkEvidenceInTransaction(client,args),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const prefix=URL+prep.id;
      const listPath=prefix+'/indicators/1/evidence';
      const payload={fileName:'sop-keamanan.pdf',mediaType:'application/pdf',
        contentBase64:PDF.toString('base64')};
      const send=(path,method='GET',cookie,body,origin=ORIGIN)=>fetch(base+path,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      const owner=cookies['padk-proof-maker@example.test'],
        viewer=cookies['padk-proof-viewer@example.test'],
        other=cookies['padk-proof-other@example.test'],
        guest=cookies['padk-proof-guest@example.test'];
      try{
        assert.equal((await send(listPath)).status,401);
        assert.equal((await send(listPath,'GET',guest)).status,403);
        assert.equal((await send(listPath,'POST',viewer,payload)).status,403);
        assert.equal((await send(listPath,'POST',other,payload)).status,403);
        assert.equal((await send(listPath,'POST',owner,payload,'https://evil.example')).status,403);
        assert.equal((await send(listPath,'POST',owner,payload)).status,409);
        await savePadkIndicatorNoteInTransaction(db,{
          actorId:maker,id:prep.id,number:1,
          preparationNotes:'Periksa SOP tata kelola',evidencePlan:'Lampirkan SOP',
          expectedRevision:0,
        });
        assert.equal((await send(prefix+'/indicators/61/evidence','POST',owner,payload)).status,400);
        assert.equal((await send(listPath,'POST',owner,{...payload,fileName:'bahaya.js'})).status,400);
        const saved=await send(listPath,'POST',owner,payload);
        assert.equal(saved.status,201);
        const record=await saved.json();
        assert.equal(record.fileName,payload.fileName);
        assert.equal(record.status,'DRAFT_EVIDENCE');
        const stored=await db.query(
          'SELECT ciphertext,nonce,auth_tag,sha256 FROM padk_indicator_evidence WHERE id=$1',
          [record.id],
        );
        assert.equal(stored.rowCount,1);
        assert.equal(stored.rows[0].ciphertext.equals(PDF),false);
        assert.equal(stored.rows[0].nonce.length,12);
        const listed=await(await send(listPath,'GET',viewer)).json();
        assert.equal(listed.evidence.length,1);
        assert.equal(listed.regulatoryPackVerified,false);
        assert.equal(listed.evidence[0].sha256,record.sha256);
        assert.ok(!JSON.stringify(listed).includes('ciphertext'));
        const download=prefix+'/evidence/'+record.id+'/download';
        assert.equal((await send(download,'GET',guest)).status,403);
        assert.equal((await send(URL+'11111111-1111-4111-8111-111111111111/evidence/'+
          record.id+'/download','GET',viewer)).status,404);
        const retrieved=await send(download,'GET',viewer);
        assert.equal(retrieved.status,200);
        assert.equal(retrieved.headers.get('content-type'),'application/octet-stream');
        assert.equal(retrieved.headers.get('content-security-policy'),'sandbox');
        assert.deepEqual(Buffer.from(await retrieved.arrayBuffer()),PDF);
        await db.query('SAVEPOINT padk_file_guard');
        await assert.rejects(db.query(
          'DELETE FROM padk_indicator_evidence WHERE id=$1',[record.id],
        ),error=>error.code==='P0001');
        await db.query('ROLLBACK TO SAVEPOINT padk_file_guard');
        const second=await send(prefix+'/indicators/2/evidence','POST',owner,payload);
        assert.equal(second.status,409);
        assert.equal((await(await send(listPath,'GET',viewer)).json()).evidence.length,1);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
