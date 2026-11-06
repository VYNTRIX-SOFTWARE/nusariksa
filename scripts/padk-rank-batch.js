#!/usr/bin/env node
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPadkRankBatch, padkDraftSha256, preparePadkRankBatch,
} from '../apps/api/src/padk-rank-batch.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const known = new Set([
  'category','from','to','template','input','apply','draft-dir',
]);
const parsed = new Map();
for (const arg of args) {
  const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
  if (!match || !known.has(match[1]) || parsed.has(match[1])) {
    console.error('Argumen tidak dikenal atau duplikat: ' + arg);
    process.exitCode = 1;
    break;
  }
  parsed.set(match[1], match[2] ?? true);
}
if (process.exitCode) {
  // Invalid flags are rejected before any file access.
} else {
  try {
    const category = Number(parsed.get('category'));
    if (![1,2].includes(category)) throw new TypeError('Gunakan --category=1 atau --category=2');
    const isTemplate = parsed.has('template'), isInput = parsed.has('input');
    if (isTemplate === isInput || parsed.get('template') !== undefined && parsed.get('template') !== true) {
      throw new TypeError('Pilih tepat satu: --template atau --input=<file>');
    }
    if (parsed.has('apply') && (parsed.get('apply') !== true || !isInput)) {
      throw new TypeError('--apply hanya valid bersama --input');
    }
    if (isInput && (parsed.has('from') || parsed.has('to'))) {
      throw new TypeError('--from dan --to hanya untuk --template');
    }
    const folder = parsed.has('draft-dir')
      ? resolve(String(parsed.get('draft-dir')))
      : join(root,'regulations','padk43','cyber','drafts');
    const destination = join(folder,'kategori-'+category+'.json');
    const draft = JSON.parse(await readFile(destination,'utf8'));
    if (draft.category !== category) throw new TypeError('Kategori draft tidak cocok');
    if (isTemplate) {
      const from = parsed.has('from') ? Number(parsed.get('from')) : 1;
      const to = parsed.has('to') ? Number(parsed.get('to'))
        : (category===1?80:60);
      const template = preparePadkRankBatch(draft,{from,to});
      process.stdout.write(JSON.stringify(template,null,2)+'\n');
    } else {
      if (typeof parsed.get('input') !== 'string' || !parsed.get('input')) {
        throw new TypeError('Tentukan --input=<file>');
      }
      const raw = JSON.parse(await readFile(resolve(parsed.get('input')),'utf8'));
      const result = applyPadkRankBatch(draft,raw);
      if (parsed.has('apply')) {
        // Detect edits made between reading and writing; never overwrite
        // existing rank criteria silently.
        const fresh = JSON.parse(await readFile(destination,'utf8'));
        if (padkDraftSha256(fresh) !== raw.baseSha256) {
          throw new TypeError('Draft berubah selama impor; batalkan dan buat ulang batch');
        }
        const temporary = destination+'.pending-'+process.pid;
        try {
          await writeFile(temporary,JSON.stringify(result.draft,null,2)+'\n',{flag:'wx',mode:0o600});
          await rename(temporary,destination);
        } finally {
          await rm(temporary,{force:true});
        }
      }
      console.log((parsed.has('apply')?'TERAPAN DRAFT':'VALIDASI SAJA')+
        ': kategori '+category+', '+result.added+' kriteria baru; '+
        'total '+result.totalDraftedCriteria+', sisa '+result.remainingCriteria+'.');
      console.log('STATUS: DRAFT_UNVERIFIED. BUKAN regulatory pack atau hasil penilaian resmi.');
    }
  } catch (error) {
    console.error('GAGAL: '+error.message);
    process.exitCode=1;
  }
}
