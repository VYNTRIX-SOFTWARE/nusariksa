import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createAssessmentInTransaction, startAssessmentInTransaction } from '../src/assessments.js';
import {
  CatalogError, createCatalogInTransaction, listCatalogs, listVersions,
  createNextVersionInTransaction, addControlInTransaction,
  publishVersionInTransaction, listControls, assignCatalogInTransaction, getChecklist,
} from '../src/control-catalogs.js';

test('publikasi mengunci kontrol dan asesmen mempertahankan versi terpasang', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions (name, kind) VALUES ('Bank Uji Katalog', 'BPR')");
      const createdUsers = await db.query(
        "INSERT INTO users (email, status, password_hash) VALUES " +
        "('editor-cat@example.test','active','hash-uji')," +
        "('viewer-cat@example.test','active','hash-uji')," +
        "('other-cat@example.test','active','hash-uji') RETURNING id,email",
      );
      const ids = Object.fromEntries(createdUsers.rows.map(u => [u.email, u.id]));
      const editor = ids['editor-cat@example.test'];
      const viewer = ids['viewer-cat@example.test'];
      const other = ids['other-cat@example.test'];
      await db.query(
        "INSERT INTO user_roles (user_id,role) VALUES ($1,'IT_OFFICER')," +
        "($2,'VIEWER'),($3,'IT_OFFICER')",
        [editor, viewer, other],
      );

      await assert.rejects(createCatalogInTransaction(db, {
        actorId: viewer, code: 'TEST-CAT', title: 'Kontrol Pengujian',
      }), (e) => e.status === 403);

      const catalog = await createCatalogInTransaction(db, {
        actorId: editor, code: 'TEST-CAT', title: 'Kontrol Pengujian',
      });
      assert.equal(catalog.currentVersion.version, 1);
      assert.equal(catalog.currentVersion.status, 'draft');
      assert.equal((await listCatalogs(db, viewer)).catalogs.length, 1);
      const v1 = catalog.currentVersion.id;
      const assessment = await createAssessmentInTransaction(db, {
        actorId: editor, title: 'Asesmen katalog 2027',
        periodStart: '2027-01-01', periodEnd: '2027-12-31',
      });
      assert.deepEqual(await getChecklist(db, viewer, assessment.id), {
        catalogVersion: null, controls: [],
      });
      await assert.rejects(assignCatalogInTransaction(db, {
        actorId: editor, assessmentId: assessment.id, versionId: v1,
      }), (e) => e.status === 409);
      await assert.rejects(publishVersionInTransaction(db, {
        actorId: editor, versionId: v1,
      }), (e) => e.status === 409);

      const item = await addControlInTransaction(db, {
        actorId: editor, versionId: v1, code: 'GOV_01',
        title: 'Inventarisasi sistem TI', description: 'Pengujian struktur',
        sourceDocument: 'Referensi contoh', sourceSection: 'Bagian 1',
      });
      assert.equal(item.position, 1);
      assert.equal(item.source_section, 'Bagian 1');

      const pub = await publishVersionInTransaction(db, { actorId: editor, versionId: v1 });
      assert.equal(pub.status, 'published');
      await assert.rejects(addControlInTransaction(db, {
        actorId: editor, versionId: v1, code: 'GOV_02', title: 'Tambahan kontrol',
      }), (e) => e.status === 409);
      await db.query('SAVEPOINT edit_published');
      await assert.rejects(
        db.query('UPDATE control_definitions SET title = $2 WHERE id = $1',
          [item.id, 'Nama kontrol yang diganti']),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT edit_published');
      await db.query('SAVEPOINT delete_published');
      await assert.rejects(
        db.query('DELETE FROM control_definitions WHERE id = $1', [item.id]),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT delete_published');
      await db.query('SAVEPOINT edit_version');
      await assert.rejects(
        db.query("UPDATE control_catalog_versions SET status = 'draft', published_at = null WHERE id = $1", [v1]),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT edit_version');

      await assert.rejects(assignCatalogInTransaction(db, {
        actorId: other, assessmentId: assessment.id, versionId: v1,
      }), (e) => e.status === 403);
      const assignment = await assignCatalogInTransaction(db, {
        actorId: editor, assessmentId: assessment.id, versionId: v1,
      });
      assert.equal(assignment.catalogVersion.version, 1);
      await assert.rejects(assignCatalogInTransaction(db, {
        actorId: editor, assessmentId: assessment.id, versionId: v1,
      }), (e) => e.status === 409);
      assert.equal((await getChecklist(db, viewer, assessment.id)).controls.length, 1);
      await db.query('SAVEPOINT immutable_assignment');
      await assert.rejects(
        db.query('DELETE FROM assessment_catalog_assignments WHERE assessment_id = $1',
          [assessment.id]),
        (e) => e.code === 'P0001',
      );
      await db.query('ROLLBACK TO SAVEPOINT immutable_assignment');

      const v2 = await createNextVersionInTransaction(db, {
        actorId: editor, catalogId: catalog.id,
      });
      assert.equal(v2.version, 2);
      assert.equal((await listControls(db, viewer, v2.id)).controls.length, 1);
      await assert.rejects(createNextVersionInTransaction(db, {
        actorId: editor, catalogId: catalog.id,
      }), (e) => e.status === 409);
      await addControlInTransaction(db, {
        actorId: editor, versionId: v2.id,
        code: 'GOV_02', title: 'Kontrol kedua',
      });
      await publishVersionInTransaction(db, { actorId: editor, versionId: v2.id });
      assert.equal((await listControls(db, viewer, v2.id)).controls.length, 2);
      assert.equal((await listVersions(db, viewer, catalog.id)).versions.length, 2);
      const after = await getChecklist(db, viewer, assessment.id);
      assert.equal(after.catalogVersion.id, v1);
      assert.equal(after.controls.length, 1);
      assert.equal(after.controls[0].control_code, 'GOV_01');
      await startAssessmentInTransaction(db, { actorId: editor, id: assessment.id });
      assert.equal((await getChecklist(db, viewer, assessment.id)).catalogVersion.id, v1);

      await db.query('SAVEPOINT bad_catalog_code');
      await assert.rejects(createCatalogInTransaction(db, {
        actorId: editor, code: 'TEST-CAT', title: 'Judul duplikat',
      }), (e) => e.status === 409);
      await db.query('ROLLBACK TO SAVEPOINT bad_catalog_code');
      await assert.rejects(getChecklist(db, viewer, 'bad-id'), (e) => e.status === 400);
      await assert.rejects(getChecklist(db, other, '11111111-1111-4111-8111-111111111111'),
        (e) => e.status === 404);
      await db.query('ROLLBACK');
    } finally {
      db.release();
    }
  } finally {
    await pool.end();
  }
});
