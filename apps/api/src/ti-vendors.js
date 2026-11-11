import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_-]{1,31}$/;
const CATEGORIES=new Set(['core_banking','infrastructure','cybersecurity','cloud','software','other']);
const CRITICALITIES=new Set(['low','medium','high']);
const VENDOR_STATUSES=new Set(['active','inactive']);
const CONTRACT_STATUSES=new Set(['active','ended']);
const VENDOR_FIELDS=['vendorCode','name','serviceCategory','contactName','contactEmail',
  'contactPhone','ownerPic','criticality','note','status'];
const CONTRACT_FIELDS=['contractCode','serviceName','contractReference','serviceDescription',
  'startDate','endDate','ownerPic','slaUptimeTarget','slaResponseTargetHours','status','note'];
const REVIEW_FIELDS=['periodStart','periodEnd','measuredUptime','measuredResponseHours','summary'];
const vendorSelect='SELECT v.*, '+
  '(SELECT count(*)::int FROM ti_vendor_contracts c WHERE c.vendor_id=v.id AND c.archived_at IS NULL AND c.status=\'active\') AS active_contracts, '+
  '(SELECT count(*)::int FROM ti_vendor_contracts c WHERE c.vendor_id=v.id AND c.archived_at IS NULL AND c.status=\'active\' AND c.end_date<CURRENT_DATE) AS overdue_contracts, '+
  '(SELECT count(*)::int FROM ti_vendor_contracts c WHERE c.vendor_id=v.id AND c.archived_at IS NULL AND c.status=\'active\' AND c.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30) AS expiring_contracts '+
  'FROM ti_vendors v JOIN users u ON u.institution_id=v.institution_id AND u.id=$1 ';
const contractSelect='SELECT c.*,to_char(c.start_date,\'YYYY-MM-DD\') AS start_date,'+
  'to_char(c.end_date,\'YYYY-MM-DD\') AS end_date,'+
  'CASE WHEN c.status=\'ended\' THEN \'ended\' WHEN c.end_date<CURRENT_DATE THEN \'expired\' '+
  'WHEN c.end_date<=CURRENT_DATE+30 THEN \'expiring\' ELSE \'current\' END AS term_state,'+
  '(SELECT count(*)::int FROM ti_vendor_service_reviews r WHERE r.contract_id=c.id) AS review_count '+
  'FROM ti_vendor_contracts c JOIN ti_vendors v ON v.id=c.vendor_id '+
  'JOIN users u ON u.institution_id=c.institution_id AND u.id=$1 ';
