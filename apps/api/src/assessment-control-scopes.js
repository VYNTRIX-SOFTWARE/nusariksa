import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ControlScopeError extends Error {
  constructor(status,message){super(message);this.name='ControlScopeError';this.status=status;}
}
const invalid=(status,message)=>{throw new ControlScopeError(status,message);};

export function validateSelectedControlIds(controlIds){
  if(!Array.isArray(controlIds)||controlIds.length<1||controlIds.length>200
    ||controlIds.some(id=>typeof id!=='string'||!UUID.test(id))
    ||new Set(controlIds).size!==controlIds.length)
    invalid(400,'Pilih 1–200 kontrol unik yang tersedia dalam katalog.');
  return controlIds;
}

/**
 * Configure an immutable scope before a draft assessment starts.
 * The caller MUST already hold a FOR UPDATE lock on the parent assessment,
 * confirm tenancy and owner, and attach the published catalog version.
 */
export async function configureAssessmentScopeInTransaction(db,{
  actorId,assessmentId,versionId,controlIds,
}){
  const ids=validateSelectedControlIds(controlIds);
  const available=await db.query(
    'SELECT id FROM control_definitions WHERE version_id=$1 AND id=ANY($2::uuid[])',
    [versionId,ids],
  );
  if(available.rowCount!==ids.length)
    invalid(400,'Ada kontrol yang tidak termasuk versi katalog terpasang.');
  const scope=await db.query(
    'INSERT INTO assessment_control_scopes '+
    '(assessment_id,catalog_version_id,configured_by) VALUES($1,$2,$3) '+
    'ON CONFLICT DO NOTHING RETURNING assessment_id',
    [assessmentId,versionId,actorId],
  );
  if(scope.rowCount!==1)
    invalid(409,'Daftar kontrol sudah ditentukan dan tidak dapat diganti.');
  await db.query(
    'INSERT INTO assessment_control_scope_items '+
    '(assessment_id,catalog_version_id,control_id) '+
    'SELECT $1,$2,selected.id FROM unnest($3::uuid[]) AS selected(id)',
    [assessmentId,versionId,ids],
  );
  return {assessmentId,selectedControls:ids.length,scopeLocked:true};
}

export async function listDefaultAssessmentControls(db,{actorId}){
  if(typeof actorId!=='string'||!UUID.test(actorId)
    ||!await userHasPermission(db,actorId,'assessments:read'))
    invalid(403,'Forbidden');
  const result=await db.query(
    'SELECT v.id AS catalog_version_id,d.id,d.control_code,d.title,d.description,'+
    'd.source_document,d.source_section,d.position FROM control_catalogs c '+
    "JOIN LATERAL (SELECT id FROM control_catalog_versions v0 "+
    "WHERE v0.catalog_id=c.id AND v0.status='published' "+
    "ORDER BY v0.version DESC LIMIT 1) v ON true "+
    'JOIN control_definitions d ON d.version_id=v.id '+
    'JOIN users u ON u.institution_id=c.institution_id AND u.id=$1 '+
    "WHERE c.code='NUSARIKSA_TI_REFERENSI' AND c.origin='builtin' "+
    "ORDER BY d.position",
    [actorId],
  );
  if(result.rowCount<1||result.rowCount>200
    ||result.rows.some(x=>x.catalog_version_id!==result.rows[0].catalog_version_id
      ||typeof x.source_document!=='string'||typeof x.source_section!=='string'))
    invalid(409,'Pustaka kontrol dasar belum tersedia. Hubungi administrator.');
  return {
    catalogVersionId:result.rows[0].catalog_version_id,
    catalogCode:'NUSARIKSA_TI_REFERENSI',
    catalogStatus:'PUBLISHED_INTERNAL_REFERENCE',
    officialInstrument:false,
    maxPerAssessment:200,
    controls:result.rows.map(({id,control_code,title,description,
      source_document,source_section,position})=>({
      id,controlCode:control_code,title,description,
      sourceDocument:source_document,sourceSection:source_section,position,
    })),
  };
}
