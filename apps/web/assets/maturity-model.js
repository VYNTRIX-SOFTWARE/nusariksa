export const MATURITY_CODE = /^[A-Z][A-Z0-9_-]{1,31}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_TEXT=/[\u0000-\u001f\u007f]/;
const INVALID_CRITERION=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const mayReadMaturity = permissions =>
  Array.isArray(permissions) && permissions.includes('assessments:read');
export const mayWriteMaturity = permissions =>
  mayReadMaturity(permissions) && permissions.includes('assessments:write');

export const isMaturityId = value => typeof value==='string' && UUID.test(value);

function validateText(value,min,max) {
  return typeof value==='string' && value.length>=min && value.length<=max
    && !INVALID_TEXT.test(value);
}
export function modelDraft({code,title,methodologyReference}={}){
  const data={
    code:typeof code==='string'?code.trim().toUpperCase():'',
    title:typeof title==='string'?title.trim():'',
    methodologyReference:typeof methodologyReference==='string'?methodologyReference.trim():'',
  };
  if(!MATURITY_CODE.test(data.code) ||
    !validateText(data.title,3,200) ||
    !validateText(data.methodologyReference,3,300))
    throw new TypeError('Kode, judul, atau referensi metodologi tidak valid.');
  return data;
}
export function domainDraft({code,title,description=''}={}){
  const data={
    code:typeof code==='string'?code.trim().toUpperCase():'',
    title:typeof title==='string'?title.trim():'',
    description:typeof description==='string'?description.trim():'',
  };
  if(!MATURITY_CODE.test(data.code)||!validateText(data.title,3,200)
    ||!validateText(data.description,0,2000))
    throw new TypeError('Kode, judul, atau deskripsi domain tidak valid.');
  return data;
}
export function criterionDraft(criterion){
  if(typeof criterion!=='string' || criterion.length<10 || criterion.length>2000
    || criterion.trim().length<10 || INVALID_CRITERION.test(criterion))
    throw new TypeError('Kriteria harus berisi 10–2000 karakter tanpa karakter kontrol.');
  return criterion;
}
export function parseMaturityModels(payload){
  if(!payload||!Array.isArray(payload.models)
    ||payload.models.some(x=>!x||!isMaturityId(x.id)
      ||typeof x.code!=='string'||typeof x.title!=='string'
      ||typeof x.methodology_reference!=='string'))
    throw new TypeError('Daftar model maturitas tidak valid.');
  return payload.models;
}
export function parseMaturityVersions(payload){
  if(!payload||!Array.isArray(payload.versions)
    ||payload.versions.some(v=>!v||!isMaturityId(v.id)
      ||!Number.isSafeInteger(v.version)||v.version<1
      ||!['draft','published'].includes(v.status)))
    throw new TypeError('Daftar versi maturitas tidak valid.');
  return payload.versions;
}
export function parseMaturityRubric(payload,versionId){
  if(!payload||!payload.version||payload.version.id!==versionId
    ||!['draft','published'].includes(payload.version.status)
    ||typeof payload.version.methodology_reference!=='string'
    ||!Array.isArray(payload.domains)
    ||payload.domains.some(d=>!d||!isMaturityId(d.id)
      ||typeof d.code!=='string'||typeof d.title!=='string'
      ||!Array.isArray(d.levels)
      ||d.levels.some(l=>!l||!Number.isSafeInteger(l.level)
        ||l.level<0||l.level>5||typeof l.criterion!=='string')))
    throw new TypeError('Rubrik maturitas dari server tidak valid.');
  return payload;
}
export function rubricComplete(domains){
  return Array.isArray(domains)&&domains.length>0
    &&domains.every(d=>Array.isArray(d.levels)&&d.levels.length===6
      &&new Set(d.levels.map(x=>x.level)).size===6
      &&d.levels.every(x=>x.level>=0&&x.level<=5));
}
