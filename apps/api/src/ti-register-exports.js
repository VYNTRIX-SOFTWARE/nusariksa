import {userHasPermission} from './authorization.js';
import {getMaturityAssessmentInTransaction} from './maturity-assessments.js';
import {listPadkIndicatorNotes} from './padk-preparation-indicators.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const def=(permission,table,columns)=>({permission,table,columns});
export class RegisterExportError extends Error{
  constructor(status,message){super(message);this.name='RegisterExportError';this.status=status;}
}
const fail=(status,message)=>{throw new RegisterExportError(status,message);};

/** Every registered field is an explicit static SQL expression, not user input. */
export const REGISTER_EXPORTS=Object.freeze({
  assets:def('assets:read','ti_assets',[
    ['asset_code','Kode aset'],['title','Nama aset'],['kind','Jenis'],
    ['owner_name','Penanggung jawab'],['location','Lokasi'],['criticality','Kritisitas'],
    ['operational_status','Kondisi'],['note','Catatan'],['archived_at','Diarsipkan UTC']
  ]),
  risks:def('risks:read','ti_risks',[
    ['risk_code','Kode risiko'],['title','Risiko'],['scenario','Skenario risiko'],
    ['likelihood','Kemungkinan'],['impact','Dampak'],['residual_likelihood','Kemungkinan residual'],
    ['residual_impact','Dampak residual'],['mitigation','Mitigasi'],['pic','PIC'],
    ['due_date','Target penyelesaian'],['status','Status'],['note','Catatan'],
    ['archived_at','Diarsipkan UTC']
  ]),
  incidents:def('incidents:read','ti_incidents',[
    ['incident_code','Kode insiden'],['title','Judul kejadian'],
    ['category','Kategori'],['severity','Keparahan'],
    ['description','Keterangan awal'],['detected_at','Terdeteksi UTC'],
    ['pic','PIC'],['impact_summary','Dampak'],
    ['containment_action','Langkah pengendalian'],
    ['root_cause','Penyebab'],['resolution','Pemulihan'],
    ['status','Status'],['resolved_at','Dipulihkan UTC'],
    ['closed_at','Ditutup UTC'],['archived_at','Diarsipkan UTC']
  ]),
  findings:def('findings:read','ti_findings',[
    ['finding_code','Kode temuan'],['title','Temuan'],['description','Uraian'],
    ['source_type','Sumber'],['priority','Prioritas'],['pic','PIC'],
    ['due_date','Target'],['action_plan','Rencana tindak lanjut'],
    ['progress_note','Hasil tindak lanjut'],['evidence_reference','Referensi bukti'],
    ['status','Status'],['archived_at','Diarsipkan UTC']
  ]),
  vendors:def('vendors:read','ti_vendors',[
    ['vendor_code','Kode vendor'],['name','Nama penyedia'],
    ['service_category','Kategori layanan'],['contact_name','PIC vendor'],
    ['contact_email','Email'],['owner_pic','PIC internal'],
    ['criticality','Kritisitas'],['status','Status'],['note','Catatan'],
    ['archived_at','Diarsipkan UTC']
  ]),
  'vendor-contracts':def('vendors:read','ti_vendor_contracts',[
    ['contract_code','Kode kontrak'],['service_name','Nama layanan'],
    ['contract_reference','Referensi perjanjian'],['service_description','Cakupan layanan'],
    ['start_date','Mulai'],['end_date','Berakhir'],
    ['owner_pic','PIC internal'],['sla_uptime_target','Target uptime persen'],
    ['sla_response_target_hours','Target respons jam'],['status','Status'],
    ['note','Catatan'],['archived_at','Diarsipkan UTC']
  ]),
  'vendor-sla':def('vendors:read','ti_vendor_service_reviews',[
    ['period_start','Periode mulai'],['period_end','Periode akhir'],
    ['measured_uptime','Uptime tercatat persen'],
    ['measured_response_hours','Respons tercatat jam'],
    ['sla_result','Hasil evaluasi numerik'],['summary','Catatan evaluasi'],
    ['recorded_at','Dicatat UTC']
  ]),
  recovery:def('recovery:read','ti_recovery_plans',[
    ['plan_code','Kode rencana'],['service_name','Layanan'],['scenario','Skenario'],
    ['business_impact','Dampak bisnis'],['activation_criteria','Kriteria aktivasi'],
    ['owner_pic','PIC'],['alternate_pic','PIC pengganti'],
    ['rto_minutes','RTO menit'],['rpo_minutes','RPO menit'],
    ['recovery_steps','Langkah pemulihan'],['communication_steps','Komunikasi'],
    ['dependencies','Ketergantungan'],['backup_reference','Acuan backup'],
    ['status','Status'],['archived_at','Diarsipkan UTC']
  ]),
  'recovery-tests':def('recovery:read','ti_recovery_exercises',[
    ['exercise_date','Tanggal uji'],['exercise_type','Jenis uji'],
    ['observed_rto_minutes','RTO terukur menit'],['observed_rpo_minutes','RPO terukur menit'],
    ['outcome','Hasil'],['summary','Ringkasan'],
    ['follow_up','Tindak lanjut'],['evidence_reference','Referensi bukti'],
    ['recorded_at','Dicatat UTC']
  ]),
});
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export function csvRegisterCell(value){
  let s=value==null?'':value instanceof Date?value.toISOString():String(value);
  s=s.replace(CONTROL,' ');
  if(/^[\s\uFEFF]*[=+\-@]/u.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function makeRegisterCsv(columns,rows){
  if(!Array.isArray(columns)||!columns.length||!Array.isArray(rows)||rows.length>5000)
    throw new TypeError('Rincian ekspor tidak valid');
  return Buffer.from('\uFEFF'+[columns,...rows].map(row=>row.map(csvRegisterCell).join(','))
    .join('\r\n')+'\r\n','utf8');
}
async function check(db,actorId,permission){
  if(typeof actorId!=='string'||!UUID.test(actorId)
    ||!await userHasPermission(db,actorId,'reports:read')
    ||!await userHasPermission(db,actorId,permission))
    fail(403,'Tidak memiliki izin ekspor register ini.');
}
export async function exportOperationalRegister(db,{actorId,type}){
  if(!Object.hasOwn(REGISTER_EXPORTS,type))fail(404,'Jenis ekspor tidak tersedia');
  const spec=REGISTER_EXPORTS[type];
  await check(db,actorId,spec.permission);
  const columns=spec.columns.map(x=>x[0]),headings=spec.columns.map(x=>x[1]);
  const tenantJoin=type==='vendor-sla'
    ?' FROM ti_vendor_service_reviews r '+
      'JOIN ti_vendor_contracts c ON c.id=r.contract_id '+
      'JOIN ti_vendors v ON v.id=c.vendor_id AND v.institution_id=c.institution_id '+
      'JOIN users u ON u.institution_id=v.institution_id AND u.id=$1 '
    :' FROM '+spec.table+' r JOIN users u ON u.institution_id=r.institution_id '+
      'AND u.id=$1 ';
  const sql='SELECT '+columns.map(name=>'r.'+name).join(',')+tenantJoin+
    'ORDER BY '+(columns.includes('recorded_at')?'r.recorded_at':'r.created_at')+
    ' DESC, r.id DESC LIMIT 5001';
  const data=await db.query(sql,[actorId]);
  if(data.rows.length>5000)fail(409,'Ekspor lebih dari 5.000 baris. Hubungi administrator.');
  return makeRegisterCsv(headings,data.rows.map(row=>columns.map(key=>row[key])));
}
export async function exportMaturityWorksheet(db,{actorId,id}){
  if(!UUID.test(id))fail(400,'ID penilaian tidak valid');
  await check(db,actorId,'assessments:read');
  const data=await getMaturityAssessmentInTransaction(db,{actorId,id});
  const cols=['Model','Versi','Domain','Judul domain','Peringkat','Justifikasi',
    'Revisi','Bukti','Status review','Catatan'];
  const rows=data.domains.map(d=>[
    data.model.code,data.model.version,d.code,d.title,
    d.level??'',d.justification,d.revision,d.evidenceFileName??'',
    data.review?.status??'', 'Penilaian maturitas internal; bukan skor OJK',
  ]);
  return makeRegisterCsv(cols,rows);
}
export async function exportPadkDraftWorksheet(db,{actorId,id}){
  if(!UUID.test(id))fail(400,'ID penilaian tidak valid');
  await check(db,actorId,'assessments:read');
  const data=await listPadkIndicatorNotes(db,{actorId,id});
  const cols=['Kategori','Nomor indikator','Indikator','Peringkat sementara',
    'Justifikasi faktual','Catatan persiapan','Rencana bukti','Revisi','Status'];
  const rows=data.indicators.map(d=>[
    data.category,d.number,d.title??d.parameter??'',
    d.provisionalRank??'',d.justification,d.preparationNotes,d.evidencePlan,
    d.revision,'DRAFT INTERNAL TIDAK TERVERIFIKASI',
  ]);
  return makeRegisterCsv(cols,rows);
}
