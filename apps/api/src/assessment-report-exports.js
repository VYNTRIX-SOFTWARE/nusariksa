import {makeProfessionalInternalAssessmentPdf} from './assessment-report-professional-pdf.js';

const LABELS=Object.freeze({
  compliant:'Memenuhi',
  partially_compliant:'Memenuhi sebagian',
  non_compliant:'Belum memenuhi',
  not_applicable:'Tidak relevan',
  not_assessed:'Belum dinilai',
});
const STATUS=Object.freeze({
  draft:'Draft',in_progress:'Dikerjakan',
  submitted:'Menunggu pemeriksaan',
  changes_requested:'Perlu perbaikan',
  approved:'Disetujui internal',
});
const value=x=>x==null?'':String(x);
function clean(x){
  return value(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
}
function wrap(text,width=88){
  const words=clean(text).split(' ');
  const lines=[];let line='';
  for(let word of words){
    while(word.length>width){
      if(line){lines.push(line);line='';}
      lines.push(word.slice(0,width));word=word.slice(width);
    }
    if(!word)continue;
    if(line.length+word.length+1>width){lines.push(line);line=word;}
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  return lines.length?lines:['(tidak diisi)'];
}
export function linesOfInternalAssessmentReport(report){
  if(!report||report.reportType!=='internal_assessment'||!report.assessment
    ||!report.institution||!report.summary||!Array.isArray(report.controls))
    throw new TypeError('Invalid internal assessment report');
  const result=[
    'NUSARIKSA / LAPORAN ASESMEN TEKNOLOGI INFORMASI',
    report.final?'FINAL INTERNAL - DISETUJUI PEMERIKSA':'PRATINJAU INTERNAL - BELUM DISETUJUI',
    'BUKAN BUKTI KEPATUHAN ATAU LAPORAN RESMI OJK',
    '',
    'INFORMASI ASESMEN',
    ...wrap('Lembaga: '+value(report.institution.name)+' ('+value(report.institution.kind)+')'),
    ...wrap('Judul: '+value(report.assessment.title)),
    'Periode: '+value(report.assessment.periodStart)+' s.d. '+value(report.assessment.periodEnd),
    'Status: '+(STATUS[report.assessment.status]??'Tidak diketahui'),
    'ID asesmen: '+value(report.assessment.id),
    ...wrap('Katalog: '+value(report.catalog?.title??'Belum terpasang')+
      ' / versi '+value(report.catalog?.version??'-')),
    'Dicetak (UTC): '+value(report.generatedAt),
    '',
    'RINGKASAN PENGISIAN - BUKAN SKOR KEPATUHAN',
    'Total kontrol: '+report.summary.total,
    'Telah dinilai: '+report.summary.assessed,
    'Belum dinilai: '+report.summary.notAssessed,
    'Kelengkapan: '+report.summary.completionPercent+'%',
  ];
  for(const [key,label] of Object.entries(LABELS)){
    if(key!=='not_assessed')result.push(label+': '+(report.summary.ratings[key]??0));
  }
  result.push('', 'PEMERIKSAAN INTERNAL');
  const decision=report.latestReviewDecision;
  if(decision){
    result.push('Keputusan: '+(decision.action==='APPROVED'
      ?'Disetujui internal':'Dikembalikan untuk perbaikan'));
    result.push('Siklus: '+value(decision.submission_cycle));
    result.push(...wrap('Catatan pemeriksa: '+value(decision.note)));
  }else result.push('Belum ada keputusan pemeriksa.');
  result.push('','RINCIAN KONTROL');
  for(let i=0;i<report.controls.length;i++){
    const control=report.controls[i];
    result.push('-'.repeat(84));
    result.push(...wrap(String(i+1)+'. '+value(control.control_code)+' / '+value(control.title)));
    result.push('Hasil: '+(LABELS[control.rating]??'Tidak diketahui')+
      ' | Revisi: '+value(control.revision??0));
    if(control.source_document&&control.source_section)
      result.push(...wrap('Referensi: '+control.source_document+' / '+control.source_section));
    result.push(...wrap('Catatan pemeriksaan: '+value(control.note||'(tidak diisi)')));
  }
  if(!report.controls.length)result.push('Belum ada kontrol dalam asesmen ini.');
  result.push('','NusaRiksa menyediakan kertas kerja internal, bukan penilaian resmi regulator.');
  return result.flatMap(line=>line?wrap(line):['']);
}
export function makeInternalAssessmentPdf(report){
  return makeProfessionalInternalAssessmentPdf(report);
}
function csvCell(input){
  let text=value(input).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ');
  // Neutralize spreadsheet formulas from user-entered titles, notes or references.
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function makeInternalAssessmentCsv(report){
  if(!report||report.reportType!=='internal_assessment'||!report.assessment
    ||!report.institution||!report.summary||!Array.isArray(report.controls))
    throw new TypeError('Invalid internal assessment report');
  const rows=[
    ['NUSARIKSA - LAPORAN ASESMEN TI INTERNAL'],
    ['Status',report.final?'FINAL INTERNAL':'PRATINJAU INTERNAL'],
    ['Peringatan','BUKAN LAPORAN RESMI OJK ATAU BUKTI KEPATUHAN'],
    ['Lembaga',report.institution.name],
    ['Jenis lembaga',report.institution.kind],
    ['Asesmen',report.assessment.title],
    ['ID asesmen',report.assessment.id],
    ['Periode mulai',report.assessment.periodStart],
    ['Periode akhir',report.assessment.periodEnd],
    ['Status asesmen',STATUS[report.assessment.status]??'Tidak diketahui'],
    ['Katalog',report.catalog?.title??'Belum terpasang'],
    ['Versi katalog',report.catalog?.version??''],
    ['Dibuat UTC',report.generatedAt],
    ['Total kontrol',report.summary.total],
    ['Telah dinilai',report.summary.assessed],
    ['Belum dinilai',report.summary.notAssessed],
    ['Kelengkapan persen',report.summary.completionPercent],
    ['Keputusan pemeriksa terakhir',report.latestReviewDecision?.action??'Belum ada'],
    ['Catatan pemeriksa',report.latestReviewDecision?.note??''],
    [],
    ['No','Kode kontrol','Judul kontrol','Rujukan dokumen',
      'Bagian sumber','Hasil penilaian','Catatan pemeriksaan','Revisi'],
    ...report.controls.map((control,index)=>[
      index+1,control.control_code,control.title,control.source_document??'',
      control.source_section??'',LABELS[control.rating]??'Tidak diketahui',
      control.note??'',control.revision??0,
    ]),
  ];
  // UTF-8 BOM improves interoperability with desktop spreadsheet applications.
  return Buffer.from('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n','utf8');
}
