export const REVIEW_ACTION_LABELS = Object.freeze({
  SUBMITTED: 'Diajukan untuk review',
  APPROVED: 'Disetujui',
  CHANGES_REQUESTED: 'Dikembalikan untuk perbaikan',
});

export function canSubmitReview(assessment,userId,permissions,catalog,controls){
  return !!assessment && !!catalog && typeof userId==='string'
    && assessment.owner_user_id===userId
    && Array.isArray(permissions) && permissions.includes('assessments:write')
    && ['in_progress','changes_requested'].includes(assessment.status)
    && Array.isArray(controls) && controls.length>0
    && controls.every(c=>Number.isSafeInteger(c.revision)&&c.revision>0);
}

export function maySubmitReview(assessment,userId,permissions,catalog){
  return !!assessment && !!catalog && typeof userId==='string'
    && assessment.owner_user_id===userId
    && Array.isArray(permissions) && permissions.includes('assessments:write')
    && ['in_progress','changes_requested'].includes(assessment.status);
}

export function canDecideReview(assessment,userId,permissions){
  return !!assessment && typeof userId==='string' && userId.length>0
    && assessment.owner_user_id!==userId && assessment.status==='submitted'
    && Array.isArray(permissions) && permissions.includes('assessments:approve');
}

export function pendingReviewQueue(assessments,userId,permissions){
  if(!Array.isArray(permissions)||!permissions.includes('assessments:read')
    || !permissions.includes('assessments:approve'))return [];
  return (Array.isArray(assessments)?assessments:[])
    .filter(a=>a && typeof a.id==='string'
      && canDecideReview(a,userId,permissions));
}

export function validateReviewDecision({decision,note}={}){
  if(!['approve','request_changes'].includes(decision))
    return 'Pilih keputusan review yang valid.';
  if(typeof note!=='string'||note.length>2000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note))
    return 'Catatan review tidak valid atau melebihi 2.000 karakter.';
  if(decision==='request_changes'&&note.trim().length<10)
    return 'Alasan pengembalian wajib minimal 10 karakter.';
  return null;
}
