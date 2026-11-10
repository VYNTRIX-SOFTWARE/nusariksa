import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createAssetInTransaction,archiveAssetInTransaction} from '../src/ti-assets.js';
import {
  RiskError,riskLevel,validateRisk,createRiskInTransaction,updateRiskInTransaction,
  archiveRiskInTransaction,getRisk,listRisks,riskHistory,listRiskAssets,
} from '../src/ti-risks.js';

const origin='http://127.0.0.1:3000';
const payload={
  riskCode:'RSK-CBS-01',title:'Gangguan server core banking',
  scenario:'Kerusakan server dapat menghentikan layanan transaksi operasional BPR.',
  assetId:null,likelihood:4,impact:5,residualLikelihood:null,residualImpact:null,
  mitigation:'',pic:'Petugas TI',dueDate:'2027-03-30',status:'open',note:'',
};
test('rubrik risiko internal: validasi ketat dan tidak menciptakan risiko residual',()=>{
  assert.equal(riskLevel(1),'low');
  assert.equal(riskLevel(4),'low');
  assert.equal(riskLevel(5),'medium');
  assert.equal(riskLevel(9),'medium');
  assert.equal(riskLevel(10),'high');
  assert.equal(riskLevel(16),'high');
  assert.equal(riskLevel(17),'critical');
  assert.equal(riskLevel(25),'critical');
  assert.throws(()=>riskLevel(0),RiskError);
  assert.equal(validateRisk(payload).residualLikelihood,null);
  for(const bad of [
    {...payload,unknown:'yes'},{...payload,riskCode:'../x'},
    {...payload,title:'a'},{...payload,likelihood:0},
    {...payload,impact:6},{...payload,assetId:'bogus'},
    {...payload,residualLikelihood:1,residualImpact:null},
    {...payload,dueDate:'2027-02-30'},
    {...payload,mitigation:'hi',status:'closed'},
  ])assert.throws(()=>validateRisk(bad),RiskError);
  assert.throws(()=>validateRisk({...payload,expectedRevision:0},{update:true}),RiskError);
  assert.equal(validateRisk({...payload,mitigation:'Tindakan mitigasi sudah dilaksanakan',
    residualLikelihood:2,residualImpact:3,status:'closed'}).status,'closed');
});
test('register risiko TI: API, FK aset, izin, penilaian, revisi, audit immutable', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Risiko','BPR') ON CONFLICT(id) DO NOTHING");
      const users={};const cookies={};
      for(const [name,role] of [['maker','IT_OFFICER'],['reviewer','REVIEWER'],['viewer','VIEWER']]){
        const u=await db.query(
          "INSERT INTO users(email,status,password_hash) VALUES($1,'active','testhash') RETURNING id",
          ['risk-'+name+'@example.test']);
        users[name]=u.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[users[name],role]);
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,users[name])).token;
      }
      const asset=await createAssetInTransaction(db,{
        actorId:users.maker,assetCode:'SRV-RISK-01',title:'Server Basis Data',
        kind:'server',ownerName:'Unit Operasional',location:'Ruang Server',
        criticality:'high',operationalStatus:'active',note:'Data uji',
      });
      const server=createServer({
        authDb:db,appOrigin:origin,riskHandlers:{
          list:(c,a)=>listRisks(c,a),detail:(c,a)=>getRisk(c,a),history:(c,a)=>riskHistory(c,a),
          assets:(c,a)=>listRiskAssets(c,a),create:(c,a)=>createRiskInTransaction(c,a),
          update:(c,a)=>updateRiskInTransaction(c,a),
          archive:(c,a)=>archiveRiskInTransaction(c,a),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,requestOrigin=origin,type='application/json')=>
        fetch(base+path,{method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:requestOrigin,'Content-Type':type}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{})});
      try{
        assert.equal((await send('/risks')).status,401);
        assert.equal((await send('/risks','POST',cookies.reviewer,payload)).status,403);
        assert.equal((await send('/risks','POST',cookies.viewer,payload)).status,403);
        assert.equal((await send('/risks','POST',cookies.maker,payload,'https://evil.example')).status,403);
        assert.equal((await send('/risks','POST',cookies.maker,payload,origin,'text/plain')).status,415);
        assert.equal((await send('/risks','POST',cookies.maker,{...payload,unknown:2})).status,400);
        assert.equal((await send('/risks','POST',cookies.maker,{
          ...payload,assetId:'99999999-9999-4999-8999-999999999999'})).status,404);
        const assets=await send('/risks/asset-options','GET',cookies.viewer);
        assert.equal(assets.status,200);
        assert.ok((await assets.json()).assets.some(x=>x.id===asset.id));
        const created=await send('/risks','POST',cookies.maker,{...payload,assetId:asset.id});
        assert.equal(created.status,201);
        const risk=await created.json();
        assert.equal(risk.inherent_score,20);
        assert.equal(risk.inherent_level,'critical');
        assert.equal(risk.residual_score,null);
        assert.equal(risk.asset_id,asset.id);
        assert.equal(risk.asset_code,asset.asset_code);
        assert.equal(risk.revision,1);
        await db.query('SAVEPOINT duplicate_code');
        assert.equal((await send('/risks','POST',cookies.maker,{...payload,assetId:asset.id})).status,409);
        await db.query('ROLLBACK TO SAVEPOINT duplicate_code');
        assert.equal((await send('/risks/'+risk.id,'GET',cookies.viewer)).status,200);
        assert.equal((await send('/risks/'+risk.id,'PATCH',cookies.viewer,
          {...payload,assetId:asset.id,expectedRevision:1})).status,403);
        assert.equal((await send('/risks/'+risk.id+'/archive','POST',cookies.reviewer,
          {expectedRevision:1})).status,403);
        assert.equal((await send('/risks?status=open&level=critical&assetId='+asset.id,
          'GET',cookies.reviewer)).status,200);
        const list=await send('/risks?q=RSK-CBS&level=critical','GET',cookies.viewer);
        assert.equal((await list.json()).risks.length,1);
        assert.equal((await send('/risks?offset=wrong','GET',cookies.maker)).status,400);
        assert.equal((await send('/risks?view=all&view=active','GET',cookies.maker)).status,400);
        assert.equal((await send('/risks?assetId=bogus','GET',cookies.maker)).status,400);
        assert.equal((await send('/risks/'+risk.id,'PATCH',cookies.maker,{
          ...payload,assetId:asset.id,expectedRevision:1,
          mitigation:'Penerapan penggantian server dan prosedur pemulihan.',
          residualLikelihood:4,residualImpact:4,status:'closed',
        })).status,409);
        const updating={...payload,assetId:asset.id,expectedRevision:1,
          mitigation:'Jalankan backup dan uji pemulihan sistem secara rutin.',
          residualLikelihood:2,residualImpact:3,status:'mitigating'};
        const patched=await send('/risks/'+risk.id,'PATCH',cookies.maker,updating);
        assert.equal(patched.status,200);
        assert.equal((await patched.json()).revision,2);
        assert.equal((await send('/risks/'+risk.id,'PATCH',cookies.maker,updating)).status,409);
        const close=await send('/risks/'+risk.id,'PATCH',cookies.maker,{
          ...updating,expectedRevision:2,status:'closed'});
        assert.equal(close.status,200);
        const closed=await close.json();
        assert.equal(closed.revision,3);assert.equal(closed.residual_score,6);
        await db.query('SAVEPOINT archived_asset');
        const archivedAsset=await archiveAssetInTransaction(db,{
          actorId:users.maker,id:asset.id,expectedRevision:1});
        assert.ok(archivedAsset.archived_at);
        assert.equal((await send('/risks','POST',cookies.maker,{
          ...payload,riskCode:'RSK-CBS-02',assetId:asset.id})).status,409);
        await db.query('RELEASE SAVEPOINT archived_asset');
        assert.equal((await send('/risks/'+risk.id,'GET',cookies.viewer)).status,200);
        const archived=await send('/risks/'+risk.id+'/archive','POST',cookies.maker,
          {expectedRevision:3});
        assert.equal(archived.status,200);
        assert.equal((await archived.json()).revision,4);
        assert.equal((await send('/risks/'+risk.id+'/archive','POST',cookies.maker,
          {expectedRevision:4})).status,409);
        assert.equal((await send('/risks/'+risk.id,'PATCH',cookies.maker,
          {...updating,expectedRevision:4})).status,409);
        assert.equal((await (await send('/risks','GET',cookies.maker)).json()).risks.length,0);
        assert.equal((await (await send('/risks?view=archived','GET',cookies.viewer)).json()).risks.length,1);
        const history=await send('/risks/'+risk.id+'/history','GET',cookies.reviewer);
        assert.equal(history.status,200);
        const events=(await history.json()).events;
        assert.deepEqual(events.map(x=>x.action),['ARCHIVED','UPDATED','UPDATED','CREATED']);
        assert.equal((await db.query('SELECT count(*)::int n FROM ti_risk_events WHERE risk_id=$1',
          [risk.id])).rows[0].n,4);
        await db.query('SAVEPOINT immutable_risk');
        await assert.rejects(db.query('DELETE FROM ti_risk_events WHERE risk_id=$1',[risk.id]));
        await db.query('ROLLBACK TO SAVEPOINT immutable_risk');
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