export class VendorError extends Error {
  constructor(status,message){super(message);this.name='VendorError';this.status=status;}
}
const isId=x=>typeof x==='string'&&UUID.test(x);
function requireId(x){if(!isId(x))throw new VendorError(400,'ID tidak valid');}
const validText=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max
  &&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const optional=(v,max)=>typeof v==='string'&&v.length<=max
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const date=x=>{
  if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
  const [year,month,day]=x.split('-').map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  return year>=2000&&year<=2100&&d.toISOString().slice(0,10)===x;
};
const decimal=(x,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=max
  &&Math.abs(Math.round(x*100)-x*100)<1e-7;
const metric=(x,max)=>x===null||decimal(x,max);
const revision=x=>Number.isSafeInteger(x)&&x>=1;
function exact(p,keys){
  return p&&typeof p==='object'&&!Array.isArray(p)
    &&Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k));
}
export function validateVendor(p,{update=false}={}){
  const keys=update?[...VENDOR_FIELDS,'expectedRevision']:VENDOR_FIELDS;
  if(!exact(p,keys)||(update&&!revision(p.expectedRevision))
    ||!validText(p.vendorCode,2,32)||!CODE.test(p.vendorCode)
    ||!validText(p.name,3,200)||!CATEGORIES.has(p.serviceCategory)
    ||!optional(p.contactName,120)||!optional(p.contactEmail,254)
    ||(p.contactEmail!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail))
    ||!optional(p.contactPhone,60)||!validText(p.ownerPic,2,120)
    ||!CRITICALITIES.has(p.criticality)||!optional(p.note,2000)
    ||!VENDOR_STATUSES.has(p.status))throw new VendorError(400,'Data penyedia tidak valid');
  return p;
}
export function validateContract(p,{update=false}={}){
  const keys=update?[...CONTRACT_FIELDS,'expectedRevision']:CONTRACT_FIELDS;
  if(!exact(p,keys)||(update&&!revision(p.expectedRevision))
    ||!validText(p.contractCode,2,32)||!CODE.test(p.contractCode)
    ||!validText(p.serviceName,3,200)||!validText(p.contractReference,3,160)
    ||!optional(p.serviceDescription,2000)||!date(p.startDate)||!date(p.endDate)
    ||p.startDate>p.endDate||!validText(p.ownerPic,2,120)
    ||!metric(p.slaUptimeTarget,100)||!metric(p.slaResponseTargetHours,999999.99)
    ||!CONTRACT_STATUSES.has(p.status)||!optional(p.note,2000))
      throw new VendorError(400,'Data kontrak tidak valid');
  if(!update&&p.status!=='active')throw new VendorError(409,'Kontrak baru harus berstatus Aktif');
  return p;
}
export function assessSla({uptimeTarget,responseTarget,uptime,response}){
  if(uptimeTarget===null&&responseTarget===null)return 'not_assessed';
  if((uptimeTarget!==null&&uptime===null)||(responseTarget!==null&&response===null))
    return 'not_assessed';
  if((uptimeTarget!==null&&uptime<uptimeTarget)
    ||(responseTarget!==null&&response>responseTarget))return 'below_targets';
  return 'meets_targets';
}
export function validateServiceReview(p){
  if(!exact(p,REVIEW_FIELDS)||!date(p.periodStart)||!date(p.periodEnd)
    ||p.periodStart>p.periodEnd||!metric(p.measuredUptime,100)
    ||!metric(p.measuredResponseHours,999999.99)
    ||!validText(p.summary,10,2000))throw new VendorError(400,'Evaluasi layanan tidak valid');
  return p;
}
async function permission(db,actorId,code){
  requireId(actorId);
  if(!await userHasPermission(db,actorId,code))throw new VendorError(403,'Forbidden');
}
function collision(e){
  if(e.code==='23505')throw new VendorError(409,'Kode sudah digunakan');
  if(e.code==='23503')throw new VendorError(409,'Referensi tidak tersedia');
  throw e;
}
const snapshot=r=>Object.fromEntries(Object.entries(r)
  .filter(([key])=>!['institution_id','created_by','updated_by'].includes(key)));
