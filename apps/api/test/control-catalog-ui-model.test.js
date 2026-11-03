import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canReadCatalogs, canWriteCatalogs, canAddControl, canPublish,
  canCreateNextVersion, validateCatalogDraft, validateControlDraft,
  parseCatalogs, parseVersions, parseControls,
} from '../../web/assets/control-catalog-model.js';

const id = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const controlId = '33333333-3333-4333-8333-333333333333';
const read = ['assessments:read'];
const write = ['assessments:read', 'assessments:write'];
const draft = { id:versionId, version:1, status:'draft' };
const published = { id:versionId, version:1, status:'published' };

test('katalog dapat dibaca tanpa memberikan akses tulis', () => {
  assert.equal(canReadCatalogs(read), true);
  assert.equal(canWriteCatalogs(read), false);
  assert.equal(canWriteCatalogs(['assessments:write']), false);
  assert.equal(canWriteCatalogs(write), true);
  assert.equal(canReadCatalogs(null), false);
});

test('validasi katalog mengikuti kontrak API', () => {
  assert.deepEqual(validateCatalogDraft({code:'  risiko_ti ',title:'  Risiko Teknologi  '}),
    {code:'RISIKO_TI',title:'Risiko Teknologi'});
  for (const candidate of [
    {code:'X',title:'Contoh'}, {code:'1CAT',title:'Contoh'},
    {code:'A B',title:'Contoh'}, {code:'VALID',title:'ab'},
    {code:'VALID',title:'Nama\nBaru'}, {code:'VALID',title:'a'.repeat(201)},
  ]) assert.throws(() => validateCatalogDraft(candidate), TypeError);
});

test('validasi kontrol membatasi rujukan berpasangan dan sanitasi line break deskripsi', () => {
  assert.deepEqual(validateControlDraft({
    code:'akses_1',title:'Hak akses operator',
    description:'Atur hak akses\nberdasarkan peran',
    sourceDocument:'  Kebijakan TI ', sourceSection:'  Bab 2  ',
  }), {
    code:'AKSES_1',title:'Hak akses operator',
    description:'Atur hak akses berdasarkan peran',
    sourceDocument:'Kebijakan TI',sourceSection:'Bab 2',
  });
  const bad = [
    {code:'A',title:'Hak akses'}, {code:'AKSES',title:'xx'},
    {code:'AKSES',title:'Hak akses',sourceDocument:'Kebijakan TI'},
    {code:'AKSES',title:'Hak akses',sourceSection:'Bab 1'},
    {code:'AKSES',title:'Hak akses',description:'x'.repeat(2001)},
    {code:'AKSES',title:'Hak akses',description:'\u0000'},
  ];
  for (const input of bad) assert.throws(() => validateControlDraft(input), TypeError);
});

test('versi hanya dapat ditambah setelah versi terbaru terbit', () => {
  assert.equal(canCreateNextVersion(write,[published]),true);
  assert.equal(canCreateNextVersion(write,[draft,published]),false);
  assert.equal(canCreateNextVersion(write,[]),false);
  assert.equal(canCreateNextVersion(read,[published]),false);
  assert.equal(canAddControl(write,draft,0),true);
  assert.equal(canAddControl(write,draft,199),true);
  assert.equal(canAddControl(write,draft,200),false);
  assert.equal(canAddControl(read,draft,1),false);
  assert.equal(canAddControl(write,published,1),false);
  assert.equal(canPublish(write,draft,0),false);
  assert.equal(canPublish(write,draft,1),true);
  assert.equal(canPublish(write,published,1),false);
});

test('respons katalog, versi dan kontrol tidak boleh dianggap kosong jika rusak', () => {
  assert.equal(parseCatalogs({catalogs:[{id,code:'CAT_TI',title:'Katalog TI'}]}).length,1);
  assert.equal(parseVersions({versions:[published]}).length,1);
  assert.equal(parseControls({
    version:published,
    controls:[{id:controlId,control_code:'AKSES_1',title:'Hak akses'}],
  },versionId).length,1);
  for(const item of [
    () => parseCatalogs(null),
    () => parseCatalogs({catalogs:'invalid'}),
    () => parseVersions({versions:[{...draft,status:'invalid'}]}),
    () => parseControls({version:published,controls:null},versionId),
    () => parseControls({version:published,controls:[]},id),
  ]) assert.throws(item,TypeError);
});
