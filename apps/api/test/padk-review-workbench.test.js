import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { preparePadkRankBatch, applyPadkRankBatch } from '../src/padk-rank-batch.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
await import('../../../tools/padk-review/review.js');
const core = globalThis.NusaRiksaPadkReview;

const draft = async category => JSON.parse(
  await readFile(join(root,'regulations','padk43','cyber','drafts',
    'kategori-'+category+'.json'),'utf8'));

function fill(template) {
  const result = core.checkTemplate(template);
  for (const item of result.entries) {
    item.workingSummary = 'Kondisi indikator ' + item.number + ' dengan pengendalian dan ' +
      'evaluasi sesuai peringkat ' + item.rank + ' yang dicatat pada dokumen sumber.';
    item.criteriaPage = 38;
  }
  return result;
}

test('workbench offline menerima dua template CLI dan tidak menciptakan kriteria sendiri',async()=>{
  assert.ok(core);
  for(const category of [1,2]) {
    const sample=await draft(category);
    const template=preparePadkRankBatch(sample,{from:1,to:1});
    const input=core.checkTemplate(template);
    assert.equal(input.category,category);
    assert.equal(core.progress(input).complete,0);
    assert.equal(core.progress(input).total,5);
    assert.ok(input.entries.every(x=>x.workingSummary===''&&x.criteriaPage===null));
    assert.throws(()=>core.exportBatch(input),/lengkapi teks/);
  }
});

test('hasil ekspor lengkap langsung kompatibel dengan validator batch PR #36',async()=>{
  const sample=await draft(1);
  const input=preparePadkRankBatch(sample,{from:1,to:2});
  const ready=fill(input);
  assert.deepEqual(core.progress(ready),{complete:10,total:10});
  const clean=core.exportBatch(ready);
  assert.equal(clean.status,'SOURCE_REVIEW_PENDING');
  assert.equal(clean.baseSha256,input.baseSha256);
  assert.equal(clean.entries.length,10);
  assert.equal(sample.items[0].rankCriteria.length,0);
  const imported=applyPadkRankBatch(sample,clean);
  assert.equal(imported.added,10);
  assert.equal(imported.remainingCriteria,390);
  assert.equal(imported.draft.status,'DRAFT_UNVERIFIED');
  assert.equal(imported.draft.source.verifiedAgainstOfficialPdf,false);
  assert.equal(imported.productionEligible,false);
});

test('menolak manipulasi kategori, header, hash, nomor, peringkat dan duplikasi',async()=>{
  const input=fill(preparePadkRankBatch(await draft(2),{from:60,to:60}));
  const mutate=[
    x=>{x.category=1;},
    x=>{x.status='VERIFIED';},
    x=>{x.baseSha256='not-a-hash';},
    x=>{x.schemaVersion=2;},
    x=>{x.entries[0].number=61;},
    x=>{x.entries[0].rank=0;},
    x=>{x.entries[0].rank=6;},
    x=>{x.entries[0].rank='1';},
    x=>{x.entries.push({...x.entries[0]});},
    x=>{x.entries[0].extra='injected';},
  ];
  for(const fn of mutate) {
    const changed=structuredClone(input);fn(changed);
    assert.throws(()=>core.checkTemplate(changed),TypeError);
  }
});

test('menolak batch yang belum lengkap, placeholder, halaman salah dan peringkat identik',async()=>{
  const ready=fill(preparePadkRankBatch(await draft(1),{from:1,to:1}));
  for(const fn of [
    x=>{x.entries[0].workingSummary='';},
    x=>{x.entries[0].workingSummary='TODO isi nanti';},
    x=>{x.entries[0].workingSummary='terlalu pendek';},
    x=>{x.entries[0].workingSummary=' Isi valid yang diawali spasi harus ditolak.';},
    x=>{x.entries[0].workingSummary='Kriteria dengan\nbaris kontrol harus ditolak.';},
    x=>{x.entries[0].criteriaPage=37;},
    x=>{x.entries[0].criteriaPage=81;},
    x=>{x.entries[0].criteriaPage=null;},
    x=>{x.entries[0].criteriaPage=38.5;},
    x=>{x.entries[1].workingSummary=x.entries[0].workingSummary;},
  ]) {
    const changed=structuredClone(ready);fn(changed);
    assert.throws(()=>core.exportBatch(changed),TypeError);
  }
});

test('antarmuka lokal mempunyai kontrol PDF, progres, ekspor dan tanpa koneksi eksternal',async()=>{
  const path=join(root,'tools','padk-review');
  const html=await readFile(join(path,'index.html'),'utf8');
  const app=await readFile(join(path,'app.js'),'utf8');
  const model=await readFile(join(path,'review.js'),'utf8');
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/frame-src blob:/);
  for(const id of ['batch-file','pdf-file','pdf-frame','physical-page','indicator',
    'save-progress','export-bottom','status']) {
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/Simpan progres lokal/);
  assert.match(html,/Nomor PDF fisik dapat berbeda/);
  assert.match(app,/URL\.createObjectURL/);
  assert.match(app,/file\.slice\(0,5\)/);
  assert.match(model,/SOURCE_REVIEW_PENDING/);
  assert.doesNotMatch(html,/<script[^>]*src="https?:/i);
  assert.doesNotMatch(app,/\bfetch\s*\(|XMLHttpRequest|localStorage/);
  for(const script of ['app.js','review.js']) {
    const result=spawnSync(process.execPath,['--check',join(path,script)],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
});
