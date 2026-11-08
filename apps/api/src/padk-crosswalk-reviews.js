import {readFile} from 'node:fs/promises';
import {userHasPermission} from './authorization.js';

export const SOURCE_SHA='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
const REVIEW_URL=new URL('../../../regulations/padk43/cyber/review/category2-candidates.json',import.meta.url);
const DRAFT_URL=new URL('../../../regulations/padk43/cyber/drafts/kategori-2.json',import.meta.url);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const NUMBER=/^(?:[1-9]|[1-5]\d|60)$/;
export class CrosswalkError extends Error{
  constructor(status,message){super(message);this.name='CrosswalkError';this.status=status;}
}
const reject=(status,message)=>{throw new CrosswalkError(status,message);};
export function parseMappingNumber(raw){
  if(typeof raw!=='string'||!NUMBER.test(raw))reject(400,'Invalid mapping number');
  return Number(raw);
}
export function validateMappingReview(body,candidate){
  if(!body||typeof body!=='object'||Array.isArray(body)
    ||Object.keys(body).length!==7)reject(400,'Invalid review payload');
  const {reviewTrack,decision,proposedTable3Number,proposedPdfPage,
    basis,sourcePdfSha256,expectedLatestEventId}=body;
  if(!['SUBSTANCE','TECHNICAL'].includes(reviewTrack)
    ||!['ACCEPT_CANDIDATE','REMAP_PROPOSAL','ESCALATE'].includes(decision)
    ||typeof basis!=='string'||basis.trim().length<20||basis.length>2000
    ||CONTROL.test(basis)||sourcePdfSha256!==SOURCE_SHA
    ||!Number.isSafeInteger(expectedLatestEventId)||expectedLatestEventId<0)
    reject(400,'Invalid review payload');
  if(decision==='ESCALATE'){
    if(proposedTable3Number!==null||proposedPdfPage!==null)
      reject(400,'Escalation cannot approve a mapping');
  }else{
    if(!Number.isSafeInteger(proposedTable3Number)||proposedTable3Number<1
      ||proposedTable3Number>80||!Number.isSafeInteger(proposedPdfPage)
      ||proposedPdfPage<157||proposedPdfPage>198)
      reject(400,'Invalid proposed mapping and page');
    if(decision==='ACCEPT_CANDIDATE'
      &&(proposedTable3Number!==candidate.table3CandidateNumber
        ||proposedPdfPage!==candidate.table3PdfPage))
      reject(400,'Candidate mismatch');
    if(decision==='REMAP_PROPOSAL'
      &&proposedTable3Number===candidate.table3CandidateNumber)
      reject(400,'Remap must select a different row');
  }
  return {reviewTrack,decision,proposedTable3Number,proposedPdfPage,basis,
    expectedLatestEventId};
}
export async function loadCrosswalkCandidates(){
  const [file,draft]=await Promise.all([readFile(REVIEW_URL,'utf8'),readFile(DRAFT_URL,'utf8')]);
  const data=JSON.parse(file),labels=JSON.parse(draft);
  if(data.status!=='DRAFT_UNVERIFIED'||data.sourcePdfSha256!==SOURCE_SHA
    ||data.sourceAuthenticityVerified!==false||data.fullCriteriaVerified!==false
    ||data.productionScoringAvailable!==false
    ||!Array.isArray(data.candidateMappings)||data.candidateMappings.length!==60
    ||labels.status!=='DRAFT_UNVERIFIED'||labels.category!==2
    ||labels.source?.verifiedAgainstOfficialPdf!==false
    ||!Array.isArray(labels.items)||labels.items.length!==60)
    reject(503,'Regulatory review sources unavailable');
  return data.candidateMappings.map((row,i)=>{
    const label=labels.items[i];
    if(row.category2Number!==i+1||!Number.isSafeInteger(row.table3CandidateNumber)
      ||row.table3CandidateNumber<1||row.table3CandidateNumber>80
      ||!Number.isSafeInteger(row.category2PdfPage)||row.category2PdfPage<147
      ||row.category2PdfPage>156||!Number.isSafeInteger(row.table3PdfPage)
      ||row.table3PdfPage<157||row.table3PdfPage>198
      ||!['CANDIDATE_NOT_APPROVED','SOURCE_REVIEW_REQUIRED'].includes(row.risk)
      ||label.number!==i+1||label.reviewStatus!=='NEEDS_SOURCE_REVIEW'
      ||typeof label.workingSummary!=='string'||label.workingSummary.length<8
      ||!Array.isArray(label.rankCriteria)||label.rankCriteria.length!==0)
      reject(503,'Regulatory draft catalog integrity failed');
    return {...row,workingSummaryDraft:label.workingSummary};
  });
}
function formatReview(row){
  return {eventId:Number(row.id),category2Number:Number(row.category2_number),
    reviewTrack:row.review_track,decision:row.decision,
    proposedTable3Number:row.proposed_table3_number,
    proposedPdfPage:row.proposed_pdf_page,basis:row.basis,
    reviewerId:row.reviewer_id,recordedAt:row.recorded_at,
    sourcePdfSha256:row.source_pdf_sha256.trim()};
}
async function getLatest(db){
  const results=await db.query(
    'SELECT DISTINCT ON (category2_number,review_track) * '+
    'FROM padk_category2_mapping_review_events '+
    'ORDER BY category2_number,review_track,id DESC',
  );
  return results.rows.map(formatReview);
}
function decorate(candidates,latest){
  const keyed=new Map();
  for(const row of latest){
    if(!keyed.has(row.category2Number))keyed.set(row.category2Number,{});
    keyed.get(row.category2Number)[row.reviewTrack]=row;
  }
  return candidates.map(item=>{
    const decisions=keyed.get(item.category2Number)??{};
    const substance=decisions.SUBSTANCE,technical=decisions.TECHNICAL;
    const independentlyAgreed=Boolean(substance&&technical
      &&substance.reviewerId!==technical.reviewerId
      &&substance.decision==='ACCEPT_CANDIDATE'
      &&technical.decision==='ACCEPT_CANDIDATE'
      &&substance.proposedTable3Number===technical.proposedTable3Number);
    return {...item,reviews:decisions,
      mappingReviewStatus:independentlyAgreed?'TWO_REVIEWERS_AGREE_CANDIDATE':'PENDING',
      fullCriteriaVerified:false,productionScoringAvailable:false};
  });
}
export async function listCrosswalkReviews(db,{actorId}){
  if(!await userHasPermission(db,actorId,'assessments:approve'))
    reject(403,'Forbidden');
  const candidates=await loadCrosswalkCandidates();
  const latest=await getLatest(db);
  return {status:'DRAFT_UNVERIFIED',sourcePdfSha256:SOURCE_SHA,
    sourceAuthenticityVerified:false,fullCriteriaVerified:false,
    productionScoringAvailable:false,items:decorate(candidates,latest)};
}
async function inTransaction(pool,fn){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');const result=await fn(db);
    await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
  finally{db.release();}
}
export async function recordMappingReviewInTransaction(db,{actorId,number,...body}){
  if(!await userHasPermission(db,actorId,'assessments:approve'))
    reject(403,'Forbidden');
  const candidateNumber=parseMappingNumber(number);
  const candidate=(await loadCrosswalkCandidates())[candidateNumber-1];
  const input=validateMappingReview(body,candidate);
  await db.query('SELECT pg_advisory_xact_lock($1,$2)',[65020,candidateNumber]);
  const opposite=await db.query(
    'SELECT 1 FROM padk_category2_mapping_review_events '+
    'WHERE category2_number=$1 AND reviewer_id=$2 AND review_track<>$3 LIMIT 1',
    [candidateNumber,actorId,input.reviewTrack],
  );
  if(opposite.rowCount)reject(409,'Use an independent reviewer for the other review track');
  const latest=await db.query(
    'SELECT id FROM padk_category2_mapping_review_events '+
    'WHERE category2_number=$1 AND review_track=$2 ORDER BY id DESC LIMIT 1',
    [candidateNumber,input.reviewTrack],
  );
  const actual=latest.rowCount?Number(latest.rows[0].id):0;
  if(actual!==input.expectedLatestEventId)reject(409,'Review changed; reload before saving');
  const saved=await db.query(
    'INSERT INTO padk_category2_mapping_review_events '+
    '(category2_number,candidate_table3_number,reviewer_id,review_track,decision,'+
    'proposed_table3_number,proposed_pdf_page,basis,source_pdf_sha256) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [candidateNumber,candidate.table3CandidateNumber,actorId,input.reviewTrack,
      input.decision,input.proposedTable3Number,input.proposedPdfPage,input.basis,SOURCE_SHA],
  );
  return {review:formatReview(saved.rows[0]),regulatoryPackVerified:false};
}
export const recordMappingReview=(pool,args)=>inTransaction(pool,db=>
  recordMappingReviewInTransaction(db,args));
export async function mappingReviewHistory(db,{actorId,number}){
  if(!await userHasPermission(db,actorId,'assessments:approve'))
    reject(403,'Forbidden');
  const candidateNumber=parseMappingNumber(number);
  const result=await db.query(
    'SELECT * FROM padk_category2_mapping_review_events WHERE category2_number=$1 '+
    'ORDER BY id DESC',[candidateNumber],
  );
  return {category2Number:candidateNumber,events:result.rows.map(formatReview),
    regulatoryPackVerified:false};
}
