import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createPadkPreparationInTransaction} from '../src/padk-preparations.js';

test('PADK Table 3 criteria are displayed from local extracted source with PDF page provenance', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PADK Criteria Test','BPR')");
      const users=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('criteria-maker@example.test','active','test-hash'),"+
        "('criteria-viewer@example.test','active','test-hash'),"+
        "('criteria-guest@example.test','active','test-hash') RETURNING id,email",
      );
      const ids=Object.fromEntries(users.rows.map(x=>[x.email,x.id]));
      await db.query("INSERT INTO user_roles(user_id,role) VALUES"+
        "($1,'IT_OFFICER'),($2,'VIEWER')",
        [ids['criteria-maker@example.test'],ids['criteria-viewer@example.test']],
      );
      const maker=ids['criteria-maker@example.test'];
      const a=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Asesmen Kategori 1 Sumber Kriteria',category:1,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      const b=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Asesmen Kategori 2 Sumber Kriteria',category:2,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      const cookies={};
      for(const x of users.rows)cookies[x.email]=
        '__Host-nusariksa_session='+(await createSession(db,x.id)).token;
      const server=createServer({authDb:db,appOrigin:'http://127.0.0.1:3000'});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const host='http://127.0.0.1:'+server.address().port;
      const route=(id,n)=>'/regulatory/padk43/cyber/preparations/'+id+
        '/indicators/'+n+'/criteria';
      const fetchSource=(path,cookie,method='GET')=>fetch(host+path,{
        method,headers:cookie?{Cookie:cookie}:{},
      });
      try{
        const path=route(a.id,1);
        assert.equal((await fetchSource(path)).status,401);
        assert.equal((await fetchSource(path,cookies['criteria-guest@example.test'])).status,403);
        const viewer=await fetchSource(path,cookies['criteria-viewer@example.test']);
        assert.equal(viewer.status,200);
        const first=await viewer.json();
        assert.equal(first.status,'EXTRACTED_SOURCE_UNVERIFIED');
        assert.equal(first.sourceTextVerified,false);
        assert.equal(first.officialScoreAvailable,false);
        assert.equal(first.table3CandidateNumber,1);
        assert.deepEqual(first.table3PdfPages,[157]);
        assert.equal(first.criteria.length,5);
        assert.match(first.criteria[0].textDraft,/Wewenang dan tanggung jawab/);
        assert.equal((await fetchSource(path,cookies['criteria-viewer@example.test'],'POST')).status,404);
        const candidate=await fetchSource(route(b.id,32),
          cookies['criteria-maker@example.test']);
        assert.equal(candidate.status,200);
        const c=await candidate.json();
        assert.equal(c.table3CandidateNumber,36);
        assert.equal(c.category2MappingRisk,'SOURCE_REVIEW_REQUIRED');
        assert.equal(c.mappingVerified,false);
        assert.equal(c.criteriaVerified,false);
        assert.equal(c.finalReportAvailable,false);
        assert.equal(c.criteria.length,5);
        assert.equal(c.sourceConflict,null);
        const conflict19=await (await fetchSource(route(b.id,19),
          cookies['criteria-maker@example.test'])).json();
        assert.equal(conflict19.table3CandidateNumber,20);
        assert.equal(conflict19.sourceConflict.code,'PARAMETER_KRITERIA_TIDAK_SELARAS');
        const conflict20=await (await fetchSource(route(b.id,20),
          cookies['criteria-maker@example.test'])).json();
        assert.equal(conflict20.table3CandidateNumber,21);
        assert.equal(conflict20.sourceConflict.code,'PARAMETER_KRITERIA_TIDAK_SELARAS');
        // Kategori 2 nomor 21 dan 25 mengarah ke Tabel 3 nomor 22 dan 27.
        for(const [indicator,table] of [[21,22],[25,27],[26,28],[27,29]]){
          const response=await fetchSource(route(b.id,indicator),
            cookies['criteria-maker@example.test']);
          assert.equal(response.status,200);
          const row=await response.json();
          assert.equal(row.table3CandidateNumber,table);
          assert.equal(row.sourceConflict.code,'PARAMETER_KRITERIA_TIDAK_SELARAS');
          assert.equal(row.officialScoreAvailable,false);
        }
        assert.equal((await fetchSource(route(b.id,61),
          cookies['criteria-maker@example.test'])).status,400);
        assert.equal((await fetchSource(route(
          '11111111-1111-4111-8111-111111111111',1),
          cookies['criteria-maker@example.test'])).status,404);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
