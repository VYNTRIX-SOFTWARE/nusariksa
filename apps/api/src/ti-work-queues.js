import {userHasPermission} from './authorization.js';
import {FindingError} from './ti-findings.js';
import {VendorError} from './ti-vendors.js';

const numeric=value=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0)throw new TypeError('Jumlah antrian tidak valid');
  return n;
};

/**
 * Read-only, tenant-scoped work summary; a current user's maker and reviewer
 * actions are separated. Counts cover the whole institution, not a page.
 */
export async function getFindingWorkQueue(db,{actorId}){
  if(!await userHasPermission(db,actorId,'findings:read'))
    throw new FindingError(403,'Tidak memiliki izin membaca temuan');
  const canReview=await userHasPermission(db,actorId,'findings:verify');
  const result=await db.query(
    "SELECT "+
    "count(*) FILTER (WHERE f.status<>'closed')::int AS active, "+
    "count(*) FILTER (WHERE f.created_by=$1 AND "+
      "f.status IN ('open','in_progress','changes_requested'))::int AS my_work, "+
    "count(*) FILTER (WHERE f.status='pending_verification' AND "+
      "f.created_by<>$1 AND f.submitted_by<>$1)::int AS reviewable, "+
    "count(*) FILTER (WHERE f.status<>'closed' AND "+
      "f.due_date<(now() AT TIME ZONE 'Asia/Jakarta')::date)::int AS overdue, "+
    "count(*) FILTER (WHERE f.status='closed')::int AS closed "+
    "FROM ti_findings f JOIN users u ON u.institution_id=f.institution_id "+
    "AND u.id=$1 WHERE f.archived_at IS NULL",
    [actorId],
  );
  const row=result.rows[0];
  if(result.rowCount!==1||!row)throw new TypeError('Ringkasan temuan tidak tersedia');
  return {
    kind:'TI_FINDINGS_WORK_QUEUE',
    active:numeric(row.active),myWork:numeric(row.my_work),
    reviewable:canReview?numeric(row.reviewable):0,
    overdue:numeric(row.overdue),closed:numeric(row.closed),
    canReview,
  };
}

/** All-contract overview plus the next 20 time-critical contract references. */
export async function getVendorWorkQueue(db,{actorId}){
  if(!await userHasPermission(db,actorId,'vendors:read'))
    throw new VendorError(403,'Tidak memiliki izin membaca penyedia');
  const result=await db.query(
    "WITH bank_vendors AS ("+
      "SELECT v.id,v.status FROM ti_vendors v JOIN users u "+
      "ON u.institution_id=v.institution_id AND u.id=$1 "+
      "WHERE v.archived_at IS NULL), "+
    "bank_contracts AS ("+
      "SELECT c.* FROM ti_vendor_contracts c "+
      "JOIN bank_vendors v ON v.id=c.vendor_id "+
      "WHERE c.archived_at IS NULL) "+
    "SELECT (SELECT count(*)::int FROM bank_vendors WHERE status='active') AS providers, "+
      "count(*) FILTER (WHERE c.status='active')::int AS contracts, "+
      "count(*) FILTER (WHERE c.status='active' AND "+
        "c.end_date<(now() AT TIME ZONE 'Asia/Jakarta')::date)::int AS expired, "+
      "count(*) FILTER (WHERE c.status='active' AND "+
        "c.end_date BETWEEN (now() AT TIME ZONE 'Asia/Jakarta')::date "+
        "AND (now() AT TIME ZONE 'Asia/Jakarta')::date+30)::int AS expiring, "+
      "count(*) FILTER (WHERE c.status='active' AND NOT EXISTS "+
        "(SELECT 1 FROM ti_vendor_service_reviews s WHERE s.contract_id=c.id))::int "+
        "AS without_review "+
    "FROM bank_contracts c",
    [actorId],
  );
  if(result.rowCount!==1)throw new TypeError('Ringkasan kontrak tidak tersedia');
  const row=result.rows[0];
  const alerts=await db.query(
    "SELECT c.id AS \"contractId\",c.vendor_id AS \"vendorId\", "+
      "c.contract_code AS \"contractCode\",c.service_name AS \"serviceName\", "+
      "v.name AS \"vendorName\",to_char(c.end_date,'YYYY-MM-DD') AS \"endDate\", "+
      "CASE WHEN c.end_date<(now() AT TIME ZONE 'Asia/Jakarta')::date "+
      "THEN 'expired' ELSE 'expiring' END AS state "+
    "FROM ti_vendor_contracts c "+
    "JOIN ti_vendors v ON v.id=c.vendor_id "+
    "JOIN users u ON u.institution_id=v.institution_id AND u.id=$1 "+
    "WHERE v.archived_at IS NULL AND c.archived_at IS NULL "+
    "AND c.status='active' AND "+
      "c.end_date<=(now() AT TIME ZONE 'Asia/Jakarta')::date+30 "+
    "ORDER BY c.end_date,c.id LIMIT 21",
    [actorId],
  );
  return {
    kind:'TI_VENDOR_WORK_QUEUE',
    providers:numeric(row.providers),contracts:numeric(row.contracts),
    expired:numeric(row.expired),expiring:numeric(row.expiring),
    withoutReview:numeric(row.without_review),
    alerts:alerts.rows.slice(0,20),
    truncated:alerts.rows.length>20,
  };
}
