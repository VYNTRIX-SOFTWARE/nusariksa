import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  PadkPreparationError,validatePadkPreparation,validatePadkPreparationNotes,
} from '../src/padk-preparations.js';

test('kategori dan tanggal periode penilaian divalidasi ketat',()=>{
  const valid={title:'Penilaian TI 2026',category:1,
    periodStart:'2026-01-01',periodEnd:'2026-12-31'};
  assert.deepEqual(validatePadkPreparation(valid),valid);
  for(const invalid of [
    {...valid,category:3},{...valid,category:'1'},
    {...valid,periodStart:'2026-02-30'},
    {...valid,periodStart:'2027-01-01'},
    {...valid,title:'x'},{...valid,title:' Catatan '},
  ])assert.throws(()=>validatePadkPreparation(invalid),PadkPreparationError);
});
test('catatan persiapan bukan hasil peringkat dan wajib revisi optimistic',()=>{
  assert.deepEqual(validatePadkPreparationNotes({
    preparationNotes:'Catatan internal',evidencePlan:'Daftar bukti',expectedRevision:1,
  }),{preparationNotes:'Catatan internal',evidencePlan:'Daftar bukti',expectedRevision:1});
  for(const data of [
    {preparationNotes:'a',evidencePlan:'b',expectedRevision:0},
    {preparationNotes:'a',evidencePlan:'b',expectedRevision:'1'},
    {preparationNotes:'x'.repeat(4001),evidencePlan:'',expectedRevision:1},
    {preparationNotes:'Text\u0001',evidencePlan:'',expectedRevision:1},
  ])assert.throws(()=>validatePadkPreparationNotes(data),PadkPreparationError);
});
