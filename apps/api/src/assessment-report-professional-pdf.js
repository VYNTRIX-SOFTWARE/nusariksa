import {createProfessionalReport} from './report-pdf-engine.js';

const LABELS=Object.freeze({
  compliant:'Memenuhi',partially_compliant:'Memenuhi sebagian',
  non_compliant:'Belum memenuhi',not_applicable:'Tidak relevan',
  not_assessed:'Belum dinilai',
});
const STATUSES=Object.freeze({
  draft:'Draft',in_progress:'Dikerjakan',submitted:'Menunggu pemeriksaan',
  changes_requested:'Perlu perbaikan',approved:'Disetujui internal',
});
const val=x=>x==null?'':String(x);
function requireReport(report){
  if(!report||report.reportType!=='internal_assessment'||!report.assessment
    ||!report.institution||!report.summary||!Array.isArray(report.controls))
    throw new TypeError('Invalid internal assessment report');
}
/**
 * Professional report V2 for the INTERNAL 26-control assessment.
 * Never computes a regulatory compliance or cyber maturity score.
 * PADK scoring/release gates remain completely independent.
 */
export function makeProfessionalInternalAssessmentPdf(report){
  requireReport(report);
  const final=report.final===true;
  const a=report.assessment,s=report.summary;
  const reportStatus=final?'FINAL INTERNAL':'PRATINJAU INTERNAL';
  const doc=createProfessionalReport({status:reportStatus,
    footer:'ASESMEN TI INTERNAL - BUKAN PENGESAHAN OJK'});
  const P=doc.palette;
  // Cover: explicit identity and status; never an implied regulator approval.
  doc.y=121;
  doc.text(44,doc.y,'LAPORAN PENILAIAN',{size:13,bold:true,fill:P.PURPLE});
  doc.y+=28;
  doc.paragraph('Teknologi Informasi BPR/BPRS',{size:27,bold:true,
    width:460,leading:34,after:11});
  doc.paragraph('Kertas kerja asesmen internal berdasarkan katalog kontrol yang dipasang.',{
    size:11,width:440,fill:P.MUTED,after:28});
  doc.rect(44,doc.y,507,90,P.LIGHT,P.BORDER);
  doc.text(60,doc.y+22,'LEMBAGA',{size:8,bold:true,fill:P.MUTED});
  const institution=val(report.institution.name);
  const ins=doc.paragraph;const instLines=(institution||'Belum ada nama lembaga');
  // Keep institution in the cover identity card and use the remainder below.
  doc.text(60,doc.y+46,instLines.slice(0,73),{size:15,bold:true});
  doc.text(60,doc.y+69,'Jenis: '+val(report.institution.kind),{size:9,fill:P.MUTED});
  doc.y+=121;
  doc.badge(reportStatus,final?P.GREEN:P.AMBER);
  doc.labelValue('Periode',val(a.periodStart)+' s.d. '+val(a.periodEnd));
  doc.labelValue('Judul asesmen',val(a.title));
  doc.labelValue('Katalog',val(report.catalog?.title??'Belum dipasang')+
    ' / versi '+val(report.catalog?.version??'-'));
  doc.space(23);
  doc.ensure(103);
  doc.metric('TOTAL KONTROL',String(s.total),44,155);
  doc.metric('SUDAH DINILAI',String(s.assessed),211,155);
  doc.metric('KELENGKAPAN',s.completionPercent+'%',378,173);
  doc.y+=94;
  doc.ensure(64);
  doc.paragraph('PENTING: BUKAN BUKTI KEPATUHAN ATAU LAPORAN RESMI OJK.',{
    size:10,bold:true,fill:P.RED,after:7});
  doc.paragraph('Status internal hanya menyatakan tahap pengerjaan dan pemeriksaan oleh pengguna NusaRiksa. Kelengkapan pengisian bukan skor kepatuhan, tidak menyatakan tingkat maturitas keamanan siber.',{
    size:9,fill:P.MUTED,leading:14});
  // Executive overview.
  doc.newPage();
  doc.section('Ringkasan eksekutif',1);
  doc.heading('Kelengkapan dan distribusi hasil');
  doc.paragraph('Laporan ini menggambarkan jawaban yang disimpan pada katalog kontrol internal. Angka di bawah adalah jumlah/proporsi pengisian, bukan nilai komposit regulator.',{
    size:10,fill:P.MUTED,after:20});
  doc.ensure(95);
  doc.metric('SUDAH DINILAI',String(s.assessed),44,155);
  doc.metric('BELUM DINILAI',String(s.notAssessed),211,155);
  doc.metric('PROGRES',s.completionPercent+'%',378,173);
  doc.y+=105;
  doc.heading('Distribusi hasil per kontrol');
  const dist=[
    ['Memenuhi',s.ratings.compliant,P.GREEN],
    ['Memenuhi sebagian',s.ratings.partially_compliant,P.AMBER],
    ['Belum memenuhi',s.ratings.non_compliant,P.RED],
    ['Tidak relevan',s.ratings.not_applicable,P.MUTED],
    ['Belum dinilai',s.notAssessed,P.PURPLE],
  ];
  for(const [label,count,shade] of dist)doc.bar(label,count,s.total,shade);
  doc.space(10);
  doc.section('Dasar dan batas penilaian',2);
  doc.labelValue('Status asesmen',STATUSES[a.status]??val(a.status));
  doc.labelValue('ID asesmen',val(a.id));
  doc.labelValue('Versi katalog',String(report.catalog?.version??'Belum dipasang'));
  doc.labelValue('Waktu snapshot UTC',val(report.generatedAt));
  doc.paragraph('Checklist 26 kontrol merupakan pemetaan operasional NusaRiksa. Jangan diperlakukan sebagai daftar indikator resmi atau penilaian maturitas Lampiran IV PADK.',{
    size:9,fill:P.RED,after:5});
  // Detailed evidence-based answers. Continue automatically across pages.
  doc.newPage();doc.section('Rincian penilaian per kontrol',3);
  doc.paragraph('Setiap entri berasal dari jawaban tersimpan. Catatan kosong dan status belum dinilai dipertahankan, tidak dilengkapi secara otomatis.',{
    size:9,fill:P.MUTED,after:20});
  if(!report.controls.length)doc.paragraph('Belum ada kontrol pada asesmen ini.');
  for(let i=0;i<report.controls.length;i++){
    const c=report.controls[i];
    const source=[c.source_document,c.source_section].filter(Boolean).join(' / ');
    doc.listItem(String(i+1).padStart(2,'0'),val(c.control_code)+' / '+val(c.title),
      val(c.note),{status:(LABELS[c.rating]??'Tidak diketahui')+
      '  |  Revisi '+val(c.revision??0),source});
  }
  // Action register: only controls explicitly marked as not/partly meeting.
  doc.newPage();doc.section('Daftar perhatian dan tindak lanjut',4);
  const pending=report.controls.filter(c=>
    c.rating==='non_compliant'||c.rating==='partially_compliant');
  doc.paragraph('Butir ini diambil hanya dari hasil Belum memenuhi atau Memenuhi sebagian. Penetapan tindakan, PIC, target dan verifikasi harus diisi berdasarkan keputusan nyata lembaga; NusaRiksa tidak mengarangnya.',{
    size:10,fill:P.MUTED,after:18});
  doc.badge(pending.length+' kontrol memerlukan telaah tindak lanjut',
    pending.length?P.AMBER:P.GREEN);
  if(!pending.length)doc.paragraph('Tidak ada kontrol yang dinilai Belum memenuhi atau Memenuhi sebagian. Periksa kembali kelengkapan dan bukti sebelum menarik kesimpulan.',{
    size:10,fill:P.MUTED,after:13});
  for(let i=0;i<pending.length;i++){
    const c=pending[i];
    doc.listItem(String(i+1).padStart(2,'0'),
      val(c.control_code)+' / '+val(c.title),val(c.note),
      {status:LABELS[c.rating]});
  }
  doc.section('Pemeriksaan internal',5);
  if(report.latestReviewDecision){
    const decision=report.latestReviewDecision;
    doc.labelValue('Keputusan terakhir',decision.action==='APPROVED'
      ?'Disetujui internal':'Dikembalikan untuk perbaikan');
    doc.labelValue('Siklus pemeriksaan',val(decision.submission_cycle));
    doc.labelValue('Waktu keputusan',val(decision.occurred_at));
    doc.paragraph('Catatan pemeriksa: '+val(decision.note||'Tidak ada catatan'),{
      size:10,width:490,after:14});
  }else{
    doc.paragraph('Belum tercatat keputusan reviewer. Dokumen ini adalah pratinjau internal dan tidak menjadi dokumen pengesahan.',{
      size:10,fill:P.AMBER,after:12});
  }
  doc.section('Pengesahan dan akuntabilitas',6);
  doc.paragraph('Kolom berikut disediakan sebagai ruang administrasi. Tidak ada tanda tangan atau persetujuan yang dihasilkan secara otomatis.',{
    size:9,fill:P.MUTED,after:20});
  doc.ensure(110);
  doc.rect(44,doc.y,242,101,P.LIGHT,P.BORDER);
  doc.rect(299,doc.y,252,101,P.LIGHT,P.BORDER);
  doc.text(58,doc.y+21,'DISUSUN / DITELAAH',{size:9,bold:true});
  doc.text(313,doc.y+21,'DISETUJUI SESUAI KEWENANGAN',{size:9,bold:true});
  doc.text(58,doc.y+82,'Nama / tanggal / tanda tangan: _______________',{size:8,fill:P.MUTED});
  doc.text(313,doc.y+82,'Nama / tanggal / tanda tangan: _______________',{size:8,fill:P.MUTED});
  doc.y+=119;
  doc.paragraph('Akhir dokumen - dibuat dari data server sesuai hak baca laporan.',{
    size:8,fill:P.MUTED});
  return doc.finish();
}
