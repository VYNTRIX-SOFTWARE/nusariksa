import {userHasPermission} from './authorization.js';
import {PadkPreparationError} from './padk-preparations.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BAD=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fail=(code,message)=>{throw new PadkPreparationError(code,message);};
const validId=x=>typeof x==='string'&&UUID.test(x);
const available=(status)=>['in_progress','changes_requested'].includes(status);
const record=x=>({status:x?.status??'in_progress',
  submissionCycle:Number(x?.submission_cycle??0),reviewedBy:x?.reviewed_by??null,
  reviewedAt:x?.reviewed_at??null,officialApprovalAvailable:false,
  regulatoryPackVerified:false,finalReportAvailable:false});
async function permission(db,userId,p){
  if(!validId(userId)||!await userHasPermission(db,userId,p))fail(403,'Forbidden');
}
async function scoped(db,{actorId,id,lock=false}){
  if(!validId(id))fail(400,'Invalid PADK preparation ID');
  const data=await db.query(
    'SELECT p.id,p.category,p.owner_user_id FROM padk_assessment_preparations p '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'WHERE p.id=$2 '+(lock?'FOR UPDATE OF p':''),[actorId,id],
  );
  if(data.rowCount!==1)fail(404,'PADK preparation not found');
  return data.rows[0];
}
async function current(db,id){
  const q=await db.query(
    'SELECT status,submission_cycle,reviewed_by,reviewed_at FROM padk_draft_review_state '+
    'WHERE preparation_id=$1',[id],
  );
  return record(q.rows[0]);
}
export function validatePadkDraftDecision(body){
  if(!body||typeof body!=='object'||Array.isArray(body)
    ||Object.keys(body).length!==2
    ||!Object.hasOwn(body,'decision')||!Object.hasOwn(body,'note'))
    fail(400,'Invalid review decision');
  const {decision,note}=body;
  if(!['accept_draft','request_changes'].includes(decision)
    ||typeof note!=='string'||note.length>2000||BAD.test(note)
    ||(decision==='request_changes'&&note.trim().length<10))
    fail(400,'Invalid draft review reason');
  return {decision,note};
}
export async function listPendingPadkDrafts(db,{actorId}){
  // Only actionable, submitted drafts for this institution. Not regulatory approvals.
  await permission(db,actorId,'assessments:approve');
  const found=await db.query(
    'SELECT p.id,p.title,p.category,p.owner_user_id,s.submission_cycle,'+
    'e.occurred_at FROM padk_draft_review_state s '+
    'JOIN padk_assessment_preparations p ON p.id=s.preparation_id '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'JOIN padk_draft_review_events e ON e.preparation_id=p.id '+
    "AND e.submission_cycle=s.submission_cycle AND e.action='SUBMITTED' "+
    "WHERE s.status='submitted' AND p.owner_user_id<>$1 "+
    'ORDER BY e.occurred_at ASC,p.id ASC LIMIT 51',
    [actorId],
  );
  return {
    drafts:found.rows.slice(0,50).map(row=>({
      preparationId:row.id,title:row.title,category:row.category,
      ownerUserId:row.owner_user_id,
      submissionCycle:Number(row.submission_cycle),
      submittedAt:row.occurred_at,status:'submitted',
    })),
    hasMore:found.rows.length>50,
    draftOnly:true,officialApprovalAvailable:false,regulatoryPackVerified:false,
  };
}

export async function padkDraftReviewStatus(db,{actorId,id}){
  await permission(db,actorId,'assessments:read');
  await scoped(db,{actorId,id});
  return {preparationId:id,...await current(db,id)};
}
export async function padkDraftReviewHistory(db,{actorId,id}){
  const status=await padkDraftReviewStatus(db,{actorId,id});
  const events=await db.query(
    'SELECT submission_cycle,actor_user_id,action,note,occurred_at '+
    'FROM padk_draft_review_events WHERE preparation_id=$1 '+
    'ORDER BY id DESC LIMIT 100',[id],
  );
  return {...status,events:events.rows};
}
export async function submitPadkDraftInTransaction(db,{actorId,id}){
  await permission(db,actorId,'assessments:write');
  const prep=await scoped(db,{actorId,id,lock:true});
  if(prep.owner_user_id!==actorId)fail(403,'Only the maker can submit draft');
  const state=await current(db,id);
  if(!available(state.status))fail(409,'Draft cannot be submitted in this state');
  const count=await db.query(
    'SELECT count(*)::int AS ranked, '+
    'count(*) FILTER (WHERE length(btrim(justification))>=20)::int AS justified '+
    'FROM padk_preparation_indicator_notes '+
    'WHERE preparation_id=$1 AND provisional_rank BETWEEN 1 AND 5',[id],
  );
  const target=prep.category===1?80:60;
  if(count.rows[0].ranked!==target||count.rows[0].justified!==target)
    fail(409,'Complete all '+target+' provisional ranks and justifications before draft submission');
  const cycle=state.submissionCycle+1;
  await db.query(
    'INSERT INTO padk_draft_review_state '+
    '(preparation_id,status,submission_cycle) VALUES($1,$2,$3) '+
    'ON CONFLICT(preparation_id) DO UPDATE SET status=EXCLUDED.status,'+
    'submission_cycle=EXCLUDED.submission_cycle,reviewed_by=NULL,reviewed_at=NULL',
    [id,'submitted',cycle],
  );
  await db.query(
    "INSERT INTO padk_draft_review_events "+
    "(preparation_id,submission_cycle,actor_user_id,action,note) "+
    "VALUES($1,$2,$3,'SUBMITTED','')",[id,cycle,actorId],
  );
  return {preparationId:id,status:'submitted',submissionCycle:cycle,
    officialApprovalAvailable:false,regulatoryPackVerified:false,finalReportAvailable:false};
}
export async function reviewPadkDraftInTransaction(db,{actorId,id,...data}){
  const {decision,note}=validatePadkDraftDecision(data);
  await permission(db,actorId,'assessments:approve');
  const prep=await scoped(db,{actorId,id,lock:true});
  if(prep.owner_user_id===actorId)fail(403,'Maker cannot review own draft');
  const state=await current(db,id);
  if(state.status!=='submitted')fail(409,'Only submitted PADK drafts can be reviewed');
  const status=decision==='accept_draft'?'draft_accepted':'changes_requested';
  const action=decision==='accept_draft'?'DRAFT_ACCEPTED':'CHANGES_REQUESTED';
  await db.query(
    'UPDATE padk_draft_review_state SET status=$2,reviewed_by=$3,reviewed_at=now() '+
    'WHERE preparation_id=$1',[id,status,actorId],
  );
  await db.query(
    'INSERT INTO padk_draft_review_events '+
    '(preparation_id,submission_cycle,actor_user_id,action,note) '+
    'VALUES($1,$2,$3,$4,$5)',[id,state.submissionCycle,actorId,action,note],
  );
  return {preparationId:id,status,submissionCycle:state.submissionCycle,
    reviewedBy:actorId,officialApprovalAvailable:false,
    regulatoryPackVerified:false,finalReportAvailable:false};
}
async function inTransaction(pool,handler){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');const result=await handler(db);
    await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export const submitPadkDraft=(pool,args)=>inTransaction(pool,db=>
  submitPadkDraftInTransaction(db,args));
export const reviewPadkDraft=(pool,args)=>inTransaction(pool,db=>
  reviewPadkDraftInTransaction(db,args));
