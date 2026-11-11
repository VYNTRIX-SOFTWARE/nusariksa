import {userHasPermission} from './authorization.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_-]{1,31}$/;
const FIELDS=['planCode','serviceName','scenario','businessImpact','activationCriteria',
  'ownerPic','alternatePic','rtoMinutes','rpoMinutes','recoverySteps',
  'communicationSteps','dependencies','backupReference','evidenceLocation','status'];
const EXERCISE=['exerciseDate','exerciseType','observedRtoMinutes','observedRpoMinutes',
  'outcome','summary','followUp','evidenceReference'];
export class RecoveryError extends Error{
  constructor(status,message){super(message);this.status=status;this.name='RecoveryError';}
}
const exact=(p,keys)=>p&&typeof p==='object'&&!Array.isArray(p)
 &&Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k));
const text=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max
 &&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v);
const narrative=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max&&v.trim()===v&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const optional=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const minutes=v=>v===null||(Number.isSafeInteger(v)&&v>=0&&v<=525600);
const validId=id=>typeof id==='string'&&UUID.test(id);
const checkId=id=>{if(!validId(id))throw new RecoveryError(400,'ID tidak valid');};
const rev=v=>Number.isSafeInteger(v)&&v>=1;
const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [y,m,d]=v.split('-').map(Number);const a=new Date(Date.UTC(y,m-1,d));
  return y>=2000&&y<=2100&&a.toISOString().slice(0,10)===v;};
export function validatePlan(p,{update=false}={}){
 if(!exact(p,update?[...FIELDS,'expectedRevision']:FIELDS)
  ||(update&&!rev(p.expectedRevision))||!text(p.planCode,2,32)||!CODE.test(p.planCode)
  ||!text(p.serviceName,3,200)||!narrative(p.scenario,10,2000)
  ||!narrative(p.businessImpact,10,2000)||!narrative(p.activationCriteria,10,2000)
  ||!text(p.ownerPic,2,120)||!optional(p.alternatePic,120)
  ||!minutes(p.rtoMinutes)||!minutes(p.rpoMinutes)
  ||!narrative(p.recoverySteps,10,10000)||!optional(p.communicationSteps,4000)
  ||!optional(p.dependencies,4000)||!optional(p.backupReference,2000)
  ||!optional(p.evidenceLocation,2000)||!['draft','maintained'].includes(p.status))
   throw new RecoveryError(400,'Data rencana pemulihan tidak valid');
 return p;
}
export function validateExercise(p){
 if(!exact(p,EXERCISE)||!date(p.exerciseDate)
  ||p.exerciseDate>new Date().toISOString().slice(0,10)
  ||!['tabletop','technical','restore'].includes(p.exerciseType)
  ||!minutes(p.observedRtoMinutes)||!minutes(p.observedRpoMinutes)
  ||!['not_assessed','passed','partial','failed'].includes(p.outcome)
  ||!narrative(p.summary,10,4000)||!optional(p.followUp,4000)
  ||!optional(p.evidenceReference,2000))
    throw new RecoveryError(400,'Data pengujian tidak valid');
 if(p.outcome==='passed'&&(!p.evidenceReference.trim()||p.observedRtoMinutes===null))
   throw new RecoveryError(400,'Hasil berhasil memerlukan bukti dan waktu pemulihan terukur');
 return p;
}
async function permit(db,actorId,code){checkId(actorId);
 if(!await userHasPermission(db,actorId,code))throw new RecoveryError(403,'Forbidden');}
async function one(db,actorId,id,{lock=false}={}){
 checkId(id);
 const q='SELECT p.* FROM ti_recovery_plans p JOIN users u ON u.institution_id=p.institution_id AND u.id=$1 WHERE p.id=$2'+(lock?' FOR UPDATE OF p':'');
 const r=await db.query(q,[actorId,id]);
 if(r.rowCount!==1)throw new RecoveryError(404,'Rencana tidak ditemukan');
 return r.rows[0];
}
const snapshot=r=>Object.fromEntries(Object.entries(r)
 .filter(([k])=>!['institution_id','created_by','updated_by'].includes(k)));
