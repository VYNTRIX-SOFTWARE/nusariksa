import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_-]{1,31}$/;
const CATEGORY=new Set(['availability','cybersecurity','data','integrity','other']);
const SEVERITY=new Set(['low','medium','high','critical']);
const STATUS=new Set(['reported','investigating','contained','resolved','closed']);
const NOTE_TYPES=new Set(['OBSERVATION','CONTAINMENT','RECOVERY','COMMUNICATION']);
const ALLOWED_TRANSITIONS={
  reported:new Set(['reported','investigating']),
  investigating:new Set(['investigating','contained','resolved']),
  contained:new Set(['contained','investigating','resolved']),
  resolved:new Set(['resolved','investigating','closed']),
  closed:new Set(['closed']),
};
const FIELDS=['incidentCode','title','category','severity','description','detectedAt',
  'assetId','riskId','pic','impactSummary','containmentAction','rootCause','resolution','status'];
const SELECT='SELECT i.*,a.asset_code,a.title AS asset_title,'+
  'r.risk_code,r.title AS risk_title FROM ti_incidents i '+
  'JOIN users u ON u.institution_id=i.institution_id AND u.id=$1 '+
  'LEFT JOIN ti_assets a ON a.id=i.asset_id AND a.institution_id=i.institution_id '+
  'LEFT JOIN ti_risks r ON r.id=i.risk_id AND r.institution_id=i.institution_id ';
export class IncidentError extends Error{
  constructor(status,message){super(message);this.name='IncidentError';this.status=status;}
}
const validId=id=>typeof id==='string'&&UUID.test(id);
function requireId(id){if(!validId(id))throw new IncidentError(400,'ID insiden tidak valid');}
const clean=(value,min,max)=>typeof value==='string'&&value.length>=min&&value.length<=max
  &&value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value);
const optional=(value,max)=>typeof value==='string'&&value.length<=max
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
function timestamp(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return false;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)&&new Date(parsed).toISOString()===value
    &&parsed>=Date.UTC(2000,0,1)&&parsed<=Date.now()+86400000;
}
export function validateIncident(payload,{update=false}={}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)
    ||Object.keys(payload).length!==FIELDS.length+(update?1:0)
    ||!FIELDS.every(key=>Object.hasOwn(payload,key))
    ||(update&&(!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision<1))
    ||!clean(payload.incidentCode,2,32)||!CODE.test(payload.incidentCode)
    ||!clean(payload.title,3,200)||!CATEGORY.has(payload.category)
    ||!SEVERITY.has(payload.severity)||!clean(payload.description,10,2000)
    ||!timestamp(payload.detectedAt)
    ||!(payload.assetId===null||validId(payload.assetId))
    ||!(payload.riskId===null||validId(payload.riskId))
    ||!clean(payload.pic,2,120)||!optional(payload.impactSummary,2000)
    ||!optional(payload.containmentAction,2000)||!optional(payload.rootCause,2000)
    ||!optional(payload.resolution,2000)||!STATUS.has(payload.status))
      throw new IncidentError(400,'Data insiden tidak valid');
  if(!update&&payload.status!=='reported')
    throw new IncidentError(409,'Insiden baru harus dimulai dari status Dilaporkan');
  if(['resolved','closed'].includes(payload.status)
    &&(payload.rootCause.trim().length<10||payload.resolution.trim().length<10))
      throw new IncidentError(409,'Penyebab dan hasil pemulihan harus diisi sebelum penyelesaian');
  return payload;
}
export function validateTimeline(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)
    ||Object.keys(payload).length!==4||!Number.isSafeInteger(payload.expectedRevision)
    ||payload.expectedRevision<1||!NOTE_TYPES.has(payload.eventType)
    ||!clean(payload.message,10,2000)
    ||!(payload.observedAt===null||timestamp(payload.observedAt)))
      throw new IncidentError(400,'Catatan kronologi tidak valid');
  return payload;
}
async function permission(db,actorId,code){
  requireId(actorId);
  if(!await userHasPermission(db,actorId,code))throw new IncidentError(403,'Forbidden');
}
const snapshot=row=>Object.fromEntries(Object.entries(row).filter(([k])=>
  !['institution_id','created_by','updated_by'].includes(k)));
