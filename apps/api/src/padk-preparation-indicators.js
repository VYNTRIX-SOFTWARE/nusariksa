import {readFile} from 'node:fs/promises';
import {userHasPermission} from './authorization.js';
import {getPadkPreparation,PadkPreparationError} from './padk-preparations.js';

const CATALOG=new Map([
  [1,new URL('../../../regulations/padk43/cyber/drafts/kategori-1.json',import.meta.url)],
  [2,new URL('../../../regulations/padk43/cyber/drafts/kategori-2.json',import.meta.url)],
]);
const INVALID=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const reject=(status,message)=>{throw new PadkPreparationError(status,message);};

export function parseIndicatorNumber(raw,category){
  const number=typeof raw==='number'?raw:
    typeof raw==='string'&&/^[1-9][0-9]?$/.test(raw)?Number(raw):NaN;
  if(!Number.isSafeInteger(number)||number<1||number>(category===1?80:category===2?60:0))
    reject(400,'Indicator not valid for selected PADK category');
  return number;
}
export function validateIndicatorWorkingNotes({preparationNotes,evidencePlan,expectedRevision}={}){
  if(typeof preparationNotes!=='string'||preparationNotes.length>4000
    ||typeof evidencePlan!=='string'||evidencePlan.length>4000
    ||INVALID.test(preparationNotes)||INVALID.test(evidencePlan)
    ||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    reject(400,'Invalid indicator working notes');
  return {preparationNotes,evidencePlan,expectedRevision};
}
async function draftIndicators(category){
  const path=CATALOG.get(category);
  if(!path)reject(503,'Draft indicator catalog unavailable');
  const data=JSON.parse(await readFile(path,'utf8'));
  const count=category===1?80:60;
  // Never silently promote a working summary to an official regulatory parameter.
  if(data.status!=='DRAFT_UNVERIFIED'||data.category!==category
    ||data.source?.verifiedAgainstOfficialPdf!==false||!Array.isArray(data.items)
    ||data.items.length!==count)
    reject(503,'Draft indicator catalog integrity check failed');
  const rows=data.items.map((row,index)=>{
    if(row.number!==index+1||row.reviewStatus!=='NEEDS_SOURCE_REVIEW'
      ||typeof row.workingSummary!=='string'||row.workingSummary.length<8
      ||!Array.isArray(row.rankCriteria)||row.rankCriteria.length!==0)
      reject(503,'Draft indicator data is incomplete or incorrectly marked verified');
    return {number:row.number,workingSummary:row.workingSummary,
      printedPage:row.tablePage};
  });
  return rows;
}
function noteRecord(row){
  return {number:Number(row.indicator_number),preparationNotes:row.preparation_notes,
    evidencePlan:row.evidence_plan,revision:Number(row.revision),updatedAt:row.updated_at,
    status:'WORKING_NOTES_UNVERIFIED',scoringAvailable:false};
}
export async function listPadkIndicatorNotes(db,{actorId,id}){
  const preparation=await getPadkPreparation(db,{actorId,id});
  const draft=await draftIndicators(preparation.category);
  const rows=await db.query(
    'SELECT indicator_number,preparation_notes,evidence_plan,revision,updated_at '+
    'FROM padk_preparation_indicator_notes WHERE preparation_id=$1',[id],
  );
  const byNumber=new Map(rows.rows.map(r=>[Number(r.indicator_number),noteRecord(r)]));
  return {preparationId:id,category:preparation.category,catalogStatus:'DRAFT_UNVERIFIED',
    scoringAvailable:false,approvalAvailable:false,sourcePdfVerified:false,
    indicators:draft.map(item=>({...item,
      ...(byNumber.get(item.number)??{
        preparationNotes:'',evidencePlan:'',revision:0,
        updatedAt:null,status:'WORKING_NOTES_UNVERIFIED',scoringAvailable:false,
      }),
    }))};
}
async function inTransaction(pool,handler){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await handler(db);
    await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}
  finally{db.release();}
}
export async function savePadkIndicatorNoteInTransaction(db,{actorId,id,number,...body}){
  const data=validateIndicatorWorkingNotes(body);
  const permission=await userHasPermission(db,actorId,'assessments:write');
  if(!permission)reject(403,'Forbidden');
  // Lock the parent to serialize first-write upserts and defend against stale revisions.
  const found=await db.query(
    'SELECT p.category,p.owner_user_id FROM padk_assessment_preparations p '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'WHERE p.id=$2 FOR UPDATE OF p',[actorId,id],
  );
  if(found.rowCount!==1)reject(404,'Preparation not found');
  const prep=found.rows[0];
  if(prep.owner_user_id!==actorId)reject(403,'Only the maker can edit working notes');
  const indicator=parseIndicatorNumber(number,prep.category);
  const existing=await db.query(
    'SELECT revision,preparation_notes,evidence_plan FROM padk_preparation_indicator_notes '+
    'WHERE preparation_id=$1 AND indicator_number=$2',[id,indicator],
  );
  const current=existing.rows[0];
  if((current?.revision??0)!==data.expectedRevision)
    reject(409,'Indicator notes changed; reload before saving');
  if(current&&current.preparation_notes===data.preparationNotes
    &&current.evidence_plan===data.evidencePlan)
    return {...noteRecord({...current,indicator_number:indicator,updated_at:null}),
      unchanged:true};
  const updated=await db.query(current?
    'UPDATE padk_preparation_indicator_notes SET preparation_notes=$3,evidence_plan=$4,'+
    'revision=revision+1,updated_at=now() WHERE preparation_id=$1 AND indicator_number=$2 RETURNING *'
    :'INSERT INTO padk_preparation_indicator_notes '+
    '(preparation_id,indicator_number,preparation_notes,evidence_plan) '+
    'VALUES($1,$2,$3,$4) RETURNING *',
    [id,indicator,data.preparationNotes,data.evidencePlan],
  );
  const row=updated.rows[0];
  await db.query(
    'INSERT INTO padk_preparation_indicator_events '+
    '(preparation_id,indicator_number,revision,actor_user_id,preparation_notes,evidence_plan) '+
    'VALUES($1,$2,$3,$4,$5,$6)',
    [id,indicator,row.revision,actorId,row.preparation_notes,row.evidence_plan],
  );
  return noteRecord(row);
}
export const savePadkIndicatorNote=(pool,args)=>inTransaction(pool,db=>
  savePadkIndicatorNoteInTransaction(db,args));
export async function historyPadkIndicatorNote(db,{actorId,id,number}){
  const preparation=await getPadkPreparation(db,{actorId,id});
  const indicator=parseIndicatorNumber(number,preparation.category);
  const events=await db.query(
    'SELECT revision,actor_user_id,preparation_notes,evidence_plan,occurred_at '+
    'FROM padk_preparation_indicator_events WHERE preparation_id=$1 '+
    'AND indicator_number=$2 ORDER BY revision DESC',[id,indicator],
  );
  return {preparationId:id,number:indicator,events:events.rows,
    status:'WORKING_NOTES_UNVERIFIED'};
}