async function event(db,p,actorId,action,before){
 await db.query('INSERT INTO ti_recovery_change_events(institution_id,plan_id,actor_user_id,action,revision,previous_values,current_values) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
 [p.institution_id,p.id,actorId,action,p.revision,before?JSON.stringify(snapshot(before)):null,JSON.stringify(snapshot(p))]);
}
export async function listRecoveryPlans(db,{actorId,view='active',q='',offset=0}){
 await permit(db,actorId,'recovery:read');
 if(!['active','archived','all'].includes(view)||typeof q!=='string'||q.length>80||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new RecoveryError(400,'Filter tidak valid');
 const args=[actorId];let where='u.id=$1';
 if(view!=='all')where+=' AND p.archived_at IS '+(view==='active'?'NULL':'NOT NULL');
 if(q.trim()){args.push(q.trim());const key='$'+args.length;
 where+=' AND (position(lower('+key+') in lower(p.plan_code))>0 OR position(lower('+key+') in lower(p.service_name))>0)';}
 args.push(offset);
 const r=await db.query('SELECT p.*, (SELECT count(*)::int FROM ti_recovery_exercises x WHERE x.plan_id=p.id) AS exercise_count FROM ti_recovery_plans p JOIN users u ON u.institution_id=p.institution_id WHERE '+where+' ORDER BY p.updated_at DESC,p.id DESC LIMIT 51 OFFSET $'+args.length,args);
 return {plans:r.rows.slice(0,50),hasMore:r.rowCount>50,offset};
}
export async function getRecoveryPlan(db,{actorId,id}){
 await permit(db,actorId,'recovery:read');return one(db,actorId,id);
}
export async function createRecoveryPlanInTransaction(db,{actorId,...payload}){
 await permit(db,actorId,'recovery:write');const p=validatePlan(payload);
 const keys=FIELDS.map(x=>({planCode:'plan_code',serviceName:'service_name',businessImpact:'business_impact',activationCriteria:'activation_criteria',ownerPic:'owner_pic',alternatePic:'alternate_pic',rtoMinutes:'rto_minutes',rpoMinutes:'rpo_minutes',recoverySteps:'recovery_steps',communicationSteps:'communication_steps',backupReference:'backup_reference',evidenceLocation:'evidence_location'}[x]??x));
 const values=FIELDS.map(k=>p[k]);
 try{
  const r=await db.query('INSERT INTO ti_recovery_plans(institution_id,'+keys.join(',')+',created_by,updated_by) SELECT u.institution_id,'+keys.map((_,i)=>'$'+(i+2)).join(',')+',u.id,u.id FROM users u WHERE u.id=$1 AND u.status=\'active\' AND u.password_hash IS NOT NULL RETURNING *',[actorId,...values]);
  if(r.rowCount!==1)throw new RecoveryError(403,'Forbidden');
  await event(db,r.rows[0],actorId,'CREATED',null);return r.rows[0];
 }catch(e){if(e.code==='23505')throw new RecoveryError(409,'Kode sudah dipakai');throw e;}
}
export async function updateRecoveryPlanInTransaction(db,{actorId,id,...payload}){
 await permit(db,actorId,'recovery:write');const p=validatePlan(payload,{update:true});
 const before=await one(db,actorId,id,{lock:true});
 if(before.archived_at)throw new RecoveryError(409,'Rencana telah diarsipkan');
 if(before.revision!==p.expectedRevision)throw new RecoveryError(409,'Data telah berubah. Muat ulang.');
 if(before.plan_code!==p.planCode)throw new RecoveryError(400,'Kode rencana tidak dapat diganti');
 const keys=FIELDS.slice(1).map(x=>({serviceName:'service_name',businessImpact:'business_impact',activationCriteria:'activation_criteria',ownerPic:'owner_pic',alternatePic:'alternate_pic',rtoMinutes:'rto_minutes',rpoMinutes:'rpo_minutes',recoverySteps:'recovery_steps',communicationSteps:'communication_steps',backupReference:'backup_reference',evidenceLocation:'evidence_location'}[x]??x));
 const r=await db.query('UPDATE ti_recovery_plans SET '+keys.map((key,i)=>key+'=$'+(i+2)).join(',')+',revision=revision+1,updated_by=$'+(keys.length+2)+',updated_at=now() WHERE id=$1 RETURNING *',[id,...FIELDS.slice(1).map(k=>p[k]),actorId]);
 await event(db,r.rows[0],actorId,'UPDATED',before);return r.rows[0];
}
export async function archiveRecoveryPlanInTransaction(db,{actorId,id,expectedRevision}){
 await permit(db,actorId,'recovery:write');if(!rev(expectedRevision))throw new RecoveryError(400,'Revisi tidak valid');
 const before=await one(db,actorId,id,{lock:true});
 if(before.archived_at||before.revision!==expectedRevision)throw new RecoveryError(409,'Rencana sudah berubah atau diarsipkan');
 const r=await db.query('UPDATE ti_recovery_plans SET archived_at=now(),revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *',[id,actorId]);
 await event(db,r.rows[0],actorId,'ARCHIVED',before);return r.rows[0];
}
export async function recoveryHistory(db,{actorId,id}){
 await getRecoveryPlan(db,{actorId,id});
 const r=await db.query('SELECT e.* FROM ti_recovery_change_events e WHERE e.plan_id=$1 ORDER BY e.id DESC LIMIT 150',[id]);
 return {events:r.rows};
}
export async function listRecoveryExercises(db,{actorId,id}){
 await getRecoveryPlan(db,{actorId,id});
 const r=await db.query("SELECT x.*,to_char(x.exercise_date,'YYYY-MM-DD') AS exercise_date FROM ti_recovery_exercises x WHERE x.plan_id=$1 ORDER BY x.recorded_at DESC,x.id DESC LIMIT 101",[id]);
 return {exercises:r.rows.slice(0,100),truncated:r.rowCount>100};
}
export async function addRecoveryExerciseInTransaction(db,{actorId,id,...payload}){
 await permit(db,actorId,'recovery:write');const e=validateExercise(payload);
 const p=await one(db,actorId,id,{lock:true});
 if(p.archived_at)throw new RecoveryError(409,'Rencana telah diarsipkan');
 if(e.outcome==='passed'&&p.rpo_minutes!==null&&e.observedRpoMinutes===null)
   throw new RecoveryError(409,'Hasil berhasil memerlukan RPO aktual jika target tersedia');
 if(e.outcome==='passed'&&p.rto_minutes!==null&&e.observedRtoMinutes>p.rto_minutes)
   throw new RecoveryError(409,'Waktu pemulihan melebihi target RTO; hasil berhasil tidak sesuai');
 if(e.outcome==='passed'&&p.rpo_minutes!==null&&e.observedRpoMinutes!==null&&e.observedRpoMinutes>p.rpo_minutes)
   throw new RecoveryError(409,'Kehilangan data melebihi target RPO; hasil berhasil tidak sesuai');
 const r=await db.query('INSERT INTO ti_recovery_exercises(institution_id,plan_id,plan_revision,exercise_date,exercise_type,observed_rto_minutes,observed_rpo_minutes,outcome,summary,follow_up,evidence_reference,recorded_by) VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',[p.institution_id,id,p.revision,e.exerciseDate,e.exerciseType,e.observedRtoMinutes,e.observedRpoMinutes,e.outcome,e.summary,e.followUp,e.evidenceReference,actorId]);
 return {id:r.rows[0].id,planRevision:p.revision};
}
async function tx(pool,fn){const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}}
export const createRecoveryPlan=(pool,args)=>tx(pool,db=>createRecoveryPlanInTransaction(db,args));
export const updateRecoveryPlan=(pool,args)=>tx(pool,db=>updateRecoveryPlanInTransaction(db,args));
export const archiveRecoveryPlan=(pool,args)=>tx(pool,db=>archiveRecoveryPlanInTransaction(db,args));
export const addRecoveryExercise=(pool,args)=>tx(pool,db=>addRecoveryExerciseInTransaction(db,args));
