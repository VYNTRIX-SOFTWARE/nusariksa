import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  createPadkPreparationInTransaction,savePadkPreparationInTransaction,
} from '../src/padk-preparations.js';
const ORIGIN='http://127.0.0.1:3000';
const ROOT='/regulatory/padk43/cyber/preparations';

test('maker creates and saves a PADK preparation; viewer can read without scoring or approval',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PADK Test','BPR')");
      const users=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('padk-maker@example.test','active','hash-test'),"+
        "('padk-maker2@example.test','active','hash-test'),"+
        "('padk-viewer@example.test','active','hash-test') RETURNING id,email",
      );
      const byEmail=Object.fromEntries(users.rows.map(u=>[u.email,u.id]));
      const maker=byEmail['padk-maker@example.test'];
      const maker2=byEmail['padk-maker2@example.test'];
      const viewer=byEmail['padk-viewer@example.test'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES"+
        "($1,'IT_OFFICER'),($2,'IT_OFFICER'),($3,'VIEWER')",
        [maker,maker2,viewer],
      );
      const cookies={};
      for(const [role,id] of [['maker',maker],['maker2',maker2],['viewer',viewer]]){
        cookies[role]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      }
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        padkPreparationHandlers:{
          create:(client,args)=>createPadkPreparationInTransaction(client,args),
          save:(client,args)=>savePadkPreparationInTransaction(client,args),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,origin=ORIGIN)=>fetch(base+path,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),
        },
        ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
      });
      try{
        const input={
          title:'Penilaian Keamanan Siber Tahun 2026',category:1,
          periodStart:'2026-01-01',periodEnd:'2026-12-31',
        };
        assert.equal((await send(ROOT)).status,401);
        assert.equal((await send(ROOT,'POST',cookies.viewer,input)).status,403);
        assert.equal((await send(ROOT,'POST',cookies.maker,input,'https://evil.example')).status,403);
        assert.equal((await send(ROOT,'POST',cookies.maker,{...input,category:3})).status,400);
        assert.equal((await send(ROOT,'POST',cookies.maker,{...input,official:true})).status,400);
        const created=await send(ROOT,'POST',cookies.maker,input);
        assert.equal(created.status,201);
        const saved=await created.json();
        assert.equal(saved.category,1);
        assert.equal(saved.status,'PREPARATION_ONLY');
        assert.equal(saved.scoringAvailable,false);
        assert.equal(saved.submissionAvailable,false);
        assert.equal(saved.finalReportAvailable,false);
        assert.equal(saved.revision,1);
        assert.equal(saved.preparationNotes,'');
        const id=saved.id;
        const listed=await (await send(ROOT,'GET',cookies.viewer)).json();
        assert.equal(listed.regulatoryPackReady,false);
        assert.equal(listed.preparations[0].id,id);
        assert.equal((await send(ROOT+'/'+id,'GET',cookies.viewer)).status,200);
        assert.equal((await send(ROOT+'/'+id,'PUT',cookies.viewer,{
          preparationNotes:'X',evidencePlan:'Y',expectedRevision:1,
        })).status,403);
        assert.equal((await send(ROOT+'/'+id,'PUT',cookies.maker2,{
          preparationNotes:'X',evidencePlan:'Y',expectedRevision:1,
        })).status,403);
        const updated=await send(ROOT+'/'+id,'PUT',cookies.maker,{
          preparationNotes:'Catatan kesiapan operasional',
          evidencePlan:'Kumpulkan kebijakan keamanan dan bukti pemantauan',
          expectedRevision:1,
        });
        assert.equal(updated.status,200);
        assert.equal((await updated.json()).revision,2);
        assert.equal((await send(ROOT+'/'+id,'PUT',cookies.maker,{
          preparationNotes:'Revisi lama',evidencePlan:'Bukti lama',expectedRevision:1,
        })).status,409);
        const after=await (await send(ROOT+'/'+id,'GET',cookies.viewer)).json();
        assert.equal(after.preparationNotes,'Catatan kesiapan operasional');
        assert.equal(after.evidencePlan,'Kumpulkan kebijakan keamanan dan bukti pemantauan');
        const history=await(await send(ROOT+'/'+id+'/history','GET',cookies.viewer)).json();
        assert.deepEqual(history.events.map(e=>e.action),['UPDATED','CREATED']);
        assert.deepEqual(history.events.map(e=>e.revision),[2,1]);
        assert.equal((await send(ROOT+'/'+id+'/submit','POST',cookies.maker,{})).status,404);
        assert.equal((await send(ROOT+'/'+id+'/report','GET',cookies.viewer)).status,404);
        const locked=await db.query(
          'SELECT * FROM padk_assessment_preparation_events WHERE preparation_id=$1',[id],
        );
        assert.equal(locked.rowCount,2);
        await assert.rejects(db.query(
          'UPDATE padk_assessment_preparation_events SET action=$2 WHERE id=$1',
          [locked.rows[0].id,'UPDATED'],
        ),/cannot be changed|cannot be deleted|Role change events/i);
      }finally{
        server.close();await once(server,'close');
      }
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
