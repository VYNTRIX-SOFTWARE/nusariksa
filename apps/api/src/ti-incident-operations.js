import {userHasPermission} from './authorization.js';

export class IncidentReportError extends Error{
  constructor(status,message){super(message);this.name='IncidentReportError';this.status=status;}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(status,message)=>{throw new IncidentReportError(status,message);};
const STATUSES=['reported','investigating','contained','resolved','closed'];
const SEVERITIES=['low','medium','high','critical'];
const names=['ID','Kode','Judul','Kategori','Keparahan','Status','Terdeteksi (UTC)',
  'Dipulihkan (UTC)','Ditutup (UTC)','PIC','Kode Aset','Kode Risiko',
  'Deskripsi','Dampak','Pengendalian','Penyebab','Pemulihan'];
const selected=[
  'id','incident_code','title','category','severity','status','detected_at',
  'resolved_at','closed_at','pic','asset_code','risk_code','description',
  'impact_summary','containment_action','root_cause','resolution',
];
const from=x=>x instanceof Date?x.toISOString():x??'';
export function incidentCsvField(value){
  let str=String(from(value));
  // Excel and other spreadsheets may execute formulas even in quoted cells.
  if(/^[\s\uFEFF]*[=+\-@]/u.test(str))str="'"+str;
  return '"'+str.replaceAll('"','""')+'"';
}
export function encodeIncidentRegisterCsv(rows){
  if(!Array.isArray(rows)||rows.length>5000)throw new TypeError('Jumlah insiden ekspor tidak valid');
  return Buffer.from('\uFEFF'+[names,...rows.map(row=>selected.map(key=>row[key]))]
    .map(cells=>cells.map(incidentCsvField).join(',')).join('\r\n')+'\r\n','utf8');
}
async function authorize(db,actorId,exporting){
  if(typeof actorId!=='string'||!UUID.test(actorId)
    ||!await userHasPermission(db,actorId,'incidents:read')
    ||(exporting&&!await userHasPermission(db,actorId,'reports:read')))
    fail(403,'Forbidden');
}
export async function incidentOperationsOverview(db,{actorId}){
  await authorize(db,actorId,false);
  // Aggregate in PostgreSQL: at most 40 status/severity/archive groups, not
  // unbounded incident descriptions loaded into API memory.
  const result=await db.query(
    'SELECT i.status,i.severity,(i.archived_at IS NOT NULL) AS archived,'+
    'count(*)::int AS total,min(i.detected_at) AS oldest '+
    'FROM ti_incidents i JOIN users u ON u.institution_id=i.institution_id '+
    'AND u.id=$1 GROUP BY i.status,i.severity,(i.archived_at IS NOT NULL)',
    [actorId],
  );
  const statuses=Object.fromEntries(STATUSES.map(k=>[k,0]));
  const severities=Object.fromEntries(SEVERITIES.map(k=>[k,0]));
  let totalActive=0,archived=0,unresolved=0,highCriticalUnresolved=0;
  let oldestUnresolvedAt=null;
  for(const row of result.rows){
    const total=Number(row.total);
    if(!STATUSES.includes(row.status)||!SEVERITIES.includes(row.severity)
      ||!Number.isSafeInteger(total)||total<1||typeof row.archived!=='boolean')
      fail(503,'Data register insiden tidak konsisten');
    if(row.archived){archived+=total;continue;}
    totalActive+=total;statuses[row.status]+=total;severities[row.severity]+=total;
    if(!['closed','resolved'].includes(row.status)){
      unresolved+=total;
      if(['high','critical'].includes(row.severity))highCriticalUnresolved+=total;
      const date=from(row.oldest);
      if(typeof date!=='string'||!Number.isFinite(Date.parse(date)))
        fail(503,'Waktu insiden tidak valid');
      if(!oldestUnresolvedAt||date<oldestUnresolvedAt)oldestUnresolvedAt=date;
    }
  }
  return {totalActive,archived,unresolved,highCriticalUnresolved,
    oldestUnresolvedAt,statuses,severities,
    kind:'INTERNAL_OPERATIONAL_OVERVIEW',regulatoryAssessment:false};
}
export async function exportIncidentRegister(db,{actorId,view='all'}){
  await authorize(db,actorId,true);
  if(!['active','archived','all'].includes(view))
    fail(400,'Filter ekspor insiden tidak valid');
  const where=view==='all'?'':view==='active'?'AND i.archived_at IS NULL ':
    'AND i.archived_at IS NOT NULL ';
  const rows=await db.query(
    'SELECT i.id,i.incident_code,i.title,i.category,i.severity,i.status,'+
    'i.detected_at,i.resolved_at,i.closed_at,i.pic,'+
    'a.asset_code,r.risk_code,i.description,i.impact_summary,'+
    'i.containment_action,i.root_cause,i.resolution FROM ti_incidents i '+
    'JOIN users u ON u.institution_id=i.institution_id AND u.id=$1 '+
    'LEFT JOIN ti_assets a ON a.id=i.asset_id AND a.institution_id=i.institution_id '+
    'LEFT JOIN ti_risks r ON r.id=i.risk_id AND r.institution_id=i.institution_id '+
    'WHERE u.id=$1 '+where+'ORDER BY i.detected_at DESC,i.id DESC LIMIT 5001',
    [actorId],
  );
  if(rows.rows.length>5000)fail(409,'Ekspor melebihi 5.000 insiden. Gunakan sistem arsip yang sesuai.');
  return encodeIncidentRegisterCsv(rows.rows);
}
