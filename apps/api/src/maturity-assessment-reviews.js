import { userHasPermission } from './authorization.js';
import { MaturityError } from './maturity-models.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=value=>typeof value==='string'&&UUID.test(value);
const BAD=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

async function permitted(db,actorId,permission){
  if(!validId(actorId)||!await userHasPermission(db,actorId,permission))
    throw new MaturityError(403,'Forbidden');
}
function validNote(note,required){
  if(typeof note!=='string'||note.length>2000||BAD.test(note)
    ||(required&&note.trim().length<10))
    throw new MaturityError(400,'Invalid maturity review note');
}
export function validateMaturityDecision({decision,note}={}){
  if(!['approve','request_changes'].includes(decision))
    throw new MaturityError(400,'Invalid maturity review decision');
  validNote(note,decision==='request_changes');
  return {decision,note};
}
async function target(db,{actorId,assessmentId,lock=false}){
  if(!validId(assessmentId))throw new MaturityError(400,'Invalid maturity assessment ID');
  const r=await db.query(
    'SELECT a.id,a.owner_user_id,a.model_version_id FROM maturity_assessments a '+
    'JOIN users u ON u.id=$1 AND u.institution_id=a.institution_id '+
    'WHERE a.id=$2 '+(lock?'FOR UPDATE OF a':''),
    [actorId,assessmentId],
  );
  if(r.rowCount!==1)throw new MaturityError(404,'Maturity assessment not found');
  return r.rows[0];
}
async function current(db,assessmentId,lock=false){
  const result=await db.query(
    'SELECT status,submission_cycle,reviewed_by,reviewed_at FROM '+
    'maturity_assessment_review_state WHERE assessment_id=$1 '+
    (lock?'FOR UPDATE':''),
    [assessmentId],
  );
  return result.rows[0]??{status:'in_progress',submission_cycle:0,
    reviewed_by:null,reviewed_at:null};
}
export async function maturityReviewStatus(db,{actorId,assessmentId}){
  await permitted(db,actorId,'assessments:read');
  await target(db,{actorId,assessmentId});
  const data=await current(db,assessmentId);
  return {
    status:data.status,submissionCycle:data.submission_cycle,
    reviewedBy:data.reviewed_by,reviewedAt:data.reviewed_at,
  };
}
export async function assertMaturityEditable(db,assessmentId){
  const value=await current(db,assessmentId);
  if(!['in_progress','changes_requested'].includes(value.status))
    throw new MaturityError(409,'Submitted or approved maturity assessment cannot be changed');
}
export async function submitMaturityAssessmentInTransaction(db,{actorId,assessmentId}){
  if(!validId(assessmentId))throw new MaturityError(400,'Invalid maturity assessment ID');
  await permitted(db,actorId,'assessments:write');
  const a=await target(db,{actorId,assessmentId,lock:true});
  if(a.owner_user_id!==actorId)
    throw new MaturityError(403,'Only the owner can submit maturity assessment');
  const state=await current(db,assessmentId,true);
  if(!['in_progress','changes_requested'].includes(state.status))
    throw new MaturityError(409,'Maturity assessment cannot be submitted in this state');
  const count=await db.query(
    'SELECT (SELECT count(*)::int FROM maturity_domains WHERE version_id=$2) AS total, '+
    '(SELECT count(*)::int FROM maturity_domain_results WHERE assessment_id=$1) AS assessed',
    [assessmentId,a.model_version_id],
  );
  const {total,assessed}=count.rows[0];
  if(total<1||assessed!==total)
    throw new MaturityError(409,'All maturity domains must be rated before submission');
  const cycle=state.submission_cycle+1;
  await db.query(
    'INSERT INTO maturity_assessment_review_state '+
    '(assessment_id,status,submission_cycle,reviewed_by,reviewed_at) '+
    "VALUES($1,'submitted',$2,NULL,NULL) ON CONFLICT(assessment_id) DO UPDATE SET "+
    "status='submitted',submission_cycle=EXCLUDED.submission_cycle,"+
    'reviewed_by=NULL,reviewed_at=NULL',[assessmentId,cycle],
  );
  await db.query(
    "INSERT INTO maturity_assessment_review_events "+
    "(assessment_id,submission_cycle,actor_user_id,action,note) "+
    "VALUES($1,$2,$3,'SUBMITTED','')",[assessmentId,cycle,actorId],
  );
  return {assessmentId,status:'submitted',submissionCycle:cycle};
}
export async function reviewMaturityAssessmentInTransaction(db,{actorId,assessmentId,...input}){
  if(!validId(assessmentId))throw new MaturityError(400,'Invalid maturity assessment ID');
  const {decision,note}=validateMaturityDecision(input);
  await permitted(db,actorId,'assessments:approve');
  const a=await target(db,{actorId,assessmentId,lock:true});
  if(a.owner_user_id===actorId)
    throw new MaturityError(403,'Maker cannot review own maturity assessment');
  const state=await current(db,assessmentId,true);
  if(state.status!=='submitted')
    throw new MaturityError(409,'Only submitted maturity assessments may be reviewed');
  const approved=decision==='approve';
  const status=approved?'approved':'changes_requested';
  const action=approved?'APPROVED':'CHANGES_REQUESTED';
  await db.query(
    'UPDATE maturity_assessment_review_state SET status=$2,reviewed_by=$3,reviewed_at=now() '+
    'WHERE assessment_id=$1',[assessmentId,status,actorId],
  );
  await db.query(
    'INSERT INTO maturity_assessment_review_events '+
    '(assessment_id,submission_cycle,actor_user_id,action,note) '+
    'VALUES($1,$2,$3,$4,$5)',
    [assessmentId,state.submission_cycle,actorId,action,note],
  );
  return {assessmentId,status,submissionCycle:state.submission_cycle,reviewedBy:actorId};
}
export async function listMaturityReviewHistory(db,{actorId,assessmentId}){
  await permitted(db,actorId,'assessments:read');
  await target(db,{actorId,assessmentId});
  const state=await current(db,assessmentId);
  const result=await db.query(
    'SELECT submission_cycle,actor_user_id,action,note,occurred_at '+
    'FROM maturity_assessment_review_events WHERE assessment_id=$1 '+
    'ORDER BY id DESC LIMIT 100',[assessmentId],
  );
  return {assessmentId,status:state.status,submissionCycle:state.submission_cycle,
    events:result.rows};
}
async function transaction(pool,action){
  const db=await pool.connect();
  try{await db.query('BEGIN');const result=await action(db);
    await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export const submitMaturityAssessment=(pool,args)=>
  transaction(pool,db=>submitMaturityAssessmentInTransaction(db,args));
export const reviewMaturityAssessment=(pool,args)=>
  transaction(pool,db=>reviewMaturityAssessmentInTransaction(db,args));
