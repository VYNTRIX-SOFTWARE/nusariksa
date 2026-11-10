import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_-]{1,31}$/;
const STATUS=new Set(['open','mitigating','monitoring','closed']);
const LEVELS=new Set(['low','medium','high','critical']);
const FIELDS=['riskCode','title','scenario','assetId','likelihood','impact',
  'residualLikelihood','residualImpact','mitigation','pic','dueDate','status','note'];
const COLUMNS='r.id,r.institution_id,r.risk_code,r.title,r.scenario,r.asset_id,'+
  'r.likelihood,r.impact,r.residual_likelihood,r.residual_impact,r.mitigation,'+
  'r.pic,to_char(r.due_date,\'YYYY-MM-DD\') AS due_date,r.status,r.note,'+
  'r.revision,r.archived_at,r.created_at,r.updated_at,a.asset_code,a.title AS asset_title';
export class RiskError extends Error{
  constructor(status,message){super(message);this.name='RiskError';this.status=status;}
}
const requireId=(id)=>{
  if(typeof id!=='string'||!UUID.test(id))throw new RiskError(400,'ID risiko tidak valid');
};
const string=(value,min,max)=>typeof value==='string'
  &&value.length>=min&&value.length<=max&&value.trim()===value
  &&!/[\u0000-\u001f\u007f]/.test(value);
const optionalText=(value,max)=>typeof value==='string'&&value.length<=max
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const validDate=(value)=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  return year>=1900&&year<=2100&&d.toISOString().slice(0,10)===value;
};
const rating=value=>Number.isInteger(value)&&value>=1&&value<=5;
export function riskLevel(score){
  if(!Number.isInteger(score)||score<1||score>25)throw new RiskError(400,'Nilai risiko tidak valid');
  return score<=4?'low':score<=9?'medium':score<=16?'high':'critical';
}
export function validateRisk(payload,{update=false}={}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)
    ||Object.keys(payload).length!==FIELDS.length+(update?1:0)
    ||!FIELDS.every(k=>Object.hasOwn(payload,k))
    ||(update&&(!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision<1))
    ||!string(payload.riskCode,2,32)||!CODE.test(payload.riskCode)
    ||!string(payload.title,3,200)||!string(payload.scenario,10,2000)
    ||!(payload.assetId===null||(typeof payload.assetId==='string'&&UUID.test(payload.assetId)))
    ||!rating(payload.likelihood)||!rating(payload.impact)
    ||!((payload.residualLikelihood===null&&payload.residualImpact===null)
      ||(rating(payload.residualLikelihood)&&rating(payload.residualImpact)))
    ||!optionalText(payload.mitigation,2000)
    ||!string(payload.pic,2,120)||!validDate(payload.dueDate)
    ||!STATUS.has(payload.status)||!optionalText(payload.note,2000))
      throw new RiskError(400,'Data risiko tidak valid');
  if(payload.status==='closed'&&(payload.residualLikelihood===null
    ||payload.residualLikelihood*payload.residualImpact>9
    ||payload.mitigation.trim().length<10))
    throw new RiskError(409,'Risiko belum boleh ditutup: lengkapi mitigasi dan nilai residual maksimal sedang');
  return payload;
}
async function permission(db,actorId,code){
  requireId(actorId);
  if(!await userHasPermission(db,actorId,code))throw new RiskError(403,'Forbidden');
}
async function referencedAsset(db,actorId,assetId){
  if(assetId===null)return;
  const found=await db.query(
    'SELECT a.id,a.archived_at FROM ti_assets a JOIN users u '+
    'ON u.institution_id=a.institution_id AND u.id=$1 WHERE a.id=$2',
    [actorId,assetId]);
  if(found.rowCount!==1)throw new RiskError(404,'Aset terkait tidak ditemukan');
  if(found.rows[0].archived_at)throw new RiskError(409,'Aset telah diarsipkan; gunakan aset aktif');
}
function decorate(row){
  const inherent=row.likelihood*row.impact;
  const residual=row.residual_likelihood===null?null:row.residual_likelihood*row.residual_impact;
  return {...row,inherent_score:inherent,inherent_level:riskLevel(inherent),
    residual_score:residual,residual_level:residual===null?null:riskLevel(residual)};
}
const recordSelect='SELECT '+COLUMNS+' FROM ti_risks r '+
  'JOIN users u ON u.institution_id=r.institution_id AND u.id=$1 '+
  'LEFT JOIN ti_assets a ON a.id=r.asset_id ';
