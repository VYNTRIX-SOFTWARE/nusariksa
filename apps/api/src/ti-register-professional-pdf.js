import {createProfessionalReport} from './report-pdf-engine.js';

const TITLES=Object.freeze({
  assets:'Inventaris Aset TI',risks:'Register Risiko TI',
  incidents:'Register Insiden TI',findings:'Tindak Lanjut Temuan TI',
  vendors:'Daftar Penyedia Jasa TI','vendor-contracts':'Daftar Kontrak Penyedia TI',
  'vendor-sla':'Evaluasi Layanan Penyedia TI',
  recovery:'Rencana Pemulihan Layanan TI',
  'recovery-tests':'Catatan Pengujian Pemulihan TI',
});
const KEYS=Object.freeze({
  assets:['asset_code','title'],risks:['risk_code','title'],
  incidents:['incident_code','title'],findings:['finding_code','title'],
  vendors:['vendor_code','name'],'vendor-contracts':['contract_code','service_name'],
  'vendor-sla':['period_start','period_end'],recovery:['plan_code','service_name'],
  'recovery-tests':['exercise_date','exercise_type'],
});
const safeValue=(value,key)=>{
  if(value===null||value===undefined||value==='')return 'Belum dicatat';
  if(value instanceof Date)
    return key.endsWith('_date')||key==='exercise_date'
      ?value.toISOString().slice(0,10):value.toISOString();
  if(typeof value==='boolean')return value?'Ya':'Tidak';
  return String(value);
};

export function makeOperationalRegisterPdf(report){
  if(!report||!Object.hasOwn(TITLES,report.type)
    ||!report.institution||typeof report.institution.name!=='string'
    ||typeof report.institution.kind!=='string'
    ||!Array.isArray(report.columns)||!report.columns.length
    ||!report.columns.every(c=>Array.isArray(c)&&c.length===2
      &&typeof c[0]==='string'&&typeof c[1]==='string')
    ||!Array.isArray(report.rows)||report.rows.length>500
    ||report.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row))
    ||typeof report.generatedAt!=='string'||report.scope!=='all')
    throw new TypeError('Data laporan register tidak valid.');

  const doc=createProfessionalReport({
    status:'SALINAN DATA INTERNAL',
    header:'LAPORAN REGISTER TI',
    footer:'REGISTER TI INTERNAL - BUKAN LAPORAN RESMI OJK',
  });
  const P=doc.palette;
  const title=TITLES[report.type];
  doc.y=121;
  doc.text(44,doc.y,'LAPORAN OPERASIONAL',{size:12,bold:true,fill:P.PURPLE});
  doc.y+=29;
  doc.paragraph(title,{size:25,bold:true,width:470,leading:33,after:12});
  doc.paragraph('Disusun otomatis dari catatan yang tersimpan di NusaRiksa.',{
    size:11,width:470,fill:P.MUTED,leading:17,after:26});
  doc.badge('DATA INTERNAL - BUKAN PENGESAHAN');
  doc.section('Identitas laporan',1);
  doc.labelValue('Lembaga',report.institution.name);
  doc.labelValue('Jenis lembaga',report.institution.kind);
  doc.labelValue('Dibuat pada (UTC)',report.generatedAt);
  doc.labelValue('Cakupan','Seluruh catatan tersimpan, termasuk yang diarsipkan; bukan hanya hasil filter layar.');
  doc.section('Ringkasan catatan',2);
  doc.ensure(105);
  const hasArchived=report.columns.some(([key])=>key==='archived_at');
  const archived=hasArchived?report.rows.filter(row=>Boolean(row.archived_at)).length:0;
  doc.metric('JUMLAH CATATAN',String(report.rows.length),44,155);
  if(hasArchived){
    doc.metric('BELUM DIARSIPKAN',String(report.rows.length-archived),211,155);
    doc.metric('DIARSIPKAN',String(archived),378,173);
  }
  doc.y+=102;
  doc.paragraph('Angka di atas adalah jumlah catatan, bukan penilaian kepatuhan, hasil audit, atau verifikasi dokumen oleh pihak independen.',{
    size:10,width:500,fill:P.MUTED,leading:15});
  doc.newPage();
  doc.section('Rincian register',3);
  doc.paragraph('Setiap entri menampilkan bidang yang tersedia dari data tersimpan. Isian kosong ditandai Belum dicatat. Tidak ada nilai atau hasil pemeriksaan yang ditambahkan otomatis.',{
    size:9,fill:P.MUTED,leading:14,after:19});
  if(!report.rows.length)doc.paragraph('Belum ada catatan pada register ini.',{
    size:11,fill:P.AMBER});
  const [code,titleKey]=KEYS[report.type];
  report.rows.forEach((row,index)=>{
    doc.ensure(88);
    doc.paragraph(String(index+1).padStart(3,'0')+' / '+
      safeValue(row[code],code)+' - '+safeValue(row[titleKey],titleKey),{
      size:12,bold:true,width:488,leading:18,after:10});
    for(const [key,label] of report.columns){
      doc.labelValue(label,safeValue(row[key],key));
    }
    doc.space(13);
    doc.ensure(8);
    doc.rule(44,doc.y,551);
    doc.space(13);
  });
  doc.section('Catatan penggunaan',4);
  doc.paragraph('Dokumen ini hanya menyalin catatan operasional sesuai hak akses pengguna. Keabsahan isi, kelengkapan bukti, keputusan manajemen, dan verifikasi fisik tetap menjadi tanggung jawab lembaga.',{
    size:10,width:500,leading:16,after:16});
  doc.paragraph('NusaRiksa tidak menyatakan laporan ini telah disetujui, ditandatangani, atau disampaikan kepada OJK.',{
    size:10,width:500,bold:true,fill:P.RED});
  return doc.finish();
}
