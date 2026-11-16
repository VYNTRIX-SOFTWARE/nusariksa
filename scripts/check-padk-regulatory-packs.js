#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { reviewPadkRegulatoryPack } from '../apps/api/src/padk-regulatory-pack-review.js';
import { validatePadkReleaseEvidence } from '../apps/api/src/padk-regulatory-release-evidence.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=join(root,'regulations','padk43','cyber','packs');
const release=process.argv.includes('--release');
const sourceArg=process.argv.find(arg=>arg.startsWith('--source-pdf='));
const pdfPath=sourceArg?.slice('--source-pdf='.length);
const evidenceArg=process.argv.find(arg=>arg.startsWith('--evidence-file='));
const evidencePath=evidenceArg?.slice('--evidence-file='.length);
let sourceHash=null;
if(release && !pdfPath){
  console.error('RELEASE BLOCKED: --source-pdf=<file PDF resmi yang telah diperiksa> wajib');
  process.exitCode=1;
}
if(release && !evidencePath){
  console.error('RELEASE BLOCKED: --evidence-file=<berkas bukti review privat> wajib');
  process.exitCode=1;
}
if(pdfPath){
  try{
    const bytes=await readFile(resolve(pdfPath));
    if(bytes.length<1024 || bytes.subarray(0,5).toString('ascii')!=='%PDF-'){
      throw new TypeError('Sumber bukan berkas PDF yang utuh');
    }
    sourceHash=createHash('sha256').update(bytes).digest('hex');
    console.log('SOURCE PDF SHA256: '+sourceHash);
  }catch(error){
    console.error('RELEASE BLOCKED: PDF sumber tidak dapat dibaca: '+error.message);
    process.exitCode=1;
  }
}
const expected=new Map([
  ['kategori-1.json',1],
  ['kategori-2.json',2],
]);

const verifiedPacks=[];
let available=[];
try{available=await readdir(directory);}
catch(error){
  if(error.code!=='ENOENT')throw error;
}
const unexpected=available.filter(name=>!expected.has(name));
let errors=0;
for(const fileName of unexpected){
  console.error('Tidak dikenal di direktori regulatory pack: '+fileName);
  errors++;
}
for(const [fileName,category] of expected){
  if(!available.includes(fileName)){
    console.log('BELUM TERSEDIA kategori '+category+' (tidak ada data dummy yang otomatis dipakai)');
    if(release)errors++;
    continue;
  }
  try{
    const input=JSON.parse(await readFile(join(directory,fileName),'utf8'));
    const checked=reviewPadkRegulatoryPack(input);
    if(checked.pack.category!==category)throw new TypeError('Kategori tidak cocok nama berkas');
    verifiedPacks.push(checked.pack);
    if(release && (!sourceHash || checked.pack.source.pdfSha256!==sourceHash))
      throw new TypeError('SHA256 PDF sumber tidak cocok dengan regulatory pack');
    console.log('VALIDASI STRUKTUR '+fileName+': '+checked.pack.indicators.length+
      ' indikator, '+(checked.pack.indicators.length*5)+' kriteria, SHA256 '+
      checked.sha256+', attestasi: '+checked.review.level);
    console.log('  PENTING: verifikasi isi terhadap halaman PDF OJK dan approval PR independen tetap wajib.');
  }catch(error){
    console.error('GAGAL '+fileName+': '+error.message);
    errors++;
  }
}
if(release&&available.length!==expected.size)errors++;
if(release&&verifiedPacks.length===2&&sourceHash&&evidencePath){
  try{
    const [source,mapping,evidence]=await Promise.all([
      readFile(join(root,'regulations','padk43','cyber','sources',
        'lampiran-iv-extraction.json'),'utf8').then(JSON.parse),
      readFile(join(root,'regulations','padk43','cyber','review',
        'category2-candidates.json'),'utf8').then(JSON.parse),
      readFile(resolve(evidencePath),'utf8').then(JSON.parse),
    ]);
    const report=validatePadkReleaseEvidence({
      evidence,source,packs:verifiedPacks,mapping:mapping.candidateMappings,
    });
    if(evidence.sourcePdfSha256!==sourceHash)
      throw new TypeError('SHA-256 PDF tidak sesuai bukti review');
    if(report.independentGitHubReviewVerified!==true)
      throw new TypeError('review PR independen belum dapat dibuktikan; penilaian resmi tetap terkunci');
    console.log('VALIDASI BUKTI LENGKAP: '+report.sourceCells+
      ' sel, '+report.crosswalkDecisions+' pemetaan, '+
      report.exceptionDecisions+' keputusan pengecualian.');
  }catch(error){
    console.error('RELEASE BLOCKED: bukti review tidak valid: '+error.message);
    errors++;
  }
}
if(errors || process.exitCode===1){
  console.error('Regulatory pack gate gagal: '+(errors+(process.exitCode===1?1:0))+' isu ditemukan.');
  process.exitCode=1;
}else if(!release&&available.length===0){
  console.log('Development pass: belum ada pack. Release gate TIDAK LULUS. Jalankan npm run regulatory:release-gate.');
}else{
  console.log('Pemeriksaan struktur selesai; tidak menggantikan verifikasi substansi atau approval manusia.');
}
