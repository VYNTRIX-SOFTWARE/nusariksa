import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  VendorError,assessSla,validateVendor,validateContract,validateServiceReview,
  createVendorInTransaction,updateVendorInTransaction,archiveVendorInTransaction,
  getVendor,listVendors,vendorHistory,listContracts,getContract,
  createContractInTransaction,updateContractInTransaction,archiveContractInTransaction,
  listServiceReviews,addServiceReviewInTransaction,
} from '../src/ti-vendors.js';

const origin='http://127.0.0.1:3000';
const vendor={
  vendorCode:'VND-CBS-01',name:'Penyedia Sistem Contoh',
  serviceCategory:'core_banking',contactName:'Petugas dukungan',
  contactEmail:'support@example.test',contactPhone:'0800000000',
  ownerPic:'Penanggung Jawab TI',criticality:'high',
  note:'Penyedia layanan operasional pengujian',status:'active',
};
const contract={
  contractCode:'CTR-CBS-01',serviceName:'Pemeliharaan Core Banking',
  contractReference:'PKS-2026-001',serviceDescription:'Dukungan dan pemeliharaan sistem transaksi.',
  startDate:'2026-01-01',endDate:'2027-01-31',ownerPic:'Penanggung Jawab TI',
  slaUptimeTarget:99.5,slaResponseTargetHours:4,status:'active',note:'',
};
const review={
  periodStart:'2026-01-01',periodEnd:'2026-02-28',
  measuredUptime:99.1,measuredResponseHours:6,
  summary:'Waktu tanggap melebihi batas target. Perlu perbaikan terencana.',
};
test('input vendor, kontrak dan evaluasi SLA memiliki validasi serta nilai tidak dinilai',()=>{
  assert.equal(validateVendor(vendor).status,'active');
  assert.equal(validateContract(contract).slaUptimeTarget,99.5);
  assert.equal(validateServiceReview(review).measuredUptime,99.1);
  for(const x of [
    {...vendor,unknown:'yes'},{...vendor,vendorCode:'../../etc'},
    {...vendor,serviceCategory:'none'}, {...vendor,contactEmail:'unsafe@'},
    {...vendor,name:'x'},
  ])assert.throws(()=>validateVendor(x),VendorError);
  for(const x of [
    {...contract,unexpected:true},{...contract,endDate:'2025-01-01'},
    {...contract,startDate:'2026-02-30'}, {...contract,slaUptimeTarget:101},
    {...contract,slaResponseTargetHours:-1}, {...contract,status:'ended'},
  ])assert.throws(()=>validateContract(x),VendorError);
  assert.throws(()=>validateServiceReview({...review,periodEnd:'2026-02-30'}),VendorError);
  assert.equal(assessSla({uptimeTarget:null,responseTarget:null,uptime:null,response:null}),
    'not_assessed');
  assert.equal(assessSla({uptimeTarget:99.5,responseTarget:4,uptime:99.7,response:null}),
    'not_assessed');
  assert.equal(assessSla({uptimeTarget:99.5,responseTarget:4,uptime:99.7,response:3}),
    'meets_targets');
  assert.equal(assessSla({uptimeTarget:99.5,responseTarget:4,uptime:99.1,response:3}),
    'below_targets');
  assert.equal(assessSla({uptimeTarget:99.5,responseTarget:4,uptime:99.7,response:6}),
    'below_targets');
});
test('vendor TI: session, role, contract term, SLA, optimistic revision, audit dan arsip', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Vendor','BPR') ON CONFLICT(id) DO NOTHING");
      const users={},cookies={};
      for(const [name,role] of [['maker','IT_OFFICER'],['checker','REVIEWER'],['viewer','VIEWER']]){
        const u=await db.query(
          "INSERT INTO users(email,status,password_hash) VALUES($1,'active','testhash') RETURNING id",
          ['vendor-'+name+'@example.test']);
        users[name]=u.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[users[name],role]);
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,users[name])).token;
      }
      const server=createServer({authDb:db,appOrigin:origin,vendorHandlers:{
        list:(c,a)=>listVendors(c,a),detail:(c,a)=>getVendor(c,a),history:(c,a)=>vendorHistory(c,a),
        create:(c,a)=>createVendorInTransaction(c,a),
        update:(c,a)=>updateVendorInTransaction(c,a),
        archive:(c,a)=>archiveVendorInTransaction(c,a),
        contracts:(c,a)=>listContracts(c,a),contract:(c,a)=>getContract(c,a),
        addContract:(c,a)=>createContractInTransaction(c,a),
        editContract:(c,a)=>updateContractInTransaction(c,a),
        endContract:(c,a)=>archiveContractInTransaction(c,a),
        reviews:(c,a)=>listServiceReviews(c,a),
        addReview:(c,a)=>addServiceReviewInTransaction(c,a),
      }});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,requestOrigin=origin,type='application/json')=>
        fetch(base+path,{method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:requestOrigin,'Content-Type':type}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{})});
      try{
        assert.equal((await send('/vendors')).status,401);
        assert.equal((await send('/vendors','POST',cookies.viewer,vendor)).status,403);
        assert.equal((await send('/vendors','POST',cookies.checker,vendor)).status,403);
        assert.equal((await send('/vendors','POST',cookies.maker,vendor,'https://evil.invalid')).status,403);
        assert.equal((await send('/vendors','POST',cookies.maker,vendor,origin,'text/plain')).status,415);
        assert.equal((await send('/vendors','POST',cookies.maker,{...vendor,extra:'x'})).status,400);
        const created=await send('/vendors','POST',cookies.maker,vendor);
        assert.equal(created.status,201);
        const v=await created.json();
        assert.equal(v.vendor_code,vendor.vendorCode);
        assert.equal(v.active_contracts,0);
        assert.equal(v.revision,1);
        await db.query('SAVEPOINT dup_vendor');
        assert.equal((await send('/vendors','POST',cookies.maker,vendor)).status,409);
        await db.query('ROLLBACK TO SAVEPOINT dup_vendor');
        assert.equal((await send('/vendors/'+v.id,'GET',cookies.viewer)).status,200);
        assert.equal((await send('/vendors?q=VND-CBS&category=core_banking','GET',cookies.viewer)).status,200);
        assert.equal((await send('/vendors?offset=bad','GET',cookies.viewer)).status,400);
        assert.equal((await send('/vendors?view=active&view=all','GET',cookies.viewer)).status,400);
        const cont=await send('/vendors/'+v.id+'/contracts','POST',cookies.maker,contract);
        assert.equal(cont.status,201);
        const c=await cont.json();
        assert.equal(c.contract_code,contract.contractCode);
        assert.equal(Number(c.sla_uptime_target),99.5);
        assert.equal(c.revision,1);
        assert.equal((await send('/vendors/'+v.id+'/contracts','GET',cookies.viewer)).status,200);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id,'GET',cookies.checker)).status,200);
        assert.equal((await send('/vendors/'+v.id,'PATCH',cookies.maker,
          {...vendor,status:'inactive',expectedRevision:1})).status,409);
        assert.equal((await send('/vendors/'+v.id+'/archive','POST',cookies.maker,
          {expectedRevision:1})).status,409);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews','POST',cookies.viewer,review)).status,403);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews','POST',cookies.maker,
          {...review,measuredResponseHours:null,periodEnd:'2030-01-01'})).status,409);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews','POST',cookies.maker,
          {...review,measuredResponseHours:null,measuredUptime:99.1,periodEnd:'2026-03-01'})).status,201);
        const first=await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews','POST',cookies.maker,review);
        assert.equal(first.status,201);
        assert.equal((await first.json()).slaResult,'below_targets');
        const good=await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews','POST',cookies.maker,
          {...review,measuredUptime:99.8,measuredResponseHours:3,
            summary:'Realisasi memenuhi kedua target layanan berdasarkan catatan sistem.'});
        assert.equal(good.status,201);
        assert.equal((await good.json()).slaResult,'meets_targets');
        const history=await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews','GET',cookies.checker);
        assert.equal(history.status,200);
        const reviews=(await history.json()).reviews;
        assert.equal(reviews.length,3);
        assert.equal(reviews.some(x=>x.sla_result==='not_assessed'),true);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id,'PATCH',cookies.maker,
          {...contract,expectedRevision:1,slaUptimeTarget:99.9})).status,409);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id,'PATCH',cookies.viewer,
          {...contract,expectedRevision:1,status:'ended'})).status,403);
        const ended=await send('/vendors/'+v.id+'/contracts/'+c.id,'PATCH',cookies.maker,
          {...contract,expectedRevision:1,status:'ended',
            note:'Perjanjian diakhiri setelah evaluasi.'});
        assert.equal(ended.status,200);
        const finalC=await ended.json();
        assert.equal(finalC.revision,2);assert.equal(finalC.status,'ended');
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id,'PATCH',cookies.maker,
          {...contract,expectedRevision:2,status:'active'})).status,409);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id+'/archive','POST',
          cookies.maker,{expectedRevision:1})).status,409);
        const contractArchive=await send('/vendors/'+v.id+'/contracts/'+c.id+'/archive',
          'POST',cookies.maker,{expectedRevision:2});
        assert.equal(contractArchive.status,200);
        assert.ok((await contractArchive.json()).archived_at);
        const updVendor=await send('/vendors/'+v.id,'PATCH',cookies.maker,
          {...vendor,expectedRevision:1,status:'inactive'});
        assert.equal(updVendor.status,200);
        assert.equal((await updVendor.json()).revision,2);
        assert.equal((await send('/vendors/'+v.id+'/archive','POST',cookies.maker,
          {expectedRevision:1})).status,409);
        const vendArchive=await send('/vendors/'+v.id+'/archive','POST',cookies.maker,
          {expectedRevision:2});
        assert.equal(vendArchive.status,200);
        assert.ok((await vendArchive.json()).archived_at);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id,'PATCH',cookies.maker,
          {...contract,status:'ended',expectedRevision:3})).status,409);
        assert.equal((await send('/vendors/'+v.id+'/contracts/'+c.id+'/reviews',
          'POST',cookies.maker,review)).status,409);
        assert.equal((await (await send('/vendors','GET',cookies.viewer)).json()).vendors.length,0);
        assert.equal((await (await send('/vendors?view=archived','GET',cookies.viewer)).json()).vendors.length,1);
        assert.equal((await send('/vendors/'+v.id+'/contracts','POST',cookies.maker,
          {...contract,contractCode:'CTR-CBS-02'})).status,409);
        const aud=await send('/vendors/'+v.id+'/history','GET',cookies.checker);
        assert.equal(aud.status,200);
        assert.deepEqual((await aud.json()).events.map(e=>e.action),[
          'VENDOR_ARCHIVED','VENDOR_UPDATED','CONTRACT_ARCHIVED','CONTRACT_UPDATED',
          'CONTRACT_CREATED','VENDOR_CREATED']);
        await db.query('SAVEPOINT locked_audit');
        await assert.rejects(db.query('DELETE FROM ti_vendor_change_events WHERE vendor_id=$1',[v.id]));
        await db.query('ROLLBACK TO SAVEPOINT locked_audit');
        await db.query('SAVEPOINT locked_review');
        await assert.rejects(db.query('DELETE FROM ti_vendor_service_reviews WHERE contract_id=$1',[c.id]));
        await db.query('ROLLBACK TO SAVEPOINT locked_review');
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
