import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 suggestRecoveryCode,recoveryTargetLabel,recoveryNextStep,
 recoveryExerciseGuidance,RECOVERY_TEMPLATES,
} from '../../web/assets/ti-recovery-ui.js';

test('saran kode rencana pemulihan bersifat deterministik dan tidak mengisi fakta',()=>{
 assert.equal(suggestRecoveryCode('Layanan CBS dan transaksi'),'BCP-LAYANAN-CBS-DAN-TRANSAKSI');
 assert.equal(suggestRecoveryCode(''), '');
 assert.equal(suggestRecoveryCode(null), '');
 assert.ok(suggestRecoveryCode('Pemulihan Core Banking dan Rekonsiliasi Transaksi yang Sangat Panjang').length<=32);
 assert.match(suggestRecoveryCode('Layanan 🖥️ server'),/^[A-Z][A-Z0-9_-]{1,31}$/);
});

test('RTO/RPO yang belum ditetapkan tidak ditafsirkan sebagai nol',()=>{
 assert.equal(recoveryTargetLabel(null),'Belum ditetapkan');
 assert.equal(recoveryTargetLabel(undefined),'Belum ditetapkan');
 assert.equal(recoveryTargetLabel(''),'Belum ditetapkan');
 assert.equal(recoveryTargetLabel(-1),'Belum ditetapkan');
 assert.equal(recoveryTargetLabel(0),'0 menit');
 assert.equal(recoveryTargetLabel(120),'120 menit (2 jam)');
 assert.equal(recoveryTargetLabel(30),'30 menit');
});

test('kerangka pemulihan hanya menyediakan narasi contoh, bukan rencana operasional faktual',()=>{
 assert.equal(RECOVERY_TEMPLATES.length,6);
 assert.equal(new Set(RECOVERY_TEMPLATES.map(x=>x.id)).size,6);
 for(const x of RECOVERY_TEMPLATES){
  assert.ok(x.id&&x.label&&x.service);
  for(const key of ['scenario','impact','activation','steps'])
   assert.ok(typeof x[key]==='string'&&x[key].length>=10);
  for(const key of ['ownerPic','alternatePic','rtoMinutes','rpoMinutes','status',
   'backupReference','evidenceLocation','exerciseDate','outcome','observedRtoMinutes']){
   assert.equal(Object.hasOwn(x,key),false,x.id+' mengandung nilai faktual '+key);
  }
 }
});

test('panduan langkah berikutnya mengikuti status dan riwayat yang tercatat',()=>{
 assert.match(recoveryNextStep(null),/Pilih rencana/);
 assert.match(recoveryNextStep({archived_at:null},0),/belum diuji|jadwalkan/);
 assert.match(recoveryNextStep({archived_at:null},2),/2 catatan pengujian/);
 assert.match(recoveryNextStep({archived_at:'2026-11-13'},1),/diarsipkan/);
 assert.match(recoveryExerciseGuidance('passed',{rpo_minutes:60}),/RPO aktual/);
 assert.match(recoveryExerciseGuidance('passed',{rpo_minutes:null}),/RTO aktual/);
 assert.doesNotMatch(recoveryExerciseGuidance('passed',{rpo_minutes:null}),/RPO aktual/);
 assert.match(recoveryExerciseGuidance('partial'),/kesenjangan/);
 assert.match(recoveryExerciseGuidance('failed'),/kesenjangan/);
 assert.match(recoveryExerciseGuidance(''),/Pilih hasil/);
});
