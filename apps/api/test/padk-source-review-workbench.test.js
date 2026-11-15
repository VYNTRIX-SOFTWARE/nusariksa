import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readExtractedTable3} from '../src/padk-draft-criteria.js';
import {buildSourceReviewWorkpaper} from '../../../scripts/padk-source-workpaper.js';

await import('../../../tools/padk-source-review/review.js');
const core=globalThis.NusaRiksaSourceReview;
const read=path=>readFile(new URL('../../../'+path,import.meta.url),'utf8');
async function sample(){
  const sources=await Promise.all([1,2].map(async cat=>
    JSON.parse(await read('regulations/padk43/cyber/drafts/kategori-'+cat+'.json'))));
  return buildSourceReviewWorkpaper(sources,await readExtractedTable3());
}
const manual={
  verdict:'MATCH',halaman_fisik_pdf:'157',
  teks_sumber_diperiksa:'Teks buatan untuk pengujian kontrak isian; bukan bukti pemeriksaan regulasi.',
  catatan_review:'',reviewer:'Pemeriksa sintetis pada tes',
  tanggal_review:'2026-11-15',
  sha256_pdf_resmi:'a'.repeat(64),
  url_sumber:'https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx',
};

test('workbench menerima workpaper utuh, menampilkan 62 baris prioritas tanpa mengubah status',async()=>{
  const input=await sample();
  const valid=core.validateWorkpaper(input);
  assert.equal(valid.records.length,540);
  assert.notStrictEqual(valid,input);
  assert.deepEqual(core.progress(valid),{
    total:540,pending:540,match:0,mismatch:0,unreadable:0,priorityPending:62,
  });
  const focus=core.orderedRows(valid);
  assert.equal(focus.length,62);
  assert.equal(focus[0].priority,'PERIKSA_ANOMALI_REDAKSI');
  assert.equal(core.orderedRows(valid,'all').length,540);
  assert.equal(core.orderedRows(valid,'all','MATCH').length,0);
  assert.equal(core.matchesReferenceCopy('63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b'),true);
  assert.equal(core.matchesReferenceCopy('63868E2FE99A48485B17646618934C1FFFB27B125811929E12BD70D170081E1B'),true);
  assert.equal(core.matchesReferenceCopy('0'.repeat(64)),false);
  assert.equal(core.matchesReferenceCopy(null),false);
  assert.equal(valid.productionEligible,false);
  assert.equal(valid.independentReviewCompleted,false);
});

test('catatan petugas hanya mengubah baris lokal, tanpa menyatakan sumber atau hasil resmi',async()=>{
  const baseline=await sample();
  const result=core.applyReview(baseline,'T3-I002-R1',manual);
  assert.equal(result.records.find(r=>r.id==='T3-I002-R1').verdict,'MATCH');
  assert.equal(baseline.records.find(r=>r.id==='T3-I002-R1').verdict,'PENDING');
  assert.equal(result.sourceAuthenticityVerified,false);
  assert.equal(result.independentReviewCompleted,false);
  assert.equal(result.productionEligible,false);
  assert.equal(result.counts.verified,0);
  const p=core.progress(result);
  assert.deepEqual({pending:p.pending,match:p.match,priorityPending:p.priorityPending},
    {pending:539,match:1,priorityPending:61});
  const reload=core.validateWorkpaper(JSON.parse(JSON.stringify(result)));
  assert.equal(core.progress(reload).match,1);
  const mismatch=core.applyReview(result,'K2-I029',{
    ...manual,verdict:'MISMATCH',catatan_review:'Pemetaan kandidat berbeda dengan hasil pemeriksaan sumber.',
  });
  assert.equal(core.progress(mismatch).mismatch,1);
  assert.equal(mismatch.counts.verified,0);
});

