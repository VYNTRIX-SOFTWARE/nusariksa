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
  assert.equal(stats.totalDraftedIndicators,140);
  assert.equal(stats.totalDraftedRankCriteria,0);
  assert.equal(stats.categories[0].missingNumbers.length,0);
  assert.equal(stats.categories[1].missingNumbers.length,0);
  assert.equal(stats.categories[0].items[0].tablePage,16);
  assert.equal(stats.categories[0].items.length,80);
  assert.equal(stats.categories[1].items.length,60);
  for (const category of stats.categories) {
    for (const item of category.items) {
      assert.equal(item.reviewStatus,'NEEDS_SOURCE_REVIEW');
      assert.equal(item.rankCriteria.length,0);
    }
  }
  assert.deepEqual(stats.categories[0].items.slice(0,22).map(x=>x.domain),
    Array(22).fill('TK'));
  assert.deepEqual(stats.categories[0].items.slice(22,30).map(x=>x.domain),
    Array(8).fill('ID'));
  assert.equal(stats.categories[1].items[20].domain,'TK');
  assert.deepEqual(stats.categories[1].items.slice(21,28).map(x=>x.domain),
    Array(7).fill('ID'));
  assert.deepEqual(stats.categories[1].items.slice(28,30).map(x=>x.domain),
    Array(2).fill('PL'));
  assert.equal(stats.categories[0].items[20].tablePage,19);
  assert.equal(stats.categories[0].items[28].tablePage,20);
  assert.equal(stats.categories[0].items[30].domain,'ID');
  assert.equal(stats.categories[0].items[31].domain,'PL');
  assert.equal(stats.categories[0].items[30].tablePage,20);
  assert.equal(stats.categories[0].items[39].tablePage,21);
  assert.equal(stats.categories[1].items[30].domain,'PL');
  assert.equal(stats.categories[1].items[30].tablePage,32);
  assert.equal(stats.categories[1].items[39].tablePage,34);
  assert.deepEqual(stats.categories[0].items.slice(40,62).map(x=>x.domain),Array(22).fill('PL'));
  assert.deepEqual(stats.categories[0].items.slice(62,65).map(x=>x.domain),Array(3).fill('DT'));
  assert.deepEqual(stats.categories[0].items.slice(65).map(x=>x.domain),Array(15).fill('PP'));
  assert.deepEqual(stats.categories[1].items.slice(40,46).map(x=>x.domain),Array(6).fill('PL'));
  assert.equal(stats.categories[1].items[46].domain,'DT');
  assert.deepEqual(stats.categories[1].items.slice(47).map(x=>x.domain),Array(13).fill('PP'));
  assert.equal(stats.categories[0].items[40].tablePage,22);
  assert.equal(stats.categories[0].items[45].tablePage,23);
  assert.equal(stats.categories[0].items[60].tablePage,25);
  assert.equal(stats.categories[0].items[65].tablePage,25);
  assert.equal(stats.categories[0].items[74].tablePage,27);
  assert.equal(stats.categories[0].items[79].tablePage,27);
  assert.equal(stats.categories[1].items[40].tablePage,34);
  assert.equal(stats.categories[1].items[45].tablePage,35);
  assert.equal(stats.categories[1].items[47].tablePage,35);
  assert.equal(stats.categories[1].items[51].tablePage,36);
  assert.equal(stats.categories[1].items[59].tablePage,37);
  assert.equal(stats.categories[0].items[46].subdomain,'MANAJEMEN_IDENTITAS_AUTENTIKASI_KONTROL_AKSES');
  assert.equal(stats.categories[1].items[46].subdomain,'KETAHANAN_INFRASTRUKTUR_TI');
  assert.equal(stats.categories[0].items[73].subdomain,
    'PELAKSANAAN_RENCANA_PEMULIHAN_INSIDEN_SIBER');
  assert.equal(stats.categories[1].items[53].subdomain,
    'PELAKSANAAN_RENCANA_PEMULIHAN_INSIDEN_SIBER');
  assert.equal(stats.totalDraftedRankCriteria,0);
  assert.equal(stats.categories.every(c=>c.missingRankCriteria>0),true);
  assert.equal(stats.categories[0].items[35].subdomain,
    'MANAJEMEN_IDENTITAS_AUTENTIKASI_KONTROL_AKSES');
  assert.equal(stats.categories[1].items[35].subdomain,'KEAMANAN_DATA');
  assert.notEqual(stats.categories[0].items[30].domain,stats.categories[1].items[30].domain);
  assert.notEqual(stats.categories[0].items[34].workingSummary,
    stats.categories[1].items[34].workingSummary);
  assert.equal(stats.categories[1].items[20].tablePage,31);
  assert.equal(stats.categories[1].items[29].tablePage,32);
  assert.notEqual(stats.categories[0].items[21].domain,stats.categories[1].items[21].domain);
  assert.notEqual(stats.categories[0].items[28].domain,stats.categories[1].items[28].domain);
  assert.equal(stats.categories[0].items[6].tablePage,16);
  assert.equal(stats.categories[0].items[7].tablePage,17);
  assert.equal(stats.categories[0].items[19].tablePage,18);
  assert.equal(stats.categories[1].items[6].tablePage,28);
  assert.equal(stats.categories[1].items[7].tablePage,29);
  assert.equal(stats.categories[1].items[19].tablePage,31);
  assert.notEqual(
    stats.categories[0].items[17].workingSummary,
    stats.categories[1].items[17].workingSummary,
    'Indikator 18 kategori 1 dan 2 tidak boleh disalin identik',
  );
  assert.notEqual(
    stats.categories[0].items[18].workingSummary,
    stats.categories[1].items[18].workingSummary,
    'Indikator 19 kategori 1 dan 2 berbeda substansi',
  );
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
  assert.match(dev.stdout,/140\/140 indikator/);
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
  assert.deepEqual(stats.categories[0].missingNumbers,[]);
  assert.deepEqual(stats.categories[1].missingNumbers,[]);
  assert.equal(stats.productionEligible,false);
});
