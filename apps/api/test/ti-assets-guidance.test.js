import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assetTypeGuidance,assetCriticalityGuidance} from '../../web/assets/ti-assets-ui.js';

test('jenis aset menampilkan contoh BPR/BPRS tanpa memilihkan jenis otomatis',()=>{
  assert.match(assetTypeGuidance('server'),/core banking/);
  assert.match(assetTypeGuidance('workstation'),/teller/);
  assert.match(assetTypeGuidance('network'),/router/);
  assert.match(assetTypeGuidance('software'),/pelaporan/);
  assert.match(assetTypeGuidance('storage'),/backup/);
  assert.match(assetTypeGuidance('other'),/catatan/);
  assert.match(assetTypeGuidance(''),/Pilih jenis/);
  assert.match(assetTypeGuidance('invalid'),/Pilih jenis/);
});
test('panduan kritikalitas menjelaskan dampak dan tidak menilai kondisi aset otomatis',()=>{
  assert.match(assetCriticalityGuidance('high'),/transaksi/);
  assert.match(assetCriticalityGuidance('medium'),/sementara/);
  assert.match(assetCriticalityGuidance('low'),/alternatif/);
  assert.match(assetCriticalityGuidance(''),/Tidak ada nilai otomatis/);
  assert.match(assetCriticalityGuidance(null),/Tidak ada nilai otomatis/);
});
