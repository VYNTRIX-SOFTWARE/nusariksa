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

test('PADK workpaper PDF exports saved data with read permissions, not scores', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PDF Uji','BPR')");
      const u=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES "+
        "('pdf-maker@example.test','active','test-hash'),"+
        "('pdf-reader@example.test','active','test-hash'),"+
        "('pdf-no-role@example.test','active','test-hash') RETURNING id,email",
      );
      const users=Object.fromEntries(u.rows.map(row=>[row.email,row.id]));
      const maker=users['pdf-maker@example.test'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [maker,users['pdf-reader@example.test']],
      );
      const preparation=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Persiapan Keamanan Siber 2026',category:2,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      await savePadkIndicatorNoteInTransaction(db,{
        actorId:maker,id:preparation.id,number:1,
        preparationNotes:'SOP backup dan pemulihan data sedang ditinjau.',
        evidencePlan:'Dokumen SOP dan catatan uji restore.',
        provisionalRank:3,
        justification:'Proses pemulihan teridentifikasi, tetapi uji belum terdokumentasi.',
        expectedRevision:0,
      });
      await uploadPadkEvidenceInTransaction(db,{
        actorId:maker,id:preparation.id,number:1,
        fileName:'sop-bukti.pdf',mediaType:'application/pdf',
        contentBase64:Buffer.from('%PDF-1.4\\n%%EOF','utf8').toString('base64'),
        key:Buffer.from('ab'.repeat(32),'hex'),
      });
      const cookies={};
      for(const user of u.rows){
        cookies[user.email]='__Host-nusariksa_session='+
          (await createSession(db,user.id)).token;
      }
      const server=createServer({authDb:db,appOrigin:'http://127.0.0.1:3000'});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const path='/regulatory/padk43/cyber/preparations/'+preparation.id+'/workpaper.pdf';
      const req=(cookie,url=path)=>fetch(base+url,{
        headers:cookie?{Cookie:cookie}:{},
      });
      try{
        assert.equal((await req()).status,401);
        assert.equal((await req(cookies['pdf-no-role@example.test'])).status,403);
        const response=await req(cookies['pdf-reader@example.test']);
        assert.equal(response.status,200);
        assert.equal(response.headers.get('content-type'),'application/pdf');
        assert.match(response.headers.get('content-disposition'),/attachment;/);
        assert.equal(response.headers.get('cache-control'),'no-store');
        const bytes=Buffer.from(await response.arrayBuffer());
        const source=bytes.toString('latin1');
        assert.ok(source.startsWith('%PDF-1.4'));
        assert.match(source,/Bank PDF Uji/);
        assert.match(source,/SOP backup dan pemulihan data sedang ditinjau/);
        assert.match(source,/Dokumen SOP dan catatan uji restore/);
        assert.match(source,/Peringkat sementara: 3/);
        assert.match(source,/Jumlah dokumen bukti aktual: 1 file/);
        assert.match(source,/Proses pemulihan teridentifikasi/);
        assert.match(source,/DRAFT - BUKAN HASIL PENILAIAN PADK/);
        assert.doesNotMatch(source,/Composite Rank|Nilai Komposit|Disetujui OJK/i);
        assert.equal((await req(cookies['pdf-maker@example.test'],
          '/regulatory/padk43/cyber/preparations/not-an-id/workpaper.pdf')).status,404);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
