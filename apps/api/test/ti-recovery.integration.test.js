import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {RecoveryError,validatePlan,validateExercise,listRecoveryPlans,getRecoveryPlan,
 createRecoveryPlanInTransaction,updateRecoveryPlanInTransaction,archiveRecoveryPlanInTransaction,
 listRecoveryExercises,addRecoveryExerciseInTransaction,recoveryHistory} from '../src/ti-recovery.js';
const origin='http://127.0.0.1:3000';
const plan={
 planCode:'BCP-CBS-01',serviceName:'Layanan transaksi CBS',
 scenario:'Server transaksi utama tidak dapat diakses saat jam layanan.',
 businessImpact:'Setoran, penarikan, dan pembukuan terhenti sampai layanan dipulihkan.',
 activationCriteria:'Aktivasi berdasarkan keputusan petugas penanggung jawab ketika layanan inti tidak tersedia.',
 ownerPic:'Penanggung Jawab TI',alternatePic:'Petugas Operasional',
 rtoMinutes:240,rpoMinutes:60,
 recoverySteps:'Koordinasi insiden, isolasi kegagalan, pilih sumber backup teruji, pulihkan layanan, validasi transaksi.',
 communicationSteps:'Hubungi Direksi, petugas operasional, dan vendor terkait.',
 dependencies:'Daya listrik, jaringan, dan basis data CBS.',
 backupReference:'Referensi berkas backup tersimpan di register internal.',
 evidenceLocation:'Arsip TI / dokumen pemulihan',status:'draft',
};
const exercise={
 exerciseDate:'2026-01-15',exerciseType:'restore',
 observedRtoMinutes:120,observedRpoMinutes:30,outcome:'passed',
 summary:'Pemulihan basis data sintetis diuji dan diverifikasi oleh petugas.',
 followUp:'Ulangi verifikasi berkala.',evidenceReference:'BA-UJI-2026-01',
};
test('rencana dan catatan uji menolak nilai palsu dan isian tak dikenal',()=>{
 assert.equal(validatePlan(plan).planCode,'BCP-CBS-01');
 assert.throws(()=>validatePlan({...plan,unexpected:true}),RecoveryError);
 assert.throws(()=>validatePlan({...plan,rtoMinutes:-1}),RecoveryError);
 assert.throws(()=>validatePlan({...plan,rtoMinutes:1.5}),RecoveryError);
 assert.throws(()=>validatePlan({...plan,planCode:'../../secret'}),RecoveryError);
 assert.throws(()=>validatePlan({...plan,scenario:'short'}),RecoveryError);
 assert.equal(validateExercise(exercise).outcome,'passed');
 assert.throws(()=>validateExercise({...exercise,outcome:'passed',evidenceReference:''}),RecoveryError);
 assert.throws(()=>validateExercise({...exercise,observedRtoMinutes:null}),RecoveryError);
 assert.throws(()=>validateExercise({...exercise,exerciseDate:'2026-02-30'}),RecoveryError);
 assert.throws(()=>validateExercise({...exercise,extra:123}),RecoveryError);
});
test('pemulihan TI: akses, revisi, pengujian permanen, tenant dan pengarsipan',{
 skip:!process.env.DATABASE_URL,
},async()=>{
 const pool=createPool();
 try{
  await runMigrations(pool);
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Pemulihan','BPR')");
   const users={},cookies={};
   for(const [name,role] of [['maker','IT_OFFICER'],['reviewer','REVIEWER'],['viewer','VIEWER']]){
    const r=await db.query("INSERT INTO users(email,status,password_hash) VALUES($1,'active','testhash') RETURNING id",
      ['recovery-'+name+'@example.test']);
    users[name]=r.rows[0].id;
    await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[users[name],role]);
    cookies[name]='__Host-nusariksa_session='+(await createSession(db,users[name])).token;
   }
   const server=createServer({authDb:db,appOrigin:origin,recoveryHandlers:{
    list:listRecoveryPlans,detail:getRecoveryPlan,history:recoveryHistory,
    create:createRecoveryPlanInTransaction,update:updateRecoveryPlanInTransaction,
    archive:archiveRecoveryPlanInTransaction,exercises:listRecoveryExercises,
    addExercise:addRecoveryExerciseInTransaction,
   }});
   server.listen(0,'127.0.0.1');await once(server,'listening');
   const base='http://127.0.0.1:'+server.address().port;
   const send=(path,method='GET',cookie,body,requestOrigin=origin)=>
    fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),
     ...(method!=='GET'?{Origin:requestOrigin,'Content-Type':'application/json'}:{})},
     ...(body!==undefined?{body:JSON.stringify(body)}:{})});
   try{
    assert.equal((await send('/recovery-plans')).status,401);
    assert.equal((await send('/recovery-plans','POST',cookies.viewer,plan)).status,403);
    assert.equal((await send('/recovery-plans','POST',cookies.reviewer,plan)).status,403);
    assert.equal((await send('/recovery-plans','POST',cookies.maker,plan,'https://wrong.test')).status,403);
    assert.equal((await send('/recovery-plans','POST',cookies.maker,{...plan,extra:'bad'})).status,400);
    const r=await send('/recovery-plans','POST',cookies.maker,plan);assert.equal(r.status,201);
    const p=await r.json();assert.equal(p.plan_code,plan.planCode);assert.equal(p.revision,1);
    assert.equal((await send('/recovery-plans/'+p.id,'GET',cookies.viewer)).status,200);
    assert.equal((await send('/recovery-plans?q=BCP-CBS','GET',cookies.viewer)).status,200);
    assert.equal((await send('/recovery-plans?offset=bad','GET',cookies.viewer)).status,400);
    assert.equal((await send('/recovery-plans?view=all&view=active','GET',cookies.viewer)).status,400);
    assert.equal((await send('/recovery-plans/'+p.id,'PATCH',cookies.viewer,
      {...plan,expectedRevision:1})).status,403);
    const upd=await send('/recovery-plans/'+p.id,'PATCH',cookies.maker,
      {...plan,status:'maintained',expectedRevision:1});
    assert.equal(upd.status,200);assert.equal((await upd.json()).revision,2);
    assert.equal((await send('/recovery-plans/'+p.id,'PATCH',cookies.maker,
      {...plan,expectedRevision:1})).status,409);
    assert.equal((await send('/recovery-plans/'+p.id+'/exercises','POST',cookies.maker,
      {...exercise,observedRtoMinutes:245})).status,409);
    const ex=await send('/recovery-plans/'+p.id+'/exercises','POST',cookies.maker,exercise);
    assert.equal(ex.status,201);assert.equal((await ex.json()).planRevision,2);
    assert.equal((await send('/recovery-plans/'+p.id+'/exercises','GET',cookies.viewer)).status,200);
    assert.equal((await send('/recovery-plans/'+p.id+'/exercises','POST',cookies.viewer,exercise)).status,403);
    const history=await (await send('/recovery-plans/'+p.id+'/history','GET',cookies.reviewer)).json();
    assert.deepEqual(history.events.map(x=>x.action),['UPDATED','CREATED']);
    await db.query('SAVEPOINT immutable');
    await assert.rejects(db.query('DELETE FROM ti_recovery_exercises WHERE plan_id=$1',[p.id]));
    await db.query('ROLLBACK TO SAVEPOINT immutable');
    const archived=await send('/recovery-plans/'+p.id+'/archive','POST',cookies.maker,{expectedRevision:2});
    assert.equal(archived.status,200);assert.ok((await archived.json()).archived_at);
    assert.equal((await send('/recovery-plans/'+p.id+'/exercises','POST',cookies.maker,exercise)).status,409);
    const hist2=await (await send('/recovery-plans/'+p.id+'/history','GET',cookies.reviewer)).json();
    assert.deepEqual(hist2.events.map(x=>x.action),['ARCHIVED','UPDATED','CREATED']);
    assert.equal((await (await send('/recovery-plans?view=archived','GET',cookies.viewer)).json()).plans.length,1);
   }finally{server.close();await once(server,'close');}
   await db.query('ROLLBACK');
  }finally{db.release();}
 }finally{await pool.end();}
});
