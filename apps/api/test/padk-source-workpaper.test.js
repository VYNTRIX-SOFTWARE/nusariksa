import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {readExtractedTable3,listPadkDraftSourceConflicts} from '../src/padk-draft-criteria.js';
import {buildSourceReviewWorkpaper,toReviewCsv,summarizeSourceReview} from '../../../scripts/padk-source-workpaper.js';

const draft=async n=>JSON.parse(await readFile(
  new URL('../../../regulations/padk43/cyber/drafts/kategori-'+n+'.json',import.meta.url),'utf8'));
test('workpaper verifikasi sumber berisi 140 indikator dan 400 kriteria unik tanpa approval otomatis',async()=>{
  const drafts=await Promise.all([1,2].map(draft));
  const source=await readExtractedTable3();
  const workpaper=buildSourceReviewWorkpaper(drafts,source);
  assert.deepEqual(workpaper.counts,{kategori1:80,kategori2:60,kriteriaUnik:400,total:540,verified:0});
  assert.equal(workpaper.productionEligible,false);
  assert.equal(workpaper.independentReviewCompleted,false);
  assert.equal(new Set(workpaper.records.map(x=>x.id)).size,540);
  assert.equal(workpaper.records.filter(x=>x.jenis==='INDIKATOR').length,140);
  assert.equal(workpaper.records.filter(x=>x.jenis==='KRITERIA_TABEL_3').length,400);
  assert.ok(workpaper.records.every(x=>x.verdict==='PENDING'&&x.reviewer===''&&x.sha256_pdf_resmi===''));
  assert.equal(workpaper.records[0].id,'K1-I001');
  assert.equal(workpaper.records[80].id,'K2-I001');
  assert.equal(workpaper.records[140].id,'T3-I001-R1');
  assert.equal(workpaper.records.at(-1).id,'T3-I080-R5');
  const highC2=workpaper.records.filter(x=>x.prioritas==='REVIEW_PEMETAAN');
  assert.deepEqual(highC2.map(x=>x.indikator),[3,18,19,20,24,29,32]);
  assert.equal(workpaper.records.filter(x=>x.prioritas==='PERIKSA_TABEL_TERPECAH').length,24);
  assert.equal(workpaper.records.filter(x=>x.prioritas==='PERIKSA_ANOMALI_REDAKSI').length,31);
  assert.equal(workpaper.records.filter(x=>['PERIKSA_TABEL_TERPECAH','PERIKSA_ANOMALI_REDAKSI'].includes(x.prioritas)).length,55);
  assert.equal(workpaper.records.filter(x=>x.prioritas!=='NORMAL').length,62);
  for(const issue of listPadkDraftSourceConflicts()){
    for(const rank of issue.reviewRanks){
      const row=workpaper.records.find(x=>x.id==='T3-I'+String(issue.number).padStart(3,'0')+'-R'+rank);
      assert.ok(row,issue.number+':'+rank);
      assert.equal(row.prioritas,'PERIKSA_ANOMALI_REDAKSI');
      assert.match(row.catatan_sumber,/Periksa redaksi sumber/);
      assert.equal(row.verdict,'PENDING');
    }
  }
  for(const row of highC2){
    assert.match(row.catatan_sumber,/belum|masih kandidat/);
    assert.equal(row.verdict,'PENDING');
  }
  const summary=summarizeSourceReview(workpaper);
  assert.equal(summary.pending,540);
  assert.equal(summary.reviewed,0);
  assert.equal(summary.sourceAuthenticityVerified,false);
  assert.equal(summary.productionEligible,false);
  assert.deepEqual(summary.focus,{sourceWordingCells:31,splitTableCells:24,
    category2MappingIndicators:7,totalFlaggedRecords:62});
  assert.throws(()=>summarizeSourceReview({...workpaper,records:[...workpaper.records.slice(1)]}),/ringkasan/);
  assert.throws(()=>summarizeSourceReview({...workpaper,records:workpaper.records.map((x,i)=>i===0?{...x,verdict:'MATCH'}:x)}),/ringkasan/);
  const anomaly=workpaper.records.find(x=>x.id==='T3-I002-R1');
  assert.equal(anomaly.prioritas,'PERIKSA_ANOMALI_REDAKSI');
  assert.match(anomaly.catatan_sumber,/risk appetite/);
  assert.equal(anomaly.verdict,'PENDING');
  assert.equal(workpaper.records.find(x=>x.id==='T3-I002-R2').catatan_sumber,'');
  const csv=toReviewCsv(workpaper);
  assert.equal(csv.trimEnd().split('\n').length>=541,true);
  assert.match(csv,/PENDING/);
  assert.match(csv,/PERIKSA_ANOMALI_REDAKSI/);
  assert.throws(()=>buildSourceReviewWorkpaper([drafts[0],drafts[0]],source),/kategori ganda/);
  assert.throws(()=>buildSourceReviewWorkpaper(drafts,source.slice(1)),/jumlah kategori/);
});
test('workpaper CLI tidak mengubah regulatory pack dan hanya melaporkan status pending',()=>{
  const cli=new URL('../../../scripts/padk-source-workpaper.js',import.meta.url);
  const run=spawnSync(process.execPath,[cli.pathname,'--format=json'],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.counts.total,540);
  assert.equal(report.counts.verified,0);
  assert.equal(report.productionEligible,false);
  assert.match(run.stderr,/belum ada hasil yang disahkan/);
  const summary=spawnSync(process.execPath,[cli.pathname,'--format=ringkasan'],{encoding:'utf8',timeout:15000});
  assert.equal(summary.status,0,summary.stderr);
  assert.equal(JSON.parse(summary.stdout).focus.totalFlaggedRecords,62);
  assert.equal(JSON.parse(summary.stdout).pending,540);
});
