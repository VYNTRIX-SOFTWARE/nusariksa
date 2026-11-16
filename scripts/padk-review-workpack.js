#!/usr/bin/env node
// Generate a PRIVATE, all-PENDING review workpack. Never marks a source row,
// mapping, exception, or score decision as approved.
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectPadkCandidatePacks} from '../apps/api/src/padk-regulatory-candidates.js';
import {padkRoundingDecisionExamples} from '../apps/api/src/padk-rounding-policy-lab.js';
import {padkRegulatoryPackFingerprint} from '../apps/api/src/padk-regulatory-pack-review.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SUB='regulations/padk43/cyber/';
const SOURCE_ISSUES={
  2:'Peringkat 1 membahas strategi, sementara parameter membahas risk appetite',
  20:'Kriteria mengukur kaji ulang risiko, bukan audit intern TI',
  21:'Kriteria mengukur budaya siber, bukan kaji ulang manajemen risiko',
  22:'Kriteria mengukur kerentanan, bukan budaya siber',
  27:'Kriteria mengukur pengujian keamanan, bukan Business Impact Analysis',
  28:'Kriteria mengukur kaji ulang kebijakan, bukan pengujian keamanan',
  29:'Kriteria mengukur risk register, bukan kaji ulang kebijakan',
};
const MAPPING_ISSUES={
  3:'Redaksi strategi menghapus contoh layanan digital',
  18:'Redaksi Kategori 2 menambahkan kewajiban penyampaian ke Direksi',
  19:'Redaksi audit Kategori 2 menambahkan pengelolaan hak akses',
  20:'Redaksi kaji ulang Kategori 2 menambahkan kebijakan, prosedur, dan limit',
  24:'Tabel 2 membahas pengamanan data, Tabel 1 membahas klasifikasi data',
  29:'Satu indikator: pelatihan berkala (Tabel 3 #32) dan simulasi phishing (Tabel 3 #35)',
  32:'Redaksi RBAC Kategori 2 lebih rinci daripada parameter Kategori 1',
};
const normalize=t=>String(t??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const csv=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
const fail=reason=>{throw new TypeError('Review workpack dibatalkan: '+reason);};
const fromDisk=async name=>JSON.parse(await readFile(join(ROOT,SUB,name),'utf8'));

export function buildPadkReviewWorkpack({source,mapping,manifest,category1,category2}){
  if(source?.counts?.total!==540||source.records?.length!==540
    ||mapping?.candidateMappings?.length!==60||manifest?.sourceCriteriaIssues?.length!==7
    ||manifest?.category2NeedsMappingReview?.length!==7
    ||category1?.indicators?.length!==80||category2?.indicators?.length!==60)
    fail('kumpulan sumber belum lengkap atau berubah');
  if([mapping.sourcePdfSha256,manifest.sourcePdfSha256,
    category1.source.pdfSha256,category2.source.pdfSha256].some(x=>x!==source.sourcePdfSha256))
    fail('SHA-256 sumber antar-kumpulan tidak seragam');
  const ids=new Map(source.records.map(r=>[r.id,r]));
  if(ids.size!==540)fail('ID sumber tidak unik');
  const k=n=>String(n).padStart(3,'0');
  const allCells=source.records.map(r=>({
    id:r.id,physicalPdfPages:[...r.physicalPdfPages],
    outcome:'PENDING',reviewNote:'',reviewedSourceText:'',reviewedBy:'',reviewedAt:'',
  }));
  const crosswalk=mapping.candidateMappings.map((r,i)=>{
    const n=i+1,candidate=r.table3CandidateNumber;
    if(r.category2Number!==n||!Number.isInteger(candidate)||candidate<1||candidate>80)
      fail('kandidat pemetaan tidak berurutan');
    const a=ids.get('K2-I'+k(n)),b=ids.get('K1-I'+k(candidate));
    if(!a||!b)fail('parameter kandidat pemetaan tidak ditemukan');
    return {
      category2Number:n,table3Number:candidate,category2PdfPage:a.physicalPdfPages[0],
      table3PdfPage:r.table3PdfPage,
      outcome:'PENDING',rationale:'',reviewerId:'',reviewedAt:'',
      redactionComparison:normalize(a.parameterText)===normalize(b.parameterText)
        ?'MATCH_NORMALIZED':'DIFFERENT_SCOPE_OR_WORDING',
      priority:Object.hasOwn(MAPPING_ISSUES,n)?'HIGH':'STANDARD',
      identifiedConcern:MAPPING_ISSUES[n]??'Verifikasi hubungan semantik Tabel 2 ke Tabel 3',
      ...(n===29?{aspects:[32,35],combinedRankRule:'',ruleImplementationReference:''}:{}),
    };
  });
  const exceptions=[
    ...Object.keys(SOURCE_ISSUES).map(x=>{
      const number=Number(x),parameter=ids.get('K1-I'+k(number));
      const pages=new Set();
      for(let rank=1;rank<=5;rank++){
        const row=ids.get('T3-I'+k(number)+'-R'+rank);
        if(!row)fail('Kriteria pengecualian tidak lengkap');
        row.physicalPdfPages.forEach(p=>pages.add(p));
      }
      return {type:'SOURCE',number,physicalPdfPages:[...pages].sort((a,b)=>a-b),
        outcome:'PENDING',decision:'',reviewerId:'',reviewedAt:'',
        identifiedConcern:SOURCE_ISSUES[number],parameterText:parameter?.parameterText??'',
        rank1Draft:ids.get('T3-I'+k(number)+'-R1').criterionText,
        rank5Draft:ids.get('T3-I'+k(number)+'-R5').criterionText};
    }),
    ...Object.keys(MAPPING_ISSUES).map(x=>{
      const number=Number(x),row=crosswalk[number-1];
      return {type:'MAPPING',number,physicalPdfPages:
          [...new Set([row.category2PdfPage,row.table3PdfPage])].sort((a,b)=>a-b),
        outcome:'PENDING',decision:'',reviewerId:'',reviewedAt:'',
        identifiedConcern:MAPPING_ISSUES[number],
        candidateTable3Number:row.table3Number};
    }),
  ];
  if(exceptions.length!==14
    ||exceptions.filter(x=>x.type==='SOURCE').length!==7
    ||exceptions.filter(x=>x.type==='MAPPING').length!==7)
    fail('daftar 14 pengecualian tidak lengkap');
  const evidence={
    schemaVersion:1,reference:'43/PADK.03/2025:LAMPIRAN_IV',
    sourcePdfSha256:source.sourcePdfSha256,
    sourceAcquisition:{origin:'UNVERIFIED',documentUrl:'',downloadedAt:'',
      pdfSha256:source.sourcePdfSha256},
    review:{compiledBy:'',attestations:[]},
    sourceCells:allCells,category2Crosswalk:crosswalk,exceptionDecisions:exceptions,
    scoring:{weights:[25,15,25,15,20],bestRank:1,worstRank:5,
      roundingDecision:'',roundingEvidence:'',boundaryTestsApproved:false},
    packFingerprints:[],
  };
  const cellRows=[
    ['id','kind','number','rank','physical_pdf_pages','draft_parameter','draft_criterion',
      'review_outcome','reviewer','review_date','source_text_checked','notes'],
    ...source.records.map(r=>[r.id,r.kind,r.indicator,r.rank,
      r.physicalPdfPages.join(';'),r.parameterText,r.criterionText,'PENDING','','','','']),
  ];
  const mapRows=[
    ['kategori_2','kandidat_tabel_3','halaman_k2','halaman_tabel3',
      'perbandingan_redaksi','prioritas','pertanyaan_review','outcome'],
    ...crosswalk.map(r=>[r.category2Number,r.table3Number,r.category2PdfPage,
      r.table3PdfPage,r.redactionComparison,r.priority,r.identifiedConcern,'PENDING']),
  ];
  const exceptionRows=[
    ['type','number','physical_pdf_pages','issue','outcome','decision','reviewer'],
    ...exceptions.map(r=>[r.type,r.number,r.physicalPdfPages.join(';'),
      r.identifiedConcern,'PENDING','','']),
  ];
  const report={
    status:'HUMAN_REVIEW_PENDING',pdfSha256:source.sourcePdfSha256,
    sourceRows:540,category1Indicators:80,category2Indicators:60,
    crosswalkCount:60,sourceExceptions:7,mappingExceptions:7,exceptionCount:14,
    matchingMachineRowsAreNotHumanApprovals:true,
    sourceReviewsApproved:0,crosswalkApproved:0,exceptionsResolved:0,
    roundingPolicyApproved:false,packFinalAvailable:false,
    screeningExamples:padkRoundingDecisionExamples(),
    candidateFingerprints:[
      {category:1,sha256:padkRegulatoryPackFingerprint(category1).sha256},
      {category:2,sha256:padkRegulatoryPackFingerprint(category2).sha256},
    ],
  };
  return {evidence,report,files:{
    'source-cells.csv':csv(cellRows),
    'category2-crosswalk.csv':csv(mapRows),
    'exception-decisions.csv':csv(exceptionRows),
    'rounding-scenarios.json':JSON.stringify(report.screeningExamples,null,2)+'\n',
    'evidence.PENDING.json':JSON.stringify(evidence,null,2)+'\n',
    'status.json':JSON.stringify(report,null,2)+'\n',
  }};
}
async function main(){
  const option=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
  if(process.argv.includes('--help')){
    console.log('node scripts/padk-review-workpack.js --source-pdf=/private/PADK.pdf --output-dir=/private/new-review-dir');
    return;
  }
  const output=option('output-dir'),pdfPath=option('source-pdf');
  if(!output||!pdfPath)fail('parameter --source-pdf dan --output-dir wajib');
  const [source,mapping,manifest,category1,category2]=await Promise.all([
    fromDisk('sources/lampiran-iv-extraction.json'),
    fromDisk('review/category2-candidates.json'),
    fromDisk('candidates/review-manifest.json'),
    fromDisk('candidates/kategori-1.json'),fromDisk('candidates/kategori-2.json'),
  ]);
  // Reuse strict integrity checks from existing merged candidate assembly.
  await inspectPadkCandidatePacks();
  const full=resolve(output),repoPath=await realpath(ROOT);
  const baseParent=await realpath(dirname(full));
  const r=relative(repoPath,baseParent);
  if(r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r)))
    fail('output review harus disimpan di LUAR repository publik');
  const bytes=await readFile(resolve(pdfPath));
  if(bytes.length<1024||bytes.subarray(0,5).toString('ascii')!=='%PDF-')
    fail('PDF sumber tidak utuh');
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==source.sourcePdfSha256)fail('SHA-256 PDF tidak cocok dengan working source');
  const {files,report}=buildPadkReviewWorkpack({source,mapping,manifest,category1,category2});
  // No overwrites and no generated reviewer identities.
  await mkdir(full,{mode:0o700});
  for(const [name,contents] of Object.entries(files)){
    await writeFile(join(full,name),contents,{mode:0o600,flag:'wx'});
  }
  console.log(JSON.stringify({...report,outputFiles:Object.keys(files),
    note:'Dokumen review dibuat privat dan PENDING. PDF hash sama bukan bukti sumber diunduh dari OJK.'},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
