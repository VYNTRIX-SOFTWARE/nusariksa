import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  csvRegisterCell,makeRegisterCsv,REGISTER_EXPORTS,
  exportOperationalRegister,RegisterExportError,
} from '../src/ti-register-exports.js';
import {formatTiDocumentNumber} from '../src/ti-document-numbers.js';

test('nomor aset dan insiden memiliki format institusional dan batas numerik',()=>{
  assert.equal(formatTiDocumentNumber('asset',2026,1),'AST-2026-000001');
  assert.equal(formatTiDocumentNumber('incident',2026,12),'INC-2026-000012');
  for(const input of [['asset',2026,0],['incident',2026,1000000],
    ['other',2026,1],['asset',1999,1]])
    assert.throws(()=>formatTiDocumentNumber(...input),TypeError);
});
test('seluruh jenis register dan laporan memakai CSV aman dan kode tidak dievaluasi',()=>{
  for(const type of ['assets','risks','incidents','findings','vendors',
    'vendor-contracts','vendor-sla','recovery','recovery-tests'])
    assert.ok(REGISTER_EXPORTS[type],type);
  for(const attack of ['=1+1',' +SUM(A1:A2)','@HYPERLINK("evil")','-1','\t=cmd']){
    const cell=csvRegisterCell(attack);
    assert.ok(cell.startsWith('"\''),attack);
  }
  assert.equal(csvRegisterCell('a"b'),'"a""b"');
  const csv=makeRegisterCsv(['Kode','Judul'],[['=TEST','Record "A"']]);
  assert.ok(csv.toString('utf8').startsWith('\uFEFF'));
  assert.ok(csv.toString('utf8').includes("'=TEST"));
  assert.ok(csv.toString('utf8').endsWith('\r\n'));
  assert.throws(()=>makeRegisterCsv(['a'],Array(5001).fill(['x'])),TypeError);
});
test('register membutuhkan izin laporan dan izin domain, menolak jenis liar',async()=>{
  const fake={query:async()=>{throw Error('Unexpected DB query');}};
  await assert.rejects(exportOperationalRegister(fake,{
    actorId:'11111111-1111-4111-8111-111111111111',type:'../../passwords',
  }),error=>error instanceof RegisterExportError&&error.status===404);
});
