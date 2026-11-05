#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizePadkDrafts } from '../apps/api/src/padk-transcription-workbench.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const folder=join(root,'regulations','padk43','cyber','drafts');
const strict=process.argv.includes('--strict');
const json=process.argv.includes('--json');

try{
  const drafts=[];
  for(const category of [1,2]){
    const data=await readFile(join(folder,'kategori-'+category+'.json'),'utf8');
    drafts.push(JSON.parse(data));
  }
  const summary=summarizePadkDrafts(drafts);
  if(json){
    console.log(JSON.stringify({
      ...summary,
      categories:summary.categories.map(({items,...rest})=>rest),
    },null,2));
  }else{
    console.log('PADK Lampiran IV — STATUS: DRAFT, TIDAK BOLEH DIPAKAI MENILAI BANK');
    for(const item of summary.categories){
      console.log('Kategori '+item.category+': '+item.draftedIndicators+'/'+
        item.expectedIndicators+' indikator dicatat; '+item.draftedRankCriteria+
        '/'+item.expectedRankCriteria+' kriteria dicatat. Belum direview.');
    }
    console.log('TOTAL: '+summary.totalDraftedIndicators+'/'+
      summary.totalExpectedIndicators+' indikator; '+summary.totalDraftedRankCriteria+
      '/'+summary.totalExpectedRankCriteria+' kriteria.');
    console.log('SOURCE: hanya salinan kerja pihak ketiga. PDF OJK belum dibandingkan byte dan halaman.');
    console.log('RELEASE: BLOCKED. Gunakan regulatory:release-gate secara terpisah.');
  }
  if(strict && (!summary.categories.every(item=>
    item.missingNumbers.length===0 && item.missingRankCriteria===0)
    || !summary.productionEligible)){
    console.error('BLOCKED: belum ada verifikasi sumber dan reviewer independen.');
    process.exitCode=1;
  }
}catch(error){
  console.error('GAGAL MEMERIKSA DRAFT: '+error.message);
  process.exitCode=1;
}
