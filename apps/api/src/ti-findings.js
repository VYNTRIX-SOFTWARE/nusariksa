import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_-]{1,31}$/;
const PRIORITIES=new Set(['low','medium','high','critical']);
const SOURCES=new Set(['assessment','risk','incident','manual']);
const STATUSES=new Set(['open','in_progress','pending_verification','changes_requested','closed']);
const FIELDS=['findingCode','title','description','priority','sourceType','assessmentId',
  'controlId','riskId','incidentId','pic','dueDate','actionPlan','progressNote','evidenceReference'];
const QUERY='SELECT f.*, to_char(f.due_date,\'YYYY-MM-DD\') AS due_date, a.title AS assessment_title, '+
  'c.control_code,c.title AS control_title,r.risk_code,r.title AS risk_title,'+
  'i.incident_code,i.title AS incident_title FROM ti_findings f '+
  'JOIN users u ON u.id=$1 AND u.institution_id=f.institution_id '+
  'LEFT JOIN assessments a ON a.id=f.assessment_id AND a.institution_id=f.institution_id '+
  'LEFT JOIN control_definitions c ON c.id=f.control_id '+
  'LEFT JOIN ti_risks r ON r.id=f.risk_id AND r.institution_id=f.institution_id '+
  'LEFT JOIN ti_incidents i ON i.id=f.incident_id AND i.institution_id=f.institution_id ';
export class FindingError extends Error {
  constructor(status,message){super(message);this.name='FindingError';this.status=status;}
}
const isId=value=>typeof value==='string'&&UUID.test(value);
function requireId(id){if(!isId(id))throw new FindingError(400,'ID temuan tidak valid');}
const clean=(value,min,max)=>typeof value==='string'&&value.length>=min&&value.length<=max
  &&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
