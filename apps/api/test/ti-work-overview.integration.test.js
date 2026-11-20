import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createServer} from '../src/server.js';
import {createSession} from '../src/sessions.js';
import {getTiWorkOverview} from '../src/ti-work-overview.js';
import {createRiskInTransaction} from '../src/ti-risks.js';
import {createIncidentInTransaction} from '../src/ti-incidents.js';
import {createFindingInTransaction} from '../src/ti-findings.js';
import {createVendorInTransaction,createContractInTransaction} from '../src/ti-vendors.js';
import {createRecoveryPlanInTransaction} from '../src/ti-recovery.js';

const origin='http://127.0.0.1:3000';
test('pusat pekerjaan menggabungkan lima register dari data lembaga dan memeriksa akses',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Pekerjaan TI','BPR') ON CONFLICT(id) DO NOTHING");
      const ids={},cookies={};
      for(const [name,role] of [['maker','IT_OFFICER'],['viewer','VIEWER'],['noaccess',null]]){
        const user=await db.query("INSERT INTO users(email,status,password_hash) "+
          "VALUES($1,'active','hash-uji') RETURNING id",
          ['ti-work-'+name+'@example.test']);
        ids[name]=user.rows[0].id;
        if(role)await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[ids[name],role]);
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,ids[name])).token;
      }
      const risk=await createRiskInTransaction(db,{
        actorId:ids.maker,riskCode:'RSK-WORK-UJI',title:'Gangguan akses transaksi CBS',
        scenario:'Gangguan server CBS dapat menghentikan transaksi harian.',
        assetId:null,likelihood:2,impact:5,
        residualLikelihood:null,residualImpact:null,mitigation:'',
        pic:'Petugas TI',dueDate:'2026-01-01',status:'open',note:'',
      });
      const incident=await createIncidentInTransaction(db,{
        actorId:ids.maker,incidentCode:'INC-WORK-UJI',title:'Gangguan transaksi CBS',
        category:'availability',severity:'high',
        description:'Sistem transaksi tidak dapat digunakan saat layanan bank.',
        detectedAt:'2026-01-01T08:00:00.000Z',assetId:null,riskId:risk.id,
        pic:'Petugas TI',impactSummary:'',containmentAction:'',
        rootCause:'',resolution:'',status:'reported',
      });
      const finding=await createFindingInTransaction(db,{
        actorId:ids.maker,findingCode:'FND-WORK-UJI',
        title:'Uji pemulihan belum didokumentasikan',
        description:'Dokumen hasil pengujian pemulihan belum ditemukan.',
        priority:'high',sourceType:'risk',assessmentId:null,
        controlId:null,riskId:risk.id,incidentId:null,
        pic:'Petugas TI',dueDate:'2026-01-01',actionPlan:'',
        progressNote:'',evidenceReference:'',
      });
      const vendor=await createVendorInTransaction(db,{
        actorId:ids.maker,vendorCode:'VND-WORK-UJI',name:'Penyedia Sistem Uji',
        serviceCategory:'core_banking',contactName:'Tim layanan',contactEmail:'',
        contactPhone:'',ownerPic:'Petugas TI',criticality:'high',note:'',status:'active',
      });
      const contract=await createContractInTransaction(db,{
        actorId:ids.maker,vendorId:vendor.id,contractCode:'CTR-WORK-UJI',
        serviceName:'Dukungan Core Banking',contractReference:'PKS-WORK-01',
        serviceDescription:'',startDate:'2026-01-01',endDate:'2026-02-01',
        ownerPic:'Petugas TI',slaUptimeTarget:null,slaResponseTargetHours:null,
        status:'active',note:'',
      });
      const recovery=await createRecoveryPlanInTransaction(db,{
        actorId:ids.maker,planCode:'RCP-WORK-UJI',serviceName:'CBS',
        scenario:'Kerusakan layanan CBS memerlukan pemulihan data.',
        businessImpact:'Setoran dan penarikan tidak dapat diproses.',
        activationCriteria:'Pemulihan dilakukan setelah gangguan ditetapkan.',
        ownerPic:'Petugas TI',alternatePic:'Petugas Operasional',
        rtoMinutes:null,rpoMinutes:null,
        recoverySteps:'Periksa backup dan pulihkan layanan dengan bukti pengujian.',
        communicationSteps:'Hubungi Direksi dan vendor.',
        dependencies:'Jaringan dan basis data.',backupReference:'',
        evidenceLocation:'',status:'draft',
      });
      const summary=await getTiWorkOverview(db,{actorId:ids.maker});
      assert.equal(summary.kind,'TI_WORK_OVERVIEW');
      assert.equal(summary.modules.length,5);
      for(const kind of ['risks','incidents','findings','vendors','recovery']){
        assert.equal(summary.modules.find(x=>x.type===kind)?.count,1,kind);
      }
      for(const [kind,id] of [['risks',risk.id],['incidents',incident.id],
        ['findings',finding.id],['vendors',contract.id],['recovery',recovery.id]]){
        assert.ok(summary.items.some(x=>x.type===kind&&x.id===id),kind);
      }
      assert.equal(summary.items.find(x=>x.type==='vendors').relatedId,vendor.id);
      assert.equal(summary.items.find(x=>x.type==='risks').code,'RSK-WORK-UJI');
      assert.ok(summary.items.every(x=>x.priority>=1&&x.priority<=10));

      const server=createServer({authDb:db,appOrigin:origin});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,who,method='GET')=>fetch(base+path,{method,
        headers:who?{Cookie:cookies[who]}:{}});
      try{
        assert.equal((await send('/ti-work/overview')).status,401);
        assert.equal((await send('/ti-work/overview','noaccess')).status,403);
        assert.equal((await send('/ti-work/overview','viewer','POST')).status,404);
        assert.equal((await send('/ti-work/overview?unexpected=1','viewer')).status,404);
        const result=await send('/ti-work/overview','viewer');
        assert.equal(result.status,200);
        assert.equal(result.headers.get('cache-control'),'no-store');
        const body=await result.json();
        assert.equal(body.modules.find(x=>x.type==='risks').count,1);
        assert.equal(body.items.find(x=>x.type==='risks').id,risk.id);
      }finally{server.close();await once(server,'close');}
    }finally{await db.query('ROLLBACK');db.release();}
  }finally{await pool.end();}
});