test('putusan tanpa teks, halaman, hash, asal penerbit, tanggal atau petugas tidak diterima',async()=>{
  const source=await sample();
  const bad=[
    {teks_sumber_diperiksa:''},{halaman_fisik_pdf:''},
    {sha256_pdf_resmi:''},{url_sumber:'https://example.com/not-ojk.pdf'},
    {tanggal_review:'2026-02-30'},{reviewer:''},
    {verdict:'MISMATCH',catatan_review:''},
  ];
  for(const data of bad){
    assert.throws(()=>core.applyReview(source,'T3-I002-R1',{...manual,...data}),TypeError);
  }
  assert.throws(()=>core.applyReview(source,'K2-I061',manual),TypeError);
  assert.throws(()=>core.applyReview(source,'K2-I029',{...manual,verified:true}),TypeError);
  assert.throws(()=>core.applyReview(source,'T3-I002-R1',{...manual,verdict:'APPROVED'}),TypeError);
});

test('manipulasi release status, angka dan urutan sumber ditolak',async()=>{
  const base=await sample();
  const cases=[
    x=>{x.productionEligible=true;},x=>{x.sourceAuthenticityVerified=true;},
    x=>{x.independentReviewCompleted=true;},x=>{x.counts.verified=540;},
    x=>{x.records[1].id=x.records[0].id;},
    x=>{x.records=x.records.slice(1);},
    x=>{x.records[0].kategori=3;},x=>{x.records[0].indikator=9;},
  ];
  for(const update of cases){
    const clone=structuredClone(base);update(clone);
    assert.throws(()=>core.validateWorkpaper(clone),TypeError);
  }
});

test('workbench PDF tetap lokal dan tidak mempunyai jaringan atau penyimpanan otomatis',async()=>{
  const html=await read('tools/padk-source-review/index.html');
  const app=await read('tools/padk-source-review/app.js');
  const model=await read('tools/padk-source-review/review.js');
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/frame-src blob:/);
  assert.match(html,/script-src 'self'/);
  assert.match(html,/nusariksa-primary\.svg/);
  assert.match(html,/id="reference-match"/);
  assert.match(app,/core\.matchesReferenceCopy\(pdfSha\)/);
  for(const id of ['workpaper-file','pdf-file','pdf-digest','row-select',
    'focus-filter','status-filter','reviewer','verdict','physical-page',
    'source-text','source-sha','source-url','download-progress'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(app,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(app,/URL\.createObjectURL/);
  assert.match(app,/core\.applyReview/);
  assert.doesNotMatch(app,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.doesNotMatch(html,/<script[^>]+src="https?:/i);
  assert.match(model,/DRAFT_SOURCE_REVIEW_PENDING/);
  assert.doesNotMatch(model,/productionEligible=true|independentReviewCompleted=true/);
  for(const js of ['app.js','review.js']){
    const script=new URL('../../../tools/padk-source-review/'+js,import.meta.url);
    const result=spawnSync(process.execPath,['--check',script.pathname],{
      encoding:'utf8',timeout:12000,
    });
    assert.equal(result.status,0,result.stderr);
  }
});

test('CLI membaca progres lokal dan tidak mengklaim kelayakan regulatori',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nusariksa-review-'));
  try{
    const source=await sample();
    const saved=core.applyReview(source,'T3-I002-R1',manual);
    const file=join(dir,'hasil.json');
    await writeFile(file,JSON.stringify(saved));
    const cli=new URL('../../../scripts/padk-source-review-progress.js',import.meta.url);
    const result=spawnSync(process.execPath,[cli.pathname,'--input='+file],{
      encoding:'utf8',timeout:15000,
    });
    assert.equal(result.status,0,result.stderr);
    const summary=JSON.parse(result.stdout);
    assert.equal(summary.match,1);
    assert.equal(summary.pending,539);
    assert.equal(summary.productionEligible,false);
    assert.equal(summary.independentReviewCompleted,false);
    const bad=structuredClone(saved);bad.productionEligible=true;
    await writeFile(file,JSON.stringify(bad));
    const rejected=spawnSync(process.execPath,[cli.pathname,'--input='+file],{
      encoding:'utf8',timeout:15000,
    });
    assert.notEqual(rejected.status,0);
    assert.match(rejected.stderr,/tidak valid/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
