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
