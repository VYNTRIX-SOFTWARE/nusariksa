const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=value=>typeof value==='string'&&UUID.test(value);
export const canReadMaturityAssessments=permissions=>
  Array.isArray(permissions)&&permissions.includes('assessments:read');
export const canCreateMaturityAssessments=permissions=>
  canReadMaturityAssessments(permissions)&&permissions.includes('assessments:write');
export const canRateMaturityAssessment=(permissions,actorId,ownerId)=>
  canCreateMaturityAssessments(permissions)&&validId(actorId)&&actorId===ownerId;
export function validMaturityAssessments(payload){
  if(!payload||!Array.isArray(payload.assessments)
    ||payload.assessments.some(a=>!a||!validId(a.id)
      ||!validId(a.model_version_id)||typeof a.title!=='string'
      ||typeof a.model_code!=='string'))
    throw new TypeError('Daftar asesmen maturitas dari server tidak valid.');
  return payload.assessments;
}
export function validMaturityDetail(data,id){
  if(!data||data.id!==id||!validId(data.ownerUserId)
    ||!data.model||typeof data.model.methodologyReference!=='string'
    ||!data.summary||!['minimum','mean_floor'].includes(data.summary.method)
    ||!Array.isArray(data.domains)
    ||data.domains.some(d=>!d||!validId(d.id)
      ||typeof d.code!=='string'||typeof d.title!=='string'
      ||!Array.isArray(d.criteria)||d.criteria.length!==6
      ||d.criteria.some((l,i)=>l.level!==i||typeof l.criterion!=='string')
      ||d.level!==null&&(!Number.isInteger(d.level)||d.level<0||d.level>5)
      ||!Number.isSafeInteger(d.revision)||d.revision<0)
    ||data.summary.totalDomains!==data.domains.length
    ||data.summary.assessedDomains!==data.domains.filter(d=>d.level!==null).length
    ||data.summary.unassessedDomains!==data.domains.filter(d=>d.level===null).length
    ||data.summary.complete!==(data.domains.length>0&&data.domains.every(d=>d.level!==null))
    ||(data.summary.complete!==true&&data.summary.overallLevel!==null)
    ||(data.summary.complete===true
      &&(!Number.isInteger(data.summary.overallLevel)
        ||data.summary.overallLevel<0||data.summary.overallLevel>5)))
    throw new TypeError('Detail asesmen maturitas dari server tidak konsisten.');
  return data;
}
export function ratingPayload({level,justification,evidenceId,expectedRevision}={}){
  if(level===''||level==null||!Number.isSafeInteger(Number(level))
    ||Number(level)<0||Number(level)>5
    ||typeof justification!=='string'||justification.trim().length<10
    ||justification.length>2000
    ||!Number.isSafeInteger(expectedRevision)||expectedRevision<0
    ||(evidenceId&& !validId(evidenceId)))
    throw new TypeError('Pilih Level 0–5, tulis justifikasi minimal 10 karakter, dan periksa ID bukti.');
  return {level:Number(level),justification,evidenceId:evidenceId||null,expectedRevision};
}
export function isMaturityAssessmentId(id){return validId(id)}

const REVIEW_STATES=['in_progress','submitted','changes_requested','approved'];
export function canSubmitMaturityAssessment(permissions,actorId,detail){
  return Boolean(detail&&canRateMaturityAssessment(permissions,actorId,detail.ownerUserId)
    &&detail.summary?.complete===true
    &&['in_progress','changes_requested'].includes(detail.review?.status));
}
export function canReviewMaturityAssessment(permissions,actorId,detail){
  return Boolean(detail&&canReadMaturityAssessments(permissions)
    &&permissions.includes('assessments:approve')&&validId(actorId)
    &&actorId!==detail.ownerUserId&&detail.review?.status==='submitted');
}
export function validMaturityReviewQueue(payload){
  if(!payload||!Array.isArray(payload.assessments)
    ||payload.assessments.length>50
    ||payload.assessments.some(a=>!a||!validId(a.id)||!validId(a.ownerUserId)
      ||typeof a.title!=='string'||typeof a.periodStart!=='string'
      ||typeof a.periodEnd!=='string'||!Number.isSafeInteger(a.submissionCycle)
      ||a.submissionCycle<1))
    throw new TypeError('Antrean reviewer maturitas dari server tidak valid.');
  return payload.assessments;
}
export function reviewDecisionPayload(decision,note){
  if(!['approve','request_changes'].includes(decision)
    ||typeof note!=='string'||note.length>2000
    ||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)
    ||(decision==='request_changes'&&note.trim().length<10))
    throw new TypeError('Pilih keputusan dan isi alasan pengembalian minimal 10 karakter.');
  return {decision,note};
}
export function validMaturityReviewHistory(payload,id){
  if(!payload||payload.assessmentId!==id
    ||!REVIEW_STATES.includes(payload.status)
    ||!Array.isArray(payload.events)
    ||payload.events.some(e=>!e||!['SUBMITTED','APPROVED','CHANGES_REQUESTED'].includes(e.action)
      ||!Number.isSafeInteger(e.submission_cycle)||e.submission_cycle<1
      ||typeof e.note!=='string'))
    throw new TypeError('Riwayat reviewer maturitas dari server tidak valid.');
  return payload;
}