const optional=(value,max)=>typeof value==='string'&&value.length<=max
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
  return y>=2000&&y<=2100&&date.toISOString().slice(0,10)===value;
}
const revision=n=>Number.isSafeInteger(n)&&n>=1;
function sourceValid(p){
  const ids=[p.assessmentId,p.controlId,p.riskId,p.incidentId];
  if(!ids.every(x=>x===null||isId(x)))return false;
  if(p.sourceType==='assessment')return isId(ids[0])&&isId(ids[1])&&ids[2]===null&&ids[3]===null;
  if(p.sourceType==='risk')return ids[0]===null&&ids[1]===null&&isId(ids[2])&&ids[3]===null;
  if(p.sourceType==='incident')return ids[0]===null&&ids[1]===null&&ids[2]===null&&isId(ids[3]);
  return p.sourceType==='manual'&&ids.every(x=>x===null);
}
export function validateFinding(p,{update=false}={}){
  if(!p||typeof p!=='object'||Array.isArray(p)
    ||Object.keys(p).length!==FIELDS.length+(update?1:0)
    ||!FIELDS.every(k=>Object.hasOwn(p,k))
    ||(update&&!revision(p.expectedRevision))
    ||!clean(p.findingCode,2,32)||!CODE.test(p.findingCode)
    ||!clean(p.title,3,200)||!clean(p.description,10,2000)
    ||!PRIORITIES.has(p.priority)||!SOURCES.has(p.sourceType)||!sourceValid(p)
    ||!clean(p.pic,2,120)||!validDate(p.dueDate)
    ||!optional(p.actionPlan,2000)||!optional(p.progressNote,2000)
    ||!optional(p.evidenceReference,2000))
      throw new FindingError(400,'Data temuan tidak valid');
  return p;
}
export function validateFindingReview(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==3
    ||!revision(p.expectedRevision)||!['verify','return'].includes(p.decision)
    ||!clean(p.note,10,2000))throw new FindingError(400,'Keputusan pemeriksaan tidak valid');
  return p;
}
async function requirePermission(db,actorId,permission){
  requireId(actorId);
  if(!await userHasPermission(db,actorId,permission))throw new FindingError(403,'Forbidden');
}
async function sourceExists(db,actorId,p){
  if(p.sourceType==='manual')return;
  let q,args;
  if(p.sourceType==='assessment'){
    q='SELECT 1 FROM assessment_control_results acr '+
      'JOIN assessments a ON a.id=acr.assessment_id '+
      'JOIN users u ON u.institution_id=a.institution_id AND u.id=$1 '+
      'WHERE acr.assessment_id=$2 AND acr.control_id=$3';
    args=[actorId,p.assessmentId,p.controlId];
  }else if(p.sourceType==='risk'){
    q='SELECT 1 FROM ti_risks r JOIN users u ON u.institution_id=r.institution_id AND u.id=$1 '+
      'WHERE r.id=$2 AND r.archived_at IS NULL';
    args=[actorId,p.riskId];
  }else{
    q='SELECT 1 FROM ti_incidents i JOIN users u ON u.institution_id=i.institution_id AND u.id=$1 '+
      'WHERE i.id=$2 AND i.archived_at IS NULL';
    args=[actorId,p.incidentId];
  }
  const found=await db.query(q,args);
  if(found.rowCount!==1)throw new FindingError(404,'Sumber temuan tidak tersedia');
}
function sourceValues(p){
  return [p.findingCode,p.title,p.description,p.priority,p.sourceType,
    p.assessmentId,p.controlId,p.riskId,p.incidentId,p.pic,p.dueDate,
    p.actionPlan,p.progressNote,p.evidenceReference];
}
async function one(db,actorId,id){
  const result=await db.query(QUERY+'WHERE f.id=$2',[actorId,id]);
  if(result.rowCount!==1)throw new FindingError(404,'Temuan tidak ditemukan');
  return result.rows[0];
}
export async function getFinding(db,{actorId,id}){
  await requirePermission(db,actorId,'findings:read');requireId(id);
  return one(db,actorId,id);
}
export async function listFindings(db,{actorId,q='',view='active',status='all',priority='all',source='all',offset=0}){
  await requirePermission(db,actorId,'findings:read');
  if(typeof q!=='string'||q.length>80||!['active','archived','all'].includes(view)
    ||!(status==='all'||STATUSES.has(status))
    ||!(priority==='all'||PRIORITIES.has(priority))
    ||!(source==='all'||SOURCES.has(source))
    ||!Number.isSafeInteger(offset)||offset<0||offset>10000)
    throw new FindingError(400,'Filter temuan tidak valid');
  const args=[actorId],filters=['u.id=$1'];
  if(q.trim()){
    args.push(q.trim());const p='$'+args.length;
    filters.push('(position(lower('+p+') in lower(f.finding_code))>0 OR '+
      'position(lower('+p+') in lower(f.title))>0 OR '+
      'position(lower('+p+') in lower(f.pic))>0)');
  }
  if(view!=='all')filters.push(view==='archived'?'f.archived_at IS NOT NULL':'f.archived_at IS NULL');
  for(const [name,value,field] of [['status',status,'f.status'],['priority',priority,'f.priority'],
    ['source',source,'f.source_type']]){
    if(value!=='all'){args.push(value);filters.push(field+'=$'+args.length);}
  }
  args.push(offset);
  const r=await db.query(QUERY+'WHERE '+filters.join(' AND ')+
    ' ORDER BY f.updated_at DESC,f.id DESC LIMIT 51 OFFSET $'+args.length,args);
  return {findings:r.rows.slice(0,50),hasMore:r.rowCount>50,offset};
}
export async function findingSources(db,{actorId}){
  await requirePermission(db,actorId,'findings:read');
  const [controls,risks,incidents]=await Promise.all([
    db.query('SELECT a.id AS assessment_id,a.title AS assessment_title,cd.id AS control_id,'+
      'cd.control_code,cd.title AS control_title,acr.rating FROM assessment_control_results acr '+
      'JOIN assessments a ON a.id=acr.assessment_id JOIN users u '+
      'ON u.institution_id=a.institution_id AND u.id=$1 '+
      'JOIN control_definitions cd ON cd.id=acr.control_id '+
      "WHERE acr.rating IN ('partially_compliant','non_compliant') "+
      'ORDER BY acr.updated_at DESC LIMIT 201',[actorId]),
    db.query('SELECT r.id,r.risk_code,r.title FROM ti_risks r JOIN users u '+
      'ON u.institution_id=r.institution_id AND u.id=$1 WHERE r.archived_at IS NULL '+
      'ORDER BY r.updated_at DESC LIMIT 201',[actorId]),
    db.query('SELECT i.id,i.incident_code,i.title FROM ti_incidents i JOIN users u '+
      'ON u.institution_id=i.institution_id AND u.id=$1 WHERE i.archived_at IS NULL '+
      'ORDER BY i.updated_at DESC LIMIT 201',[actorId]),
  ]);
  return {controls:controls.rows.slice(0,200),risks:risks.rows.slice(0,200),
    incidents:incidents.rows.slice(0,200),
    truncated:[controls,risks,incidents].some(x=>x.rowCount>200)};
}
export async function findingHistory(db,{actorId,id}){
  await getFinding(db,{actorId,id});
  const r=await db.query('SELECT e.id,e.actor_user_id,e.action,e.revision,e.note,'+
    'e.before_state,e.after_state,e.recorded_at FROM ti_finding_events e '+
    'JOIN ti_findings f ON f.id=e.finding_id JOIN users u '+
    'ON u.institution_id=f.institution_id AND u.id=$1 WHERE e.finding_id=$2 '+
    'ORDER BY e.id DESC LIMIT 150',[actorId,id]);
  return {events:r.rows};
}
const snapshot=r=>Object.fromEntries(Object.entries(r)
  .filter(([k])=>!['institution_id','created_by','updated_by'].includes(k)));
