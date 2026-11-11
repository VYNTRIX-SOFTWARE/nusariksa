#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const KNOWN_WORKING_COPY_SHA256='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
export function inspectPadkPdfCopy(bytes) {
 if(!Buffer.isBuffer(bytes)||bytes.length<1024
   ||bytes.subarray(0,5).toString('ascii')!=='%PDF-')
   throw new TypeError('Berkas sumber bukan PDF valid atau terlalu kecil');
 const sha256=createHash('sha256').update(bytes).digest('hex');
 return {
  sha256,
  sameAsRecordedWorkingCopy:sha256===KNOWN_WORKING_COPY_SHA256,
  sourceAuthenticityVerified:false,
  regulatoryContentVerified:false,
  approvedForScoring:false,
  note:'Hash sama hanya membuktikan byte PDF sama dengan working copy. Asal file dan isi Lampiran IV masih membutuhkan verifikasi independen.',
 };
}
async function main() {
 const args=process.argv.slice(2);
 if(args.length!==1||!args[0].startsWith('--source-pdf=')
   ||args[0].length<15) {
  console.error('Pakai: node scripts/padk-pdf-fingerprint.js --source-pdf=/lokasi/file.pdf');
  process.exitCode=2;return;
 }
 try{
  const source=args[0].slice('--source-pdf='.length);
  const output=inspectPadkPdfCopy(await readFile(resolve(source)));
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
 }catch(error){console.error('Gagal memeriksa PDF: '+error.message);process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
 main().catch(error=>{console.error(error.message);process.exitCode=1;});
