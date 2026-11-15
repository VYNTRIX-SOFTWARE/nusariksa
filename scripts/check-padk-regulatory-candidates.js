#!/usr/bin/env node
import {inspectPadkCandidatePacks} from '../apps/api/src/padk-regulatory-candidates.js';

try{
  const report=await inspectPadkCandidatePacks();
  console.log(JSON.stringify(report,null,2));
  console.error('Selesai: 140 indikator dan 700 penempatan kriteria tersedia sebagai candidate packs. Review sumber dan persetujuan independen BELUM selesai.');
}catch(error){
  console.error('Regulatory candidate pack tidak konsisten: '+error.message);
  process.exitCode=1;
}
