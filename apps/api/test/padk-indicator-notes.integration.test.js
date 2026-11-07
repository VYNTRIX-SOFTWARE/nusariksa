import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createPadkPreparationInTransaction} from '../src/padk-preparations.js';
import {
  listPadkIndicatorNotes,savePadkIndicatorNoteInTransaction,
  historyPadkIndicatorNote,
} from '../src/padk-preparation-indicators.js';

const ORIGIN='http://127.0.0.1:3000';
const ROOT='/regulatory/padk43/cyber/preparations';

test('category 2: per-indicator notes persist and audit, maker-only write, no scoring',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PADK Indicator Test','BPR')");
      const users=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('padk-item-maker@example.test','active','hash-test'),"+
        "('padk-item-writer@example.test','active','hash-test'),"+
        "('padk-item-viewer@example.test','active','hash-test') RETURNING id,email",
      );
      const byEmail=Object.fromEntries(users.rows.map(u=>[u.email,u.id]));
      const maker=byEmail['padk-item-maker@example.test'];
      const writer=byEmail['padk-item-writer@example.test'];
      const viewer=byEmail['padk-item-viewer@example.test'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES"+
        "($1,'IT_OFFICER'),($2,'IT_OFFICER'),($3,'VIEWER')",
        [maker,writer,viewer],
      );
      const prep=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Persiapan kategori 2 2026',category:2,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      const cookies={};
      for(const [key,id] of [['maker',maker],['writer',writer],['viewer',viewer]])
        cookies[key]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        padkPreparationHandlers:{
          indicators:(client,args)=>listPadkIndicatorNotes(client,args),
          indicatorHistory:(client,args)=>historyPadkIndicatorNote(client,args),
          saveIndicator:(client,args)=>savePadkIndicatorNoteInTransaction(client,args),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const url=ROOT+'/'+prep.id+'/indicators';
      const send=(path,method='GET',cookie,body,origin=ORIGIN)=>fetch(base+path,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      const note={preparationNotes:'Peninjauan kebijakan dan kewenangan',
        evidencePlan:'SOP dan surat penugasan',expectedRevision:0};
      try{
        assert.equal((await send(url)).status,401);
        const list=await send(url,'GET',cookies.viewer);
        assert.equal(list.status,200);
        const value=await list.json();
        assert.equal(value.catalogStatus,'DRAFT_UNVERIFIED');
        assert.equal(value.scoringAvailable,false);
        assert.equal(value.sourcePdfVerified,false);
        assert.equal(value.indicators.length,60);
        assert.equal(value.indicators[0].revision,0);
        assert.equal((await send(url+'/61','PUT',cookies.maker,note)).status,400);
        assert.equal((await send(url+'/1','PUT',cookies.viewer,note)).status,403);
        assert.equal((await send(url+'/1','PUT',cookies.writer,note)).status,403);
        assert.equal((await send(url+'/1','PUT',cookies.maker,note,'https://evil.example')).status,403);
        assert.equal((await send(url+'/1','PUT',cookies.maker,{...note,rank:1})).status,400);
        const saved=await send(url+'/1','PUT',cookies.maker,note);
        assert.equal(saved.status,200);
        assert.equal((await saved.json()).revision,1);
        assert.equal((await send(url+'/1','PUT',cookies.maker,note)).status,409);
        const updated=await send(url+'/1','PUT',cookies.maker,{
          ...note,preparationNotes:'Catatan setelah inventarisasi bukti',expectedRevision:1,
        });
        assert.equal(updated.status,200);
        assert.equal((await updated.json()).revision,2);
        const reopened=await(await send(url,'GET',cookies.viewer)).json();
        assert.equal(reopened.indicators[0].revision,2);
        assert.equal(reopened.indicators[0].preparationNotes,'Catatan setelah inventarisasi bukti');
        assert.equal(reopened.indicators[1].revision,0);
        const hist=await(await send(url+'/1/history','GET',cookies.viewer)).json();
        assert.deepEqual(hist.events.map(x=>x.revision),[2,1]);
        assert.equal((await send(url+'/1/submit','POST',cookies.maker,{})).status,404);
        assert.equal((await send(url+'/1/score','GET',cookies.viewer)).status,404);
        const raw=await db.query(
          'SELECT revision FROM padk_preparation_indicator_notes WHERE preparation_id=$1',[prep.id],
        );
        assert.equal(raw.rows[0].revision,2);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