async function event(db,row,actorId,action,old=null,isContract=false){
  const vendorId=isContract?row.vendor_id:row.id;
  await db.query('INSERT INTO ti_vendor_change_events(institution_id,vendor_id,contract_id,'+
    'actor_user_id,action,revision,previous_values,current_values) VALUES('+
    '$1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',[
    row.institution_id,vendorId,isContract?row.id:null,actorId,action,row.revision,
    old?JSON.stringify(snapshot(old)):null,JSON.stringify(snapshot(row)),
  ]);
}
async function oneVendor(db,actorId,id){
  const r=await db.query(vendorSelect+'WHERE v.id=$2',[actorId,id]);
  if(r.rowCount!==1)throw new VendorError(404,'Penyedia tidak ditemukan');
  return r.rows[0];
}
export async function getVendor(db,{actorId,id}){
  await permission(db,actorId,'vendors:read');requireId(id);
  return oneVendor(db,actorId,id);
}
export async function listVendors(db,{actorId,q='',view='active',category='all',status='all',offset=0}){
  await permission(db,actorId,'vendors:read');
  if(typeof q!=='string'||q.length>80||!['active','archived','all'].includes(view)
    ||!(category==='all'||CATEGORIES.has(category))
    ||!(status==='all'||VENDOR_STATUSES.has(status))
    ||!Number.isSafeInteger(offset)||offset<0||offset>10000)
    throw new VendorError(400,'Filter penyedia tidak valid');
  const args=[actorId],where=['u.id=$1'];
  if(q.trim()){
    args.push(q.trim());const p='$'+args.length;
    where.push('(position(lower('+p+') in lower(v.vendor_code))>0 OR '+
      'position(lower('+p+') in lower(v.name))>0 OR '+
      'position(lower('+p+') in lower(v.owner_pic))>0)');
  }
  if(view!=='all')where.push(view==='archived'?'v.archived_at IS NOT NULL':'v.archived_at IS NULL');
  if(category!=='all'){args.push(category);where.push('v.service_category=$'+args.length);}
  if(status!=='all'){args.push(status);where.push('v.status=$'+args.length);}
  args.push(offset);
  const r=await db.query(vendorSelect+'WHERE '+where.join(' AND ')+
    ' ORDER BY v.updated_at DESC,v.id DESC LIMIT 51 OFFSET $'+args.length,args);
  return {vendors:r.rows.slice(0,50),hasMore:r.rowCount>50,offset};
}
async function lockVendor(db,actorId,id){
  requireId(id);
  const r=await db.query('SELECT v.* FROM ti_vendors v JOIN users u '+
    'ON u.institution_id=v.institution_id AND u.id=$1 WHERE v.id=$2 FOR UPDATE OF v',
    [actorId,id]);
  if(r.rowCount!==1)throw new VendorError(404,'Penyedia tidak ditemukan');
  return r.rows[0];
}
export async function createVendorInTransaction(db,{actorId,...payload}){
  await permission(db,actorId,'vendors:write');
  const d=validateVendor(payload);
  try{
    const r=await db.query('INSERT INTO ti_vendors(institution_id,vendor_code,name,'+
      'service_category,contact_name,contact_email,contact_phone,owner_pic,criticality,'+
      'note,status,created_by,updated_by) SELECT u.institution_id,$2,$3,$4,$5,$6,'+
      "$7,$8,$9,$10,$11,u.id,u.id FROM users u WHERE u.id=$1 AND u.status='active' "+
      'AND u.password_hash IS NOT NULL RETURNING *',
      [actorId,d.vendorCode,d.name,d.serviceCategory,d.contactName,d.contactEmail,
        d.contactPhone,d.ownerPic,d.criticality,d.note,d.status]);
    if(r.rowCount!==1)throw new VendorError(403,'Forbidden');
    await event(db,r.rows[0],actorId,'VENDOR_CREATED');
    return oneVendor(db,actorId,r.rows[0].id);
  }catch(error){collision(error);}
}
export async function updateVendorInTransaction(db,{actorId,id,...payload}){
  await permission(db,actorId,'vendors:write');const d=validateVendor(payload,{update:true});
  const before=await lockVendor(db,actorId,id);
  if(before.archived_at)throw new VendorError(409,'Penyedia telah diarsipkan');
  if(before.revision!==d.expectedRevision)throw new VendorError(409,'Data telah berubah. Muat ulang.');
  if(before.vendor_code!==d.vendorCode)throw new VendorError(400,'Kode penyedia tidak dapat diubah');
  if(d.status==='inactive'){
    const active=await db.query('SELECT 1 FROM ti_vendor_contracts WHERE vendor_id=$1 '+
      "AND archived_at IS NULL AND status='active' LIMIT 1",[id]);
    if(active.rowCount)throw new VendorError(409,'Akhiri kontrak aktif sebelum menonaktifkan penyedia');
  }
  const r=await db.query('UPDATE ti_vendors SET name=$2,service_category=$3,'+
    'contact_name=$4,contact_email=$5,contact_phone=$6,owner_pic=$7,criticality=$8,'+
    'note=$9,status=$10,revision=revision+1,updated_by=$11,updated_at=now() '+
    'WHERE id=$1 RETURNING *',
    [id,d.name,d.serviceCategory,d.contactName,d.contactEmail,d.contactPhone,
      d.ownerPic,d.criticality,d.note,d.status,actorId]);
  await event(db,r.rows[0],actorId,'VENDOR_UPDATED',before);
  return oneVendor(db,actorId,id);
}
export async function archiveVendorInTransaction(db,{actorId,id,expectedRevision}){
  await permission(db,actorId,'vendors:write');
  if(!revision(expectedRevision))throw new VendorError(400,'Revisi tidak valid');
  const before=await lockVendor(db,actorId,id);
  if(before.archived_at)throw new VendorError(409,'Penyedia sudah diarsipkan');
  if(before.revision!==expectedRevision)throw new VendorError(409,'Data telah berubah. Muat ulang.');
  const active=await db.query('SELECT 1 FROM ti_vendor_contracts WHERE vendor_id=$1 '+
    "AND archived_at IS NULL AND status='active' LIMIT 1",[id]);
  if(active.rowCount)throw new VendorError(409,'Akhiri kontrak aktif sebelum mengarsipkan penyedia');
  const r=await db.query('UPDATE ti_vendors SET archived_at=now(),status=\'inactive\','+
    'revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,actorId]);
  await event(db,r.rows[0],actorId,'VENDOR_ARCHIVED',before);
  return oneVendor(db,actorId,id);
}
export async function vendorHistory(db,{actorId,id}){
  await getVendor(db,{actorId,id});
  const r=await db.query('SELECT e.id,e.contract_id,e.actor_user_id,e.action,'+
    'e.revision,e.previous_values,e.current_values,e.occurred_at FROM ti_vendor_change_events e '+
    'JOIN ti_vendors v ON v.id=e.vendor_id JOIN users u '+
    'ON u.institution_id=v.institution_id AND u.id=$1 WHERE e.vendor_id=$2 '+
    'ORDER BY e.id DESC LIMIT 150',[actorId,id]);
  return {events:r.rows};
}
async function oneContract(db,actorId,vendorId,id){
  const r=await db.query(contractSelect+'WHERE c.vendor_id=$2 AND c.id=$3',
    [actorId,vendorId,id]);
  if(r.rowCount!==1)throw new VendorError(404,'Kontrak tidak ditemukan');
  return r.rows[0];
}
export async function listContracts(db,{actorId,vendorId}){
  await permission(db,actorId,'vendors:read');requireId(vendorId);
  await oneVendor(db,actorId,vendorId);
  const r=await db.query(contractSelect+'WHERE c.vendor_id=$2 '+
    'ORDER BY c.archived_at NULLS FIRST,c.end_date ASC,c.id LIMIT 101',[actorId,vendorId]);
  return {contracts:r.rows.slice(0,100),truncated:r.rowCount>100};
}
export async function getContract(db,{actorId,vendorId,id}){
  await permission(db,actorId,'vendors:read');requireId(vendorId);requireId(id);
  return oneContract(db,actorId,vendorId,id);
}
async function lockContract(db,actorId,vendorId,id){
  requireId(vendorId);requireId(id);
  const r=await db.query('SELECT c.* FROM ti_vendor_contracts c JOIN users u '+
    'ON u.institution_id=c.institution_id AND u.id=$1 WHERE c.vendor_id=$2 '+
    'AND c.id=$3 FOR UPDATE OF c',[actorId,vendorId,id]);
  if(r.rowCount!==1)throw new VendorError(404,'Kontrak tidak ditemukan');
  return r.rows[0];
}
export async function createContractInTransaction(db,{actorId,vendorId,...payload}){
  await permission(db,actorId,'vendors:write');
  const d=validateContract(payload);
  const vendor=await lockVendor(db,actorId,vendorId);
  if(vendor.archived_at||vendor.status!=='active')
    throw new VendorError(409,'Penyedia harus aktif untuk membuat kontrak');
  try{
    const r=await db.query('INSERT INTO ti_vendor_contracts(institution_id,vendor_id,'+
      'contract_code,service_name,contract_reference,service_description,start_date,end_date,'+
      'owner_pic,sla_uptime_target,sla_response_target_hours,status,note,created_by,updated_by) '+
      'VALUES($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,$12,$13,$14,$14) RETURNING *',
      [vendor.institution_id,vendorId,d.contractCode,d.serviceName,d.contractReference,
        d.serviceDescription,d.startDate,d.endDate,d.ownerPic,d.slaUptimeTarget,
        d.slaResponseTargetHours,d.status,d.note,actorId]);
    await event(db,r.rows[0],actorId,'CONTRACT_CREATED',null,true);
    return oneContract(db,actorId,vendorId,r.rows[0].id);
  }catch(error){collision(error);}
}
export async function updateContractInTransaction(db,{actorId,vendorId,id,...payload}){
  await permission(db,actorId,'vendors:write');
  const d=validateContract(payload,{update:true});
  const vendor=await lockVendor(db,actorId,vendorId);
  if(vendor.archived_at)throw new VendorError(409,'Penyedia telah diarsipkan');
  const before=await lockContract(db,actorId,vendorId,id);
  if(before.archived_at)throw new VendorError(409,'Kontrak telah diarsipkan');
  if(before.revision!==d.expectedRevision)throw new VendorError(409,'Data telah berubah. Muat ulang.');
  if(before.contract_code!==d.contractCode)throw new VendorError(400,'Kode kontrak permanen');
  const count=await db.query('SELECT 1 FROM ti_vendor_service_reviews WHERE contract_id=$1 LIMIT 1',[id]);
  if(count.rowCount&&(before.start_date.toISOString().slice(0,10)!==d.startDate
    ||before.end_date.toISOString().slice(0,10)!==d.endDate
    ||(before.sla_uptime_target===null?null:Number(before.sla_uptime_target))!==d.slaUptimeTarget
    ||(before.sla_response_target_hours===null?null:Number(before.sla_response_target_hours))!==d.slaResponseTargetHours))
    throw new VendorError(409,'Tanggal dan target SLA tidak dapat diubah setelah evaluasi tercatat');
  if(before.status==='ended'&&d.status==='active')
    throw new VendorError(409,'Kontrak yang telah diakhiri tidak dapat diaktifkan kembali');
  const r=await db.query('UPDATE ti_vendor_contracts SET service_name=$2,contract_reference=$3,'+
    'service_description=$4,start_date=$5::date,end_date=$6::date,owner_pic=$7,'+
    'sla_uptime_target=$8,sla_response_target_hours=$9,status=$10,note=$11,'+
    'updated_by=$12,updated_at=now(),revision=revision+1 WHERE id=$1 RETURNING *',
    [id,d.serviceName,d.contractReference,d.serviceDescription,d.startDate,d.endDate,
      d.ownerPic,d.slaUptimeTarget,d.slaResponseTargetHours,d.status,d.note,actorId]);
  await event(db,r.rows[0],actorId,'CONTRACT_UPDATED',before,true);
  return oneContract(db,actorId,vendorId,id);
}
export async function archiveContractInTransaction(db,{actorId,vendorId,id,expectedRevision}){
  await permission(db,actorId,'vendors:write');
  if(!revision(expectedRevision))throw new VendorError(400,'Revisi tidak valid');
  await lockVendor(db,actorId,vendorId);
  const before=await lockContract(db,actorId,vendorId,id);
  if(before.archived_at||before.status!=='ended')
    throw new VendorError(409,'Hanya kontrak yang sudah diakhiri dapat diarsipkan');
  if(before.revision!==expectedRevision)throw new VendorError(409,'Data telah berubah. Muat ulang.');
  const r=await db.query('UPDATE ti_vendor_contracts SET archived_at=now(),revision=revision+1,'+
    'updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,actorId]);
  await event(db,r.rows[0],actorId,'CONTRACT_ARCHIVED',before,true);
  return oneContract(db,actorId,vendorId,id);
}
export async function listServiceReviews(db,{actorId,vendorId,contractId}){
  await permission(db,actorId,'vendors:read');
  requireId(vendorId);requireId(contractId);
  await oneContract(db,actorId,vendorId,contractId);
  const r=await db.query('SELECT r.id,r.vendor_id,r.contract_id,'+
    'to_char(r.period_start,\'YYYY-MM-DD\') AS period_start,'+
    'to_char(r.period_end,\'YYYY-MM-DD\') AS period_end,'+
    'r.measured_uptime,r.measured_response_hours,r.sla_result,r.summary,'+
    'r.reviewed_by,r.recorded_at FROM ti_vendor_service_reviews r '+
    'WHERE r.contract_id=$1 ORDER BY r.recorded_at DESC,r.id DESC LIMIT 101',[contractId]);
  return {reviews:r.rows.slice(0,100),truncated:r.rowCount>100};
}
export async function addServiceReviewInTransaction(db,{actorId,vendorId,contractId,...payload}){
  await permission(db,actorId,'vendors:write');
  const d=validateServiceReview(payload);
  const vendor=await lockVendor(db,actorId,vendorId);
  if(vendor.archived_at)throw new VendorError(409,'Penyedia telah diarsipkan');
  const c=await lockContract(db,actorId,vendorId,contractId);
  if(c.archived_at)throw new VendorError(409,'Kontrak telah diarsipkan');
  if(d.periodStart<c.start_date.toISOString().slice(0,10)
    ||d.periodEnd>c.end_date.toISOString().slice(0,10)
    ||d.periodEnd>new Date().toISOString().slice(0,10))
    throw new VendorError(409,'Periode evaluasi harus sudah berlalu dan berada dalam masa kontrak');
  if((c.sla_uptime_target===null&&d.measuredUptime!==null)
    ||(c.sla_response_target_hours===null&&d.measuredResponseHours!==null))
    throw new VendorError(400,'Realisasi hanya dapat diisi bila target SLA tercantum di kontrak');
  const outcome=assessSla({
    uptimeTarget:c.sla_uptime_target===null?null:Number(c.sla_uptime_target),
    responseTarget:c.sla_response_target_hours===null?null:Number(c.sla_response_target_hours),
    uptime:d.measuredUptime,response:d.measuredResponseHours,
  });
  const r=await db.query('INSERT INTO ti_vendor_service_reviews(vendor_id,contract_id,'+
    'period_start,period_end,measured_uptime,measured_response_hours,sla_result,'+
    'summary,reviewed_by) VALUES($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9) '+
    'RETURNING id,sla_result',[vendorId,contractId,d.periodStart,d.periodEnd,
      d.measuredUptime,d.measuredResponseHours,outcome,d.summary,actorId]);
  return {id:r.rows[0].id,slaResult:r.rows[0].sla_result};
}
async function transaction(pool,fn){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');const result=await fn(db);
    await db.query('COMMIT');return result;
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export const createVendor=(pool,args)=>transaction(pool,db=>createVendorInTransaction(db,args));
export const updateVendor=(pool,args)=>transaction(pool,db=>updateVendorInTransaction(db,args));
export const archiveVendor=(pool,args)=>transaction(pool,db=>archiveVendorInTransaction(db,args));
export const createContract=(pool,args)=>transaction(pool,db=>createContractInTransaction(db,args));
export const updateContract=(pool,args)=>transaction(pool,db=>updateContractInTransaction(db,args));
export const archiveContract=(pool,args)=>transaction(pool,db=>archiveContractInTransaction(db,args));
export const addServiceReview=(pool,args)=>transaction(pool,db=>addServiceReviewInTransaction(db,args));
