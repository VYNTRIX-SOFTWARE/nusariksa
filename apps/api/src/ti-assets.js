import {userHasPermission} from './authorization.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[A-Z][A-Z0-9_-]{1,31}$/;
const KINDS=new Set(['server','workstation','network','software','storage','other']);
const CRITICALITIES=new Set(['low','medium','high']);
const STATUSES=new Set(['active','maintenance','retired']);
const FIELDS=['assetCode','title','kind','ownerName','location','criticality','operationalStatus','note'];
const SELECT="a.id,a.institution_id,a.asset_code,a.title,a.kind,a.owner_name,a.location,a.criticality,a.operational_status,a.note,a.revision,a.archived_at,a.created_at,a.updated_at";
const SNAPSHOT="to_jsonb(a)-'institution_id'-'created_by'-'updated_by'";
export class AssetError extends Error{
  constructor(status,message){super(message);this.name='AssetError';this.status=status;}
}
function requireId(id){
  if(typeof id!=='string'||!UUID.test(id))throw new AssetError(400,'Invalid asset ID');
}
async function authorized(db,actorId,permission){
  requireId(actorId);
  if(!await userHasPermission(db,actorId,permission))
    throw new AssetError(403,'Forbidden');
}
function fieldString(value,min,max){
  return typeof value==='string'&&value.length>=min&&value.length<=max
    &&value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
}
export function validateAssetInput(payload,{update=false}={}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)
    ||Object.keys(payload).length!==FIELDS.length+(update?1:0)
    ||!FIELDS.every(k=>Object.hasOwn(payload,k))
    ||(update&&(!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision<1))
    ||!fieldString(payload.assetCode,2,32)||!CODE.test(payload.assetCode)
    ||!fieldString(payload.title,3,200)
    ||!KINDS.has(payload.kind)
    ||!fieldString(payload.ownerName,2,120)
    ||!fieldString(payload.location,2,200)
    ||!CRITICALITIES.has(payload.criticality)
    ||!STATUSES.has(payload.operationalStatus)
    ||typeof payload.note!=='string'||payload.note.length>2000
    ||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(payload.note))
      throw new AssetError(400,'Data aset tidak valid');
  return payload;
}
function rowValues(x){
  return [x.assetCode,x.title,x.kind,x.ownerName,x.location,x.criticality,
    x.operationalStatus,x.note];
}
function wrapConflict(error){
  if(error.code==='23505')throw new AssetError(409,'Kode aset sudah digunakan di institusi ini');
  throw error;
}
async function findForUpdate(db,actorId,id){
  requireId(id);
  const result=await db.query(
    "SELECT a.* FROM ti_assets a JOIN users u ON u.institution_id=a.institution_id "+
    "AND u.id=$1 WHERE a.id=$2 FOR UPDATE OF a",[actorId,id]);
  if(result.rowCount!==1)throw new AssetError(404,'Aset tidak ditemukan');
  return result.rows[0];
}
async function appendEvent(db,asset,actorId,action,before=null){
  await db.query(
    'INSERT INTO ti_asset_events(institution_id,asset_id,actor_user_id,action,revision,old_values,new_values) '+
    'VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',
    [asset.institution_id,asset.id,actorId,action,asset.revision,
      before?JSON.stringify(before):null,JSON.stringify(asset)]);
}
function snapshot(x){
  return Object.fromEntries(Object.entries(x).filter(([k])=>
    !['institution_id','created_by','updated_by'].includes(k)));
}
export async function listAssets(db,{actorId,q='',status='active',kind='all',criticality='all',offset=0}){
  await authorized(db,actorId,'assets:read');
  if(typeof q!=='string'||q.length>80||!['active','archived','all'].includes(status)
    ||!(kind==='all'||KINDS.has(kind))
    ||!(criticality==='all'||CRITICALITIES.has(criticality))
    ||!Number.isInteger(offset)||offset<0||offset>10000)
    throw new AssetError(400,'Filter aset tidak valid');
  const parameters=[actorId];
  const filters=['u.id=$1'];
  if(q.trim()){
    parameters.push(q.trim());
    const param='$'+parameters.length;
    filters.push('(position(lower('+param+') in lower(a.asset_code))>0 '+
      'OR position(lower('+param+') in lower(a.title))>0 '+
      'OR position(lower('+param+') in lower(a.owner_name))>0)');
  }
  if(status!=='all')filters.push(status==='archived'
    ?'a.archived_at IS NOT NULL':'a.archived_at IS NULL');
  if(kind!=='all'){parameters.push(kind);filters.push('a.kind=$'+parameters.length);}
  if(criticality!=='all'){parameters.push(criticality);filters.push('a.criticality=$'+parameters.length);}
  parameters.push(offset);
  const result=await db.query(
    'SELECT '+SELECT+' FROM ti_assets a JOIN users u ON u.institution_id=a.institution_id '+
    'WHERE '+filters.join(' AND ')+' ORDER BY a.updated_at DESC,a.id DESC '+
    'LIMIT 51 OFFSET $'+parameters.length,parameters);
  return {assets:result.rows.slice(0,50),hasMore:result.rows.length>50,offset};
}
export async function getAsset(db,{actorId,id}){
  await authorized(db,actorId,'assets:read');requireId(id);
  const result=await db.query('SELECT '+SELECT+
    ' FROM ti_assets a JOIN users u ON u.institution_id=a.institution_id AND u.id=$1 '+
    'WHERE a.id=$2',[actorId,id]);
  if(result.rowCount!==1)throw new AssetError(404,'Aset tidak ditemukan');
  return result.rows[0];
}
export async function assetHistory(db,{actorId,id}){
  await getAsset(db,{actorId,id});
  const rows=await db.query('SELECT e.id,e.actor_user_id,e.action,e.revision,'+
    'e.old_values,e.new_values,e.occurred_at FROM ti_asset_events e '+
    'JOIN ti_assets a ON a.id=e.asset_id JOIN users u '+
    'ON u.institution_id=a.institution_id AND u.id=$1 WHERE e.asset_id=$2 '+
    'ORDER BY e.id DESC LIMIT 100',[actorId,id]);
  return {events:rows.rows};
}
export async function createAssetInTransaction(db,{actorId,...input}){
  await authorized(db,actorId,'assets:write');
  const data=validateAssetInput(input);
  try{
    const result=await db.query(
      'INSERT INTO ti_assets(institution_id,asset_code,title,kind,owner_name,location,'+
      'criticality,operational_status,note,created_by,updated_by) '+
      'SELECT u.institution_id,$2,$3,$4,$5,$6,$7,$8,$9,u.id,u.id FROM users u '+
      "WHERE u.id=$1 AND u.status='active' AND u.password_hash IS NOT NULL RETURNING *",
      [actorId,...rowValues(data)]);
    if(result.rowCount!==1)throw new AssetError(403,'Forbidden');
    const asset=result.rows[0];
    await appendEvent(db,asset,actorId,'CREATED');
    return getAsset(db,{actorId,id:asset.id});
  }catch(error){wrapConflict(error);}
}
export async function updateAssetInTransaction(db,{actorId,id,...input}){
  await authorized(db,actorId,'assets:write');
  const data=validateAssetInput(input,{update:true});
  const before=await findForUpdate(db,actorId,id);
  if(before.archived_at)throw new AssetError(409,'Aset telah diarsipkan dan tidak dapat diubah');
  if(before.revision!==data.expectedRevision)throw new AssetError(409,'Data aset berubah. Muat ulang sebelum mengedit.');
  if(before.asset_code!==data.assetCode)
    throw new AssetError(400,'Kode aset permanen dan tidak dapat diganti');
  try{
    const updated=await db.query(
      'UPDATE ti_assets SET title=$2,kind=$3,owner_name=$4,location=$5,criticality=$6,'+
      'operational_status=$7,note=$8,updated_by=$9,updated_at=now(),revision=revision+1 '+
      'WHERE id=$1 RETURNING *',
      [id,data.title,data.kind,data.ownerName,data.location,data.criticality,
        data.operationalStatus,data.note,actorId]);
    await appendEvent(db,updated.rows[0],actorId,'UPDATED',snapshot(before));
    return getAsset(db,{actorId,id});
  }catch(error){wrapConflict(error);}
}
export async function archiveAssetInTransaction(db,{actorId,id,expectedRevision}){
  await authorized(db,actorId,'assets:write');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
    throw new AssetError(400,'Revisi aset tidak valid');
  const before=await findForUpdate(db,actorId,id);
  if(before.archived_at)throw new AssetError(409,'Aset sudah diarsipkan');
  if(before.revision!==expectedRevision)throw new AssetError(409,'Data aset berubah. Muat ulang.');
  const result=await db.query(
    'UPDATE ti_assets SET archived_at=now(),updated_at=now(),updated_by=$2,'+
    'revision=revision+1 WHERE id=$1 RETURNING *',[id,actorId]);
  await appendEvent(db,result.rows[0],actorId,'ARCHIVED',snapshot(before));
  return getAsset(db,{actorId,id});
}
async function transaction(pool,fn){
  const client=await pool.connect();
  try{await client.query('BEGIN');const out=await fn(client);await client.query('COMMIT');return out;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export const createAsset=(pool,args)=>transaction(pool,db=>createAssetInTransaction(db,args));
export const updateAsset=(pool,args)=>transaction(pool,db=>updateAssetInTransaction(db,args));
export const archiveAsset=(pool,args)=>transaction(pool,db=>archiveAssetInTransaction(db,args));
