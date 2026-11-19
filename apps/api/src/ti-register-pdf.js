import {userHasPermission} from './authorization.js';
import {REGISTER_EXPORTS,RegisterExportError} from './ti-register-exports.js';
import {makeOperationalRegisterPdf} from './ti-register-professional-pdf.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PDF_REGISTER_LIMIT=500;

/**
 * Read an entire operational register, including archived records, rather than
 * silently exporting only the currently paginated or filtered browser view.
 * One repeatable-read snapshot provides consistent bank identity and records.
 */
export async function buildOperationalRegisterPdfSnapshot(db,{actorId,type}){
  if(!Object.hasOwn(REGISTER_EXPORTS,type))
    throw new RegisterExportError(404,'Jenis laporan tidak tersedia.');
  if(typeof actorId!=='string'||!UUID.test(actorId))
    throw new RegisterExportError(403,'Tidak memiliki izin mengunduh laporan.');
  const spec=REGISTER_EXPORTS[type];
  if(!await userHasPermission(db,actorId,'reports:read')
    ||!await userHasPermission(db,actorId,spec.permission))
    throw new RegisterExportError(403,'Tidak memiliki izin mengunduh laporan.');

  const identity=await db.query(
    'SELECT i.name,i.kind FROM users u JOIN institutions i ON i.id=u.institution_id '+
    'WHERE u.id=$1 AND u.status=\'active\' AND u.password_hash IS NOT NULL',[actorId]);
  if(identity.rowCount!==1)
    throw new RegisterExportError(403,'Lembaga atau pengguna tidak tersedia.');

  // Names come exclusively from the fixed server-side export registry.
  const columns=spec.columns.map(([name])=>name);
  const tenantJoin=type==='vendor-sla'
    ?' FROM ti_vendor_service_reviews r '+
      'JOIN ti_vendor_contracts c ON c.id=r.contract_id '+
      'JOIN ti_vendors v ON v.id=c.vendor_id AND v.institution_id=c.institution_id '+
      'JOIN users u ON u.institution_id=v.institution_id AND u.id=$1 '
    :' FROM '+spec.table+' r JOIN users u ON u.institution_id=r.institution_id '+
      'AND u.id=$1 ';
  const orderBy=columns.includes('recorded_at')?'r.recorded_at':'r.created_at';
  const sql='SELECT '+columns.map(name=>'r.'+name).join(',')+tenantJoin+
    'ORDER BY '+orderBy+' DESC, r.id DESC LIMIT 501';
  const rows=await db.query(sql,[actorId]);
  if(rows.rows.length>PDF_REGISTER_LIMIT)
    throw new RegisterExportError(409,
      'Register melebihi 500 catatan. Gunakan CSV untuk ekspor lengkap.');
  return {type,institution:identity.rows[0],columns:spec.columns,
    rows:rows.rows,generatedAt:new Date().toISOString(),scope:'all'};
}

export async function exportOperationalRegisterPdf(pool,{actorId,type}){
  // A pooled client can also expose connect(), but must not be reconnected.
  const owns=typeof pool.connect==='function'&&typeof pool.release!=='function';
  const db=owns?await pool.connect():pool;
  try{
    if(owns)await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot=await buildOperationalRegisterPdfSnapshot(db,{actorId,type});
    const pdf=makeOperationalRegisterPdf(snapshot);
    if(owns)await db.query('COMMIT');
    return pdf;
  }catch(error){
    if(owns)await db.query('ROLLBACK');
    throw error;
  }finally{if(owns)db.release();}
}
