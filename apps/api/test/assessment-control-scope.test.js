import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  ControlScopeError,validateSelectedControlIds,
} from '../src/assessment-control-scopes.js';
import {
  validateControlLibrary,validateSelection,
} from '../../web/assets/assessment-control-picker.js';

const one='11111111-1111-4111-8111-111111111111';
const two='22222222-2222-4222-8222-222222222222';
const unknown='33333333-3333-4333-8333-333333333333';
const controls=[
  {id:one,controlCode:'GOV_01',title:'Kebijakan TI',
    description:'Periksa dokumen',sourceDocument:'POJK Nomor 34 Tahun 2025',
    sourceSection:'Pasal 3',position:1},
  {id:two,controlCode:'GOV_02',title:'Kontrol akses TI',
    description:'Periksa akun',sourceDocument:'POJK Nomor 34 Tahun 2025',
    sourceSection:'Pasal 6',position:2},
];

test('validasi cakupan: 1–200 ID unik dalam daftar kontrol yang tersedia',()=>{
  assert.deepEqual(validateSelectedControlIds([one,two]),[one,two]);
  for(const selected of [[],[one,one],[unknown,'bad'],[one,'bad'],
    Array.from({length:201},()=>one)]){
    assert.throws(()=>validateSelectedControlIds(selected),ControlScopeError);
  }
  assert.deepEqual(validateSelection(controls,[one]),[one]);
  assert.deepEqual(validateSelection(controls,[two,one]),[two,one]);
  for(const ids of [[],[one,one],[unknown],[one,unknown]]){
    assert.throws(()=>validateSelection(controls,ids),TypeError);
  }
});

test('UI menolak katalog tak terverifikasi dan data kontrol cacat',()=>{
  const library={catalogVersionId:one,catalogCode:'NUSARIKSA_TI_REFERENSI',
    catalogStatus:'PUBLISHED_INTERNAL_REFERENCE',
    officialInstrument:false,maxPerAssessment:200,controls};
  assert.deepEqual(validateControlLibrary(library),controls);
  for(const variant of [
    {...library,officialInstrument:true},
    {...library,maxPerAssessment:26},
    {...library,catalogStatus:'OFFICIAL_OJK'},
    {...library,controls:[]},
    {...library,controls:[controls[0],controls[0]]},
    {...library,controls:[{...controls[0],sourceSection:null}]},
  ])assert.throws(()=>validateControlLibrary(variant),TypeError);
});
