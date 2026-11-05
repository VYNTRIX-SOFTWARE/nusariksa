import { userHasPermission } from './authorization.js';
import { MaturityError } from './maturity-models.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
const METHODS=Object.freeze({
  minimum: 'Level domain terendah',
  mean_floor: 'Rata-rata level domain, dibulatkan ke bawah',
});
const validId=value=>typeof value==='string'&&UUID.test(value);
function validDate(value){
  if(typeof value!=='string'||!DATE.test(value))return false;
  const year=Number(value.slice(0,4));
  if(year<1900||year>2100)return false;
  const parsed=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function validText(value,min=10,max=2000){
  return typeof value==='string'&&value.length<=max&&value.trim().length>=min
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
export function validateMaturityAssessment({modelVersionId,title,periodStart,periodEnd}={}){
  if(!validId(modelVersionId) || typeof title!=='string'
    || title.length<3||title.length>200||title!==title.trim()
    ||/[\u0000-\u001f\u007f]/.test(title)
    ||!validDate(periodStart)||!validDate(periodEnd)||periodStart>periodEnd)
    throw new MaturityError(400,'Invalid maturity assessment');
  return {modelVersionId,title,periodStart,periodEnd};
}
export function validateMaturityRating({level,justification,evidenceId=null,expectedRevision}={}){
  if(!Number.isSafeInteger(level)||level<0||level>5
    ||!validText(justification)
    ||!Number.isSafeInteger(expectedRevision)||expectedRevision<0
    ||(evidenceId!==null&&!validId(evidenceId)))
    throw new MaturityError(400,'Invalid maturity rating');
  return {level,justification,evidenceId,expectedRevision};
}
export function calculateMaturitySummary(domains,method){
  if(!Array.isArray(domains)||!Object.hasOwn(METHODS,method)
    ||domains.some(d=>!d||!Number.isSafeInteger(d.level)&&d.level!==null
      ||d.level!==null&&(d.level<0||d.level>5)))
    throw new MaturityError(400,'Invalid maturity calculation inputs');
  const count=domains.length;
  const levels=domains.filter(d=>d.level!==null).map(d=>d.level);
  const complete=count>0&&levels.length===count;
  const overallLevel=!complete?null:method==='minimum'
    ?Math.min(...levels):Math.floor(levels.reduce((a,b)=>a+b,0)/count);
  return {
    method,methodLabel:METHODS[method],totalDomains:count,
    assessedDomains:levels.length,unassessedDomains:count-levels.length,
    complete,overallLevel,
    note:'Indikator maturitas internal berdasarkan rubrik pengguna; bukan nilai resmi OJK.',
  };
}
async function permitted(db,actorId,permission){
  if(!validId(actorId)||!await userHasPermission(db,actorId,permission))
    throw new MaturityError(403,'Forbidden');
}
async function writeTx(pool,callback){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await callback(db);
    await db.query('COMMIT');
    return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
async function readTx(pool,callback){
  const db=await pool.connect();
  try{
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await callback(db);
    await db.query('COMMIT');
    return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function setMaturityPolicyInTransaction(db,{actorId,versionId,method}){
  if(!validId(versionId)||!Object.hasOwn(METHODS,method))
    throw new MaturityError(400,'Invalid aggregation method');
  await permitted(db,actorId,'assessments:write');
  const version=await db.query(
    'SELECT v.status FROM maturity_model_versions v '+
    'JOIN maturity_models m ON m.id=v.model_id '+
    'JOIN users u ON u.institution_id=m.institution_id AND u.id=$1 '+
    'WHERE v.id=$2 FOR UPDATE OF v',[actorId,versionId],
  );
  if(version.rowCount!==1)throw new MaturityError(404,'Maturity version not found');
  if(version.rows[0].status!=='draft')
    throw new MaturityError(409,'Published aggregation policy is immutable');
  const saved=await db.query(
    'INSERT INTO maturity_aggregation_policies(version_id,method,configured_by) '+
    'VALUES($1,$2,$3) ON CONFLICT(version_id) DO UPDATE SET '+
    'method=EXCLUDED.method,configured_by=EXCLUDED.configured_by,configured_at=now() '+
    'RETURNING version_id,method,configured_at',[versionId,method,actorId],
  );
  return {versionId:saved.rows[0].version_id,method:saved.rows[0].method,
    configuredAt:saved.rows[0].configured_at};
}

export async function createMaturityAssessmentInTransaction(db,{actorId,...input}){
  const data=validateMaturityAssessment(input);
  await permitted(db,actorId,'assessments:write');
  const found=await db.query(
    'SELECT m.institution_id,v.status,p.method FROM maturity_model_versions v '+
    'JOIN maturity_models m ON m.id=v.model_id '+
    'JOIN users u ON u.institution_id=m.institution_id AND u.id=$1 '+
    'LEFT JOIN maturity_aggregation_policies p ON p.version_id=v.id '+
    'WHERE v.id=$2 FOR SHARE OF v',[actorId,data.modelVersionId],
  );
  if(found.rowCount!==1)throw new MaturityError(404,'Maturity rubric not found');
  if(found.rows[0].status!=='published'||!found.rows[0].method)
    throw new MaturityError(409,'A published rubric with explicit aggregation method is required');
  const counts=await db.query(
    'SELECT d.id,count(l.level)::int AS levels '+
    'FROM maturity_domains d LEFT JOIN maturity_domain_levels l ON l.domain_id=d.id '+
    'WHERE d.version_id=$1 GROUP BY d.id',[data.modelVersionId],
  );
  if(!counts.rows.length||counts.rows.some(d=>d.levels!==6))
    throw new MaturityError(409,'Maturity rubric has incomplete level criteria');
  const created=await db.query(
    'INSERT INTO maturity_assessments '+
    '(institution_id,model_version_id,title,period_start,period_end,owner_user_id) '+
    'VALUES($1,$2,$3,$4::date,$5::date,$6) RETURNING id',
    [found.rows[0].institution_id,data.modelVersionId,
      data.title,data.periodStart,data.periodEnd,actorId],
  );
  return getMaturityAssessmentInTransaction(db,{actorId,id:created.rows[0].id});
}

export async function listMaturityAssessments(db,{actorId}){
  await permitted(db,actorId,'assessments:read');
  const result=await db.query(
    'SELECT a.id,a.title,to_char(a.period_start,$2) AS period_start, '+
    'to_char(a.period_end,$2) AS period_end,a.model_version_id, '+
    'a.owner_user_id,a.created_at,m.code AS model_code,m.title AS model_title, '+
    'v.version FROM maturity_assessments a '+
    'JOIN maturity_model_versions v ON v.id=a.model_version_id '+
    'JOIN maturity_models m ON m.id=v.model_id '+
    'JOIN users u ON u.id=$1 AND u.institution_id=a.institution_id '+
    'ORDER BY a.created_at DESC,a.id DESC LIMIT 50',[actorId,'YYYY-MM-DD'],
  );
  return {assessments:result.rows};
}

async function findAssessment(db,actorId,id,lock=false){
  if(!validId(id))throw new MaturityError(400,'Invalid maturity assessment ID');
  const result=await db.query(
    'SELECT a.id,a.institution_id,a.model_version_id,a.title, '+
    "to_char(a.period_start,'YYYY-MM-DD') AS period_start, "+
    "to_char(a.period_end,'YYYY-MM-DD') AS period_end, "+
    'a.owner_user_id,a.created_at,m.code AS model_code,m.title AS model_title, '+
    'm.methodology_reference,v.version,p.method '+
    'FROM maturity_assessments a '+
    'JOIN maturity_model_versions v ON v.id=a.model_version_id '+
    'JOIN maturity_models m ON m.id=v.model_id '+
    'JOIN maturity_aggregation_policies p ON p.version_id=v.id '+
    'JOIN users u ON u.id=$1 AND u.institution_id=a.institution_id '+
    'WHERE a.id=$2 '+(lock?'FOR UPDATE OF a':''),
    [actorId,id],
  );
  if(result.rowCount!==1)throw new MaturityError(404,'Maturity assessment not found');
  return result.rows[0];
}

export async function getMaturityAssessmentInTransaction(db,{actorId,id}){
  await permitted(db,actorId,'assessments:read');
  const assessment=await findAssessment(db,actorId,id);
  const result=await db.query(
    'SELECT d.id,d.code,d.title,d.description,d.position, '+
    'r.level,r.justification,r.revision,r.evidence_id,r.updated_at, '+
    'e.file_name AS evidence_file_name,e.assessment_id AS evidence_assessment_id '+
    'FROM maturity_domains d '+
    'LEFT JOIN maturity_domain_results r ON r.domain_id=d.id AND r.assessment_id=$2 '+
    'LEFT JOIN assessment_evidence e ON e.id=r.evidence_id '+
    'WHERE d.version_id=$1 ORDER BY d.position',
    [assessment.model_version_id,id],
  );
  const rubric=await db.query(
    'SELECT l.domain_id,l.level,l.criterion FROM maturity_domain_levels l '+
    'JOIN maturity_domains d ON d.id=l.domain_id '+
    'WHERE d.version_id=$1 ORDER BY d.position,l.level',
    [assessment.model_version_id],
  );
  const criteria=new Map(result.rows.map(d=>[d.id,[]]));
  for(const row of rubric.rows)criteria.get(row.domain_id)?.push({
    level:row.level,criterion:row.criterion,
  });
  const evidenceAllowed=await userHasPermission(db,actorId,'evidence:read');
  const domains=result.rows.map(row=>({
    id:row.id,code:row.code,title:row.title,description:row.description,
    position:row.position,criteria:criteria.get(row.id)??[],
    level:row.level??null,justification:row.justification??'',
    revision:row.revision??0,updatedAt:row.updated_at??null,
    evidenceId:evidenceAllowed?row.evidence_id??null:null,
    evidenceFileName:evidenceAllowed?row.evidence_file_name??null:null,
    evidenceAssessmentId:evidenceAllowed?row.evidence_assessment_id??null:null,
  }));
  return {
    id:assessment.id,title:assessment.title,
    periodStart:assessment.period_start,periodEnd:assessment.period_end,
    ownerUserId:assessment.owner_user_id,createdAt:assessment.created_at,
    modelVersionId:assessment.model_version_id,
    model:{code:assessment.model_code,title:assessment.model_title,
      version:assessment.version,methodologyReference:assessment.methodology_reference},
    summary:calculateMaturitySummary(domains,assessment.method),
    domains,
  };
}

export async function rateMaturityDomainInTransaction(db,{
  actorId,assessmentId,domainId,...input
}){
  if(!validId(assessmentId)||!validId(domainId))
    throw new MaturityError(400,'Invalid maturity target');
  const value=validateMaturityRating(input);
  await permitted(db,actorId,'assessments:write');
  const assessment=await findAssessment(db,actorId,assessmentId,true);
  if(assessment.owner_user_id!==actorId)
    throw new MaturityError(403,'Only the maturity assessment owner can rate domains');
  const criterion=await db.query(
    'SELECT 1 FROM maturity_domain_levels l '+
    'JOIN maturity_domains d ON d.id=l.domain_id '+
    'WHERE d.id=$1 AND d.version_id=$2 AND l.level=$3',
    [domainId,assessment.model_version_id,value.level],
  );
  if(criterion.rowCount!==1)throw new MaturityError(404,'Domain or criterion not found');
  if(value.evidenceId!==null){
    await permitted(db,actorId,'evidence:read');
    const file=await db.query(
      'SELECT 1 FROM assessment_evidence e '+
      'JOIN assessments a ON a.id=e.assessment_id '+
      'WHERE e.id=$1 AND a.institution_id=$2',
      [value.evidenceId,assessment.institution_id],
    );
    if(file.rowCount!==1)throw new MaturityError(404,'Evidence not found');
  }
  const existing=await db.query(
    'SELECT revision FROM maturity_domain_results '+
    'WHERE assessment_id=$1 AND domain_id=$2',
    [assessmentId,domainId],
  );
  const revision=existing.rows[0]?.revision??0;
  if(value.expectedRevision!==revision)
    throw new MaturityError(409,'Maturity domain result was changed by another request');
  const saved=await db.query(
    'INSERT INTO maturity_domain_results '+
    '(assessment_id,model_version_id,domain_id,level,justification,evidence_id,revision,updated_by) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(assessment_id,domain_id) DO UPDATE SET '+
    'level=EXCLUDED.level,justification=EXCLUDED.justification, '+
    'evidence_id=EXCLUDED.evidence_id,revision=EXCLUDED.revision, '+
    'updated_by=EXCLUDED.updated_by,updated_at=now() '+
    'RETURNING revision,updated_at',
    [assessmentId,assessment.model_version_id,domainId,value.level,
      value.justification,value.evidenceId,revision+1,actorId],
  );
  await db.query(
    'INSERT INTO maturity_domain_result_events '+
    '(assessment_id,domain_id,revision,level,justification,evidence_id,actor_user_id) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7)',
    [assessmentId,domainId,saved.rows[0].revision,value.level,
      value.justification,value.evidenceId,actorId],
  );
  return {
    assessmentId,domainId,level:value.level,revision:saved.rows[0].revision,
    justification:value.justification,evidenceId:value.evidenceId,
    updatedAt:saved.rows[0].updated_at,
  };
}

export async function listMaturityDomainHistory(db,{actorId,assessmentId,domainId}){
  await permitted(db,actorId,'assessments:read');
  const a=await findAssessment(db,actorId,assessmentId);
  const domain=await db.query('SELECT 1 FROM maturity_domains WHERE id=$1 AND version_id=$2',
    [domainId,a.model_version_id]);
  if(domain.rowCount!==1)throw new MaturityError(404,'Maturity domain not found');
  const result=await db.query(
    'SELECT revision,level,justification,evidence_id,actor_user_id,occurred_at '+
    'FROM maturity_domain_result_events WHERE assessment_id=$1 AND domain_id=$2 '+
    'ORDER BY revision DESC LIMIT 100',
    [assessmentId,domainId],
  );
  const evidenceAllowed=await userHasPermission(db,actorId,'evidence:read');
  return {history:result.rows.map(r=>({
    revision:r.revision,level:r.level,justification:r.justification,
    evidenceId:evidenceAllowed?r.evidence_id:null,
    actorUserId:r.actor_user_id,occurredAt:r.occurred_at,
  }))};
}

export const setMaturityPolicy=(pool,args)=>
  writeTx(pool,db=>setMaturityPolicyInTransaction(db,args));
export const createMaturityAssessment=(pool,args)=>
  writeTx(pool,db=>createMaturityAssessmentInTransaction(db,args));
export const rateMaturityDomain=(pool,args)=>
  writeTx(pool,db=>rateMaturityDomainInTransaction(db,args));
export const getMaturityAssessment=(pool,args)=>
  readTx(pool,db=>getMaturityAssessmentInTransaction(db,args));
