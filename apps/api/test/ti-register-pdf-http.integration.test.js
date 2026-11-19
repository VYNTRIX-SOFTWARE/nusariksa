import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createRiskInTransaction} from '../src/ti-risks.js';

test('PDF register: autentikasi, hak baca, sumber data, batas 500 dan CSV lama',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('BPR Uji PDF Register','BPR')");
      const people={};
      for(const [name,role] of [['maker','IT_OFFICER'],['reader','VIEWER'],
        ['unauthorized','IT_OFFICER']]){
        const u=await db.query("INSERT INTO users(email,status,password_hash) "+
          "VALUES($1,'active','hash-uji') RETURNING id",
          ['pdf-register-'+name+'@example.test']);
        people[name]=u.rows[0].id;
        if(role&&name!=='unauthorized')
          await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',
            [u.rows[0].id,role]);
      }
      const cookie={};
      for(const [name,id] of Object.entries(people))
        cookie[name]='__Host-nusariksa_session='+(await createSession(db,id)).token;
      await createRiskInTransaction(db,{
        actorId:people.maker,riskCode:'RSK-PDF-UJI-01',
        title:'Gangguan CBS untuk pengujian laporan',
        scenario:'Skenario kerusakan server menghambat transaksi operasional.',
        assetId:null,likelihood:4,impact:4,residualLikelihood:null,residualImpact:null,
        mitigation:'',pic:'Petugas TI',dueDate:'2027-06-30',status:'open',
        note:'Bukti masih memerlukan telaah internal.',
      });
      const server=createServer({authDb:db,appOrigin:'http://127.0.0.1:3000'});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,who,method='GET')=>fetch(base+path,{method,
        headers:who?{Cookie:cookie[who]}:{}});
      try{
        assert.equal((await send('/register-exports/risks.pdf')).status,401);
        assert.equal((await send('/register-exports/risks.pdf','unauthorized')).status,403);
        assert.equal((await send('/register-exports/risks.pdf','reader','POST')).status,404);
        assert.equal((await send('/register-exports/unknown.pdf','reader')).status,404);
        assert.equal((await send('/register-exports/risks.PDF','reader')).status,404);
        const result=await send('/register-exports/risks.pdf','reader');
        assert.equal(result.status,200);
        assert.equal(result.headers.get('content-type'),'application/pdf');
        assert.equal(result.headers.get('cache-control'),'no-store');
        assert.equal(result.headers.get('content-security-policy'),'sandbox');
        assert.match(result.headers.get('content-disposition'),/attachment.*risks-internal.pdf/);
        const body=Buffer.from(await result.arrayBuffer()).toString('latin1');
        assert.ok(body.startsWith('%PDF-1.4'));
        assert.match(body,/BPR Uji PDF Register/);
        assert.match(body,/RSK-PDF-UJI-01/);
        assert.match(body,/BUKAN LAPORAN RESMI OJK/);
        for(const type of ['findings','vendors','vendor-contracts','vendor-sla',
          'recovery','recovery-tests','incidents','assets']){
          const res=await send('/register-exports/'+type+'.pdf','reader');
          assert.equal(res.status,200,type);
          assert.match(res.headers.get('content-type'),/application\/pdf/,type);
        }
        const csv=await send('/register-exports/risks.csv','reader');
        assert.equal(csv.status,200);
        assert.match(csv.headers.get('content-type'),/text\/csv/);
        assert.match(await csv.text(),/RSK-PDF-UJI-01/);

        // A PDF never silently drops records after the first 500.
        await db.query('INSERT INTO ti_risks(institution_id,risk_code,title,scenario,'+
          'likelihood,impact,residual_likelihood,residual_impact,mitigation,pic,due_date,'+
          'status,note,created_by,updated_by) '+
          'SELECT (SELECT institution_id FROM users WHERE id=$1), '+
          "'RSK-PDF-LOAD-'||lpad(n::text,4,'0'),"+
          "'Risiko pengujian kapasitas PDF','Potensi gangguan layanan teknologi informasi.',"+
          "1,1,NULL,NULL,'','Petugas TI','2027-12-31','open','',$1,$1 "+
          'FROM generate_series(1,500) n',[people.maker]);
        const tooLarge=await send('/register-exports/risks.pdf','reader');
        assert.equal(tooLarge.status,409);
        assert.match((await tooLarge.json()).error,/500 catatan/);
        assert.equal((await send('/register-exports/risks.csv','reader')).status,200);
      }finally{
        server.close();await once(server,'close');
      }
    }finally{await db.query('ROLLBACK');db.release();}
  }finally{await pool.end();}
});
