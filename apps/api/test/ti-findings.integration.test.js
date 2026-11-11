import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createAssetInTransaction} from '../src/ti-assets.js';
import {createRiskInTransaction} from '../src/ti-risks.js';
import {createIncidentInTransaction} from '../src/ti-incidents.js';
import {
  FindingError,validateFinding,validateFindingReview,
  createFindingInTransaction,updateFindingInTransaction,submitFindingInTransaction,
  reviewFindingInTransaction,archiveFindingInTransaction,
  listFindings,getFinding,findingHistory,findingSources,
} from '../src/ti-findings.js';

const origin='http://127.0.0.1:3000';
const data={
  findingCode:'TEM-CBS-01',title:'Pengujian pemulihan belum tersedia',
  description:'Pengujian restore server CBS pada periode pemeriksaan belum dibuktikan.',
  priority:'high',sourceType:'manual',assessmentId:null,controlId:null,riskId:null,incidentId:null,
  pic:'Petugas Infrastruktur',dueDate:'2027-06-30',
  actionPlan:'',progressNote:'',evidenceReference:'',
};
test('validasi temuan dan keputusan verifikasi memerlukan sumber serta bukti yang tepat',()=>{
  assert.equal(validateFinding(data),data);
  for(const invalid of [
    {...data,bogus:'privilege'},{...data,findingCode:'../../db'},
    {...data,title:'ab'},{...data,priority:'urgent'},
    {...data,sourceType:'risk'},{...data,sourceType:'assessment'},
    {...data,assessmentId:'bad'},{...data,riskId:'fake'},
    {...data,sourceType:'incident',incidentId:'fake'},
    {...data,dueDate:'2027-02-30'},
    {...data,description:'too short'}, {...data,actionPlan:'x'.repeat(2001)},
  ])assert.throws(()=>validateFinding(invalid),FindingError);
  assert.throws(()=>validateFinding({...data,expectedRevision:0},{update:true}),FindingError);
  assert.throws(()=>validateFindingReview({decision:'verify',note:'ok',expectedRevision:1}),FindingError);
  assert.throws(()=>validateFindingReview({decision:'accept',note:'Perbaikan telah benar',expectedRevision:1}),FindingError);
  assert.equal(validateFindingReview({decision:'return',note:'Perlu tambahan bukti uji',expectedRevision:1}).decision,'return');
});
test('temuan TI: sumber nyata, PIC, maker-checker, konflik revisi, arsip dan histori', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Temuan','BPR') ON CONFLICT(id) DO NOTHING");
      const users={},cookies={};
      for(const [name,role] of [
        ['maker','IT_OFFICER'],['checker','REVIEWER'],
        ['compliance','COMPLIANCE_OFFICER'],['viewer','VIEWER'],['other','IT_OFFICER'],
      ]){
        const u=await db.query(
          "INSERT INTO users(email,status,password_hash) VALUES($1,'active','testhash') RETURNING id",
          ['finding-'+name+'@example.test']);
        users[name]=u.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[users[name],role]);
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,users[name])).token;
      }
      const asset=await createAssetInTransaction(db,{
        actorId:users.maker,assetCode:'SRV-FIND-01',title:'Server pemeriksaan TI',
        kind:'server',ownerName:'Petugas TI',location:'Ruang Server',
        criticality:'high',operationalStatus:'active',note:'',
      });
      const risk=await createRiskInTransaction(db,{
        actorId:users.maker,riskCode:'RSK-FIND-01',title:'Gangguan server CBS',
        scenario:'Kegagalan server dapat menghentikan transaksi pada layanan perbankan.',
        assetId:asset.id,likelihood:3,impact:5,residualLikelihood:null,residualImpact:null,
        mitigation:'',pic:'Petugas TI',dueDate:'2027-06-30',status:'open',note:'',
      });
      const incident=await createIncidentInTransaction(db,{
        actorId:users.maker,incidentCode:'INC-FIND-01',title:'Layanan CBS terganggu',
        category:'availability',severity:'high',
        description:'CBS tidak dapat melayani transaksi akibat kerusakan penyimpanan.',
        detectedAt:new Date().toISOString(),assetId:asset.id,riskId:risk.id,
        pic:'Petugas TI',impactSummary:'',containmentAction:'',rootCause:'',resolution:'',status:'reported',
      });
      // Satu hasil kontrol asesmen yang sudah benar-benar disimpan.
      const catalog=(await db.query('INSERT INTO control_catalogs(institution_id,code,title,created_by) '+
        "VALUES(1,'FIND_TEST_CATALOG','Katalog uji kontrol insiden',$1) RETURNING id",[users.maker])).rows[0];
      const version=(await db.query(
        'INSERT INTO control_catalog_versions(catalog_id,version,created_by) '+
        'VALUES($1,1,$2) RETURNING id',[catalog.id,users.maker])).rows[0];
      const control=(await db.query('INSERT INTO control_definitions(version_id,control_code,title,position) '+
        "VALUES($1,'CTRL_BACKUP','Uji pemulihan sistem',1) RETURNING id",[version.id])).rows[0];
      await db.query("UPDATE control_catalog_versions SET status='published',published_at=now() WHERE id=$1",[version.id]);
      const assessment=(await db.query(
        'INSERT INTO assessments(institution_id,title,period_start,period_end,owner_user_id,created_by,status,started_at) '+
        "VALUES(1,'Asesmen uji tindak lanjut','2026-01-01','2026-12-31',$1,$1,'in_progress',now()) RETURNING id",
        [users.maker])).rows[0];
      await db.query('INSERT INTO assessment_catalog_assignments(assessment_id,catalog_version_id,assigned_by) '+
        'VALUES($1,$2,$3)',[assessment.id,version.id,users.maker]);
      await db.query('INSERT INTO assessment_control_results('+
        'assessment_id,catalog_version_id,control_id,rating,note,updated_by) '+
        "VALUES($1,$2,$3,'non_compliant','Pengujian pemulihan belum dilaksanakan',$4)",
        [assessment.id,version.id,control.id,users.maker]);
      const server=createServer({authDb:db,appOrigin:origin,findingHandlers:{
        list:(c,a)=>listFindings(c,a),detail:(c,a)=>getFinding(c,a),
        history:(c,a)=>findingHistory(c,a),sources:(c,a)=>findingSources(c,a),
        create:(c,a)=>createFindingInTransaction(c,a),
        update:(c,a)=>updateFindingInTransaction(c,a),
        submit:(c,a)=>submitFindingInTransaction(c,a),
        review:(c,a)=>reviewFindingInTransaction(c,a),
        archive:(c,a)=>archiveFindingInTransaction(c,a),
      }});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,requestOrigin=origin,type='application/json')=>
        fetch(base+path,{method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:requestOrigin,'Content-Type':type}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{})});
      try{
        assert.equal((await send('/findings')).status,401);
        assert.equal((await send('/findings','POST',cookies.checker,data)).status,403);
        assert.equal((await send('/findings','POST',cookies.viewer,data)).status,403);
        assert.equal((await send('/findings','POST',cookies.maker,data,'https://evil.example')).status,403);
        assert.equal((await send('/findings','POST',cookies.maker,data,origin,'text/plain')).status,415);
        assert.equal((await send('/findings','POST',cookies.maker,{...data,unexpected:'yes'})).status,400);
        assert.equal((await send('/findings','POST',cookies.maker,{
          ...data,sourceType:'risk',riskId:'99999999-9999-4999-8999-999999999999'})).status,404);
        assert.equal((await send('/findings','POST',cookies.maker,{
          ...data,sourceType:'assessment',assessmentId:assessment.id,
          controlId:'99999999-9999-4999-8999-999999999999'})).status,404);
        const sources=await send('/findings/sources','GET',cookies.viewer);
        assert.equal(sources.status,200);
        const options=await sources.json();
        assert.ok(options.controls.some(x=>x.control_id===control.id));
        assert.ok(options.risks.some(x=>x.id===risk.id));
        assert.ok(options.incidents.some(x=>x.id===incident.id));
        const original=await send('/findings','POST',cookies.maker,{
          ...data,sourceType:'assessment',assessmentId:assessment.id,controlId:control.id});
        assert.equal(original.status,201);
        const found=await original.json();
        assert.equal(found.source_type,'assessment');
        assert.equal(found.control_code,'CTRL_BACKUP');
        assert.equal(found.status,'open');
        assert.equal(found.revision,1);
        await db.query('SAVEPOINT duplicate_finding');
        assert.equal((await send('/findings','POST',cookies.maker,data)).status,409);
        await db.query('ROLLBACK TO SAVEPOINT duplicate_finding');
        assert.equal((await send('/findings/'+found.id,'GET',cookies.viewer)).status,200);
        assert.equal((await send('/findings/'+found.id,'PATCH',cookies.other,
          {...data,expectedRevision:1,sourceType:'assessment',assessmentId:assessment.id,
            controlId:control.id})).status,403);
        assert.equal((await send('/findings/'+found.id,'PATCH',cookies.checker,
          {...data,expectedRevision:1})).status,403);
        assert.equal((await send('/findings/'+found.id+'/submit','POST',cookies.maker,
          {expectedRevision:1})).status,409);
        assert.equal((await send('/findings/'+found.id,'PATCH',cookies.maker,
          {...data,expectedRevision:1,sourceType:'risk',riskId:risk.id})).status,400);
        const ready={...data,sourceType:'assessment',assessmentId:assessment.id,
          controlId:control.id,expectedRevision:1,
          actionPlan:'Jalankan uji restore dan dokumentasikan hasilnya.',
          progressNote:'Simulasi restore dilakukan pada lingkungan pengujian.',
          evidenceReference:'Berita acara uji DRP nomor BA-2027-011.'};
        const modified=await send('/findings/'+found.id,'PATCH',cookies.maker,ready);
        assert.equal(modified.status,200);
        assert.equal((await modified.json()).status,'in_progress');
        assert.equal((await send('/findings/'+found.id,'PATCH',cookies.maker,ready)).status,409);
        const submitted=await send('/findings/'+found.id+'/submit','POST',cookies.maker,
          {expectedRevision:2});
        assert.equal(submitted.status,200);
        assert.equal((await submitted.json()).status,'pending_verification');
        assert.equal((await send('/findings/'+found.id+'/review','POST',cookies.maker,
          {expectedRevision:3,decision:'verify',note:'Bukti pemulihan telah diperiksa'})).status,403);
        assert.equal((await send('/findings/'+found.id+'/review','POST',cookies.viewer,
          {expectedRevision:3,decision:'verify',note:'Bukti pemulihan telah diperiksa'})).status,403);
        const returned=await send('/findings/'+found.id+'/review','POST',cookies.checker,
          {expectedRevision:3,decision:'return',note:'Perlu lampiran validasi hasil pemulihan sistem'});
        assert.equal(returned.status,200);
        assert.equal((await returned.json()).status,'changes_requested');
        const fix=await send('/findings/'+found.id,'PATCH',cookies.maker,
          {...ready,expectedRevision:4,progressNote:'Pengujian ulang berhasil dan hasil diparaf dua petugas.'});
        assert.equal(fix.status,200);
        assert.equal((await fix.json()).revision,5);
        const again=await send('/findings/'+found.id+'/submit','POST',cookies.maker,
          {expectedRevision:5});
        assert.equal(again.status,200);
        assert.equal((await again.json()).submission_cycle,2);
        assert.equal((await send('/findings/'+found.id+'/review','POST',cookies.checker,
          {expectedRevision:5,decision:'verify',note:'Bukti telah diperiksa dan sesuai'})).status,409);
        const approved=await send('/findings/'+found.id+'/review','POST',cookies.checker,
          {expectedRevision:6,decision:'verify',note:'Bukti hasil restore dan berita acara sudah diperiksa'});
        assert.equal(approved.status,200);
        const closed=await approved.json();
        assert.equal(closed.status,'closed');
        assert.equal(closed.verified_by,users.checker);
        assert.ok(closed.closed_at);
        assert.equal((await send('/findings/'+found.id,'PATCH',cookies.maker,
          {...ready,expectedRevision:7})).status,409);
        assert.equal((await send('/findings/'+found.id+'/archive','POST',cookies.other,
          {expectedRevision:7})).status,403);
        const archived=await send('/findings/'+found.id+'/archive','POST',cookies.maker,
          {expectedRevision:7});
        assert.equal(archived.status,200);
        assert.ok((await archived.json()).archived_at);
        assert.equal((await (await send('/findings','GET',cookies.viewer)).json()).findings.length,0);
        assert.equal((await (await send('/findings?view=archived','GET',cookies.viewer)).json()).findings.length,1);
        const history=await send('/findings/'+found.id+'/history','GET',cookies.viewer);
        assert.equal(history.status,200);
        assert.deepEqual((await history.json()).events.map(x=>x.action),[
          'ARCHIVED','VERIFIED','SUBMITTED','UPDATED','RETURNED','SUBMITTED','UPDATED','CREATED']);
        assert.equal((await db.query('SELECT count(*)::int n FROM ti_finding_events WHERE finding_id=$1',
          [found.id])).rows[0].n,8);
        await db.query('SAVEPOINT immutable_finding');
        await assert.rejects(db.query('DELETE FROM ti_finding_events WHERE finding_id=$1',[found.id]));
        await db.query('ROLLBACK TO SAVEPOINT immutable_finding');
        // Actual risk and incident references, not standalone text labels.
        assert.equal((await send('/findings','POST',cookies.maker,{
          ...data,findingCode:'TEM-RISK-02',sourceType:'risk',riskId:risk.id})).status,201);
        assert.equal((await send('/findings','POST',cookies.maker,{
          ...data,findingCode:'TEM-INC-03',sourceType:'incident',incidentId:incident.id})).status,201);
        // A checker with both writer and verifier permissions still cannot self-approve.
        const self=(await (await send('/findings','POST',cookies.compliance,{
          ...data,findingCode:'TEM-COMP-04',
          actionPlan:ready.actionPlan,progressNote:ready.progressNote,
          evidenceReference:ready.evidenceReference})).json());
        const selfSubmit=await send('/findings/'+self.id+'/submit','POST',cookies.compliance,
          {expectedRevision:1});
        assert.equal(selfSubmit.status,200);
        assert.equal((await send('/findings/'+self.id+'/review','POST',cookies.compliance,
          {expectedRevision:2,decision:'verify',note:'Bukti sudah diperiksa secara mandiri'})).status,403);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
