import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  listRiskStarterRegister,markRiskStarterStateInTransaction,createRiskInTransaction,
} from '../src/ti-risks.js';

test('daftar awal risiko tersimpan di database dan dapat dinilai tanpa angka buatan', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      const institution=await db.query(
        "INSERT INTO institutions(name,kind) VALUES('Bank Referensi TI','BPR') "+
        'ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name RETURNING id');
      const instId=institution.rows[0].id;
      const seeded=await db.query(
        "SELECT count(*)::int AS n FROM ti_risk_reference_register WHERE institution_id=$1",
        [instId]);
      assert.equal(seeded.rows[0].n,24);
      const catalog=await db.query(
        "SELECT count(*)::int AS n FROM ti_risk_reference_catalog");
      assert.equal(catalog.rows[0].n,24);
      await db.query('SELECT add_risk_reference_register_for_institution($1)',[instId]);
      assert.equal((await db.query(
        'SELECT count(*)::int AS n FROM ti_risk_reference_register WHERE institution_id=$1',
        [instId])).rows[0].n,24);
      const owners={};
      const cookies={};
      for(const [key,role] of [['writer','IT_OFFICER'],['reader','VIEWER']]){
        const result=await db.query(
          "INSERT INTO users(institution_id,email,status,password_hash) "+
          "VALUES($1,$2,'active','hash-uji') RETURNING id",
          [instId,'risk-ref-'+key+'@example.test']);
        owners[key]=result.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',
          [owners[key],role]);
        cookies[key]='__Host-nusariksa_session='+(await createSession(db,owners[key])).token;
      }
      const server=createServer({authDb:db,appOrigin:'http://127.0.0.1:3000',
        riskHandlers:{
          starter:(c,a)=>listRiskStarterRegister(c,a),
          starterState:(c,a)=>markRiskStarterStateInTransaction(c,a),
          create:(c,a)=>createRiskInTransaction(c,a),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,origin='http://127.0.0.1:3000')=>
        fetch(base+path,{method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{})});
      try{
        assert.equal((await send('/risks/starter')).status,401);
        const all=await send('/risks/starter','GET',cookies.reader);
        assert.equal(all.status,200);
        const refs=(await all.json()).references;
        assert.equal(refs.length,24);
        assert.ok(refs.every(x=>x.state==='pending'&&!x.adopted_risk_id));
        assert.ok(refs.every(x=>x.title&&x.scenario&&x.review&&x.controls));
        assert.equal((await db.query(
          'SELECT count(*)::int AS n FROM ti_risks WHERE institution_id=$1',
          [instId])).rows[0].n,0);
        const url='/risks/starter/RANSOMWARE/state';
        assert.equal((await send(url,'POST',cookies.reader,{state:'not_applicable'})).status,403);
        assert.equal((await send(url,'POST',cookies.writer,{state:'not_applicable'},
          'https://evil.example')).status,403);
        assert.equal((await send(url,'POST',cookies.writer,{state:'invalid'})).status,400);
        assert.equal((await send(url,'POST',cookies.writer,{state:'not_applicable'})).status,200);
        assert.equal((await send(url,'POST',cookies.writer,{state:'pending'})).status,200);
        const manuallyAssessed={
          referenceCode:'RANSOMWARE',riskCode:'RSK-REF-RANSOMWARE',
          title:'Potensi ransomware pada jaringan internal',
          scenario:'Serangan malware dapat menghambat layanan kritis dan akses data internal bank.',
          assetId:null,likelihood:3,impact:4,
          residualLikelihood:null,residualImpact:null,mitigation:'',
          pic:'Petugas TI',dueDate:'2027-03-30',status:'open',note:'',
        };
        assert.equal((await send('/risks','POST',cookies.reader,manuallyAssessed)).status,403);
        const posted=await send('/risks','POST',cookies.writer,manuallyAssessed);
        assert.equal(posted.status,201);
        const recorded=await posted.json();
        assert.equal(recorded.inherent_score,12);
        assert.equal(recorded.residual_score,null);
        const adopted=await db.query(
          'SELECT state,adopted_risk_id,reviewed_by FROM ti_risk_reference_register '+
          'WHERE institution_id=$1 AND reference_code=$2',[instId,'RANSOMWARE']);
        assert.equal(adopted.rows[0].state,'adopted');
        assert.equal(adopted.rows[0].adopted_risk_id,recorded.id);
        assert.equal(adopted.rows[0].reviewed_by,owners.writer);
        const replay=await send('/risks','POST',cookies.writer,{
          ...manuallyAssessed,riskCode:'RSK-REF-OTHER'});
        assert.equal(replay.status,409);
        assert.equal((await send(url,'POST',cookies.writer,{state:'pending'})).status,409);
        assert.equal((await db.query(
          'SELECT count(*)::int AS n FROM ti_risks WHERE institution_id=$1',
          [instId])).rows[0].n,1);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
