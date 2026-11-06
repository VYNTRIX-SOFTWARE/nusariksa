import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {
  submitMaturityAssessmentInTransaction,reviewMaturityAssessmentInTransaction,
  listMaturityReviewHistory,listPendingMaturityReviews,
} from '../src/maturity-assessment-reviews.js';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {createSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  createMaturityModelInTransaction,addMaturityDomainInTransaction,
  setMaturityLevelInTransaction,publishMaturityVersionInTransaction,
  createNextMaturityVersionInTransaction,
} from '../src/maturity-models.js';
import {
  setMaturityPolicyInTransaction,createMaturityAssessmentInTransaction,
  getMaturityAssessmentInTransaction,rateMaturityDomainInTransaction,
  calculateMaturitySummary,
} from '../src/maturity-assessments.js';
import {
  createCatalogInTransaction,addControlInTransaction,
  publishVersionInTransaction,assignCatalogInTransaction,
} from '../src/control-catalogs.js';
import {createAssessmentInTransaction,startAssessmentInTransaction} from '../src/assessments.js';
import {uploadEvidenceInTransaction} from '../src/assessment-evidence.js';

const ORIGIN='http://127.0.0.1:3000';
const criteria=level=>'Indikator spesifik pada Level '+level+' yang dinilai secara internal.';
const justification='Kegiatan dan bukti terkait telah diperiksa berdasarkan rubrik internal.';

