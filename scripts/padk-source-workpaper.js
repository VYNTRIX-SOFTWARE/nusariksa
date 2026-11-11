#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPadkTranscriptionDraft} from '../apps/api/src/padk-transcription-workbench.js';
import {readExtractedTable3} from '../apps/api/src/padk-draft-criteria.js';

// Data ini hanya bahan review sumber, bukan instrumen final untuk official scoring.
const FIELDS=[
  'id','jenis','kategori','indikator','peringkat','domain','prioritas',
  'teks_draft','halaman_tercetak_draft','halaman_fisik_pdf','teks_sumber_diperiksa',
  'verdict','catatan_review','catatan_sumber','reviewer','tanggal_review','sha256_pdf_resmi','url_sumber'
];
const RISK_ROWS=new Set([2,26,36,74,79]);
const RISK_C2=new Set([3,18,19,20,24,29,32]);
const SOURCE_NOTES=new Map([
  ['2:1','Kriteria peringkat 1 pada Tabel 3 nomor 2 memuat uraian strategi keamanan siber, sedangkan parameter nomor 2 membahas risk appetite. Periksa redaksi sumber dan klarifikasi sebelum digunakan sebagai dasar scoring.'],
]);
const AUTHORITY='https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx';
function fail(message){throw new TypeError('Workpaper verifikasi sumber tidak valid: '+message);}
const digits=n=>String(n).padStart(3,'0');
const blank={halaman_fisik_pdf:'',teks_sumber_diperiksa:'',verdict:'PENDING',
  catatan_sumber:'',
  catatan_review:'',reviewer:'',tanggal_review:'',sha256_pdf_resmi:'',url_sumber:AUTHORITY};
export function buildSourceReviewWorkpaper(drafts,table3){
  if(!Array.isArray(drafts)||drafts.length!==2||!Array.isArray(table3)||table3.length!==80)
    fail('jumlah kategori atau baris Tabel 3 tidak sesuai');
  const byCategory=new Map();
  for(const draft of drafts){
    const status=inspectPadkTranscriptionDraft(draft);
    if(byCategory.has(status.category)||status.missingNumbers.length)
      fail('kategori ganda atau indikator belum lengkap');
    byCategory.set(status.category,status);
  }
  if(!byCategory.has(1)||!byCategory.has(2))fail('harus mencakup Kategori 1 dan 2');
  const records=[];
  for(const category of [1,2]){
    for(const indicator of byCategory.get(category).items){
      records.push({
        id:'K'+category+'-I'+digits(indicator.number),
        jenis:'INDIKATOR',
        kategori:category,
        indikator:indicator.number,
        peringkat:'',
        domain:indicator.domain,
        prioritas:category===2&&RISK_C2.has(indicator.number)?'REVIEW_PEMETAAN':'NORMAL',
        teks_draft:indicator.workingSummary,
        halaman_tercetak_draft:String(indicator.tablePage),
        ...blank,
      });
    }
  }
  for(let i=0;i<80;i++){
    const entry=table3[i];
    if(!entry||entry.number!==i+1||!Array.isArray(entry.pdfPages)
      ||!entry.pdfPages.length||!Array.isArray(entry.ranks)||entry.ranks.length!==5)
      fail('Tabel 3 tidak lengkap pada nomor '+(i+1));
    const seen=new Set();
    for(const criterion of entry.ranks){
      if(!Number.isInteger(criterion.rank)||criterion.rank<1||criterion.rank>5
        ||seen.has(criterion.rank)||typeof criterion.textDraft!=='string'
        ||criterion.textDraft.trim().length<10)
        fail('Rank Tabel 3 tidak valid pada nomor '+(i+1));
      seen.add(criterion.rank);
      records.push({
        id:'T3-I'+digits(entry.number)+'-R'+criterion.rank,
        jenis:'KRITERIA_TABEL_3',
        kategori:'',
        indikator:entry.number,
        peringkat:criterion.rank,
        domain:'',
        prioritas:SOURCE_NOTES.has(entry.number+':'+criterion.rank)
          ?'PERIKSA_ANOMALI_REDAKSI':RISK_ROWS.has(entry.number)?'PERIKSA_TABEL_TERPECAH':'NORMAL',
        teks_draft:criterion.textDraft,
        halaman_tercetak_draft:entry.pdfPages.join('|'),
        ...blank,
        catatan_sumber:SOURCE_NOTES.get(entry.number+':'+criterion.rank)??'',
      });
    }
  }
  if(records.length!==540||new Set(records.map(x=>x.id)).size!==540)
    fail('hasil harus berisi 140 indikator dan 400 kriteria unik');
  return {
    schemaVersion:1,
    status:'DRAFT_SOURCE_REVIEW_PENDING',
    sourceAuthenticityVerified:false,
    independentReviewCompleted:false,
    productionEligible:false,
    counts:{kategori1:80,kategori2:60,kriteriaUnik:400,total:540,verified:0},
    records,
  };
}
function csvCell(v){
  let value=String(v??'');
  // Jangan izinkan teks sumber tampil sebagai formula spreadsheet.
  if(/^[\s]*[=+@-]/.test(value))value="'"+value;
  return '"'+value.replaceAll('"','""')+'"';
}
export function toReviewCsv(workpaper){
  if(!workpaper||workpaper.status!=='DRAFT_SOURCE_REVIEW_PENDING'
    ||workpaper.productionEligible!==false||!Array.isArray(workpaper.records)
    ||workpaper.records.length!==540)fail('dokumen belum layak diekspor');
  return [FIELDS.map(csvCell).join(','),
    ...workpaper.records.map(row=>FIELDS.map(k=>csvCell(row[k])).join(','))].join('\n')+'\n';
}
async function main(){
  const args=process.argv.slice(2);
  if(args.includes('--help')){
    process.stdout.write('Pakai: node scripts/padk-source-workpaper.js [--format=csv|json] > workpaper.csv\n');
    return;
  }
  if(args.some(x=>!['--format=csv','--format=json'].includes(x))||args.length>1)
    fail('argumen tidak dikenal');
  const drafts=await Promise.all([1,2].map(async n=>JSON.parse(
    await readFile(new URL('../regulations/padk43/cyber/drafts/kategori-'+n+'.json',import.meta.url),'utf8'))));
  const workpaper=buildSourceReviewWorkpaper(drafts,await readExtractedTable3());
  const format=args[0]==='--format=json'?'json':'csv';
  process.stdout.write(format==='json'?JSON.stringify(workpaper,null,2)+'\n':toReviewCsv(workpaper));
  process.stderr.write('Workpaper: '+workpaper.counts.total+' record tersedia untuk review; belum ada hasil yang disahkan.\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
