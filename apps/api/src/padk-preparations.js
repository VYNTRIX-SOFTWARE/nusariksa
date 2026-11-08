import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const INVALID=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const source='43/PADK.03/2025:LAMPIRAN_IV';

export class PadkPreparationError extends Error{
  constructor(status,message){super(message);this.name='PadkPreparationError';this.status=status;}
}
const fail=(status,message)=>{throw new PadkPreparationError(status,message);};
const validId=value=>typeof value==='string'&&UUID.test(value);
function date(value){
  if(typeof value!=='string'||!DATE.test(value)
    ||value<'1900-01-01'||value>'2100-12-31')return false;
  const d=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
const notes=value=>typeof value==='string'&&value.length<=4000&&!INVALID.test(value);
export function validatePadkPreparation({title,category,periodStart,periodEnd}={}){
  if(typeof title!=='string'||title!==title.trim()
    ||title.length<3||title.length>200||INVALID.test(title)
    ||![1,2].includes(category)||!date(periodStart)||!date(periodEnd)
    ||periodEnd<periodStart)fail(400,'Invalid preparation');
  return {title,category,periodStart,periodEnd};
}
export function validatePadkPreparationNotes({preparationNotes,evidencePlan,expectedRevision}={}){
  if(!notes(preparationNotes)||!notes(evidencePlan)
    ||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    fail(400,'Invalid preparation notes or revision');
  return {preparationNotes,evidencePlan,expectedRevision};
}
async function permitted(db,actorId,permission){
  if(!validId(actorId)||!await userHasPermission(db,actorId,permission))
    fail(403,'Forbidden');
}
async function inTransaction(pool,handler){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await handler(db);
    await db.query('COMMIT');
    return result;
  }catch(error){
    await db.query('ROLLBACK');
    throw error;
  }finally{db.release();}
}
const dateString=value=>value instanceof Date?value.toISOString().slice(0,10):value;
function record(row){
  return {
    id:row.id,title:row.title,category:row.category,
    periodStart:dateString(row.period_start),periodEnd:dateString(row.period_end),
    ownerUserId:row.owner_user_id,revision:row.revision,
    preparationNotes:row.preparation_notes,evidencePlan:row.evidence_plan,
    createdAt:row.created_at,updatedAt:row.updated_at,
    status:'PREPARATION_ONLY',regulatoryReference:source,
    scoringAvailable:false,submissionAvailable:false,finalReportAvailable:false,
  };
}
export async function listPadkPreparations(db,{actorId}){
  await permitted(db,actorId,'assessments:read');
  const result=await db.query(
    'SELECT p.* FROM padk_assessment_preparations p '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'ORDER BY p.created_at DESC,p.id DESC LIMIT 50',[actorId],
  );
  return {preparations:result.rows.map(record),regulatoryPackReady:false};
}
export async function getPadkPreparation(db,{actorId,id}){
  if(!validId(id))fail(400,'Invalid preparation ID');
  await permitted(db,actorId,'assessments:read');
  const result=await db.query(
    'SELECT p.* FROM padk_assessment_preparations p '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'WHERE p.id=$2',[actorId,id],
  );
  if(result.rowCount!==1)fail(404,'Preparation not found');
  return record(result.rows[0]);
}
export async function createPadkPreparationInTransaction(db,{actorId,...input}){
  const data=validatePadkPreparation(input);
  await permitted(db,actorId,'assessments:write');
  const actor=await db.query(
    "SELECT institution_id FROM users WHERE id=$1 AND status='active'",[actorId],
  );
  if(actor.rowCount!==1)fail(403,'Forbidden');
  const result=await db.query(
    'INSERT INTO padk_assessment_preparations '+
    '(institution_id,owner_user_id,title,category,period_start,period_end) '+
    'VALUES($1,$2,$3,$4,$5::date,$6::date) RETURNING *',
    [actor.rows[0].institution_id,actorId,data.title,data.category,
      data.periodStart,data.periodEnd],
  );
  const row=result.rows[0];
  await db.query(
    'INSERT INTO padk_assessment_preparation_events '+
    '(preparation_id,revision,action,actor_user_id,preparation_notes,evidence_plan) '+
    "VALUES($1,$2,'CREATED',$3,$4,$5)",
    [row.id,row.revision,actorId,row.preparation_notes,row.evidence_plan],
  );
  return record(row);
}
export function createPadkPreparation(pool,args){
  return inTransaction(pool,db=>createPadkPreparationInTransaction(db,args));
}
export async function savePadkPreparationInTransaction(db,{actorId,id,...input}){
  if(!validId(id))fail(400,'Invalid preparation ID');
  const data=validatePadkPreparationNotes(input);
  await permitted(db,actorId,'assessments:write');
  const target=await db.query(
    'SELECT p.id,p.revision,p.owner_user_id FROM padk_assessment_preparations p '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'WHERE p.id=$2 FOR UPDATE OF p',[actorId,id],
  );
  if(target.rowCount!==1)fail(404,'Preparation not found');
  if(target.rows[0].owner_user_id!==actorId)fail(403,'Only the maker can edit preparation');
  const review=await db.query('SELECT status FROM padk_draft_review_state WHERE preparation_id=$1',[id]);
  if(['submitted','draft_accepted'].includes(review.rows[0]?.status))
    fail(409,'Draft preparation is locked during review');
  if(target.rows[0].revision!==data.expectedRevision)
    fail(409,'Preparation changed; reload before saving');
  const updated=await db.query(
    'UPDATE padk_assessment_preparations SET preparation_notes=$2,'+
    'evidence_plan=$3,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',
    [id,data.preparationNotes,data.evidencePlan],
  );
  const row=updated.rows[0];
  await db.query(
    'INSERT INTO padk_assessment_preparation_events '+
    '(preparation_id,revision,action,actor_user_id,preparation_notes,evidence_plan) '+
    "VALUES($1,$2,'UPDATED',$3,$4,$5)",
    [id,row.revision,actorId,row.preparation_notes,row.evidence_plan],
  );
  return record(row);
}
export function savePadkPreparation(pool,args){
  return inTransaction(pool,db=>savePadkPreparationInTransaction(db,args));
}
export async function historyPadkPreparation(db,{actorId,id}){
  await getPadkPreparation(db,{actorId,id});
  const rows=await db.query(
    'SELECT revision,action,actor_user_id,preparation_notes,evidence_plan,occurred_at '+
    'FROM padk_assessment_preparation_events WHERE preparation_id=$1 ORDER BY revision DESC',
    [id],
  );
  return {id,events:rows.rows};
}
