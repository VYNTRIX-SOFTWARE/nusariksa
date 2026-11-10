import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  createAssetInTransaction,updateAssetInTransaction,archiveAssetInTransaction,
  getAsset,listAssets,assetHistory,AssetError,validateAssetInput,
} from '../src/ti-assets.js';

const origin='http://127.0.0.1:3000';
const data={
  assetCode:'SRV-CBS-01',title:'Server Core Banking',
  kind:'server',ownerName:'Tim Operasional TI',location:'Ruang Server Pusat',
  criticality:'high',operationalStatus:'active',note:'Inventaris uji sintetis',
};
test('validasi inventaris menolak field liar dan nilai tidak valid',()=>{
  assert.deepEqual(validateAssetInput(data),data);
  for(const bad of [
    {...data,assetCode:'../../admin'},
    {...data,assetCode:'srv-cbs-01'},
    {...data,title:' '},
    {...data,criticality:'critical'},
    {...data,operationalStatus:'hacked'},
    {...data,unexpected:'role'},
    {...data,note:'a'.repeat(2001)},
  ])assert.throws(()=>validateAssetInput(bad),AssetError);
  assert.throws(()=>validateAssetInput({...data,expectedRevision:0},{update:true}),AssetError);
});
test('inventaris TI: persistence, role, tenant, filter, audit, revisi & arsip', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Asset A','BPR') ON CONFLICT (id) DO NOTHING");
      const inst1=1;
      // Deployment is single-institution by schema, so a second tenant cannot be forged.
      await db.query('SAVEPOINT reject_second_institution');
      await assert.rejects(db.query(
        "INSERT INTO institutions(id,name,kind) VALUES(2,'Bank Palsu','BPR')"),
        error=>error.code==='23514');
      await db.query('ROLLBACK TO SAVEPOINT reject_second_institution');
      const ids={};
      for(const [role,institution] of [['maker',inst1],['reviewer',inst1],['viewer',inst1]]){
        const created=await db.query(
          "INSERT INTO users(institution_id,email,status,password_hash) VALUES($1,$2,'active','hash-uji') RETURNING id",
          [institution,'ti-asset-'+role+'@example.test']);
        ids[role]=created.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',
          [ids[role],role==='maker'?'IT_OFFICER':role==='reviewer'?'REVIEWER':'VIEWER']);
      }
      const cookies={};
      for(const [name,id] of Object.entries(ids))
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      const server=createServer({
        authDb:db,appOrigin:origin,
        assetHandlers:{
          list:(connection,args)=>listAssets(connection,args),
          detail:(connection,args)=>getAsset(connection,args),
          history:(connection,args)=>assetHistory(connection,args),
          create:(connection,args)=>createAssetInTransaction(connection,args),
          update:(connection,args)=>updateAssetInTransaction(connection,args),
          archive:(connection,args)=>archiveAssetInTransaction(connection,args),
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
        assert.equal((await send('/assets')).status,401);
        assert.equal((await send('/assets','POST',cookies.reviewer,data)).status,403);
        assert.equal((await send('/assets','POST',cookies.viewer,data)).status,403);
        assert.equal((await send('/assets','POST',cookies.maker,data,'https://evil.test')).status,403);
        assert.equal((await send('/assets','POST',cookies.maker,data,origin,'text/plain')).status,415);
        assert.equal((await send('/assets','POST',cookies.maker,{...data,ownerName:''})).status,400);
        const created=await send('/assets','POST',cookies.maker,data);
        assert.equal(created.status,201);
        const asset=await created.json();
        assert.equal(asset.asset_code,data.assetCode);
        assert.equal(asset.revision,1);
        await db.query('SAVEPOINT duplicate_code');
        assert.equal((await send('/assets','POST',cookies.maker,data)).status,409);
        await db.query('ROLLBACK TO SAVEPOINT duplicate_code');
        assert.equal((await send('/assets','POST',cookies.maker,
          {...data,institutionId:2})).status,400);
        assert.equal((await send('/assets/'+asset.id,'GET',cookies.viewer)).status,200);
        assert.equal((await send('/assets/'+asset.id+'/history','GET',cookies.viewer)).status,200);
        assert.equal((await send('/assets/'+asset.id+'/archive','POST',cookies.viewer,
          {expectedRevision:1})).status,403);
        assert.equal((await send('/assets/'+asset.id,'PATCH',cookies.viewer,
          {...data,expectedRevision:1})).status,403);
        const list=await send('/assets?q=SRV-CBS&kind=server&criticality=high','GET',cookies.reviewer);
        assert.equal(list.status,200);
        assert.equal((await list.json()).assets.length,1);
        assert.deepEqual((await (await send('/assets?status=archived','GET',cookies.maker)).json()).assets,[]);
        assert.equal((await send('/assets?q=%25%27%20OR%201%3D1','GET',cookies.maker)).status,200);
        assert.equal((await send('/assets?offset=wat','GET',cookies.maker)).status,400);
        assert.equal((await send('/assets?status=active&status=archived','GET',cookies.maker)).status,400);
        const change={...data,ownerName:'Unit Infrastruktur',operationalStatus:'maintenance',expectedRevision:1};
        const patched=await send('/assets/'+asset.id,'PATCH',cookies.maker,change);
        assert.equal(patched.status,200);
        assert.equal((await patched.json()).revision,2);
        assert.equal((await send('/assets/'+asset.id,'PATCH',cookies.maker,change)).status,409);
        assert.equal((await send('/assets/'+asset.id,'PATCH',cookies.maker,
          {...change,expectedRevision:2,assetCode:'SRV-OTHER'})).status,400);
        const archived=await send('/assets/'+asset.id+'/archive','POST',cookies.maker,{expectedRevision:2});
        assert.equal(archived.status,200);
        const record=await archived.json();
        assert.equal(record.revision,3);assert.ok(record.archived_at);
        assert.equal((await send('/assets/'+asset.id+'/archive','POST',cookies.maker,{expectedRevision:3})).status,409);
        assert.equal((await send('/assets/'+asset.id,'PATCH',cookies.maker,{...data,expectedRevision:3})).status,409);
        assert.equal((await (await send('/assets','GET',cookies.maker)).json()).assets.length,0);
        assert.equal((await (await send('/assets?status=archived','GET',cookies.viewer)).json()).assets.length,1);
        const history=await send('/assets/'+asset.id+'/history','GET',cookies.reviewer);
        assert.equal(history.status,200);
        assert.deepEqual((await history.json()).events.map(x=>x.action),['ARCHIVED','UPDATED','CREATED']);
        const persisted=await db.query('SELECT count(*)::int AS total FROM ti_asset_events WHERE asset_id=$1',[asset.id]);
        assert.equal(persisted.rows[0].total,3);
        await db.query('SAVEPOINT protect_events');
        await assert.rejects(db.query('DELETE FROM ti_asset_events WHERE asset_id=$1',[asset.id]));
        await db.query('ROLLBACK TO SAVEPOINT protect_events');
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
