import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CatalogError, validateControl, createCatalogInTransaction,
  assignCatalogInTransaction,
} from '../src/control-catalogs.js';

test('kode, judul, dan referensi kontrol divalidasi', () => {
  const good = {
    code: 'GOV_01', title: 'Inventarisasi sistem TI',
    sourceDocument: 'Dokumen internal', sourceSection: 'Bagian 2',
  };
  assert.deepEqual(validateControl(good), { ...good, description: '' });
  for (const control of [
    { ...good, code: 'bad-key' },
    { ...good, title: ' ' },
    { ...good, title: 'a'.repeat(201) },
    { ...good, sourceSection: null },
    { ...good, description: 'x'.repeat(2001) },
  ]) {
    assert.throws(() => validateControl(control),
      (error) => error instanceof CatalogError && error.status === 400);
  }
});

test('invalid catalog and attachment ids cannot trigger database work', async () => {
  const db = { query() { throw new Error('Unexpected database query'); } };
  await assert.rejects(createCatalogInTransaction(db, {
    actorId: 'invalid', code: 'not-valid', title: 'Contoh katalog',
  }), (error) => error instanceof CatalogError && error.status === 400);
  await assert.rejects(assignCatalogInTransaction(db, {
    actorId: '00000000-0000-4000-8000-000000000001',
    assessmentId: 'not-a-uuid',
    versionId: '00000000-0000-4000-8000-000000000002',
  }), (error) => error instanceof CatalogError && error.status === 400);
});
