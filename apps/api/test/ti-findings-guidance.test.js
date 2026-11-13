import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  suggestFindingCode,findingSubmissionChecklist,findingNextStep,findingPriorityGuidance,
} from '../../web/assets/ti-findings-ui.js';

test('saran kode temuan bisa diperbaiki petugas dan tidak membuat data faktual',()=>{
  assert.equal(suggestFindingCode('Pengujian Pemulihan CBS'),'TEM-PENGUJIAN-PEMULIHAN-CBS');
  assert.equal(suggestFindingCode(''), '');
  assert.equal(suggestFindingCode(null),'');
  assert.ok(suggestFindingCode('Temuan Pemeriksaan Sistem Informasi Sangat Panjang untuk Pemeriksaan').length<=32);
  assert.match(suggestFindingCode('Akses — pengguna'),/^[A-Z][A-Z0-9_-]{1,31}$/);
});

test('formulir tidak boleh memilih prioritas tanpa penilaian petugas',()=>{
  assert.match(findingPriorityGuidance(''),/Tidak ada prioritas otomatis/);
  assert.match(findingPriorityGuidance('low'),/Rendah/);
  assert.match(findingPriorityGuidance('medium'),/Sedang/);
  assert.match(findingPriorityGuidance('high'),/Tinggi/);
  assert.match(findingPriorityGuidance('critical'),/Kritis/);
  assert.match(findingPriorityGuidance('unknown'),/Tidak ada prioritas otomatis/);
});

test('kelengkapan pengajuan mengikuti syarat backend tiga catatan minimum',()=>{
  const missing=findingSubmissionChecklist({action_plan:'',progress_note:'',evidence_reference:''});
  assert.deepEqual(missing.map(x=>x.complete),[false,false,false]);
  assert.deepEqual(findingSubmissionChecklist(null).map(x=>x.complete),[false,false,false]);
  const partial=findingSubmissionChecklist({
    action_plan:'Uji pemulihan TI',
    progress_note:'Selesai',
    evidence_reference:'BA-PENGUJIAN-001',
  });
  assert.deepEqual(partial.map(x=>x.complete),[true,false,true]);
  const ready={
    action_plan:'Uji prosedur restore',
    progress_note:'Pengujian restore telah selesai',
    evidence_reference:'BA-RESTORE-2026-01',
  };
  assert.equal(findingSubmissionChecklist(ready).every(x=>x.complete),true);
  assert.match(findingNextStep({...ready,status:'open'}),/dapat mengajukan/);
  assert.match(findingNextStep({...ready,status:'pending_verification'}),/Menunggu pemeriksaan/);
  assert.match(findingNextStep({...ready,status:'changes_requested'}),/meminta perbaikan/);
  assert.match(findingNextStep({...ready,status:'closed'}),/diverifikasi/);
  assert.match(findingNextStep({...ready,status:'closed',archived_at:'2026-11-13'}),/diarsipkan/);
  assert.match(findingNextStep({status:'open'}),/Lengkapi rencana/);
});
