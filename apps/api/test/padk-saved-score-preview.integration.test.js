import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createPadkPreparationInTransaction} from '../src/padk-preparations.js';
import {savePadkIndicatorNoteInTransaction} from '../src/padk-preparation-indicators.js';
import {getPadkSavedScorePreview} from '../src/padk-saved-score-preview.js';

const ROOT='/regulatory/padk43/cyber/preparations';
test('saved PADK ranks flow to domain/composite preview, scoped by user session',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PADK Preview Test','BPR')");
      const people=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('preview-maker@example.test','active','test-hash'),"+
        "('preview-viewer@example.test','active','test-hash'),"+
        "('preview-guest@example.test','active','test-hash') RETURNING id,email",
      );
      const ids=Object.fromEntries(people.rows.map(x=>[x.email,x.id]));
      const maker=ids['preview-maker@example.test'];
      await db.query("INSERT INTO user_roles(user_id,role) VALUES "+
        "($1,'IT_OFFICER'),($2,'VIEWER')",
        [maker,ids['preview-viewer@example.test']],
      );
      const preparation=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Simulasi maturitas Kategori 2',category:2,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      const cookies={};
      for(const p of people.rows){
        cookies[p.email]='__Host-nusariksa_session='+(await createSession(db,p.id)).token;
      }
      const server=createServer({
        authDb:db,appOrigin:'http://127.0.0.1:3000',
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const url='http://127.0.0.1:'+server.address().port+ROOT+'/'+preparation.id+'/score-preview';
      const send=(cookie)=>fetch(url,{headers:cookie?{Cookie:cookie}:{}});
      try{
        assert.equal((await send()).status,401);
        assert.equal((await send(cookies['preview-guest@example.test'])).status,403);
        const empty=await send(cookies['preview-viewer@example.test']);
        assert.equal(empty.status,200);
        const first=await empty.json();
        assert.equal(first.status,'PREVIEW_UNVERIFIED');
        assert.equal(first.sourceStatus,'DRAFT_UNVERIFIED');
        assert.equal(first.requiredIndicators,60);
        assert.equal(first.ratedIndicators,0);
        assert.equal(first.compositePreview,null);
        assert.equal(first.officialScoreAvailable,false);
        await savePadkIndicatorNoteInTransaction(db,{
          actorId:maker,id:preparation.id,number:1,
          preparationNotes:'Pemeriksaan tata kelola keamanan siber',
          evidencePlan:'Dokumentasi kebijakan TI',
          provisionalRank:3,
          justification:'Penerapan dilakukan namun tindak lanjut belum berkala.',
          expectedRevision:0,
        });
        const one=await(await send(cookies['preview-maker@example.test'])).json();
        assert.equal(one.ratedIndicators,1);
        assert.deepEqual(one.missingNumbers.slice(0,3),[2,3,4]);
        assert.equal(one.compositeRaw,null);
        await db.query(
          "INSERT INTO padk_preparation_indicator_notes "+
          "(preparation_id,indicator_number,provisional_rank,justification) "+
          "SELECT $1,n,2,'Justifikasi sementara berdasarkan pemeriksaan dokumen internal.' "+
          "FROM generate_series(2,60) AS n",[preparation.id],
        );
        const complete=await(await send(cookies['preview-viewer@example.test'])).json();
        assert.equal(complete.complete,true);
        assert.equal(complete.ratedIndicators,60);
        assert.equal(complete.domains.length,5);
        assert.equal(complete.compositePreview.valueTwoDecimals,'2.01');
        assert.equal(complete.compositePreview.rank,2);
        assert.equal(complete.criteriaVerified,false);
        assert.equal(complete.roundingPolicyVerified,false);
        assert.equal(complete.officialScoreAvailable,false);
        assert.equal(complete.finalReportAvailable,false);
        assert.equal(complete.regulatoryResult,false);
        assert.equal((await fetch(url,{method:'POST',headers:{
          Origin:'http://127.0.0.1:3000',
          Cookie:cookies['preview-maker@example.test'],
          'Content-Type':'application/json',
        },body:JSON.stringify({official:true})})).status,404);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
