import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createPadkPreparationInTransaction,savePadkPreparationInTransaction}
  from '../src/padk-preparations.js';
import {savePadkIndicatorNoteInTransaction}
  from '../src/padk-preparation-indicators.js';
import {
  validatePadkDraftDecision,submitPadkDraftInTransaction,reviewPadkDraftInTransaction,
} from '../src/padk-draft-review.js';

const ROOT='/regulatory/padk43/cyber/preparations/';
const ORIGIN='http://127.0.0.1:3000';
test('PADK draft decision accepts only two provisional outcomes and limits notes',()=>{
  assert.deepEqual(validatePadkDraftDecision({decision:'accept_draft',note:''}),
    {decision:'accept_draft',note:''});
  for(const x of [
    {decision:'approve',note:''},{decision:'request_changes',note:'short'},
    {decision:'request_changes',note:'x'.repeat(2001)},
    {decision:'accept_draft',note:'bad\u0001'},
    {decision:'accept_draft',note:'',official:true},
  ])assert.throws(()=>validatePadkDraftDecision(x),error=>error.status===400);
});
test('PADK maker submits complete provisional assessment; checker returns, resubmits, accepts draft only',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank PADK Workflow Test','BPR')");
      const people=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES"+
        "('padk-work-maker@example.test','active','test-hash'),"+
        "('padk-work-reviewer@example.test','active','test-hash'),"+
        "('padk-work-viewer@example.test','active','test-hash') RETURNING id,email",
      );
      const ids=Object.fromEntries(people.rows.map(r=>[r.email.split('@')[0],r.id]));
      const maker=ids['padk-work-maker'],reviewer=ids['padk-work-reviewer'],
        viewer=ids['padk-work-viewer'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES "+
        "($1,'IT_OFFICER'),($2,'REVIEWER'),($3,'VIEWER')",
        [maker,reviewer,viewer],
      );
      const prep=await createPadkPreparationInTransaction(db,{
        actorId:maker,title:'Penilaian Kategori 2 Uji Siklus',category:2,
        periodStart:'2026-01-01',periodEnd:'2026-12-31',
      });
      const cookies={};
      for(const user of people.rows){
        cookies[user.email]='__Host-nusariksa_session='+(await createSession(db,user.id)).token;
      }
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        padkDraftReviewHandlers:{
          submit:(client,args)=>submitPadkDraftInTransaction(client,args),
          review:(client,args)=>reviewPadkDraftInTransaction(client,args),
        },
        padkPreparationHandlers:{
          save:(client,args)=>savePadkPreparationInTransaction(client,args),
          saveIndicator:(client,args)=>savePadkIndicatorNoteInTransaction(client,args),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const root='http://127.0.0.1:'+server.address().port,base=ROOT+prep.id;
      const makerCookie=cookies['padk-work-maker@example.test'],
        reviewerCookie=cookies['padk-work-reviewer@example.test'],
        viewerCookie=cookies['padk-work-viewer@example.test'];
      const send=(url,method='GET',cookie,body,origin=ORIGIN)=>fetch(root+url,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method==='POST'||method==='PUT'?{Origin:origin}:{}),
          ...(body!==undefined?{'Content-Type':'application/json'}:{}),
        },
        ...(body!==undefined?{body:JSON.stringify(body)}:{}),
      });
      const url=base+'/draft-review';
      try{
        assert.equal((await send(url)).status,401);
        assert.equal((await send(url,'GET',viewerCookie)).status,200);
        const initial=await(await send(url,'GET',makerCookie)).json();
        assert.equal(initial.status,'in_progress');
        assert.equal(initial.finalReportAvailable,false);
        assert.equal(initial.officialApprovalAvailable,false);
        assert.equal((await send(url+'/submit','POST',viewerCookie)).status,403);
        assert.equal((await send(url+'/submit','POST',makerCookie,undefined,'https://evil.invalid')).status,403);
        assert.equal((await send(url+'/submit','POST',makerCookie)).status,409);
        await db.query(
          "INSERT INTO padk_preparation_indicator_notes "+
          "(preparation_id,indicator_number,provisional_rank,justification) "+
          "SELECT $1,n,2,'Justifikasi sementara berdasarkan pemeriksaan dokumen internal.' "+
          "FROM generate_series(1,60) AS n",[prep.id],
        );
        const submitted=await send(url+'/submit','POST',makerCookie);
        assert.equal(submitted.status,200);
        const submittedData=await submitted.json();
        assert.equal(submittedData.status,'submitted');
        assert.equal(submittedData.submissionCycle,1);
        assert.equal(submittedData.officialApprovalAvailable,false);
        assert.equal((await send(url+'/submit','POST',makerCookie)).status,409);
        assert.equal((await send(url+'/decision','POST',makerCookie,{
          decision:'accept_draft',note:'',
        })).status,403);
        assert.equal((await send(url+'/decision','POST',viewerCookie,{
          decision:'accept_draft',note:'',
        })).status,403);
        assert.equal((await send(base,'PUT',makerCookie,{
          preparationNotes:'Dilarang mengubah saat review',evidencePlan:'',
          expectedRevision:1,
        })).status,409);
        assert.equal((await send(base+'/indicators/1','PUT',makerCookie,{
          preparationNotes:'Diubah ketika menunggu review',
          evidencePlan:'',provisionalRank:3,
          justification:'Justifikasi belum final dari inspeksi terakhir.',expectedRevision:1,
        })).status,409);
        // Database-level protection also blocks direct SQL writes.
        await db.query('SAVEPOINT draft_guard');
        await assert.rejects(db.query(
          "UPDATE padk_preparation_indicator_notes SET justification='Ubah tanpa UI',revision=revision+1 "+
          "WHERE preparation_id=$1 AND indicator_number=1",[prep.id],
        ),/locked while submitted or accepted/i);
        await db.query('ROLLBACK TO SAVEPOINT draft_guard');
        const returned=await send(url+'/decision','POST',reviewerCookie,{
          decision:'request_changes',
          note:'Periksa konsistensi justifikasi antara kriteria dan bukti.',
        });
        assert.equal(returned.status,200);
        assert.equal((await returned.json()).status,'changes_requested');
        assert.equal((await send(url+'/decision','POST',reviewerCookie,{
          decision:'accept_draft',note:'',
        })).status,409);
        const amended=await send(base+'/indicators/1','PUT',makerCookie,{
          preparationNotes:'Pemeriksaan diulang setelah dikembalikan.',
          evidencePlan:'Bukti SOP dan notulen.',
          provisionalRank:3,
          justification:'Perlu perbaikan tata kelola sesuai hasil pemeriksaan ulang.',
          expectedRevision:1,
        });
        assert.equal(amended.status,200);
        assert.equal((await amended.json()).revision,2);
        assert.equal((await send(url+'/submit','POST',makerCookie)).status,200);
        const second=await send(url+'/decision','POST',reviewerCookie,{
          decision:'accept_draft',note:'Kelengkapan dokumentasi draft internal telah diperiksa.',
        });
        assert.equal(second.status,200);
        const accepted=await second.json();
        assert.equal(accepted.status,'draft_accepted');
        assert.equal(accepted.submissionCycle,2);
        assert.equal(accepted.officialApprovalAvailable,false);
        assert.equal(accepted.regulatoryPackVerified,false);
        assert.equal(accepted.finalReportAvailable,false);
        const history=await(await send(url+'/history','GET',viewerCookie)).json();
        assert.deepEqual(history.events.map(e=>e.action),
          ['DRAFT_ACCEPTED','SUBMITTED','CHANGES_REQUESTED','SUBMITTED']);
        assert.deepEqual(history.events.map(e=>e.submission_cycle),[2,2,1,1]);
        assert.equal((await send(base+'/indicators/1','PUT',makerCookie,{
          preparationNotes:'Perubahan setelah accepted',evidencePlan:'',
          provisionalRank:2,justification:'Perubahan yang harus ditolak oleh server.',
          expectedRevision:2,
        })).status,409);
        assert.equal((await send(url+'/submit','POST',makerCookie)).status,409);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