async function one(db,actorId,id){
  const out=await db.query(recordSelect+'WHERE r.id=$2',[actorId,id]);
  if(out.rowCount!==1)throw new RiskError(404,'Risiko tidak ditemukan');
  return decorate(out.rows[0]);
}
export async function getRisk(db,{actorId,id}){
  await permission(db,actorId,'risks:read');requireId(id);
  return one(db,actorId,id);
}
export async function listRiskAssets(db,{actorId}){
  await permission(db,actorId,'risks:read');
  const r=await db.query('SELECT a.id,a.asset_code,a.title FROM ti_assets a '+
    'JOIN users u ON u.institution_id=a.institution_id AND u.id=$1 '+
    'WHERE a.archived_at IS NULL ORDER BY a.asset_code LIMIT 1001',[actorId]);
  return {assets:r.rows.slice(0,1000),truncated:r.rows.length>1000};
}
export async function listRisks(db,{actorId,q='',view='active',status='all',level='all',assetId='all',offset=0}){
  await permission(db,actorId,'risks:read');
  if(typeof q!=='string'||q.length>80||!['active','archived','all'].includes(view)
    ||!(status==='all'||STATUS.has(status))||!(level==='all'||LEVELS.has(level))
    ||!(assetId==='all'||assetId==='none'||(typeof assetId==='string'&&UUID.test(assetId)))
    ||!Number.isInteger(offset)||offset<0||offset>10000)
      throw new RiskError(400,'Filter risiko tidak valid');
  const args=[actorId],filters=['u.id=$1'];
  if(q.trim()){
    args.push(q.trim());const p='$'+args.length;
    filters.push('(position(lower('+p+') in lower(r.risk_code))>0 OR '+
      'position(lower('+p+') in lower(r.title))>0 OR '+
      'position(lower('+p+') in lower(r.pic))>0)');
  }
  if(view!=='all')filters.push(view==='archived'
    ?'r.archived_at IS NOT NULL':'r.archived_at IS NULL');
  if(status!=='all'){args.push(status);filters.push('r.status=$'+args.length);}
  if(level!=='all'){
    const lower={low:1,medium:5,high:10,critical:17}[level];
    const upper={low:4,medium:9,high:16,critical:25}[level];
    args.push(lower,upper);
    filters.push('(r.likelihood*r.impact BETWEEN $'+(args.length-1)+' AND $'+args.length+')');
  }
  if(assetId==='none')filters.push('r.asset_id IS NULL');
  else if(assetId!=='all'){args.push(assetId);filters.push('r.asset_id=$'+args.length);}
  args.push(offset);
  const rows=await db.query(recordSelect+'WHERE '+filters.join(' AND ')+
    ' ORDER BY r.updated_at DESC,r.id DESC LIMIT 51 OFFSET $'+args.length,args);
  return {risks:rows.rows.slice(0,50).map(decorate),hasMore:rows.rowCount>50,offset};
}
export async function riskHistory(db,{actorId,id}){
  await getRisk(db,{actorId,id});
  const rows=await db.query('SELECT e.id,e.action,e.actor_user_id,e.revision,e.old_values,'+
    'e.new_values,e.occurred_at FROM ti_risk_events e JOIN ti_risks r ON r.id=e.risk_id '+
    'JOIN users u ON u.institution_id=r.institution_id AND u.id=$1 '+
    'WHERE e.risk_id=$2 ORDER BY e.id DESC LIMIT 100',[actorId,id]);
  return {events:rows.rows};
}
const snapshot=x=>Object.fromEntries(Object.entries(x).filter(([k])=>
  !['institution_id','created_by','updated_by'].includes(k)));
