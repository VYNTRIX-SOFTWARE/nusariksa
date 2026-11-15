#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
await import('../tools/padk-source-review/review.js');
const review=globalThis.NusaRiksaSourceReview;

export async function inspectLocalReviewFile(path){
  if(typeof path!=='string'||!path.trim())throw new TypeError('Lokasi berkas JSON diperlukan.');
  let value;
  try{value=JSON.parse(await readFile(path,'utf8'));}
  catch(error){throw new TypeError('Berkas JSON tidak dapat dibaca: '+error.message);}
  const report=review.progress(value);
  return {
    kind:'PADK_SOURCE_REVIEW_PROGRESS',
    productionEligible:false,
    sourceAuthenticityVerified:false,
    independentReviewCompleted:false,
    ...report,
    note:'Status MATCH berarti hasil pencocokan awal oleh petugas. Pemeriksaan independen dan keaslian berkas sumber masih perlu dibuktikan.',
  };
}

async function main(args){
  if(args.length!==1||!args[0].startsWith('--input=')||
    !args[0].slice('--input='.length))
    throw new TypeError('Pemakaian: node scripts/padk-source-review-progress.js --input=review.json');
  const path=args[0].slice('--input='.length);
  const report=await inspectLocalReviewFile(path);
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main(process.argv.slice(2)).catch(error=>{
    console.error(error.message);process.exitCode=1;
  });
