import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL('../../../'+path,import.meta.url),'utf8');

test('README memisahkan pengenalan produk dari panduan pengguna dan catatan pengerjaan',async()=>{
  const readme=await read('README.md');
  assert.match(readme,/^# NusaRiksa/m);
  assert.match(readme,/\[Panduan Penggunaan NusaRiksa\]\(docs\/PANDUAN-PENGGUNA\.md\)/);
  assert.match(readme,/Menjalankan NusaRiksa secara lokal/);
  assert.doesNotMatch(readme,/\b(?:MVP|DRAFT_UNVERIFIED|checkpoint|sprint|roadmap)\b|PR\s*#\d+/i);
  assert.doesNotMatch(readme,/expectedRevision|ROLLBACK|\bmaker.checker\b/);
});
test('panduan petugas memakai langkah operasional dan menghindari metadata pengerjaan',async()=>{
  const guide=await read('docs/PANDUAN-PENGGUNA.md');
  for(const section of ['Mulai menggunakan aplikasi','Membuat asesmen TI',
    'Mengisi penilaian keamanan siber','Mengelola inventaris aset TI',
    'Mencatat dan memantau risiko TI','Mencatat dan menangani insiden TI/siber',
    'Jika mengalami kendala'])
      assert.ok(guide.includes(section),section);
  assert.match(guide,/tidak otomatis mengirim laporan kepada OJK/);
  assert.doesNotMatch(guide,/\b(?:MVP|DRAFT_UNVERIFIED|checkpoint|sprint|roadmap)\b|PR\s*#\d+/i);
});
