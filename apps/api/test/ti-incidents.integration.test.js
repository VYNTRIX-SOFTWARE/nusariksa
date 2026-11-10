import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {createAssetInTransaction} from '../src/ti-assets.js';
import {createRiskInTransaction} from '../src/ti-risks.js';
import {
  IncidentError,validateIncident,validateTimeline,createIncidentInTransaction,
  updateIncidentInTransaction,appendIncidentTimelineInTransaction,
  archiveIncidentInTransaction,listIncidents,getIncident,incidentHistory,
  listIncidentOptions,
} from '../src/ti-incidents.js';

const origin='http://127.0.0.1:3000';
const now=()=>new Date().toISOString();
const payload=()=>({
  incidentCode:'INC-CBS-01',title:'Layanan CBS terhenti',
  category:'availability',severity:'high',
  description:'Sistem core banking tidak menerima transaksi teller pada jam layanan.',
  detectedAt:now(),assetId:null,riskId:null,pic:'Petugas Infrastruktur',
  impactSummary:'Kegiatan teller tertunda untuk pemeriksaan.',
  containmentAction:'',rootCause:'',resolution:'',status:'reported',
});
test('validasi insiden menolak data rekayasa dan penutupan prematur',()=>{
  const good=payload();
  assert.equal(validateIncident(good).status,'reported');
  for(const bad of [
    {...good,extra:'admin'},{...good,incidentCode:'../../secret'},
    {...good,category:'breach'}, {...good,severity:'catastrophic'},
    {...good,description:'short'}, {...good,detectedAt:'2030-02-31'},
    {...good,assetId:'fake'}, {...good,riskId:'fake'},
    {...good,status:'closed'}, {...good,status:'resolved'},
  ])assert.throws(()=>validateIncident(bad),IncidentError);
  assert.throws(()=>validateIncident({...good,expectedRevision:0},{update:true}),IncidentError);
  assert.equal(validateIncident({...good,expectedRevision:1,status:'investigating'},{update:true}).status,'investigating');
  assert.throws(()=>validateTimeline({expectedRevision:1,eventType:'OBSERVATION',message:'short',observedAt:null}),IncidentError);
  assert.throws(()=>validateTimeline({expectedRevision:1,eventType:'EXECUTE',message:'Isolasi perangkat bermasalah',observedAt:null}),IncidentError);
  assert.equal(validateTimeline({expectedRevision:1,eventType:'CONTAINMENT',
    message:'Koneksi remote vendor dinonaktifkan sementara',observedAt:null}).eventType,'CONTAINMENT');
});
test('insiden TI: sesi, role, FK aset/risiko, status, timeline immutable, arsip', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('BPR Test Insiden','BPR') ON CONFLICT(id) DO NOTHING");
      const users={},cookies={};
      for(const [name,role] of [['maker','IT_OFFICER'],['reviewer','REVIEWER'],['viewer','VIEWER']]){
        const u=await db.query(
          "INSERT INTO users(email,status,password_hash) VALUES($1,'active','testhash') RETURNING id",
          ['incident-'+name+'@example.test']);
        users[name]=u.rows[0].id;
        await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[users[name],role]);
        cookies[name]='__Host-nusariksa_session='+(await createSession(db,users[name])).token;
      }
      const asset=await createAssetInTransaction(db,{
        actorId:users.maker,assetCode:'SRV-INC-01',title:'Server CBS Insiden',
        kind:'server',ownerName:'Unit TI',location:'Ruang Server',
        criticality:'high',operationalStatus:'active',note:'Aset uji insiden',
      });
      const risk=await createRiskInTransaction(db,{
        actorId:users.maker,riskCode:'RSK-INC-01',title:'Gangguan CBS',
        scenario:'Kegagalan server CBS menghentikan layanan teller dan pembayaran nasabah.',
        assetId:asset.id,likelihood:4,impact:4,
        residualLikelihood:null,residualImpact:null,mitigation:'',
        pic:'Petugas TI',dueDate:'2027-03-01',status:'open',note:'',
      });
      const server=createServer({authDb:db,appOrigin:origin,incidentHandlers:{
        list:(c,a)=>listIncidents(c,a),detail:(c,a)=>getIncident(c,a),
        history:(c,a)=>incidentHistory(c,a),options:(c,a)=>listIncidentOptions(c,a),
        create:(c,a)=>createIncidentInTransaction(c,a),
        update:(c,a)=>updateIncidentInTransaction(c,a),
        timeline:(c,a)=>appendIncidentTimelineInTransaction(c,a),
        archive:(c,a)=>archiveIncidentInTransaction(c,a),
      }});
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,requestOrigin=origin,type='application/json')=>
        fetch(base+path,{method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method!=='GET'?{Origin:requestOrigin,'Content-Type':type}:{}),
        },...(body!==undefined?{body:JSON.stringify(body)}:{})});
      try{
        const data={...payload(),assetId:asset.id,riskId:risk.id};
        assert.equal((await send('/incidents')).status,401);
        assert.equal((await send('/incidents','POST',cookies.viewer,data)).status,403);
        assert.equal((await send('/incidents','POST',cookies.reviewer,data)).status,403);
        assert.equal((await send('/incidents','POST',cookies.maker,data,'https://evil.invalid')).status,403);
        assert.equal((await send('/incidents','POST',cookies.maker,data,origin,'text/plain')).status,415);
        assert.equal((await send('/incidents','POST',cookies.maker,{...data,unexpected:'x'})).status,400);
        assert.equal((await send('/incidents','POST',cookies.maker,{...data,riskId:'99999999-9999-4999-8999-999999999999'})).status,404);
        assert.equal((await send('/incidents','POST',cookies.maker,{...data,assetId:null})).status,409);
        const opts=await send('/incidents/options','GET',cookies.viewer);
        assert.equal(opts.status,200);
        const allowed=await opts.json();
        assert.ok(allowed.assets.some(x=>x.id===asset.id));
        assert.ok(allowed.risks.some(x=>x.id===risk.id));
        const initial=await send('/incidents','POST',cookies.maker,data);
        assert.equal(initial.status,201);
        const created=await initial.json();
        assert.equal(created.status,'reported');
        assert.equal(created.revision,1);
        assert.equal(created.asset_id,asset.id);
        assert.equal(created.risk_id,risk.id);
        await db.query('SAVEPOINT incident_duplicate');
        assert.equal((await send('/incidents','POST',cookies.maker,data)).status,409);
        await db.query('ROLLBACK TO SAVEPOINT incident_duplicate');
        assert.equal((await send('/incidents/'+created.id,'GET',cookies.reviewer)).status,200);
        assert.equal((await send('/incidents/'+created.id,'PATCH',cookies.viewer,
          {...data,expectedRevision:1,status:'investigating'})).status,403);
        assert.equal((await send('/incidents/'+created.id+'/timeline','POST',cookies.viewer,
          {eventType:'OBSERVATION',message:'Meninjau log aplikasi core banking',observedAt:null,expectedRevision:1})).status,403);
        assert.equal((await send('/incidents?status=reported&severity=high','GET',cookies.viewer)).status,200);
        const result=await send('/incidents?q=INC-CBS&category=availability','GET',cookies.reviewer);
        assert.equal((await result.json()).incidents.length,1);
        assert.equal((await send('/incidents?offset=notnumber','GET',cookies.viewer)).status,400);
        assert.equal((await send('/incidents?status=reported&status=closed','GET',cookies.viewer)).status,400);
        assert.equal((await send('/incidents/'+created.id+'/archive','POST',cookies.maker,
          {expectedRevision:1})).status,409);
        assert.equal((await send('/incidents/'+created.id,'PATCH',cookies.maker,
          {...data,expectedRevision:1,status:'closed'})).status,409);
        const investigation=await send('/incidents/'+created.id,'PATCH',cookies.maker,
          {...data,expectedRevision:1,status:'investigating'});
        assert.equal(investigation.status,200);
        assert.equal((await investigation.json()).revision,2);
        const note=await send('/incidents/'+created.id+'/timeline','POST',cookies.maker,
          {eventType:'CONTAINMENT',
            message:'Layanan dihentikan sementara untuk pemeriksaan keamanan.',
            observedAt:now(),expectedRevision:2});
        assert.equal(note.status,200);
        assert.equal((await note.json()).revision,3);
        assert.equal((await send('/incidents/'+created.id+'/timeline','POST',cookies.maker,
          {eventType:'OBSERVATION',message:'Memeriksa log sistem dan aplikasi',observedAt:null,expectedRevision:2})).status,409);
        const resolved=await send('/incidents/'+created.id,'PATCH',cookies.maker,{
          ...data,expectedRevision:3,status:'resolved',
          rootCause:'Kegagalan proses basis data pada host CBS.',
          resolution:'Restart service secara terkendali dan validasi transaksi uji.',
          containmentAction:'Isolasi host CBS dari akses pihak luar selama pemeriksaan.',
        });
        assert.equal(resolved.status,200);
        const resolvedBody=await resolved.json();
        assert.ok(resolvedBody.resolved_at);
        assert.equal(resolvedBody.revision,4);
        const closed=await send('/incidents/'+created.id,'PATCH',cookies.maker,{
          ...data,expectedRevision:4,status:'closed',
          rootCause:'Kegagalan proses basis data pada host CBS.',
          resolution:'Restart service secara terkendali dan validasi transaksi uji.',
          containmentAction:'Isolasi host CBS dari akses pihak luar selama pemeriksaan.',
        });
        assert.equal(closed.status,200);
        const closedBody=await closed.json();
        assert.ok(closedBody.closed_at);
        assert.equal(closedBody.revision,5);
        assert.equal((await send('/incidents/'+created.id,'PATCH',cookies.maker,
          {...data,expectedRevision:5,status:'reported'})).status,409);
        const archived=await send('/incidents/'+created.id+'/archive','POST',cookies.maker,
          {expectedRevision:5});
        assert.equal(archived.status,200);
        assert.ok((await archived.json()).archived_at);
        assert.equal((await (await send('/incidents','GET',cookies.viewer)).json()).incidents.length,0);
        assert.equal((await (await send('/incidents?view=archived','GET',cookies.viewer)).json()).incidents.length,1);
        const history=await send('/incidents/'+created.id+'/history','GET',cookies.reviewer);
        assert.equal(history.status,200);
        assert.deepEqual((await history.json()).events.map(x=>x.event_type),
          ['ARCHIVED','UPDATED','UPDATED','CONTAINMENT','UPDATED','CREATED']);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM ti_incident_events WHERE incident_id=$1',
          [created.id])).rows[0].n,6);
        await db.query('SAVEPOINT immutable_incidents');
        await assert.rejects(db.query('DELETE FROM ti_incident_events WHERE incident_id=$1',[created.id]));
        await db.query('ROLLBACK TO SAVEPOINT immutable_incidents');
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
