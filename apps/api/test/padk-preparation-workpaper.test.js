import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeDraftWorkpaperPdf} from '../src/padk-preparation-workpaper.js';

test('PADK preparation workpaper renders valid PDF with conspicuous draft labeling',()=>{
  const lines=[
    'NUSARIKSA - KERTAS KERJA PERSIAPAN',
    'DRAFT - BUKAN HASIL PENILAIAN REGULASI',
    'Catatan: SOP backup sudah tersedia (belum diverifikasi)',
  ];
  const bytes=makeDraftWorkpaperPdf(lines);
  assert.ok(Buffer.isBuffer(bytes));
  assert.ok(bytes.subarray(0,8).toString('latin1').startsWith('%PDF-1.4'));
  const text=bytes.toString('latin1');
  assert.match(text,/DRAFT - BUKAN HASIL PENILAIAN PADK/);
  assert.match(text,/SOP backup sudah tersedia/);
  assert.match(text,/\/Type \/Catalog/);
  assert.match(text,/xref/);
  assert.match(text,/startxref/);
  assert.match(text,/%%EOF/);
  assert.ok(bytes.length>600);
});
test('PDF generator splits long reports across actual PDF pages',()=>{
  const report=makeDraftWorkpaperPdf(Array.from({length:140},(_,i)=>'Baris '+i));
  const source=report.toString('latin1');
  assert.match(source,/\/Count 3 >>/);
  assert.equal((source.match(/\/Type \/Page \/Parent/g)||[]).length,3);
  assert.equal((source.match(/BUKAN HASIL PENILAIAN PADK/g)||[]).length,3);
});
