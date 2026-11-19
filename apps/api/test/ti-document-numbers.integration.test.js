import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createRiskInTransaction,updateRiskInTransaction} from '../src/ti-risks.js';
import {createFindingInTransaction} from '../src/ti-findings.js';
import {createVendorInTransaction,createContractInTransaction} from '../src/ti-vendors.js';
import {createRecoveryPlanInTransaction} from '../src/ti-recovery.js';

test('counter TI: 5 CREATE aktual, seed manual, rollback, role, immutable dan batas nomor',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('BPR Uji Nomor Otomatis','BPR') ON CONFLICT(id) DO NOTHING");
      const ids={};
      for(const [role,code] of [['maker','IT_OFFICER'],['viewer','VIEWER']]){
        const row=await db.query(
          "INSERT INTO users(email,status,password_hash) VALUES($1,'active','hash-test') RETURNING id",
          ['auto-number-'+role+'@example.test']);
        ids[role]=row.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[ids[role],code]);
      }
      const year=Number((await db.query(
        "SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta') AS y")).rows[0].y);
      const riskData={
        riskCode:'AUTO',title:'Kegagalan layanan transaksi CBS',
        scenario:'Gangguan basis data dapat menghentikan layanan transaksi nasabah.',
        assetId:null,likelihood:3,impact:4,residualLikelihood:null,residualImpact:null,
        mitigation:'',pic:'Petugas TI',dueDate:'2027-07-31',status:'open',note:'',
      };
      const manual=await createRiskInTransaction(db,{
        actorId:ids.maker,...riskData,riskCode:'RSK-'+year+'-000050'});
      assert.equal(manual.risk_code,'RSK-'+year+'-000050');
      const risk=await createRiskInTransaction(db,{actorId:ids.maker,...riskData});
      assert.equal(risk.risk_code,'RSK-'+year+'-000051');
      assert.equal(risk.revision,1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ti_risk_events WHERE risk_id=$1',
        [risk.id])).rows[0].n,1);
      await assert.rejects(
        createRiskInTransaction(db,{actorId:ids.viewer,...riskData}),
        err=>err.status===403);
      await assert.rejects(
        updateRiskInTransaction(db,{actorId:ids.maker,id:risk.id,
          ...riskData,riskCode:'RSK-OTHER',expectedRevision:1}),
        err=>err.status===400);

      const findingData={
        findingCode:'AUTO',title:'Hasil pengujian restore perlu dilengkapi',
        description:'Dokumentasi uji pemulihan layanan belum lengkap.',
        priority:'high',sourceType:'manual',assessmentId:null,controlId:null,
        riskId:null,incidentId:null,pic:'Petugas TI',dueDate:'2027-07-31',
        actionPlan:'',progressNote:'',evidenceReference:'',
      };
      await db.query('SAVEPOINT numbered_finding');
      const failed=await createFindingInTransaction(db,{actorId:ids.maker,...findingData});
      await db.query('ROLLBACK TO SAVEPOINT numbered_finding');
      const finding=await createFindingInTransaction(db,{actorId:ids.maker,...findingData});
      assert.equal(finding.finding_code,failed.finding_code);
      assert.match(finding.finding_code,new RegExp('^FND-'+year+'-\\d{6}$'));

      const vendor=await createVendorInTransaction(db,{
        actorId:ids.maker,vendorCode:'AUTO',name:'Penyedia Infrastruktur Uji',
        serviceCategory:'infrastructure',contactName:'Tim Layanan',
        contactEmail:'support@example.test',contactPhone:'0800000000',
        ownerPic:'Penanggung Jawab TI',criticality:'high',note:'',status:'active',
      });
      assert.match(vendor.vendor_code,new RegExp('^VND-'+year+'-\\d{6}$'));
      const contract=await createContractInTransaction(db,{
        actorId:ids.maker,vendorId:vendor.id,contractCode:'AUTO',
        serviceName:'Pemeliharaan infrastruktur CBS',
        contractReference:'PKS-UJI-2026',serviceDescription:'Layanan infrastruktur sintetis',
        startDate:'2026-01-01',endDate:'2027-12-31',
        ownerPic:'Penanggung Jawab TI',slaUptimeTarget:99.5,
        slaResponseTargetHours:4,status:'active',note:'',
      });
      assert.match(contract.contract_code,new RegExp('^CTR-'+year+'-\\d{6}$'));
      const recovery=await createRecoveryPlanInTransaction(db,{
        actorId:ids.maker,planCode:'AUTO',serviceName:'Layanan CBS',
        scenario:'Gangguan penyimpanan memerlukan pemulihan sistem utama.',
        businessImpact:'Nasabah tidak dapat menyelesaikan transaksi harian.',
        activationCriteria:'Aktivasi setelah penanggung jawab memastikan gangguan.',
        ownerPic:'Petugas TI',alternatePic:'Petugas Operasional',
        rtoMinutes:180,rpoMinutes:60,
        recoverySteps:'Pulihkan layanan dari backup teruji dan lakukan rekonsiliasi data.',
        communicationSteps:'Hubungi Direksi dan vendor.',
        dependencies:'Jaringan listrik dan basis data.',
        backupReference:'Rekam cadang uji',evidenceLocation:'Arsip internal',status:'draft',
      });
      assert.match(recovery.plan_code,new RegExp('^RCP-'+year+'-\\d{6}$'));

      const counters=await db.query('SELECT document_kind,last_number FROM ti_document_number_counters WHERE institution_id=(SELECT institution_id FROM users WHERE id=$1) AND document_year=$2',
        [ids.maker,year]);
      for(const kind of ['risk','finding','vendor','contract','recovery'])
        assert.ok(counters.rows.some(row=>row.document_kind===kind));
      await createRiskInTransaction(db,{actorId:ids.maker,...riskData,
        riskCode:'RSK-'+year+'-999999'});
      await assert.rejects(createRiskInTransaction(db,{actorId:ids.maker,...riskData}),
        /batas 999999/);
    }finally{await db.query('ROLLBACK');db.release();}
  }finally{await pool.end();}
});
