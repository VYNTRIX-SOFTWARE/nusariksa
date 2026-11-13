import {createProfessionalReport} from './report-pdf-engine.js';

/**
 * Structured, printable PADK draft workpaper. Render actual saved answers,
 * domain PREVIEW_UNVERIFIED, and evidence inventory without making an official
 * compliance assertion or implying approval by a regulator.
 */
export function makeProfessionalPadkDraftPdf({
  institution,preparation,items,preview,review,evidence,generatedAt,
}){
  if(!institution||!preparation||!Array.isArray(items)||!preview||
    !review||!Array.isArray(evidence))throw new TypeError('Invalid PADK workpaper input');
  if(preview.status!=='PREVIEW_UNVERIFIED'||preview.officialScoreAvailable!==false
    ||preview.finalReportAvailable!==false||review.finalReportAvailable!==false)
    throw new TypeError('PADK regulatory release gate must remain closed');
  const total=preparation.category===1?80:preparation.category===2?60:null;
  if(!total)throw new TypeError('Invalid PADK category');
  const p=createProfessionalReport({status:'DRAFT_UNVERIFIED / SIMULASI INTERNAL',
    footer:'DRAFT - BUKAN HASIL PENILAIAN PADK / BUKAN LAPORAN FINAL'});
  const C=p.palette;
  p.y=123;
  p.text(44,p.y,'LAPORAN KERTAS KERJA',{size:13,bold:true,fill:C.PURPLE});p.y+=28;
  p.paragraph('Penilaian Maturitas Keamanan Siber',{
    size:26,bold:true,width:482,leading:35,after:10});
  p.paragraph('Penilaian mandiri BPR/BPRS - instrumen dan pemetaan masih DRAFT_UNVERIFIED.',{
    size:10,fill:C.MUTED,after:28});
  p.rect(44,p.y,507,91,C.LIGHT,C.BORDER);
  p.text(59,p.y+21,'LEMBAGA',{size:8,bold:true,fill:C.MUTED});
  const name=String(institution.name??'Belum dicatat');
  p.text(59,p.y+47,name.slice(0,66),{size:15,bold:true});
  p.text(59,p.y+70,'Jenis: '+String(institution.kind??'-'),{size:9,fill:C.MUTED});
  p.y+=123;
  p.badge('DRAFT - BUKAN HASIL PENILAIAN PADK',C.RED);
  p.labelValue('Judul',String(preparation.title??'-'));
  p.labelValue('Kategori',preparation.category+' / '+total+' indikator');
  p.labelValue('Periode',String(preparation.periodStart)+' s.d. '+String(preparation.periodEnd));
  p.space(14);
  p.ensure(93);
  p.metric('TOTAL INDIKATOR',String(total),44,155);
  p.metric('SUDAH DINILAI',String(preview.ratedIndicators),211,155);
  p.metric('KELENGKAPAN',Math.round(preview.ratedIndicators/total*100)+'%',378,173);
  p.y+=94;
  p.paragraph('PENTING: BUKAN LAPORAN RESMI PADK/OJK, BUKAN PENGESAHAN NILAI MATURITAS.',{
    size:10,bold:true,fill:C.RED,after:7});
  p.paragraph('Indikator, kriteria, pemetaan dan kebijakan pembulatan masih memerlukan verifikasi independen. Hasil yang ditampilkan hanya alat bantu analisis internal.',{
    size:9,fill:C.MUTED});
  p.newPage();p.section('Ringkasan pemeriksaan draft',1);
  p.heading('Progres dan kelengkapan indikator');
  p.paragraph('Indikator dengan peringkat sementara dapat dipakai untuk kerja internal. Progres pengisian tidak sama dengan hasil maturitas atau kepatuhan OJK.',{
    size:10,fill:C.MUTED,after:18});
  p.ensure(89);
  p.metric('DIPERSYARATKAN',String(preview.requiredIndicators),44,155);
  p.metric('DIBERI PERINGKAT',String(preview.ratedIndicators),211,155);
  p.metric('BELUM LENGKAP',String(Math.max(0,preview.requiredIndicators-preview.ratedIndicators)),378,173);
  p.y+=104;
  p.paragraph('Progres: '+preview.ratedIndicators+' / '+total+' indikator', {
    size:9,fill:C.MUTED,after:9});
  p.heading('Lima domain - SIMULASI saja');
  for(const domain of preview.domains){
    p.ensure(48);
    p.text(44,p.y+13,String(domain.name),{size:10,bold:true,fill:C.INK});
    p.text(43,p.y+30,'Bobot '+domain.weightPercent+'% | '+domain.ratedIndicators+
      '/'+domain.requiredIndicators+' indikator',{size:9,fill:C.MUTED});
    const info=domain.complete
      ?'rata-rata '+Number(domain.averageRank).toFixed(3)+
       ' | kontribusi '+Number(domain.contribution).toFixed(3)
      :'BELUM LENGKAP - tidak ada nilai domain';
    p.paragraph(info,{x:305,width:245,size:9,fill:C.PURPLE});
    p.y+=22;p.ensure(7);p.rule(44,p.y,551);p.y+=10;
  }
  p.space(7);
  if(preview.complete&&preview.compositePreview){
    p.badge('KOMPOSIT SIMULASI: '+preview.compositePreview.valueTwoDecimals+
      ' / Peringkat '+preview.compositePreview.rank,C.RED);
  }else{
    p.badge('KOMPOSIT SIMULASI: BELUM TERSEDIA',C.AMBER);
  }
  p.paragraph('Tidak ada peringkat komposit resmi atau pernyataan pemenuhan ketentuan yang dapat diterbitkan dari instrumen draft ini.',{
    size:9,fill:C.RED,after:14});
  p.section('Data persiapan dan kontrol',2);
  p.labelValue('ID persiapan',String(preparation.id));
  p.labelValue('Status review','Status: '+String(review.status));
  p.labelValue('Siklus review',String(review.submissionCycle));
  p.labelValue('Jumlah file bukti',String(evidence.length));
  p.labelValue('Waktu snapshot UTC',String(generatedAt));
  p.newPage();p.section('Jawaban indikator tersimpan',3);
  p.paragraph('Hanya catatan yang benar-benar tersimpan yang dicetak. Nomor yang belum diisi tidak dibuatkan jawaban, bukti, atau nilai default.',{
    size:9,fill:C.MUTED,after:14});
  p.badge(items.length+' dari '+total+' indikator memiliki catatan tersimpan',C.PURPLE);
  const byNumber=new Map();
  for(const file of evidence){
    const num=Number(file.indicator_number);
    if(!byNumber.has(num))byNumber.set(num,[]);
    byNumber.get(num).push(file);
  }
  for(const item of items){
    const n=Number(item.indicator_number),files=byNumber.get(n)??[];
    p.listItem(String(n).padStart(2,'0'),'Indikator '+n,
      String(item.justification||'Belum ada justifikasi')+
      ' | Catatan kerja: '+String(item.preparation_notes||'Belum diisi'),
      {status:'Peringkat sementara: '+String(item.provisional_rank??'belum dipilih')+
        ' | Revisi '+String(item.revision)});
    if(item.evidence_plan){
      p.paragraph('Rencana bukti: '+item.evidence_plan,{
        x:56,width:480,size:9,fill:C.MUTED,after:7});
    }
    p.paragraph('Jumlah dokumen bukti aktual: '+files.length+
      ' file (isi file tidak disisipkan)',{
      x:56,width:480,size:8,fill:C.MUTED,after:8});
  }
  if(!items.length)p.paragraph('Belum ada jawaban indikator tersimpan.',{
    size:10,fill:C.MUTED});
  p.newPage();p.section('Inventaris bukti pendukung',4);
  p.paragraph('Hanya nama file, ukuran dan checksum yang dicetak. File asli tetap berada dalam penyimpanan aplikasi dengan kontrol akses.',{
    size:9,fill:C.MUTED,after:18});
  if(!evidence.length)p.paragraph('Belum ada file bukti yang dilampirkan.',{
    size:10,fill:C.MUTED});
  for(let i=0;i<evidence.length;i++){
    const file=evidence[i],hash=Buffer.isBuffer(file.sha256)
      ?file.sha256.toString('hex'):String(file.sha256??'-');
    p.listItem(String(i+1).padStart(2,'0'),
      'Indikator '+String(file.indicator_number)+' / '+String(file.file_name),
      'SHA-256 '+hash+' | '+String(file.size_bytes)+' bytes',
      {status:'Inventaris bukti (tanpa lampiran file)'});
  }
  p.section('Riwayat pemeriksaan internal',5);
  p.badge('Status: '+String(review.status),C.AMBER);
  p.paragraph('Pemeriksaan kelengkapan draft tidak berarti persetujuan nilai maturitas atau penetapan kepatuhan regulator.',{
    size:9,fill:C.RED,after:15});
  if(!review.events.length)p.paragraph('Belum ada riwayat submit atau pemeriksaan.',{
    size:10,fill:C.MUTED});
  for(const event of review.events){
    p.listItem('R'+String(event.submission_cycle),
      String(event.action)+' / '+String(event.occurred_at),
      'Catatan pemeriksa: '+String(event.note||'(tanpa catatan)'),
      {status:'Aktor: '+String(event.actor_user_id)});
  }
  p.section('Catatan administrasi',6);
  p.paragraph('Dokumen ini adalah kertas kerja internal. Tanda tangan, pengesahan, dan penyampaian resmi tidak dihasilkan secara otomatis.',{
    size:9,fill:C.MUTED,after:12});
  p.paragraph('Akhir dokumen. Versi instrumen: DRAFT_UNVERIFIED.',{
    size:9,bold:true,fill:C.RED});
  return p.finish();
}
