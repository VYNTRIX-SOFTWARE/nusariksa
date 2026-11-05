import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  createMaturityModelInTransaction, listMaturityModels, listMaturityVersions,
  createNextMaturityVersionInTransaction, addMaturityDomainInTransaction,
  setMaturityLevelInTransaction, getMaturityRubric,
  publishMaturityVersionInTransaction,
} from '../src/maturity-models.js';

const ORIGIN='http://127.0.0.1:3000';
const criterion=level=>'Kriteria internal spesifik untuk tingkat '+level+' (harus diperiksa auditor).';

test('maturity framework versioning memerlukan enam level per domain dan tidak membuat skor otomatis', {
  skip: !process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank Uji Maturitas','BPR')");
      const people=await db.query(
        "INSERT INTO users (email,status,password_hash) VALUES " +
        "('maker-maturity@example.test','active','hash-uji')," +
        "('viewer-maturity@example.test','active','hash-uji')," +
        "('none-maturity@example.test','active','hash-uji') RETURNING id,email",
      );
      const users=Object.fromEntries(people.rows.map(p=>[p.email,p.id]));
      const maker=users['maker-maturity@example.test'];
      const viewer=users['viewer-maturity@example.test'];
      const none=users['none-maturity@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [maker,viewer],
      );
      const cookies={};
      for(const [role,id] of [['maker',maker],['viewer',viewer],['none',none]])
        cookies[role]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        maturityHandlers:{
          create:(client,args)=>createMaturityModelInTransaction(client,args),
          nextVersion:(client,args)=>createNextMaturityVersionInTransaction(client,args),
          addDomain:(client,args)=>addMaturityDomainInTransaction(client,args),
          setLevel:(client,args)=>setMaturityLevelInTransaction(client,args),
          publish:(client,args)=>publishMaturityVersionInTransaction(client,args),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,origin=ORIGIN,type='application/json')=>fetch(base+path,{
        method,
        headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method==='POST'||method==='PUT'?{Origin:origin,'Content-Type':type}:{})
        },
        ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
      });
      try{
        assert.equal((await send('/maturity-models')).status,401);
        assert.equal((await send('/maturity-models','GET',cookies.none)).status,403);
        assert.equal((await send('/maturity-models','POST',cookies.viewer,{
          code:'MAT_TI',title:'Evaluasi maturitas TI',
          methodologyReference:'Metodologi mandiri internal',
        })).status,403);
        assert.equal((await send('/maturity-models','POST',cookies.maker,{
          code:'MAT_TI',title:'Evaluasi maturitas TI',
          methodologyReference:'Metodologi mandiri internal',
        },'https://attacker.example')).status,403);
        assert.equal((await send('/maturity-models','POST',cookies.maker,'{')).status,400);
        assert.equal((await send('/maturity-models','POST',cookies.maker,{
          code:'MAT_TI',title:'Evaluasi maturitas TI',
          methodologyReference:'Metodologi mandiri internal',extra:'not allowed',
        })).status,400);
        assert.equal((await send('/maturity-models','POST',cookies.maker,'{}',
          ORIGIN,'text/plain')).status,415);

        const created=await send('/maturity-models','POST',cookies.maker,{
          code:'MAT_TI',title:'Evaluasi maturitas TI',
          methodologyReference:'Metodologi mandiri internal - bukan regulasi resmi',
        });
        assert.equal(created.status,201);
        const model=await created.json(),v1=model.currentVersion.id;
        assert.equal(model.currentVersion.status,'draft');
        const models=await (await send('/maturity-models','GET',cookies.viewer)).json();
        assert.equal(models.models[0].code,'MAT_TI');
        const versions=await (await send('/maturity-models/'+model.id+'/versions','GET',cookies.viewer)).json();
        assert.deepEqual(versions.versions.map(v=>v.version),[1]);
        assert.equal((await send('/maturity-versions/'+v1+'/publish','POST',cookies.maker)).status,409);
        const added=await send('/maturity-versions/'+v1+'/domains','POST',cookies.maker,{
          code:'GOV_01',title:'Tata kelola TI',description:'Pengelolaan kebijakan TI',
        });
        assert.equal(added.status,201);
        const domain=await added.json();
        assert.equal((await send('/maturity-versions/'+v1+'/publish','POST',cookies.maker)).status,409);
        const rubricPath='/maturity-domains/'+domain.id+'/levels/';
        for(let level=0;level<6;level++) {
          const response=await send(rubricPath+level,'PUT',cookies.maker,
            {criterion:criterion(level)});
          assert.equal(response.status,200);
          assert.equal((await response.json()).level,level);
        }
        const before=await (await send('/maturity-versions/'+v1+'/domains','GET',cookies.viewer)).json();
        assert.equal(before.domains.length,1);
        assert.deepEqual(before.domains[0].levels.map(x=>x.level),[0,1,2,3,4,5]);
        assert.equal(Object.hasOwn(before,'score'),false);
        assert.equal(before.version.status,'draft');
        const published=await send('/maturity-versions/'+v1+'/publish','POST',cookies.maker);
        assert.equal(published.status,200);
        assert.equal((await published.json()).status,'published');
        assert.equal((await send(rubricPath+'0','PUT',cookies.maker,
          {criterion:'Kriteria yang tidak boleh mengganti versi lama.'})).status,409);
        assert.equal((await send('/maturity-versions/'+v1+'/domains','POST',cookies.maker,{
          code:'SEC_01',title:'Keamanan TI',
        })).status,409);
        assert.equal((await send('/maturity-versions/'+v1+'/publish','POST',cookies.maker)).status,409);

        const next=await send('/maturity-models/'+model.id+'/versions','POST',cookies.maker);
        assert.equal(next.status,201);
        const nextVersion=await next.json();
        assert.equal(nextVersion.version,2);
        assert.equal(nextVersion.status,'draft');
        const copy=await (await send('/maturity-versions/'+nextVersion.id+'/domains','GET',cookies.viewer)).json();
        assert.equal(copy.domains.length,1);
        assert.equal(copy.domains[0].levels.length,6);
        assert.notEqual(copy.domains[0].id,domain.id);
        const changed=await send('/maturity-domains/'+copy.domains[0].id+'/levels/0',
          'PUT',cookies.maker,{criterion:'Kriteria internal versi dua yang sudah direvisi.'});
        assert.equal(changed.status,200);
        const old=await getMaturityRubric(db,viewer,v1);
        assert.equal(old.domains[0].levels[0].criterion,criterion(0));
        assert.equal((await send('/maturity-models/'+model.id+'/versions','POST',cookies.maker)).status,409);
        const noPermission=await send('/maturity-versions/'+nextVersion.id+'/publish','POST',cookies.viewer);
        assert.equal(noPermission.status,403);

        const oldDb=await db.query(
          "SELECT status FROM maturity_model_versions WHERE id=$1",[v1],
        );
        assert.equal(oldDb.rows[0].status,'published');
        await db.query('SAVEPOINT maturity_immutable');
        await assert.rejects(db.query(
          "UPDATE maturity_domain_levels SET criterion='This should not change.' WHERE domain_id=$1 AND level=0",
          [domain.id],
        ),error=>error.code==='P0001');
        await db.query('ROLLBACK TO SAVEPOINT maturity_immutable');
      }finally{
        server.close();await once(server,'close');
      }
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});

test('maturity API tidak tersedia tanpa database',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const resp=await fetch('http://127.0.0.1:'+server.address().port+'/maturity-models');
    assert.equal(resp.status,503);
  }finally{server.close();await once(server,'close');}
});
