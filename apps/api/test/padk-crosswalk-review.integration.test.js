import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  SOURCE_SHA,recordMappingReviewInTransaction,
} from '../src/padk-crosswalk-reviews.js';

const PATH='/regulatory/padk43/cyber/crosswalk';
const ORIGIN='http://127.0.0.1:3000';
test('PADK mapping review audit needs two different reviewers; never unlock scoring',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank review test','BPR')");
      const people=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('reg-substance@example.test','active','test-hash'),"+
        "('reg-technical@example.test','active','test-hash'),"+
        "('reg-maker@example.test','active','test-hash') RETURNING id,email",
      );
      const ids=Object.fromEntries(people.rows.map(x=>[x.email.split('@')[0],x.id]));
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES "+
        "($1,'REVIEWER'),($2,'REVIEWER'),($3,'IT_OFFICER')",
        [ids['reg-substance'],ids['reg-technical'],ids['reg-maker']],
      );
      const cookies={};
      for(const [k,id] of Object.entries(ids))cookies[k]=
        '__Host-nusariksa_session='+(await createSession(db,id)).token;
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        crosswalkHandlers:{submit:(client,args)=>recordMappingReviewInTransaction(client,args)},
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method,cookie,body,origin=ORIGIN)=>fetch(base+path,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{'Content-Type':'application/json',Origin:origin}:{}),
        },
        ...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      const candidate={reviewTrack:'SUBSTANCE',decision:'ACCEPT_CANDIDATE',
        proposedTable3Number:25,proposedPdfPage:169,
        basis:'PDF halaman 150 dan 169 telah dibaca untuk perbandingan kandidat.',
        sourcePdfSha256:SOURCE_SHA,expectedLatestEventId:0};
      const source=cookies['reg-substance'],tech=cookies['reg-technical'],maker=cookies['reg-maker'];
      try{
        assert.equal((await send(PATH,'GET')).status,401);
        assert.equal((await send(PATH,'GET',maker)).status,403);
        assert.equal((await send(PATH+'/24','POST',maker,candidate)).status,403);
        assert.equal((await send(PATH+'/24','POST',source,candidate,'https://evil.invalid')).status,403);
        assert.equal((await send(PATH+'/24','POST',source,{...candidate,sourcePdfSha256:'0'.repeat(64)})).status,400);
        const list=await send(PATH,'GET',source);
        assert.equal(list.status,200);
        const collection=await list.json();
        assert.equal(collection.items.length,60);
        assert.equal(collection.sourceAuthenticityVerified,false);
        assert.equal(collection.productionScoringAvailable,false);
        assert.equal(collection.items[23].risk,'SOURCE_REVIEW_REQUIRED');
        const first=await send(PATH+'/24','POST',source,candidate);
        assert.equal(first.status,201);
        const event=(await first.json()).review;
        assert.ok(Number.isSafeInteger(event.eventId)&&event.eventId>0);
        assert.equal((await send(PATH+'/24','POST',source,candidate)).status,409);
        assert.equal((await send(PATH+'/24','POST',source,{
          ...candidate,reviewTrack:'TECHNICAL',expectedLatestEventId:0,
        })).status,409);
        const second=await send(PATH+'/24','POST',tech,{
          ...candidate,reviewTrack:'TECHNICAL',
        });
        assert.equal(second.status,201);
        assert.equal((await second.json()).regulatoryPackVerified,false);
        const reviewed=(await(await send(PATH,'GET',source)).json()).items[23];
        assert.equal(reviewed.mappingReviewStatus,'TWO_REVIEWERS_AGREE_CANDIDATE');
        assert.equal(reviewed.productionScoringAvailable,false);
        const history=await send(PATH+'/24/history','GET',source);
        assert.equal(history.status,200);
        assert.equal((await history.json()).events.length,2);
        const revise=await send(PATH+'/24','POST',tech,{
          ...candidate,reviewTrack:'TECHNICAL',decision:'ESCALATE',
          proposedTable3Number:null,proposedPdfPage:null,
          expectedLatestEventId:reviewed.reviews.TECHNICAL.eventId,
          basis:'Pemeriksaan tambahan perlu dilakukan pada halaman 150 dan 169.',
        });
        assert.equal(revise.status,201);
        const unresolved=(await(await send(PATH,'GET',source)).json()).items[23];
        assert.equal(unresolved.mappingReviewStatus,'PENDING');
        const permanent=await db.query(
          'SELECT * FROM padk_category2_mapping_review_events WHERE category2_number=24',
        );
        assert.equal(permanent.rows.length,3);
        await assert.rejects(db.query(
          'DELETE FROM padk_category2_mapping_review_events WHERE id=$1',[event.eventId],
        ),/Role change events cannot be changed or deleted/);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK').catch(()=>{});
    }finally{db.release();}
  }finally{await pool.end();}
});
