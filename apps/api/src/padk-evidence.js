import {userHasPermission} from './authorization.js';
import {
  EvidenceError,validateEvidence,encryptEvidence,decryptEvidence,
} from './assessment-evidence.js';
import {getPadkPreparation} from './padk-preparations.js';
import {parseIndicatorNumber} from './padk-preparation-indicators.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMIT=10;
const reject=(status,message)=>{throw new EvidenceError(status,message);};
const contextFor=number=>'PADK43_INDICATOR_'+number;
async function authorize(db,actorId,permission){
  if(typeof actorId!=='string'||!UUID.test(actorId)
    ||!await userHasPermission(db,actorId,permission))
    reject(403,'Forbidden');
}
async function target(db,{actorId,id,number}){
  const preparation=await getPadkPreparation(db,{actorId,id});
  const indicator=parseIndicatorNumber(number,preparation.category);
  return {preparation,indicator};
}
const metadata=row=>({
  id:row.id,preparationId:row.preparation_id,
  indicatorNumber:Number(row.indicator_number),fileName:row.file_name,
  mediaType:row.media_type,sizeBytes:row.size_bytes,
  sha256:Buffer.isBuffer(row.sha256)?row.sha256.toString('hex'):row.sha256,
  uploadedBy:row.uploaded_by,uploadedAt:row.uploaded_at,
});
export async function listPadkEvidence(db,{actorId,id,number}){
  await authorize(db,actorId,'evidence:read');
  const {indicator}=await target(db,{actorId,id,number});
  const result=await db.query(
    'SELECT id,preparation_id,indicator_number,file_name,media_type,size_bytes,'+
    'sha256,uploaded_by,uploaded_at FROM padk_indicator_evidence '+
    'WHERE preparation_id=$1 AND indicator_number=$2 '+
    'ORDER BY uploaded_at DESC,id DESC',[id,indicator],
  );
  return {preparationId:id,indicatorNumber:indicator,evidence:result.rows.map(metadata),
    status:'DRAFT_EVIDENCE',regulatoryPackVerified:false};
}
export async function uploadPadkEvidenceInTransaction(db,{
  actorId,id,number,fileName,mediaType,contentBase64,key,
}){
  await authorize(db,actorId,'evidence:write');
  // Lock the parent preparation before checking ownership and per-indicator quota.
  const found=await db.query(
    'SELECT p.category,p.owner_user_id FROM padk_assessment_preparations p '+
    'JOIN users u ON u.id=$1 AND u.institution_id=p.institution_id '+
    'WHERE p.id=$2 FOR UPDATE OF p',[actorId,id],
  );
  if(found.rowCount!==1)reject(404,'PADK preparation not found');
  if(found.rows[0].owner_user_id!==actorId)
    reject(403,'Only the PADK maker can upload evidence');
  const review=await db.query('SELECT status FROM padk_draft_review_state WHERE preparation_id=$1',[id]);
  if(['submitted','draft_accepted'].includes(review.rows[0]?.status))
    reject(409,'PADK draft evidence is locked during review');
  const indicator=parseIndicatorNumber(number,found.rows[0].category);
  const note=await db.query(
    'SELECT 1 FROM padk_preparation_indicator_notes '+
    'WHERE preparation_id=$1 AND indicator_number=$2',[id,indicator],
  );
  if(note.rowCount!==1)
    reject(409,'Save the indicator draft before uploading evidence');
  const count=await db.query(
    'SELECT count(*)::int AS total FROM padk_indicator_evidence '+
    'WHERE preparation_id=$1 AND indicator_number=$2',[id,indicator],
  );
  if(count.rows[0].total>=LIMIT)reject(409,'Evidence limit reached');
  const value=validateEvidence({fileName,mediaType,contentBase64});
  const encrypted=encryptEvidence({
    ...value,assessmentId:id,controlId:contextFor(indicator),
  },key);
  const inserted=await db.query(
    'INSERT INTO padk_indicator_evidence '+
    '(id,preparation_id,indicator_number,file_name,media_type,size_bytes,sha256,'+
    'nonce,auth_tag,ciphertext,uploaded_by) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) '+
    'RETURNING id,preparation_id,indicator_number,file_name,media_type,'+
    'size_bytes,sha256,uploaded_by,uploaded_at',
    [encrypted.id,id,indicator,encrypted.file_name,encrypted.media_type,
      encrypted.size_bytes,encrypted.sha256,encrypted.nonce,
      encrypted.auth_tag,encrypted.ciphertext,actorId],
  );
  return {...metadata(inserted.rows[0]),status:'DRAFT_EVIDENCE'};
}
async function transaction(pool,work){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');const result=await work(db);
    await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export const uploadPadkEvidence=(pool,args)=>
  transaction(pool,db=>uploadPadkEvidenceInTransaction(db,args));
export async function downloadPadkEvidence(db,{actorId,id,evidenceId,key}){
  if(typeof id!=='string'||!UUID.test(id)||typeof evidenceId!=='string'
    ||!UUID.test(evidenceId))reject(400,'Invalid PADK evidence ID');
  await authorize(db,actorId,'evidence:read');
  await getPadkPreparation(db,{actorId,id});
  const found=await db.query(
    'SELECT id,preparation_id,indicator_number,file_name,media_type,size_bytes,'+
    'sha256,nonce,auth_tag,ciphertext FROM padk_indicator_evidence '+
    'WHERE id=$1 AND preparation_id=$2',[evidenceId,id],
  );
  if(found.rowCount!==1)reject(404,'PADK evidence not found');
  const row=found.rows[0];
  const bytes=decryptEvidence({
    id:row.id,assessment_id:row.preparation_id,
    control_id:contextFor(Number(row.indicator_number)),
    file_name:row.file_name,media_type:row.media_type,
    size_bytes:row.size_bytes,sha256:row.sha256,
    nonce:row.nonce,auth_tag:row.auth_tag,ciphertext:row.ciphertext,
  },key);
  return {data:bytes,fileName:row.file_name,mediaType:row.media_type};
}