async function audit(db,row,actorId,action,note,before=null){
  await db.query('INSERT INTO ti_finding_events(institution_id,finding_id,actor_user_id,'+
    'action,revision,note,before_state,after_state) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
    [row.institution_id,row.id,actorId,action,row.revision,note,
      before?JSON.stringify(snapshot(before)):null,JSON.stringify(snapshot(row))]);
}
function conflict(error){
  if(error.code==='23505')throw new FindingError(409,'Kode temuan sudah digunakan');
  if(error.code==='23503')throw new FindingError(409,'Referensi temuan tidak tersedia');
  throw error;
}
async function lock(db,actorId,id){
  requireId(id);
  const r=await db.query('SELECT f.* FROM ti_findings f '+
    'JOIN users u ON u.institution_id=f.institution_id AND u.id=$1 '+
    'WHERE f.id=$2 FOR UPDATE OF f',[actorId,id]);
  if(r.rowCount!==1)throw new FindingError(404,'Temuan tidak ditemukan');
  return r.rows[0];
}
export async function createFindingInTransaction(db,{actorId,...input}){
  await requirePermission(db,actorId,'findings:write');
  const d=validateFinding(input);
  await sourceExists(db,actorId,d);
  try{
    const result=await db.query('INSERT INTO ti_findings('+
      'institution_id,finding_code,title,description,priority,source_type,assessment_id,'+
      'control_id,risk_id,incident_id,pic,due_date,action_plan,progress_note,'+
      'evidence_reference,created_by,updated_by) SELECT u.institution_id,'+
      '$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15,u.id,u.id '+
      "FROM users u WHERE u.id=$1 AND u.status='active' AND u.password_hash IS NOT NULL RETURNING *",
      [actorId,...sourceValues(d)]);
    if(result.rowCount!==1)throw new FindingError(403,'Forbidden');
    await audit(db,result.rows[0],actorId,'CREATED','Temuan dicatat');
    return one(db,actorId,result.rows[0].id);
  }catch(e){conflict(e);}
}
export async function updateFindingInTransaction(db,{actorId,id,...input}){
  await requirePermission(db,actorId,'findings:write');
  const d=validateFinding(input,{update:true});
  const before=await lock(db,actorId,id);
  if(before.archived_at||!['open','in_progress','changes_requested'].includes(before.status))
    throw new FindingError(409,'Temuan tidak dapat diubah pada status ini');
  if(before.revision!==d.expectedRevision)throw new FindingError(409,'Data temuan telah berubah. Muat ulang.');
  if(before.created_by!==actorId)throw new FindingError(403,'Hanya pembuat temuan yang dapat memperbarui tindak lanjut');
  if(before.finding_code!==d.findingCode||before.source_type!==d.sourceType
    ||before.assessment_id!==d.assessmentId||before.control_id!==d.controlId
    ||before.risk_id!==d.riskId||before.incident_id!==d.incidentId)
      throw new FindingError(400,'Kode dan sumber temuan tidak dapat diganti');
  const status=d.actionPlan.trim().length>=10?'in_progress':'open';
  const r=await db.query('UPDATE ti_findings SET title=$2,description=$3,priority=$4,'+
    'pic=$5,due_date=$6::date,action_plan=$7,progress_note=$8,evidence_reference=$9,'+
    'status=$10,updated_by=$11,updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *',
    [id,d.title,d.description,d.priority,d.pic,d.dueDate,d.actionPlan,d.progressNote,
      d.evidenceReference,status,actorId]);
  await audit(db,r.rows[0],actorId,'UPDATED','Perubahan rencana atau progres',before);
  return one(db,actorId,id);
}
export async function submitFindingInTransaction(db,{actorId,id,expectedRevision}){
  await requirePermission(db,actorId,'findings:write');
  if(!revision(expectedRevision))throw new FindingError(400,'Revisi tidak valid');
  const before=await lock(db,actorId,id);
  if(before.created_by!==actorId)throw new FindingError(403,'Hanya pembuat temuan yang dapat mengajukan');
  if(before.archived_at||!['open','in_progress','changes_requested'].includes(before.status))
    throw new FindingError(409,'Temuan tidak dapat diajukan');
  if(before.revision!==expectedRevision)throw new FindingError(409,'Temuan sudah diubah. Muat ulang.');
  if([before.action_plan,before.progress_note,before.evidence_reference]
    .some(x=>x.trim().length<10))
    throw new FindingError(409,'Lengkapi tindakan, hasil perbaikan, dan referensi bukti sebelum mengajukan');
  const r=await db.query("UPDATE ti_findings SET status='pending_verification',"+
    'submitted_by=$2,submission_cycle=submission_cycle+1,'+
    'updated_by=$2,updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *',
    [id,actorId]);
  await audit(db,r.rows[0],actorId,'SUBMITTED','Tindak lanjut diajukan untuk pemeriksaan',before);
  return one(db,actorId,id);
}
export async function reviewFindingInTransaction(db,{actorId,id,...input}){
  await requirePermission(db,actorId,'findings:verify');
  const d=validateFindingReview(input);
  const before=await lock(db,actorId,id);
  if(before.archived_at||before.status!=='pending_verification')
    throw new FindingError(409,'Temuan belum menunggu verifikasi');
  if(before.revision!==d.expectedRevision)throw new FindingError(409,'Temuan telah berubah. Muat ulang.');
  if(actorId===before.created_by||actorId===before.submitted_by)
    throw new FindingError(403,'Pemeriksa harus berbeda dengan pembuat temuan');
  const accepted=d.decision==='verify';
  const status=accepted?'closed':'changes_requested';
  const r=await db.query('UPDATE ti_findings SET status=$2,'+
    'verified_by=$3,verified_at=$4::timestamptz,closed_at=$4::timestamptz,'+
    'updated_by=$5,updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *',
    [id,status,accepted?actorId:null,accepted?new Date().toISOString():null,actorId]);
  await audit(db,r.rows[0],actorId,accepted?'VERIFIED':'RETURNED',d.note,before);
  return one(db,actorId,id);
}
export async function archiveFindingInTransaction(db,{actorId,id,expectedRevision}){
  await requirePermission(db,actorId,'findings:write');
  if(!revision(expectedRevision))throw new FindingError(400,'Revisi tidak valid');
  const before=await lock(db,actorId,id);
  if(before.created_by!==actorId)throw new FindingError(403,'Hanya pembuat temuan yang dapat mengarsipkan');
  if(before.archived_at||before.status!=='closed')throw new FindingError(409,'Hanya temuan terverifikasi dapat diarsipkan');
  if(before.revision!==expectedRevision)throw new FindingError(409,'Temuan telah berubah');
  const r=await db.query('UPDATE ti_findings SET archived_at=now(),revision=revision+1,'+
    'updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,actorId]);
  await audit(db,r.rows[0],actorId,'ARCHIVED','Temuan selesai dan diarsipkan',before);
  return one(db,actorId,id);
}
async function transaction(pool,fn){
  const db=await pool.connect();
  try{await db.query('BEGIN');const res=await fn(db);await db.query('COMMIT');return res;}
  catch(err){await db.query('ROLLBACK');throw err;}
  finally{db.release();}
}
export const createFinding=(pool,args)=>transaction(pool,db=>createFindingInTransaction(db,args));
export const updateFinding=(pool,args)=>transaction(pool,db=>updateFindingInTransaction(db,args));
export const submitFinding=(pool,args)=>transaction(pool,db=>submitFindingInTransaction(db,args));
export const reviewFinding=(pool,args)=>transaction(pool,db=>reviewFindingInTransaction(db,args));
export const archiveFinding=(pool,args)=>transaction(pool,db=>archiveFindingInTransaction(db,args));
