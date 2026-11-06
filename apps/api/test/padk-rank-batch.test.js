import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  applyPadkRankBatch, padkDraftSha256, preparePadkRankBatch,
} from '../src/padk-rank-batch.js';
import { inspectPadkTranscriptionDraft } from '../src/padk-transcription-workbench.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = join(root,'regulations','padk43','cyber','drafts');
const script = join(root,'scripts','padk-rank-batch.js');
const draftFor = async category =>
  JSON.parse(await readFile(join(folder,'kategori-'+category+'.json'),'utf8'));
const criterion = (number,rank,text) => ({
  number,rank,workingSummary:text,criteriaPage:38,
});

test('template menampilkan 700 slot kosong tanpa kriteria karangan',async()=>{
  const one=await draftFor(1),two=await draftFor(2);
  const a=preparePadkRankBatch(one),b=preparePadkRankBatch(two);
  assert.equal(a.entries.length,400);
  assert.equal(b.entries.length,300);
  assert.equal(a.category,1);
  assert.equal(b.category,2);
  assert.equal(a.status,'SOURCE_REVIEW_PENDING');
  assert.equal(a.baseSha256,padkDraftSha256(one));
  assert.ok(a.entries.every(e=>e.workingSummary===''&&e.criteriaPage===null));
  assert.equal(preparePadkRankBatch(one,{from:1,to:2}).entries.length,10);
  assert.equal(preparePadkRankBatch(two,{from:60,to:60}).entries.length,5);
  assert.throws(()=>preparePadkRankBatch(one,{from:0,to:2}),TypeError);
  assert.throws(()=>preparePadkRankBatch(two,{from:1,to:61}),TypeError);
});

test('batch parsial mengisi slot tanpa mengubah status draft, hash, atau sumber',async()=>{
  const original=await draftFor(1);
  const base=preparePadkRankBatch(original,{from:1,to:1});
  const batch={...base,entries:[
    criterion(1,1,'Wewenang dan tanggung jawab sudah ditetapkan dan dikaji berkala.'),
    criterion(1,2,'Wewenang dan tanggung jawab ditetapkan tertulis tetapi tinjauan belum konsisten.'),
  ]};
  const result=applyPadkRankBatch(original,batch);
  assert.equal(result.added,2);
  assert.equal(result.totalDraftedCriteria,2);
  assert.equal(result.remainingCriteria,398);
  assert.equal(result.productionEligible,false);
  assert.equal(result.draft.status,'DRAFT_UNVERIFIED');
  assert.equal(result.draft.source.pdfSha256,null);
  assert.equal(result.draft.source.verifiedAgainstOfficialPdf,false);
  assert.equal(result.draft.items[0].reviewStatus,'NEEDS_SOURCE_REVIEW');
  assert.deepEqual(result.draft.items[0].rankCriteria.map(x=>x.rank),[1,2]);
  assert.equal(original.items[0].rankCriteria.length,0);
  assert.equal(inspectPadkTranscriptionDraft(result.draft).sourcePdfVerified,false);
  const next=preparePadkRankBatch(result.draft,{from:1,to:1});
  assert.equal(next.entries.length,3);
  assert.deepEqual(next.entries.map(x=>x.rank),[3,4,5]);
  assert.notEqual(next.baseSha256,base.baseSha256);
  assert.throws(()=>applyPadkRankBatch(result.draft,batch),/hash baseline berubah/);
});

test('nomor, rank, duplikat, teks generik dan sumber halaman yang tidak lengkap ditolak',async()=>{
  const one=await draftFor(1),two=await draftFor(2);
  const template=preparePadkRankBatch(one,{from:1,to:1});
  const good=criterion(1,1,'Pengendalian telah terdokumentasi dan dievaluasi sesuai prosedur.');
  for(const entry of [
    {...good,number:81},{...good,number:0},{...good,number:'1'},
    {...good,rank:0},{...good,rank:6},{...good,rank:1.5},
    {...good,criteriaPage:37},{...good,criteriaPage:81},
    {...good,criteriaPage:'38'},{...good,workingSummary:'TODO perbaiki'},
    {...good,workingSummary:'Kriteria yang mengandung\nbaris kontrol.'},
    {...good,workingSummary:'terlalu pendek'},
    {...good,unexpected:true},
  ]){
    assert.throws(()=>applyPadkRankBatch(one,{...template,entries:[entry]}),TypeError);
  }
  assert.throws(()=>applyPadkRankBatch(one,{...template,category:2,entries:[good]}),TypeError);
  assert.throws(()=>applyPadkRankBatch(one,{...template,baseSha256:'0'.repeat(64),entries:[good]}),TypeError);
  assert.throws(()=>applyPadkRankBatch(one,{...template,status:'VERIFIED',entries:[good]}),TypeError);
  assert.throws(()=>applyPadkRankBatch(one,{...template,entries:[good,good]}),TypeError);
  assert.throws(()=>applyPadkRankBatch(one,{...template,entries:[good,{...good,rank:2}]}),/tidak boleh identik/);
  assert.throws(()=>applyPadkRankBatch(one,{...template,entries:[]}),TypeError);
  assert.throws(()=>applyPadkRankBatch(two,{...template,entries:[good]}),TypeError);
});

test('CLI dry-run tidak menulis file; apply eksplisit dan impor ulang ditolak',async()=>{
  const temporary=await mkdtemp(join(tmpdir(),'nusariksa-padk-batch-'));
  try{
    for(const category of [1,2])
      await copyFile(join(folder,'kategori-'+category+'.json'),
        join(temporary,'kategori-'+category+'.json'));
    const run=(args)=>spawnSync(process.execPath,[
      script,'--draft-dir='+temporary,...args,
    ],{cwd:root,encoding:'utf8',timeout:15000});
    const preview=run(['--category=1','--from=1','--to=2','--template']);
    assert.equal(preview.status,0,preview.stderr);
    const output=JSON.parse(preview.stdout);
    assert.equal(output.entries.length,10);
    assert.ok(output.entries.every(x=>x.criteriaPage===null));
    const target=join(temporary,'kategori-1.json');
    const initial=await readFile(target,'utf8');
    const batch={...output,entries:[
      criterion(1,1,'Dokumen prosedur ditetapkan formal dan evaluasi dijalankan berkala.'),
    ]};
    const input=join(temporary,'review-batch.json');
    await writeFile(input,JSON.stringify(batch));
    const check=run(['--category=1','--input='+input]);
    assert.equal(check.status,0,check.stderr);
    assert.match(check.stdout,/VALIDASI SAJA/);
    assert.equal(await readFile(target,'utf8'),initial);
    const applied=run(['--category=1','--input='+input,'--apply']);
    assert.equal(applied.status,0,applied.stderr);
    assert.match(applied.stdout,/TERAPAN DRAFT/);
    assert.equal((await readFile(target,'utf8'))===initial,false);
    const saved=JSON.parse(await readFile(target,'utf8'));
    assert.equal(saved.items[0].rankCriteria.length,1);
    assert.equal(saved.status,'DRAFT_UNVERIFIED');
    assert.equal((await draftFor(1)).items[0].rankCriteria.length,0);
    assert.equal(run(['--category=1','--input='+input,'--apply']).status,1);
    assert.equal(run(['--category=2','--input='+input,'--apply']).status,1);
    assert.equal(run(['--category=1','--apply','--template']).status,1);
    assert.equal(run(['--category=1','--template','--from=1','--to=999']).status,1);
  }finally{
    await rm(temporary,{recursive:true,force:true});
  }
});
