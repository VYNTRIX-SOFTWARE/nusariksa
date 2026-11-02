export const RATING_LABELS = Object.freeze({
  not_assessed: 'Belum dinilai',
  compliant: 'Memenuhi',
  partially_compliant: 'Memenuhi sebagian',
  non_compliant: 'Belum memenuhi',
  not_applicable: 'Tidak relevan',
});

const RATINGS = new Set(Object.keys(RATING_LABELS).filter(x=>x!=='not_assessed'));

export function canWriteAssessment(a, userId, permissions) {
  return !!a && typeof userId === 'string'
    && a.owner_user_id === userId && Array.isArray(permissions)
    && permissions.includes('assessments:write');
}

export function canAttachCatalog(a, userId, permissions, catalogVersion) {
  return canWriteAssessment(a,userId,permissions)
    && a.status === 'draft' && !catalogVersion;
}

export function canStartAssessment(a, userId, permissions, catalogVersion) {
  return canWriteAssessment(a,userId,permissions)
    && a.status === 'draft' && !!catalogVersion;
}

export function canEditResult(a, userId, permissions, catalogVersion) {
  return canWriteAssessment(a,userId,permissions)
    && ['in_progress','changes_requested'].includes(a.status) && !!catalogVersion;
}

export function combineControls(checklist, results) {
  const byId = new Map(Array.isArray(results?.controls)
    ? results.controls.map(row=>[row.control_id,row]):[]);
  return (Array.isArray(checklist?.controls) ? checklist.controls : []).map(control=>{
    const result=byId.get(control.id);
    return {
      ...control, rating: result?.rating ?? 'not_assessed',
      note: result?.note ?? '', revision: result?.revision ?? 0,
      updated_at: result?.updated_at ?? null,
    };
  });
}

export function validateAssessmentDraft({title,periodStart,periodEnd}) {
  if(typeof title!=='string' || title.length<3 || title.length>200
     || title.trim()!==title || /[\u0000-\u001f\u007f]/.test(title))
    return 'Judul harus 3–200 karakter, tanpa spasi di awal/akhir.';
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if(!date.test(periodStart??'')||!date.test(periodEnd??'')
    || periodStart<'1900-01-01'||periodStart>'2100-12-31'
    || periodEnd<'1900-01-01'||periodEnd>'2100-12-31'
    || periodEnd<periodStart) return 'Periode mulai dan akhir tidak valid.';
  for(const s of [periodStart,periodEnd]) {
    const [y,m,d]=s.split('-').map(Number);
    const real = new Date(Date.UTC(y,m-1,d));
    if(real.toISOString().slice(0,10)!==s)
      return 'Tanggal tidak valid.';
  }
  return null;
}

export function validateRatingDraft({rating,note}) {
  if(!RATINGS.has(rating))return 'Pilih hasil penilaian.';
  if(typeof note!=='string'||note.length>2000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note))
    return 'Catatan tidak valid atau lebih dari 2.000 karakter.';
  if(rating!=='compliant' && note.trim().length<10)
    return 'Catatan minimal 10 karakter untuk hasil selain Memenuhi.';
  return null;
}
