import { userHasPermission } from './authorization.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z][A-Z0-9_-]{1,31}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export class MaturityError extends Error {
  constructor(status, message) {
    super(message); this.name = 'MaturityError'; this.status = status;
  }
}
const validId = value => typeof value === 'string' && UUID.test(value);
function cleanText(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max
    && value === value.trim() && !CONTROL.test(value);
}
export function validateMaturityModel({ code, title, methodologyReference } = {}) {
  if (typeof code !== 'string' || !CODE.test(code)
    || !cleanText(title, 3, 200)
    || !cleanText(methodologyReference, 3, 300)) {
    throw new MaturityError(400, 'Invalid maturity framework');
  }
  return { code, title, methodologyReference };
}
export function validateMaturityDomain({ code, title, description = '' } = {}) {
  if (typeof code !== 'string' || !CODE.test(code) || !cleanText(title, 3, 200)
    || typeof description !== 'string' || description.length > 2000
    || CONTROL.test(description)) throw new MaturityError(400, 'Invalid maturity domain');
  return { code, title, description };
}
export function validateLevelCriterion({ level, criterion } = {}) {
  if (!Number.isInteger(level) || level < 0 || level > 5
    || typeof criterion !== 'string' || criterion.length < 10
    || criterion.length > 2000 || criterion.trim().length < 10
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(criterion)) {
    throw new MaturityError(400, 'Invalid maturity level criterion');
  }
  return { level, criterion };
}
async function permission(db, actorId, role) {
  if (!validId(actorId) || !await userHasPermission(db, actorId, role)) {
    throw new MaturityError(403, 'Forbidden');
  }
}
async function withTransaction(pool, callback) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const value = await callback(db);
    await db.query('COMMIT');
    return value;
  } catch(error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

export async function createMaturityModelInTransaction(db, {actorId, ...input}) {
  const data = validateMaturityModel(input);
  await permission(db,actorId,'assessments:write');
  let result;
  try {
    result = await db.query(
      'INSERT INTO maturity_models (institution_id, code, title, methodology_reference, created_by) ' +
      "SELECT institution_id, $2, $3, $4, id FROM users WHERE id = $1 " +
      "AND status = 'active' AND password_hash IS NOT NULL " +
      'RETURNING id, code, title, methodology_reference',
      [actorId,data.code,data.title,data.methodologyReference],
    );
  } catch(error) {
    if (error.code === '23505') throw new MaturityError(409,'Maturity model code exists');
    throw error;
  }
  if (result.rowCount !== 1) throw new MaturityError(403,'Forbidden');
  const model=result.rows[0];
  const version = await db.query(
    'INSERT INTO maturity_model_versions (model_id, version, created_by) ' +
    "VALUES ($1, 1, $2) RETURNING id, version, status",
    [model.id,actorId],
  );
  return { id:model.id, code:model.code, title:model.title,
    methodologyReference:model.methodology_reference, currentVersion:version.rows[0] };
}

export async function listMaturityModels(db, actorId) {
  await permission(db,actorId,'assessments:read');
  const results = await db.query(
    'SELECT m.id, m.code, m.title, m.methodology_reference, m.created_at ' +
    'FROM maturity_models m JOIN users u ON u.institution_id = m.institution_id ' +
    'AND u.id = $1 ORDER BY m.code LIMIT 50', [actorId],
  );
  return { models: results.rows };
}

export async function listMaturityVersions(db, actorId, modelId) {
  if (!validId(modelId)) throw new MaturityError(400,'Invalid maturity model ID');
  await permission(db,actorId,'assessments:read');
  const found=await db.query(
    'SELECT 1 FROM maturity_models m JOIN users u ON u.institution_id = m.institution_id ' +
    'AND u.id = $1 WHERE m.id = $2', [actorId,modelId],
  );
  if(found.rowCount!==1)throw new MaturityError(404,'Maturity model not found');
  const result=await db.query(
    'SELECT id, version, status, created_at, published_at ' +
    'FROM maturity_model_versions WHERE model_id = $1 ORDER BY version DESC LIMIT 50',
    [modelId],
  );
  return { versions:result.rows };
}

export async function createNextMaturityVersionInTransaction(db, {actorId,modelId}) {
  if (!validId(modelId))throw new MaturityError(400,'Invalid maturity model ID');
  await permission(db,actorId,'assessments:write');
  const found=await db.query(
    'SELECT m.id FROM maturity_models m ' +
    'JOIN users u ON u.institution_id = m.institution_id AND u.id = $1 ' +
    'WHERE m.id = $2 FOR UPDATE OF m',[actorId,modelId],
  );
  if(found.rowCount!==1)throw new MaturityError(404,'Maturity model not found');
  const latest=await db.query(
    'SELECT id, version, status FROM maturity_model_versions ' +
    'WHERE model_id = $1 ORDER BY version DESC LIMIT 1',[modelId],
  );
  if(latest.rowCount!==1 || latest.rows[0].status!=='published')
    throw new MaturityError(409,'Publish the current draft first');
  const created=await db.query(
    'INSERT INTO maturity_model_versions (model_id,version,created_by) ' +
    'VALUES ($1,$2,$3) RETURNING id,version,status',
    [modelId,latest.rows[0].version+1,actorId],
  );
  const oldDomains=await db.query(
    'SELECT id,code,title,description,position FROM maturity_domains ' +
    'WHERE version_id=$1 ORDER BY position',[latest.rows[0].id],
  );
  for(const domain of oldDomains.rows){
    const inserted=await db.query(
      'INSERT INTO maturity_domains (version_id,code,title,description,position) ' +
      'VALUES($1,$2,$3,$4,$5) RETURNING id',
      [created.rows[0].id,domain.code,domain.title,domain.description,domain.position],
    );
    await db.query(
      'INSERT INTO maturity_domain_levels (domain_id,level,criterion) ' +
      'SELECT $1,level,criterion FROM maturity_domain_levels WHERE domain_id=$2',
      [inserted.rows[0].id,domain.id],
    );
  }
  await db.query(
    'INSERT INTO maturity_aggregation_policies(version_id,method,configured_by) ' +
    'SELECT $1,method,$3 FROM maturity_aggregation_policies WHERE version_id=$2',
    [created.rows[0].id,latest.rows[0].id,actorId],
  );
  return created.rows[0];
}

export async function addMaturityDomainInTransaction(db, {actorId, versionId, ...input}) {
  if (!validId(versionId))throw new MaturityError(400,'Invalid maturity version ID');
  const data=validateMaturityDomain(input);
  await permission(db,actorId,'assessments:write');
  const parent=await db.query(
    'SELECT v.status FROM maturity_model_versions v ' +
    'JOIN maturity_models m ON m.id = v.model_id ' +
    'JOIN users u ON u.institution_id = m.institution_id AND u.id=$1 ' +
    'WHERE v.id=$2 FOR UPDATE OF v',[actorId,versionId],
  );
  if(parent.rowCount!==1)throw new MaturityError(404,'Maturity version not found');
  if(parent.rows[0].status!=='draft')
    throw new MaturityError(409,'Published maturity rubric is immutable');
  const sequence=await db.query(
    'SELECT coalesce(max(position),0)+1 AS position FROM maturity_domains WHERE version_id=$1',
    [versionId],
  );
  const position=sequence.rows[0].position;
  if(position>30)throw new MaturityError(409,'Maximum 30 maturity domains');
  try{
    const added=await db.query(
      'INSERT INTO maturity_domains (version_id,code,title,description,position) ' +
      'VALUES($1,$2,$3,$4,$5) RETURNING id,code,title,description,position',
      [versionId,data.code,data.title,data.description,position],
    );
    return added.rows[0];
  }catch(error){
    if(error.code==='23505')throw new MaturityError(409,'Maturity domain code exists');
    throw error;
  }
}

export async function setMaturityLevelInTransaction(db, {actorId,domainId,level,criterion}) {
  if(!validId(domainId))throw new MaturityError(400,'Invalid maturity domain ID');
  validateLevelCriterion({level,criterion});
  await permission(db,actorId,'assessments:write');
  const domain=await db.query(
    'SELECT v.status FROM maturity_domains d ' +
    'JOIN maturity_model_versions v ON v.id=d.version_id ' +
    'JOIN maturity_models m ON m.id=v.model_id ' +
    'JOIN users u ON u.institution_id=m.institution_id AND u.id=$1 ' +
    'WHERE d.id=$2 FOR UPDATE OF v',[actorId,domainId],
  );
  if(domain.rowCount!==1)throw new MaturityError(404,'Maturity domain not found');
  if(domain.rows[0].status!=='draft')
    throw new MaturityError(409,'Published maturity rubric is immutable');
  const saved=await db.query(
    'INSERT INTO maturity_domain_levels (domain_id,level,criterion) VALUES($1,$2,$3) ' +
    'ON CONFLICT(domain_id,level) DO UPDATE SET criterion=EXCLUDED.criterion ' +
    'RETURNING level,criterion',[domainId,level,criterion],
  );
  return saved.rows[0];
}

export async function getMaturityRubric(db,actorId,versionId) {
  if(!validId(versionId))throw new MaturityError(400,'Invalid maturity version ID');
  await permission(db,actorId,'assessments:read');
  const version=await db.query(
    'SELECT v.id,v.version,v.status,m.code AS model_code,m.title AS model_title, ' +
    'm.methodology_reference FROM maturity_model_versions v ' +
    'JOIN maturity_models m ON m.id=v.model_id ' +
    'JOIN users u ON u.institution_id=m.institution_id AND u.id=$1 ' +
    'WHERE v.id=$2',[actorId,versionId],
  );
  if(version.rowCount!==1)throw new MaturityError(404,'Maturity version not found');
  const domains=await db.query(
    'SELECT id,code,title,description,position FROM maturity_domains ' +
    'WHERE version_id=$1 ORDER BY position',[versionId],
  );
  const levels=await db.query(
    'SELECT l.domain_id,l.level,l.criterion FROM maturity_domain_levels l ' +
    'JOIN maturity_domains d ON d.id=l.domain_id WHERE d.version_id=$1 ' +
    'ORDER BY d.position,l.level',[versionId],
  );
  const byId=new Map(domains.rows.map(d=>[d.id,{...d,levels:[]}]));
  for(const level of levels.rows) {
    byId.get(level.domain_id)?.levels.push({level:level.level,criterion:level.criterion});
  }
  const policy = await db.query(
    'SELECT method FROM maturity_aggregation_policies WHERE version_id=$1',
    [versionId],
  );
  return { version: version.rows[0], domains: [...byId.values()],
    aggregationMethod: policy.rows[0]?.method ?? null,
    note:'Metodologi internal pengguna; bukan hasil penilaian atau level maturitas yang disahkan OJK.' };
}

export async function publishMaturityVersionInTransaction(db,{actorId,versionId}) {
  if(!validId(versionId))throw new MaturityError(400,'Invalid maturity version ID');
  await permission(db,actorId,'assessments:write');
  const version=await db.query(
    'SELECT v.id,v.status FROM maturity_model_versions v ' +
    'JOIN maturity_models m ON m.id=v.model_id ' +
    'JOIN users u ON u.institution_id=m.institution_id AND u.id=$1 ' +
    'WHERE v.id=$2 FOR UPDATE OF v',[actorId,versionId],
  );
  if(version.rowCount!==1)throw new MaturityError(404,'Maturity version not found');
  if(version.rows[0].status!=='draft')
    throw new MaturityError(409,'Maturity version already published');
  const counts=await db.query(
    'SELECT d.id,count(l.level)::int AS levels ' +
    'FROM maturity_domains d LEFT JOIN maturity_domain_levels l ON l.domain_id=d.id ' +
    'WHERE d.version_id=$1 GROUP BY d.id',[versionId],
  );
  if(counts.rows.length===0 || counts.rows.some(d=>d.levels!==6)){
    throw new MaturityError(409,'Every domain requires criteria for levels 0 through 5');
  }
  const saved=await db.query(
    "UPDATE maturity_model_versions SET status='published',published_at=now() " +
    'WHERE id=$1 RETURNING id,version,status,published_at',[versionId],
  );
  return saved.rows[0];
}

export const createMaturityModel=(pool,args)=>
  withTransaction(pool,db=>createMaturityModelInTransaction(db,args));
export const createNextMaturityVersion=(pool,args)=>
  withTransaction(pool,db=>createNextMaturityVersionInTransaction(db,args));
export const addMaturityDomain=(pool,args)=>
  withTransaction(pool,db=>addMaturityDomainInTransaction(db,args));
export const setMaturityLevel=(pool,args)=>
  withTransaction(pool,db=>setMaturityLevelInTransaction(db,args));
export const publishMaturityVersion=(pool,args)=>
  withTransaction(pool,db=>publishMaturityVersionInTransaction(db,args));