test('HTTP asesmen maturitas memerlukan policy, mengaudit revisi, dan tidak membuat skor parsial', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name,kind) VALUES ('Bank Uji Engine','BPR')");
      const people=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES "+
        "('ma-writer@example.test','active','hash-uji'),"+
        "('ma-viewer@example.test','active','hash-uji'),"+
        "('ma-unauthorized@example.test','active','hash-uji'),"+
        "('ma-reviewer@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids=Object.fromEntries(people.rows.map(r=>[r.email,r.id]));
      const maker=ids['ma-writer@example.test'];
      const viewer=ids['ma-viewer@example.test'];
      const none=ids['ma-unauthorized@example.test'];
      const reviewer=ids['ma-reviewer@example.test'];
      await db.query(
        "INSERT INTO user_roles(user_id,role) VALUES "+
        "($1,'IT_OFFICER'),($2,'VIEWER'),($3,'REVIEWER')",
        [maker,viewer,reviewer],
      );
      const cookies={};
      for(const [key,userId] of [['maker',maker],['viewer',viewer],['none',none],['reviewer',reviewer]]){
        cookies[key]='__Host-nusariksa_session='+(await createSession(db,userId)).token;
      }
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        maturityHandlers:{
          create:(client,args)=>createMaturityModelInTransaction(client,args),
          nextVersion:(client,args)=>createNextMaturityVersionInTransaction(client,args),
          addDomain:(client,args)=>addMaturityDomainInTransaction(client,args),
          setLevel:(client,args)=>setMaturityLevelInTransaction(client,args),
          publish:(client,args)=>publishMaturityVersionInTransaction(client,args),
          setPolicy:(client,args)=>setMaturityPolicyInTransaction(client,args),
        },
        maturityAssessmentHandlers:{
          create:(client,args)=>createMaturityAssessmentInTransaction(client,args),
          detail:(client,args)=>getMaturityAssessmentInTransaction(client,args),
          rate:(client,args)=>rateMaturityDomainInTransaction(client,args),
          submit:(client,args)=>submitMaturityAssessmentInTransaction(client,args),
          review:(client,args)=>reviewMaturityAssessmentInTransaction(client,args),
          reviews:(client,args)=>listMaturityReviewHistory(client,args),
          queue:(client,args)=>listPendingMaturityReviews(client,args),
        },
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(path,method='GET',cookie,body,origin=ORIGIN)=>fetch(base+path,{
        method,headers:{
          ...(cookie?{Cookie:cookie}:{}),
          ...(method==='POST'||method==='PUT'?{'Content-Type':'application/json',Origin:origin}:{}),
        },
        ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),
      });
      try{
        assert.equal((await send('/maturity-assessments')).status,401);
        assert.equal((await send('/maturity-assessments','GET',cookies.none)).status,403);
        assert.equal((await send('/maturity-assessments','POST',cookies.viewer,{})).status,403);
        assert.equal((await send('/maturity-assessments','POST',cookies.maker,{},'https://evil.example')).status,403);

        const model=await createMaturityModelInTransaction(db,{
          actorId:maker,code:'MAT_ENGINE',title:'Model penilaian maturitas',
          methodologyReference:'Rubrik internal yang tidak diklaim sebagai standar OJK',
        });
        const versionId=model.currentVersion.id;
        const first=await addMaturityDomainInTransaction(db,{
          actorId:maker,versionId,code:'GOV_01',title:'Tata Kelola TI',
        });
        const second=await addMaturityDomainInTransaction(db,{
          actorId:maker,versionId,code:'SEC_01',title:'Pengamanan TI',
        });
        for(const domain of [first,second]){
          for(let level=0;level<=5;level++)
            await setMaturityLevelInTransaction(db,{
              actorId:maker,domainId:domain.id,level,criterion:criteria(level),
            });
        }
        await publishMaturityVersionInTransaction(db,{actorId:maker,versionId});
        const payload={
          modelVersionId:versionId,title:'Maturity TI Tahunan',
          periodStart:'2027-01-01',periodEnd:'2027-12-31',
        };
        assert.equal((await send('/maturity-assessments','POST',cookies.maker,payload)).status,409);
        assert.equal((await send('/maturity-versions/'+versionId+'/aggregation','PUT',
          cookies.maker,{method:'minimum'})).status,409);

        const next=await createNextMaturityVersionInTransaction(db,{
          actorId:maker,modelId:model.id,
        });
        const nextRubric=await db.query(
          'SELECT id FROM maturity_domains WHERE version_id=$1 ORDER BY position',[next.id],
        );
        const policy=await send('/maturity-versions/'+next.id+'/aggregation','PUT',
          cookies.maker,{method:'minimum'});
        assert.equal(policy.status,200);
        assert.equal((await policy.json()).method,'minimum');
        await publishMaturityVersionInTransaction(db,{actorId:maker,versionId:next.id});
        assert.equal((await send('/maturity-versions/'+next.id+'/aggregation','PUT',
          cookies.maker,{method:'mean_floor'})).status,409);
        const future=await createNextMaturityVersionInTransaction(db,{
          actorId:maker,modelId:model.id,
        });
        const cloned=await db.query(
          'SELECT method FROM maturity_aggregation_policies WHERE version_id=$1',[future.id],
        );
        assert.equal(cloned.rows[0].method,'minimum');

        const created=await send('/maturity-assessments','POST',cookies.maker,{
          ...payload,modelVersionId:next.id,
        });
        assert.equal(created.status,201);
        const result=await created.json();
        assert.equal(result.summary.complete,false);
        assert.equal(result.summary.overallLevel,null);
        assert.equal(result.domains.length,2);
        assert.equal(result.modelVersionId,next.id);
        const assessmentId=result.id;
        const ratingPath='/maturity-assessments/'+assessmentId+'/domains/';
        assert.equal((await send('/maturity-assessments','GET',cookies.viewer)).status,200);
        assert.equal((await send('/maturity-assessments/review-queue')).status,401);
        assert.equal((await send('/maturity-assessments/review-queue','GET',cookies.viewer)).status,403);
        assert.equal((await send('/maturity-assessments/review-queue','GET',cookies.maker)).status,403);
        assert.deepEqual((await(await send('/maturity-assessments/review-queue',
          'GET',cookies.reviewer)).json()).assessments,[]);
        assert.equal((await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.viewer,{
          level:0,justification,expectedRevision:0,
        })).status,403);
        assert.equal((await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.maker,{
          level:0,justification,expectedRevision:0,
        },'https://evil.example')).status,403);
        assert.equal((await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.maker,{
          level:0,justification:'short',expectedRevision:0,
        })).status,400);
        assert.equal((await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.maker,{
          level:0,justification,expectedRevision:0,
          evidenceId:'11111111-1111-4111-8111-111111111111',
        })).status,404);
        const firstSaved=await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.maker,{
          level:0,justification,expectedRevision:0,
        });
        assert.equal(firstSaved.status,200);
        assert.equal((await firstSaved.json()).revision,1);
        assert.equal((await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.maker,{
          level:2,justification,expectedRevision:0,
        })).status,409);

        const partial=await(await send('/maturity-assessments/'+assessmentId,
          'GET',cookies.viewer)).json();
        assert.equal(partial.summary.assessedDomains,1);
        assert.equal(partial.summary.complete,false);
        assert.equal(partial.summary.overallLevel,null);
        const reviewPath='/maturity-assessments/'+assessmentId;
        assert.equal(partial.review.status,'in_progress');
        assert.equal((await send(reviewPath+'/submit','POST',cookies.maker)).status,409);
        assert.equal((await send(reviewPath+'/submit','POST',cookies.reviewer)).status,403);

        // Reuse immutable evidence from an existing control assessment, same institution.
        const cat=await createCatalogInTransaction(db,{
          actorId:maker,code:'MAT_EVIDENCE',title:'Katalog evidence pendukung',
        });
        const control=await addControlInTransaction(db,{
          actorId:maker,versionId:cat.currentVersion.id,
          code:'EVID_01',title:'Bukti tata kelola TI',
        });
        await publishVersionInTransaction(db,{actorId:maker,versionId:cat.currentVersion.id});
        const controlAssessment=await createAssessmentInTransaction(db,{
          actorId:maker,title:'Asesmen sumber bukti',
          periodStart:'2027-01-01',periodEnd:'2027-12-31',
        });
        await assignCatalogInTransaction(db,{
          actorId:maker,assessmentId:controlAssessment.id,
          versionId:cat.currentVersion.id,
        });
        await startAssessmentInTransaction(db,{actorId:maker,id:controlAssessment.id});
        const pdf=Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n%%EOF');
        const evidence=await uploadEvidenceInTransaction(db,{
          actorId:maker,assessmentId:controlAssessment.id,controlId:control.id,
          fileName:'rekaman uji.pdf',mediaType:'application/pdf',
          contentBase64:pdf.toString('base64'),key:Buffer.from('aa'.repeat(32),'hex'),
        });
        const evidenceSaved=await send(ratingPath+nextRubric.rows[0].id,'PUT',cookies.maker,{
          level:1,justification:justification+' Dengan lampiran kontrol.',
          expectedRevision:1,evidenceId:evidence.id,
        });
        assert.equal(evidenceSaved.status,200);
        const secondSaved=await send(ratingPath+nextRubric.rows[1].id,'PUT',cookies.maker,{
          level:5,justification,expectedRevision:0,
        });
        assert.equal(secondSaved.status,200);

        const complete=await(await send('/maturity-assessments/'+assessmentId,
          'GET',cookies.viewer)).json();
        assert.equal(complete.summary.complete,true);
        assert.equal(complete.summary.method,'minimum');
        assert.equal(complete.summary.overallLevel,1);
        assert.equal(complete.domains[0].evidenceFileName,'rekaman uji.pdf');
        assert.equal(complete.domains[0].evidenceAssessmentId,controlAssessment.id);
        assert.equal(complete.domains[1].level,5);
        const submitted=await send(reviewPath+'/submit','POST',cookies.maker);
        assert.equal(submitted.status,200);
        assert.equal((await submitted.json()).submissionCycle,1);
        const reviewQueue=await(await send('/maturity-assessments/review-queue',
          'GET',cookies.reviewer)).json();
        assert.equal(reviewQueue.assessments.length,1);
        assert.equal(reviewQueue.assessments[0].id,assessmentId);
        assert.equal(reviewQueue.assessments[0].ownerUserId,maker);
        assert.equal(reviewQueue.assessments[0].submissionCycle,1);
        await db.query('SAVEPOINT review_rating_lock');
        await assert.rejects(db.query(
          'UPDATE maturity_domain_results SET justification=$3 WHERE assessment_id=$1 AND domain_id=$2',
          [assessmentId,nextRubric.rows[0].id,justification]),e=>e.code==='P0001');
        await db.query('ROLLBACK TO SAVEPOINT review_rating_lock');
        await db.query('SAVEPOINT review_delete_lock');
        await assert.rejects(db.query(
          'DELETE FROM maturity_domain_results WHERE assessment_id=$1 AND domain_id=$2',
          [assessmentId,nextRubric.rows[0].id]),e=>e.code==='P0001');
        await db.query('ROLLBACK TO SAVEPOINT review_delete_lock');
        assert.equal((await send(reviewPath+'/submit','POST',cookies.maker)).status,409);
        assert.equal((await send(ratingPath+nextRubric.rows[1].id,'PUT',cookies.maker,{
          level:3,justification,expectedRevision:1,
        })).status,409);
        assert.equal((await send(reviewPath+'/review','POST',cookies.maker,{
          decision:'approve',note:'Sudah direview.',
        })).status,403);
        assert.equal((await send(reviewPath+'/review','POST',cookies.reviewer,{
          decision:'request_changes',note:'kurang',
        })).status,400);
        assert.equal((await send(reviewPath+'/review','POST',cookies.reviewer,{
          decision:'request_changes',note:'Perbaiki dasar penilaian domain kedua.',
        },'https://evil.example')).status,403);
        const returned=await send(reviewPath+'/review','POST',cookies.reviewer,{
          decision:'request_changes',note:'Perbaiki dasar penilaian domain kedua.',
        });
        assert.equal(returned.status,200);
        assert.equal((await returned.json()).status,'changes_requested');
        assert.equal((await(await send('/maturity-assessments/review-queue',
          'GET',cookies.reviewer)).json()).assessments.length,0);
        assert.equal((await send(ratingPath+nextRubric.rows[1].id,'PUT',cookies.maker,{
          level:3,justification,expectedRevision:1,
        })).status,200);
        assert.equal((await send(reviewPath+'/submit','POST',cookies.maker)).status,200);
        assert.equal((await(await send('/maturity-assessments/review-queue',
          'GET',cookies.reviewer)).json()).assessments[0].submissionCycle,2);
        const approved=await send(reviewPath+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'Penilaian sesuai rubrik internal.',
        });
        assert.equal(approved.status,200);
        assert.equal((await approved.json()).submissionCycle,2);
        assert.equal((await(await send('/maturity-assessments/review-queue',
          'GET',cookies.reviewer)).json()).assessments.length,0);
        assert.equal((await send(reviewPath+'/review','POST',cookies.reviewer,{
          decision:'approve',note:'Selesai.',
        })).status,409);
        assert.equal((await send(ratingPath+nextRubric.rows[1].id,'PUT',cookies.maker,{
          level:5,justification,expectedRevision:2,
        })).status,409);
        const audited=await(await send(reviewPath+'/reviews','GET',cookies.viewer)).json();
        assert.equal(audited.status,'approved');
        assert.deepEqual(audited.events.map(x=>x.action),
          ['APPROVED','SUBMITTED','CHANGES_REQUESTED','SUBMITTED']);
        const ratedDetail=await(await send(reviewPath,'GET',cookies.viewer)).json();
        assert.equal(ratedDetail.review.status,'approved');
        assert.equal(ratedDetail.review.submissionCycle,2);

        const history=await(await send(ratingPath+nextRubric.rows[0].id+'/history','GET',
          cookies.viewer)).json();
        assert.deepEqual(history.history.map(x=>x.revision),[2,1]);
        assert.equal(history.history[0].evidenceId,evidence.id);

        await db.query('SAVEPOINT immutable_maturity_event');
        await assert.rejects(
          db.query('DELETE FROM maturity_domain_result_events WHERE assessment_id=$1',
            [assessmentId]),e=>e.code==='P0001',
        );
        await db.query('ROLLBACK TO SAVEPOINT immutable_maturity_event');
        await db.query('SAVEPOINT immutable_maturity_review');
        await assert.rejects(db.query(
          'DELETE FROM maturity_assessment_review_events WHERE assessment_id=$1',
          [assessmentId]),e=>e.code==='P0001');
        await db.query('ROLLBACK TO SAVEPOINT immutable_maturity_review');
        assert.equal(calculateMaturitySummary([{level:1},{level:5}], 'mean_floor').overallLevel,3);
      }finally{
        server.close();await once(server,'close');
      }
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});

test('endpoint asesmen maturitas tetap 503 tanpa koneksi database',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/maturity-assessments');
    assert.equal(response.status,503);
  }finally{server.close();await once(server,'close');}
});
