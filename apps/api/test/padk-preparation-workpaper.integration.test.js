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
import {getPadkPreparationWorkpaper} from '../src/padk-preparation-workpaper.js';
import {
  submitPadkDraftInTransaction,reviewPadkDraftInTransaction,
} from '../src/padk-draft-review.js';

test('PADK report draft includes provisional domain/composite and review but never official values', {
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
        "('pdf-no-role@example.test','active','test-hash'),"+
        "('pdf-reviewer@example.test','active','test-hash') RETURNING id,email",
      );
      const users=Object.fromEntries(u.rows.map(row=>[row.email,row.id]));
      const maker=users['pdf-maker@example.test'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES "+
        "($1,'IT_OFFICER'),($2,'VIEWER'),($3,'REVIEWER')",
        [maker,users['pdf-reader@example.test'],users['pdf-reviewer@example.test']],
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
      const direct=await getPadkPreparationWorkpaper(db,{actorId:maker,id:preparation.id});
      assert.ok(direct.pdf.subarray(0,8).toString('latin1').startsWith('%PDF-1.4'));
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
        assert.equal(response.status,200,response.status===200?'PDF accepted':await response.clone().text());
        assert.equal(response.headers.get('content-type'),'application/pdf');
        assert.match(response.headers.get('content-disposition'),/attachment;/);
        assert.equal(response.headers.get('cache-control'),'no-store');
        const bytes=Buffer.from(await response.arrayBuffer());
        const source=bytes.toString('latin1');
        // Vector PDF wraps visible paragraphs into multiple Tj text operators.
        // Test the reconstructed visible text instead of fixed Courier lines.
        const visible=[...source.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
          .map(match=>match[1].replace(/\\([()\\])/g,'$1')).join(' ');
        assert.ok(source.startsWith('%PDF-1.4'));
        assert.match(visible,/Bank PDF Uji/);
        assert.match(visible,/SOP backup dan pemulihan data sedang ditinjau/);
        assert.match(visible,/Dokumen SOP dan catatan uji restore/);
        assert.match(visible,/Peringkat sementara: 3/);
        assert.match(visible,/Jumlah dokumen bukti aktual: 1 file/);
        assert.match(visible,/sop-bukti.pdf/);
        assert.match(visible,/SHA-256/);
        assert.match(visible,/Progres: 1 \/ 60 indikator/);
        assert.match(visible,/KOMPOSIT SIMULASI: BELUM TERSEDIA/);
        assert.match(visible,/Status: in_progress/);
        assert.match(visible,/Proses pemulihan teridentifikasi/);
        assert.match(visible,/DRAFT - BUKAN HASIL PENILAIAN PADK/);
        assert.doesNotMatch(visible,/Composite Rank|Nilai Komposit|Disetujui OJK/i);
        await db.query(
          "INSERT INTO padk_preparation_indicator_notes "+
          "(preparation_id,indicator_number,provisional_rank,justification) "+
          "SELECT $1,n,2,'Dasar kerja sementara dari bukti yang tersedia di BPR.' "+
          "FROM generate_series(2,60) AS n",[preparation.id],
        );
        await submitPadkDraftInTransaction(db,{actorId:maker,id:preparation.id});
        await reviewPadkDraftInTransaction(db,{
          actorId:users['pdf-reviewer@example.test'],id:preparation.id,
          decision:'accept_draft',note:'Pemeriksaan kelengkapan draft saja, bukan hasil resmi.',
        });
        const complete=await req(cookies['pdf-reader@example.test']);
        assert.equal(complete.status,200);
        const full=Buffer.from(await complete.arrayBuffer()).toString('latin1');
        assert.match(full,/Progres: 60 \/ 60 indikator/);
        assert.match(full,/KOMPOSIT SIMULASI: 2\.01/);
        assert.match(full,/Status: draft_accepted/);
        assert.match(full,/DRAFT_ACCEPTED/);
        assert.match(full,/BUKAN HASIL PENILAIAN PADK/);
        assert.doesNotMatch(full,/DISAHKAN SEBAGAI HASIL RESMI|DISETUJUI OJK/i);
        assert.equal((await req(cookies['pdf-maker@example.test'],
          '/regulatory/padk43/cyber/preparations/not-an-id/workpaper.pdf')).status,404);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