async function event(db,record,actorId,action,old=null){
  await db.query('INSERT INTO ti_risk_events('+
    'institution_id,risk_id,actor_user_id,action,revision,old_values,new_values) '+
    'VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
    [record.institution_id,record.id,actorId,action,record.revision,
      old?JSON.stringify(snapshot(old)):null,JSON.stringify(snapshot(record))]);
}
function duplicate(error){
  if(error.code==='23505')throw new RiskError(409,'Kode risiko sudah digunakan');
  if(error.code==='23503')throw new RiskError(409,'Referensi aset tidak tersedia');
  throw error;
}
async function lockRisk(db,actorId,id){
  requireId(id);
  const row=await db.query('SELECT r.* FROM ti_risks r '+
    'JOIN users u ON u.institution_id=r.institution_id AND u.id=$1 '+
    'WHERE r.id=$2 FOR UPDATE OF r',[actorId,id]);
  if(row.rowCount!==1)throw new RiskError(404,'Risiko tidak ditemukan');
  return row.rows[0];
}
export async function createRiskInTransaction(db,{actorId,...input}){
  await permission(db,actorId,'risks:write');
  const d=validateRisk(input);
  await referencedAsset(db,actorId,d.assetId);
  try{
    const result=await db.query(
      'INSERT INTO ti_risks(institution_id,risk_code,title,scenario,asset_id,likelihood,'+
      'impact,residual_likelihood,residual_impact,mitigation,pic,due_date,status,note,created_by,updated_by) '+
      'SELECT u.institution_id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,u.id,u.id '+
      "FROM users u WHERE u.id=$1 AND u.status='active' AND u.password_hash IS NOT NULL RETURNING *",
      [actorId,d.riskCode,d.title,d.scenario,d.assetId,d.likelihood,d.impact,
        d.residualLikelihood,d.residualImpact,d.mitigation,d.pic,d.dueDate,d.status,d.note]);
    if(result.rowCount!==1)throw new RiskError(403,'Forbidden');
    await event(db,result.rows[0],actorId,'CREATED');
    return one(db,actorId,result.rows[0].id);
  }catch(e){duplicate(e);}
}
export async function updateRiskInTransaction(db,{actorId,id,...input}){
  await permission(db,actorId,'risks:write');
  const d=validateRisk(input,{update:true});
  const before=await lockRisk(db,actorId,id);
  if(before.archived_at)throw new RiskError(409,'Risiko telah diarsipkan');
  if(before.revision!==d.expectedRevision)throw new RiskError(409,'Data risiko berubah. Muat ulang.');
  if(before.risk_code!==d.riskCode)throw new RiskError(400,'Kode risiko permanen');
  if(d.assetId!==before.asset_id)await referencedAsset(db,actorId,d.assetId);
  try{
    const result=await db.query(
      'UPDATE ti_risks SET title=$2,scenario=$3,asset_id=$4,likelihood=$5,impact=$6,'+
      'residual_likelihood=$7,residual_impact=$8,mitigation=$9,pic=$10,due_date=$11::date,'+
      'status=$12,note=$13,updated_by=$14,updated_at=now(),revision=revision+1 '+
      'WHERE id=$1 RETURNING *',
      [id,d.title,d.scenario,d.assetId,d.likelihood,d.impact,d.residualLikelihood,
        d.residualImpact,d.mitigation,d.pic,d.dueDate,d.status,d.note,actorId]);
    await event(db,result.rows[0],actorId,'UPDATED',before);
    return one(db,actorId,id);
  }catch(e){duplicate(e);}
}
export async function archiveRiskInTransaction(db,{actorId,id,expectedRevision}){
  await permission(db,actorId,'risks:write');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    throw new RiskError(400,'Revisi tidak valid');
  const before=await lockRisk(db,actorId,id);
  if(before.archived_at)throw new RiskError(409,'Risiko sudah diarsipkan');
  if(before.revision!==expectedRevision)throw new RiskError(409,'Data risiko berubah. Muat ulang.');
  const r=await db.query('UPDATE ti_risks SET archived_at=now(),revision=revision+1,'+
    'updated_at=now(),updated_by=$2 WHERE id=$1 RETURNING *',[id,actorId]);
  await event(db,r.rows[0],actorId,'ARCHIVED',before);
  return one(db,actorId,id);
}
async function tx(pool,fn){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export const createRisk=(pool,args)=>tx(pool,db=>createRiskInTransaction(db,args));
export const updateRisk=(pool,args)=>tx(pool,db=>updateRiskInTransaction(db,args));
export const archiveRisk=(pool,args)=>tx(pool,db=>archiveRiskInTransaction(db,args));
