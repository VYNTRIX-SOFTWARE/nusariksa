import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  inspectPadkTranscriptionDraft, summarizePadkDrafts,
} from '../src/padk-transcription-workbench.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const base=join(root,'regulations','padk43','cyber','drafts');
const getDraft=async category=>JSON.parse(
  await readFile(join(base,'kategori-'+category+'.json'),'utf8'),
);
const script=join(root,'scripts','check-padk-transcription-drafts.js');

test('progres transkripsi hanya mencatat sumber yang jelas belum diverifikasi',async()=>{
  const drafts=await Promise.all([1,2].map(getDraft));
  const stats=summarizePadkDrafts(drafts);
  assert.equal(stats.status,'TRANSCRIPTION_IN_PROGRESS');
  assert.equal(stats.productionEligible,false);
  assert.equal(stats.totalExpectedIndicators,140);
  assert.equal(stats.totalExpectedRankCriteria,700);
  assert.equal(stats.totalDraftedIndicators,12);
  assert.equal(stats.totalDraftedRankCriteria,0);
  assert.equal(stats.categories[0].missingNumbers.length,74);
  assert.equal(stats.categories[1].missingNumbers.length,54);
  assert.equal(stats.categories[0].items[0].tablePage,16);
  assert.equal(stats.categories[1].items[0].tablePage,28);
  assert.equal(stats.categories[0].sourcePdfVerified,false);
  assert.equal(drafts[0].source.pdfSha256,null);
  assert.equal(drafts[1].source.verifiedAgainstOfficialPdf,false);
});

test('draft tidak boleh dipromosikan melalui perubahan field status',async()=>{
  const draft=await getDraft(1);
  for(const mutate of [
    x=>{x.status='VERIFIED';},
    x=>{x.source.verifiedAgainstOfficialPdf=true;},
    x=>{x.source.pdfSha256='a'.repeat(64);},
    x=>{x.items[0].reviewStatus='APPROVED';},
    x=>{x.items[0].number=x.items[1].number;},
    x=>{x.items[0].tablePage=38;},
    x=>{x.items[0].domain='INVALID';},
    x=>{x.items[0].workingSummary='teks\nkontrol';},
    x=>{x.items[0].unexpected=true;},
    x=>{x.items[0].rankCriteria=[{
      rank:0,workingSummary:'Kriteria sintetis pengujian',criteriaPage:38,
    }];},
  ]){
    const changed=structuredClone(draft);
    mutate(changed);
    assert.throws(()=>inspectPadkTranscriptionDraft(changed),TypeError);
  }
});

test('workbench menguji rank 1–5 unik tanpa mengarang kriteria yang kosong',async()=>{
  const draft=await getDraft(2);
  const item=draft.items[0];
  item.rankCriteria=[
    {rank:5,workingSummary:'Kriteria kerja kelima yang perlu diteliti',criteriaPage:39},
    {rank:1,workingSummary:'Kriteria kerja pertama yang perlu diteliti',criteriaPage:39},
  ];
  const result=inspectPadkTranscriptionDraft(draft);
  assert.equal(result.draftedRankCriteria,2);
  assert.equal(result.missingRankCriteria,298);
  assert.deepEqual(result.items[0].rankCriteria.map(x=>x.rank),[1,5]);
  item.rankCriteria.push({...item.rankCriteria[0]});
  assert.throws(()=>inspectPadkTranscriptionDraft(draft),TypeError);
});

test('CLI development melaporkan progres, mode ketat gagal tanpa verifikasi',()=>{
  const dev=spawnSync(process.execPath,[script],{
    cwd:root,encoding:'utf8',timeout:15000,
  });
  assert.equal(dev.status,0,dev.stderr);
  assert.match(dev.stdout,/12\/140 indikator/);
  assert.match(dev.stdout,/0\/700 kriteria/);
  assert.match(dev.stdout,/RELEASE: BLOCKED/);

  const strict=spawnSync(process.execPath,[script,'--strict'],{
    cwd:root,encoding:'utf8',timeout:15000,
  });
  assert.equal(strict.status,1);
  assert.match(strict.stderr,/BLOCKED:/);
  const json=spawnSync(process.execPath,[script,'--json'],{
    cwd:root,encoding:'utf8',timeout:15000,
  });
  assert.equal(json.status,0,json.stderr);
  const stats=JSON.parse(json.stdout);
  assert.equal(stats.categories[0].missingNumbers[0],7);
  assert.equal(stats.productionEligible,false);
});
