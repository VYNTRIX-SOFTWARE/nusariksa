import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createServer} from '../src/server.js';
import {inspectReleaseDatabase,createReadinessProbe} from '../src/runtime-readiness.js';

const fakePool=(version='170005')=>{
  const commands=[];let releases=0;
  const client={query:async sql=>{
    commands.push(sql);
    if(sql.includes('current_setting'))return {rows:[{version}]};
    return {rows:[{result:1}]};
  },release:()=>{releases++;}};
  return {commands,get releases(){return releases;},connect:async()=>client};
};

test('inspeksi skema membaca transaksi READ ONLY dan melepas koneksi',async()=>{
  const pool=fakePool();
  const data=await inspectReleaseDatabase(pool,{verify:async()=>{
    pool.commands.push('verifyMigrationHistory');return 37;
  }});
  assert.deepEqual(data,{postgresMajor:17,migrations:37});
  assert.match(pool.commands[0],/REPEATABLE READ READ ONLY/);
  assert.ok(pool.commands.includes('verifyMigrationHistory'));
  assert.equal(pool.commands.at(-1),'COMMIT');
  assert.equal(pool.releases,1);
});

test('skema hilang dan PostgreSQL di luar 17 membuat readiness gagal tanpa membocorkan error',async()=>{
  const wrong=fakePool('160017');
  await assert.rejects(inspectReleaseDatabase(wrong,{verify:async()=>37}),
    /Database release inspection failed/);
  assert.ok(wrong.commands.includes('ROLLBACK'));
  assert.equal(wrong.releases,1);
  const pool=fakePool();
  await assert.rejects(inspectReleaseDatabase(pool,{verify:async()=>{
    throw new Error('password=secret-value; schema_migrations missing');
  }}),error=>{
    assert.equal(error.message,'Database release inspection failed');
    assert.ok(!error.message.includes('secret-value'));
    return true;
  });
  assert.equal(pool.releases,1);
  assert.ok(pool.commands.includes('ROLLBACK'));
});

test('probe membatasi cache dan menyatukan pemeriksaan paralel',async()=>{
  let now=100,checks=0,shouldPass=true;
  const probe=createReadinessProbe({},{
    ttlMs:3000,clock:()=>now,
    inspect:async()=>{checks++;await Promise.resolve();if(!shouldPass)throw new Error('private');},
  });
  const results=await Promise.all([probe(),probe(),probe()]);
  assert.deepEqual(results,[true,true,true]);assert.equal(checks,1);
  assert.equal(await probe(),true);assert.equal(checks,1);
  now+=3001;shouldPass=false;
  assert.equal(await probe(),false);assert.equal(checks,2);
  assert.equal(await probe(),false);assert.equal(checks,2);
  now+=3001;shouldPass=true;
  assert.equal(await probe(),true);assert.equal(checks,3);
  assert.throws(()=>createReadinessProbe({}, {ttlMs:-1}),TypeError);
});

test('endpoint /ready mengembalikan status generik saat skema tidak cocok',async()=>{
  const ready=createReadinessProbe(fakePool(),{inspect:async()=>{
    throw new Error('DATABASE_URL includes a secret');
  }});
  const server=createServer({checkReadiness:ready});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const root='http://127.0.0.1:'+server.address().port;
    assert.deepEqual(await(await fetch(root+'/health')).json(),{status:'ok'});
    const result=await fetch(root+'/ready');
    assert.equal(result.status,503);
    assert.deepEqual(await result.json(),{status:'unavailable'});
    assert.equal(result.headers.get('cache-control'),'no-store');
  }finally{server.close();await once(server,'close');}
});

test('readiness nyata memeriksa migrasi di PostgreSQL 17 tanpa perubahan',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const report=await inspectReleaseDatabase(pool);
    assert.equal(report.postgresMajor,17);
    assert.equal(report.migrations,37);
    assert.equal(await createReadinessProbe(pool)(),true);
  }finally{await pool.end();}
});