async function audit(db,row,actorId,eventType,message,before=null,observedAt=null){
  await db.query('INSERT INTO ti_incident_events(institution_id,incident_id,actor_user_id,'+
    'event_type,revision,message,observed_at,before_state,after_state) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,$9::jsonb)',
    [row.institution_id,row.id,actorId,eventType,row.revision,message,observedAt,
      before?JSON.stringify(snapshot(before)):null,JSON.stringify(snapshot(row))]);
}
function conflict(error){
  if(error.code==='23505')throw new IncidentError(409,'Kode insiden sudah digunakan');
  if(error.code==='23503')throw new IncidentError(409,'Aset/risiko terkait tidak tersedia');
  throw error;
}
async function references(db,actorId,assetId,riskId){
  if(assetId!==null){
    const asset=await db.query('SELECT a.id,a.archived_at FROM ti_assets a '+
      'JOIN users u ON u.institution_id=a.institution_id AND u.id=$1 WHERE a.id=$2',
      [actorId,assetId]);
    if(asset.rowCount!==1)throw new IncidentError(404,'Aset tidak ditemukan');
    if(asset.rows[0].archived_at)throw new IncidentError(409,'Aset telah diarsipkan');
  }
  if(riskId!==null){
    const risk=await db.query('SELECT r.asset_id,r.archived_at FROM ti_risks r '+
      'JOIN users u ON u.institution_id=r.institution_id AND u.id=$1 WHERE r.id=$2',
      [actorId,riskId]);
    if(risk.rowCount!==1)throw new IncidentError(404,'Risiko tidak ditemukan');
    if(risk.rows[0].archived_at)throw new IncidentError(409,'Risiko telah diarsipkan');
    if(risk.rows[0].asset_id!==null&&risk.rows[0].asset_id!==assetId)
      throw new IncidentError(409,'Aset insiden harus sesuai dengan aset pada risiko terkait');
  }
}
async function one(db,actorId,id){
  const rows=await db.query(SELECT+'WHERE i.id=$2',[actorId,id]);
  if(rows.rowCount!==1)throw new IncidentError(404,'Insiden tidak ditemukan');
  return rows.rows[0];
}
export async function getIncident(db,{actorId,id}){
  await permission(db,actorId,'incidents:read');requireId(id);
  return one(db,actorId,id);
}
export async function listIncidentOptions(db,{actorId}){
  await permission(db,actorId,'incidents:read');
  const [assets,risks]=await Promise.all([
    db.query('SELECT a.id,a.asset_code,a.title FROM ti_assets a JOIN users u '+
      'ON u.institution_id=a.institution_id AND u.id=$1 WHERE a.archived_at IS NULL '+
      'ORDER BY a.asset_code LIMIT 1001',[actorId]),
    db.query('SELECT r.id,r.risk_code,r.title,r.asset_id FROM ti_risks r JOIN users u '+
      'ON u.institution_id=r.institution_id AND u.id=$1 WHERE r.archived_at IS NULL '+
      'ORDER BY r.risk_code LIMIT 1001',[actorId]),
  ]);
  return {assets:assets.rows.slice(0,1000),risks:risks.rows.slice(0,1000),
    truncated:assets.rowCount>1000||risks.rowCount>1000};
}
export async function listIncidents(db,{
  actorId,q='',view='active',status='all',severity='all',category='all',offset=0,
}){
  await permission(db,actorId,'incidents:read');
  if(typeof q!=='string'||q.length>80||!['active','archived','all'].includes(view)
    ||!(status==='all'||STATUS.has(status))
    ||!(severity==='all'||SEVERITY.has(severity))
    ||!(category==='all'||CATEGORY.has(category))
    ||!Number.isSafeInteger(offset)||offset<0||offset>10000)
      throw new IncidentError(400,'Filter insiden tidak valid');
  const args=[actorId],where=['u.id=$1'];
  if(q.trim()){
    args.push(q.trim());const p='$'+args.length;
    where.push('(position(lower('+p+') in lower(i.incident_code))>0 OR '+
      'position(lower('+p+') in lower(i.title))>0 OR '+
      'position(lower('+p+') in lower(i.pic))>0)');
  }
  if(view!=='all')where.push(view==='archived'?'i.archived_at IS NOT NULL':'i.archived_at IS NULL');
  if(status!=='all'){args.push(status);where.push('i.status=$'+args.length);}
  if(severity!=='all'){args.push(severity);where.push('i.severity=$'+args.length);}
  if(category!=='all'){args.push(category);where.push('i.category=$'+args.length);}
  args.push(offset);
  const r=await db.query(SELECT+'WHERE '+where.join(' AND ')+
    ' ORDER BY i.updated_at DESC,i.id DESC LIMIT 51 OFFSET $'+args.length,args);
  return {incidents:r.rows.slice(0,50),hasMore:r.rowCount>50,offset};
}
export async function incidentHistory(db,{actorId,id}){
  await getIncident(db,{actorId,id});
  const r=await db.query('SELECT e.id,e.actor_user_id,e.event_type,e.revision,e.message,'+
    'e.observed_at,e.recorded_at,e.before_state,e.after_state '+
    'FROM ti_incident_events e JOIN ti_incidents i ON i.id=e.incident_id '+
    'JOIN users u ON u.institution_id=i.institution_id AND u.id=$1 '+
    'WHERE e.incident_id=$2 ORDER BY e.id DESC LIMIT 150',[actorId,id]);
  return {events:r.rows};
}
async function lock(db,actorId,id){
  requireId(id);
  const result=await db.query('SELECT i.* FROM ti_incidents i '+
    'JOIN users u ON u.institution_id=i.institution_id AND u.id=$1 '+
    'WHERE i.id=$2 FOR UPDATE OF i',[actorId,id]);
  if(result.rowCount!==1)throw new IncidentError(404,'Insiden tidak ditemukan');
  return result.rows[0];
}
export async function createIncidentInTransaction(db,{actorId,...payload}){
  await permission(db,actorId,'incidents:write');
  const d=validateIncident(payload);
  await references(db,actorId,d.assetId,d.riskId);
  try{
    const r=await db.query('INSERT INTO ti_incidents(institution_id,incident_code,title,'+
      'category,severity,description,detected_at,asset_id,risk_id,pic,impact_summary,'+
      'containment_action,root_cause,resolution,status,created_by,updated_by) '+
      'SELECT u.institution_id,$2,$3,$4,$5,$6,$7::timestamptz,$8,$9,$10,$11,$12,$13,$14,'+
      " 'reported',u.id,u.id FROM users u WHERE u.id=$1 AND u.status='active' "+
      'AND u.password_hash IS NOT NULL RETURNING *',
      [actorId,d.incidentCode,d.title,d.category,d.severity,d.description,d.detectedAt,
        d.assetId,d.riskId,d.pic,d.impactSummary,d.containmentAction,d.rootCause,d.resolution]);
    if(r.rowCount!==1)throw new IncidentError(403,'Forbidden');
    await audit(db,r.rows[0],actorId,'CREATED','Insiden dilaporkan: '+d.title,null,d.detectedAt);
    return one(db,actorId,r.rows[0].id);
  }catch(e){conflict(e);}
}
export async function updateIncidentInTransaction(db,{actorId,id,...payload}){
  await permission(db,actorId,'incidents:write');
  const d=validateIncident(payload,{update:true});
  const before=await lock(db,actorId,id);
  if(before.archived_at||before.status==='closed')
    throw new IncidentError(409,'Insiden telah ditutup atau diarsipkan');
  if(before.revision!==d.expectedRevision)
    throw new IncidentError(409,'Data insiden telah berubah. Muat ulang.');
  if(before.incident_code!==d.incidentCode)
    throw new IncidentError(400,'Kode insiden tidak dapat diganti');
  if(!ALLOWED_TRANSITIONS[before.status].has(d.status))
    throw new IncidentError(409,'Perpindahan status tidak diperbolehkan');
  if(before.asset_id!==d.assetId||before.risk_id!==d.riskId)
    await references(db,actorId,d.assetId,d.riskId);
  const resolvedAt=['resolved','closed'].includes(d.status)
    ?(before.resolved_at??new Date().toISOString()):null;
  const closedAt=d.status==='closed'?new Date().toISOString():null;
  try{
    const r=await db.query('UPDATE ti_incidents SET title=$2,category=$3,severity=$4,'+
      'description=$5,detected_at=$6::timestamptz,asset_id=$7,risk_id=$8,pic=$9,'+
      'impact_summary=$10,containment_action=$11,root_cause=$12,resolution=$13,'+
      'status=$14,resolved_at=$15::timestamptz,closed_at=$16::timestamptz,'+
      'revision=revision+1,updated_by=$17,updated_at=now() WHERE id=$1 RETURNING *',
      [id,d.title,d.category,d.severity,d.description,d.detectedAt,d.assetId,d.riskId,
        d.pic,d.impactSummary,d.containmentAction,d.rootCause,d.resolution,d.status,
        resolvedAt,closedAt,actorId]);
    await audit(db,r.rows[0],actorId,'UPDATED',
      'Pembaruan insiden: '+before.status+' → '+d.status,before);
    return one(db,actorId,id);
  }catch(e){conflict(e);}
}
export async function appendIncidentTimelineInTransaction(db,{actorId,id,...input}){
  await permission(db,actorId,'incidents:write');
  const d=validateTimeline(input);
  const before=await lock(db,actorId,id);
  if(before.archived_at)throw new IncidentError(409,'Insiden diarsipkan');
  if(before.revision!==d.expectedRevision)
    throw new IncidentError(409,'Data insiden telah berubah. Muat ulang.');
  const r=await db.query('UPDATE ti_incidents SET revision=revision+1,'+
    'updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,actorId]);
  await audit(db,r.rows[0],actorId,d.eventType,d.message,before,d.observedAt);
  return one(db,actorId,id);
}
export async function archiveIncidentInTransaction(db,{actorId,id,expectedRevision}){
  await permission(db,actorId,'incidents:write');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    throw new IncidentError(400,'Revisi tidak valid');
  const before=await lock(db,actorId,id);
  if(before.archived_at)throw new IncidentError(409,'Insiden sudah diarsipkan');
  if(before.status!=='closed')throw new IncidentError(409,'Hanya insiden yang sudah Ditutup dapat diarsipkan');
  if(before.revision!==expectedRevision)throw new IncidentError(409,'Data insiden telah berubah');
  const r=await db.query('UPDATE ti_incidents SET archived_at=now(),revision=revision+1,'+
    'updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,actorId]);
  await audit(db,r.rows[0],actorId,'ARCHIVED','Insiden selesai dan diarsipkan',before);
  return one(db,actorId,id);
}
async function transaction(pool,fn){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');const r=await fn(client);
    await client.query('COMMIT');return r;
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export const createIncident=(pool,args)=>transaction(pool,db=>createIncidentInTransaction(db,args));
export const updateIncident=(pool,args)=>transaction(pool,db=>updateIncidentInTransaction(db,args));
export const appendIncidentTimeline=(pool,args)=>
  transaction(pool,db=>appendIncidentTimelineInTransaction(db,args));
export const archiveIncident=(pool,args)=>
  transaction(pool,db=>archiveIncidentInTransaction(db,args));
