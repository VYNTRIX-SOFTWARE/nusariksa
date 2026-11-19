import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {nextTiDocumentNumber} from '../src/ti-document-numbers.js';

test('allocator nomor TI tahan 8 transaksi paralel dan terisolasi per lembaga',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  const schema='nr_num_test_'+randomUUID().replace(/-/g,'');
  const actor1=randomUUID(),actor2=randomUUID();
  const owner=await pool.connect();
  let created=false;
  try{
    // Standalone disposable schema isolates concurrent commits from application tables.
    await owner.query('CREATE SCHEMA '+schema);
    created=true;
    await owner.query('CREATE TABLE '+schema+'.users ('+
      'id uuid PRIMARY KEY,institution_id smallint NOT NULL,'+
      'status text NOT NULL,password_hash text NOT NULL)');
    await owner.query('CREATE TABLE '+schema+'.ti_risks ('+
      'institution_id smallint NOT NULL,risk_code text NOT NULL)');
    await owner.query('CREATE TABLE '+schema+'.ti_document_number_counters ('+
      'institution_id smallint NOT NULL,document_kind text NOT NULL,'+
      'document_year integer NOT NULL,last_number integer NOT NULL CHECK(last_number BETWEEN 1 AND 999999),'+
      'PRIMARY KEY(institution_id,document_kind,document_year))');
    for(const [id,institution] of [[actor1,1],[actor2,2]])
      await owner.query('INSERT INTO '+schema+'.users(id,institution_id,status,password_hash) '+
        "VALUES($1,$2,'active','testhash')",[id,institution]);
    const year=Number((await owner.query(
      "SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta') AS y")).rows[0].y);
    await owner.query('INSERT INTO '+schema+'.ti_risks(institution_id,risk_code) VALUES(1,$1)',
      ['RSK-'+year+'-000030']);
    async function allocate(actorId,{rollback=false}={}){
      const db=await pool.connect();
      try{
        await db.query('BEGIN');
        await db.query('SET LOCAL search_path TO '+schema);
        const number=await nextTiDocumentNumber(db,{actorId,kind:'risk'});
        await db.query(rollback?'ROLLBACK':'COMMIT');
        return number;
      }catch(error){await db.query('ROLLBACK');throw error;}
      finally{db.release();}
    }
    const generated=await Promise.all(Array.from({length:8},()=>allocate(actor1)));
    assert.equal(new Set(generated).size,8);
    assert.deepEqual(generated.map(code=>Number(code.slice(-6))).sort((a,b)=>a-b),
      [31,32,33,34,35,36,37,38]);
    assert.ok(generated.every(code=>code.startsWith('RSK-'+year+'-')));
    assert.equal(await allocate(actor2),'RSK-'+year+'-000001');
    await owner.query('INSERT INTO '+schema+'.ti_risks(institution_id,risk_code) VALUES(1,$1)',
      ['RSK-'+year+'-000070']);
    assert.equal(await allocate(actor1),'RSK-'+year+'-000071');
    const rolledBack=await allocate(actor1,{rollback:true});
    assert.equal(rolledBack,'RSK-'+year+'-000072');
    assert.equal(await allocate(actor1),rolledBack);
    await owner.query('INSERT INTO '+schema+'.ti_risks(institution_id,risk_code) VALUES(1,$1)',
      ['RSK-'+year+'-999999']);
    await assert.rejects(allocate(actor1),/batas 999999/);
    const current=await owner.query('SELECT last_number FROM '+
      schema+'.ti_document_number_counters WHERE institution_id=1 AND document_kind=$1',
      ['risk']);
    assert.equal(current.rows[0].last_number,72);
  }finally{
    if(created)await owner.query('DROP SCHEMA '+schema+' CASCADE');
    owner.release();
    await pool.end();
  }
});
