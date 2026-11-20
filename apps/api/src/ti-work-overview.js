import {userHasPermission} from './authorization.js';

const RIGHTS=Object.freeze({
  findings:'findings:read',incidents:'incidents:read',risks:'risks:read',
  vendors:'vendors:read',recovery:'recovery:read',
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed=Object.keys(RIGHTS);
export class TiWorkError extends Error{
  constructor(status,message){super(message);this.name='TiWorkError';this.status=status;}
}
const positiveInt=(n)=>{const value=Number(n);if(!Number.isSafeInteger(value)||value<0)
  throw new TypeError('Jumlah perhatian TI tidak valid');return value;};
const asItem=(kind,row)=>({
  type:kind,id:row.id,relatedId:row.related_id??null,
  code:row.code,title:row.title,reason:row.reason,
  priority:positiveInt(row.priority),dueDate:row.due_date??null,
});
/**
 * Lightweight cross-register overview. Each branch is only queried when the
 * authenticated user can read that register. Never uses the frontend's page
 * size as the basis for institution-wide attention counts.
 */
export async function getTiWorkOverview(db,{actorId}){
  if(typeof actorId!=='string'||!UUID.test(actorId))
    throw new TiWorkError(403,'Tidak memiliki izin melihat pekerjaan TI.');
  const rights=Object.fromEntries(await Promise.all(allowed.map(async kind=>
    [kind,await userHasPermission(db,actorId,RIGHTS[kind])])));
  if(!allowed.some(kind=>rights[kind]))
    throw new TiWorkError(403,'Tidak memiliki izin melihat pekerjaan TI.');
  const review=rights.findings&&await userHasPermission(db,actorId,'findings:verify');
  const modules=[],items=[];
  const append=(kind,result)=>{const count=positiveInt(result.rows[0]?.total??0);
    modules.push({type:kind,count});
    for(const row of result.rows.slice(1))items.push(asItem(kind,row));
  };
  // Rows: first record is a global count, followed by up to 8 actionable
  // references. UNION keeps count accurate even when no items match.
  if(rights.findings){
    const result=await db.query(
      "WITH tasks AS ("+
      " SELECT f.id,f.finding_code AS code,f.title,f.due_date, "+
      " CASE WHEN $2::boolean AND f.status='pending_verification' "+
      " AND f.created_by<>$1 AND f.submitted_by<>$1 THEN 'Menunggu pemeriksaan Anda' "+
      " WHEN f.status<>'closed' AND f.due_date<(now() AT TIME ZONE 'Asia/Jakarta')::date "+
      " THEN 'Melewati target penyelesaian' ELSE 'Tindak lanjut Anda' END AS reason, "+
      " CASE WHEN $2::boolean AND f.status='pending_verification' "+
      " AND f.created_by<>$1 AND f.submitted_by<>$1 THEN 1 "+
      " WHEN f.status<>'closed' AND f.due_date<(now() AT TIME ZONE 'Asia/Jakarta')::date "+
      " THEN 2 ELSE 5 END AS priority "+
      " FROM ti_findings f JOIN users u ON u.institution_id=f.institution_id "+
      " AND u.id=$1 WHERE f.archived_at IS NULL AND ("+
      " (f.created_by=$1 AND f.status IN ('open','in_progress','changes_requested')) "+
      " OR ($2::boolean AND f.status='pending_verification' "+
      " AND f.created_by<>$1 AND f.submitted_by<>$1) "+
      " OR (f.status<>'closed' AND f.due_date<(now() AT TIME ZONE 'Asia/Jakarta')::date))) "+
      " SELECT count(*)::int AS total,NULL::uuid AS id,NULL::text AS code,"+
      " NULL::text AS title,NULL::date AS due_date,NULL::text AS reason,NULL::int AS priority "+
      " FROM tasks UNION ALL SELECT NULL,id,code,title,due_date,reason,priority "+
      " FROM (SELECT * FROM tasks ORDER BY priority,due_date,id LIMIT 8) t ORDER BY total DESC NULLS LAST,priority NULLS LAST,due_date,id",
      [actorId,Boolean(review)]);
    append('findings',result);
  }
  if(rights.incidents){
    const result=await db.query(
      "WITH tasks AS (SELECT i.id,i.incident_code AS code,i.title,"+
      " i.detected_at::date AS due_date,"+
      " CASE WHEN i.severity IN ('high','critical') THEN 'Gangguan belum selesai - prioritas tinggi' "+
      " ELSE 'Insiden belum selesai' END AS reason,"+
      " CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 "+
      " WHEN 'medium' THEN 5 ELSE 7 END AS priority "+
      " FROM ti_incidents i JOIN users u ON u.institution_id=i.institution_id AND u.id=$1 "+
      " WHERE i.archived_at IS NULL AND i.status NOT IN ('resolved','closed')) "+
      " SELECT count(*)::int AS total,NULL::uuid AS id,NULL::text AS code,"+
      " NULL::text AS title,NULL::date AS due_date,NULL::text AS reason,NULL::int AS priority "+
      " FROM tasks UNION ALL SELECT NULL,id,code,title,due_date,reason,priority "+
      " FROM (SELECT * FROM tasks ORDER BY priority,due_date,id LIMIT 8) t ORDER BY total DESC NULLS LAST,priority NULLS LAST,due_date,id",
      [actorId]);
    append('incidents',result);
  }
  if(rights.risks){
    const result=await db.query(
      "WITH tasks AS (SELECT r.id,r.risk_code AS code,r.title,r.due_date,"+
      " 'Risiko inheren tinggi/kritis belum ditutup'::text AS reason,"+
      " CASE WHEN r.likelihood*r.impact>=17 THEN 3 ELSE 4 END AS priority "+
      " FROM ti_risks r JOIN users u ON u.institution_id=r.institution_id AND u.id=$1 "+
      " WHERE r.archived_at IS NULL AND r.status<>'closed' "+
      " AND r.likelihood*r.impact>=10) "+
      " SELECT count(*)::int AS total,NULL::uuid AS id,NULL::text AS code,"+
      " NULL::text AS title,NULL::date AS due_date,NULL::text AS reason,NULL::int AS priority "+
      " FROM tasks UNION ALL SELECT NULL,id,code,title,due_date,reason,priority "+
      " FROM (SELECT * FROM tasks ORDER BY priority,due_date,id LIMIT 8) t ORDER BY total DESC NULLS LAST,priority NULLS LAST,due_date,id",
      [actorId]);
    append('risks',result);
  }
  if(rights.vendors){
    const result=await db.query(
      "WITH tasks AS (SELECT c.id,c.vendor_id AS related_id,"+
      " c.contract_code AS code,c.service_name AS title,c.end_date AS due_date,"+
      " CASE WHEN c.end_date<(now() AT TIME ZONE 'Asia/Jakarta')::date "+
      " THEN 'Kontrak melewati masa berlaku' "+
      " WHEN c.end_date<=(now() AT TIME ZONE 'Asia/Jakarta')::date+30 "+
      " THEN 'Kontrak berakhir dalam 30 hari' ELSE 'Belum ada evaluasi SLA tercatat' END AS reason,"+
      " CASE WHEN c.end_date<(now() AT TIME ZONE 'Asia/Jakarta')::date THEN 2 "+
      " WHEN c.end_date<=(now() AT TIME ZONE 'Asia/Jakarta')::date+30 THEN 4 ELSE 6 END AS priority "+
      " FROM ti_vendor_contracts c JOIN ti_vendors v ON v.id=c.vendor_id "+
      " AND v.institution_id=c.institution_id "+
      " JOIN users u ON u.institution_id=c.institution_id AND u.id=$1 "+
      " WHERE c.archived_at IS NULL AND v.archived_at IS NULL "+
      " AND c.status='active' AND (c.end_date<=(now() AT TIME ZONE 'Asia/Jakarta')::date+30 "+
      " OR NOT EXISTS(SELECT 1 FROM ti_vendor_service_reviews s WHERE s.contract_id=c.id))) "+
      " SELECT count(*)::int AS total,NULL::uuid AS id,NULL::uuid AS related_id,"+
      " NULL::text AS code,NULL::text AS title,NULL::date AS due_date,"+
      " NULL::text AS reason,NULL::int AS priority FROM tasks "+
      " UNION ALL SELECT NULL,id,related_id,code,title,due_date,reason,priority "+
      " FROM (SELECT * FROM tasks ORDER BY priority,due_date,id LIMIT 8) t ORDER BY total DESC NULLS LAST,priority NULLS LAST,due_date,id",
      [actorId]);
    append('vendors',result);
  }
  if(rights.recovery){
    const result=await db.query(
      "WITH tasks AS (SELECT p.id,p.plan_code AS code,p.service_name AS title,"+
      " p.created_at::date AS due_date,"+
      " 'Belum ada pengujian pemulihan tercatat'::text AS reason,6::int AS priority "+
      " FROM ti_recovery_plans p JOIN users u "+
      " ON u.institution_id=p.institution_id AND u.id=$1 "+
      " WHERE p.archived_at IS NULL AND NOT EXISTS "+
      " (SELECT 1 FROM ti_recovery_exercises e WHERE e.plan_id=p.id)) "+
      " SELECT count(*)::int AS total,NULL::uuid AS id,NULL::text AS code,"+
      " NULL::text AS title,NULL::date AS due_date,NULL::text AS reason,NULL::int AS priority "+
      " FROM tasks UNION ALL SELECT NULL,id,code,title,due_date,reason,priority "+
      " FROM (SELECT * FROM tasks ORDER BY priority,due_date,id LIMIT 8) t ORDER BY total DESC NULLS LAST,priority NULLS LAST,due_date,id",
      [actorId]);
    append('recovery',result);
  }
  // Keep a deterministic, bounded queue; count cards remain all-institution.
  items.sort((a,b)=>a.priority-b.priority||
    String(a.dueDate??'').localeCompare(String(b.dueDate??''))||
    a.type.localeCompare(b.type)||a.id.localeCompare(b.id));
  return {kind:'TI_WORK_OVERVIEW',generatedAt:new Date().toISOString(),
    modules,items:items.slice(0,20),hasMore:modules.reduce((n,m)=>n+m.count,0)>items.slice(0,20).length};
}
