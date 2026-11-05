import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createSession } from '../src/sessions.js';
import { createServer } from '../src/server.js';

const ORIGIN='http://127.0.0.1:3000';
// Synthetic mapping for HTTP tests only, NEVER a seeded regulatory pack.
const manifest=(category=2)=>({
  reference:'43/PADK.03/2025:LAMPIRAN_IV',
  category,
  indicators:Array.from({length:category===1?80:60},(_,i)=>({
    number:i+1,
    domain:['TK','ID','PL','DT','PP'][i%5],
    subdomain:'TEST.SYNTH',
    title:'Indikator sintetis untuk uji API nomor '+(i+1),
  })),
});
const body=(category=2)=>({
  manifest:manifest(category),
  ratings:Array.from({length:category===1?80:60},(_,i)=>({
    number:i+1,rank:i%2===0?1:2,
  })),
});

test('API pratinjau PADK menjaga permission, origin, format dan menolak klaim resmi', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Preview PADK','BPR')");
      const result=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES "+
        "('maker-padk-preview@example.test','active','hash-uji'),"+
        "('viewer-padk-preview@example.test','active','hash-uji'),"+
        "('none-padk-preview@example.test','active','hash-uji') RETURNING id,email"
      );
      const users=Object.fromEntries(result.rows.map(row=>[row.email,row.id]));
      const maker=users['maker-padk-preview@example.test'];
      const viewer=users['viewer-padk-preview@example.test'];
      const none=users['none-padk-preview@example.test'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES ($1,'IT_OFFICER'),($2,'VIEWER')",
        [maker,viewer],
      );
      const cookies={};
      for(const [name,id] of [['maker',maker],['viewer',viewer],['none',none]]){
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      }
      const server=createServer({authDb:db,appOrigin:ORIGIN});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(endpoint,method='GET',cookie,payload,origin=ORIGIN,type='application/json')=>
        fetch(base+endpoint,{
          method,
          headers:{
            ...(cookie?{Cookie:cookie}:{}),
            ...(method==='POST'?{Origin:origin,'Content-Type':type}:{})
          },
          ...(payload!==undefined?{body:typeof payload==='string'
            ?payload:JSON.stringify(payload)}:{})
        });
      const framework='/regulatory/padk43/cyber/framework';
      const preview='/regulatory/padk43/cyber/preview';
      try{
        assert.equal((await send(framework)).status,401);
        assert.equal((await send(framework,'GET',cookies.none)).status,403);
        const config=await send(framework,'GET',cookies.viewer);
        assert.equal(config.status,200);
        const cfg=await config.json();
        assert.deepEqual(cfg.categoryIndicatorCounts,{'1':80,'2':60});
        assert.equal(cfg.readyForRegulatoryUse,false);

        assert.equal((await send(preview,'POST',cookies.viewer,body())).status,403);
        assert.equal((await send(preview,'POST',cookies.maker,body(),
          'https://attacker.example')).status,403);
        assert.equal((await send(preview,'POST',cookies.maker,body(),
          ORIGIN,'text/plain')).status,415);
        assert.equal((await send(preview,'POST',cookies.maker,'{')).status,400);
        assert.equal((await send(preview,'POST',cookies.maker,'x'.repeat(270000))).status,413);
        assert.equal((await send(preview,'POST',cookies.maker,{
          ...body(),official:true,
        })).status,400);
        const input=body();
        input.ratings[0].rank=0;
        assert.equal((await send(preview,'POST',cookies.maker,input)).status,400);
        const success=await send(preview,'POST',cookies.maker,body(1));
        assert.equal(success.status,200);
        assert.equal(success.headers.get('cache-control'),'no-store');
        const output=await success.json();
        assert.equal(output.requiredIndicators,80);
        assert.equal(output.complete,true);
        assert.equal(output.mappingVerified,false);
        assert.equal(output.regulatoryResult,false);
        assert.equal(output.status,'PREVIEW_UNVERIFIED');
        assert.ok(output.compositePreview);
        assert.equal(Object.hasOwn(output,'officialScore'),false);
        assert.equal((await send('/regulatory/padk43/cyber/unknown',
          'GET',cookies.maker)).status,404);
      }finally{
        server.close();await once(server,'close');
      }
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});

test('API PADK tidak tersedia saat database tidak dikonfigurasi',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+
      '/regulatory/padk43/cyber/framework');
    assert.equal(response.status,503);
  }finally{server.close();await once(server,'close');}
});
