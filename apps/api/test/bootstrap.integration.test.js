import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { initializeInstitutionInTransaction, bootstrapInstitution } from '../src/bootstrap.js';
import { verifyPassword } from '../src/passwords.js';
import {createCatalogInTransaction,createNextVersionInTransaction,
  addControlInTransaction,publishVersionInTransaction,listControls}
  from '../src/control-catalogs.js';

const setup = {
  institutionName: 'BPR Pengujian Awal', institutionKind: 'BPR',
  email: 'Admin@Example.test', password: 'Password-admin-test-2026',
};

test('first administrator and institution are created atomically', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    await runMigrations(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await initializeInstitutionInTransaction(client, setup);
      assert.equal(created.email, 'admin@example.test');
      const user = await client.query('SELECT status, password_hash FROM users WHERE id = $1', [created.userId]);
      assert.equal(user.rows[0].status, 'active');
      assert.equal(await verifyPassword(setup.password, user.rows[0].password_hash), true);
      const role = await client.query(
        "SELECT role, assigned_by FROM user_roles WHERE user_id = $1",
        [created.userId],
      );
      assert.deepEqual(role.rows, [{ role: 'SUPER_ADMIN', assigned_by: created.userId }]);
      const events = await client.query(
        'SELECT actor_user_id, target_user_id, role, action, source FROM role_change_events',
      );
      assert.equal(events.rowCount, 1);
      assert.deepEqual(events.rows[0], {
        actor_user_id: created.userId, target_user_id: created.userId,
        role: 'SUPER_ADMIN', action: 'GRANT', source: 'BOOTSTRAP',
      });
      // New installation has a ready-to-use published baseline without entering controls.
      const builtin=await client.query(
        "SELECT c.id,c.origin,c.code,v.id AS version_id,v.status FROM control_catalogs c "+
        "JOIN control_catalog_versions v ON v.catalog_id=c.id WHERE c.origin='builtin'");
      assert.equal(builtin.rowCount,2);
      const legacy=builtin.rows.find(x=>x.code==='NUSARIKSA_BPR_INTERNAL');
      const referenced=builtin.rows.find(x=>x.code==='NUSARIKSA_TI_REFERENSI');
      assert.ok(legacy);assert.ok(referenced);
      assert.equal(legacy.status,'published');
      assert.equal(referenced.status,'published');
      const count=await client.query(
        'SELECT count(*)::int AS total FROM control_definitions WHERE version_id=$1',
        [referenced.version_id]);
      assert.equal(count.rows[0].total,26);
      const references=await client.query(
        'SELECT count(*)::int AS total FROM control_definitions WHERE version_id=$1 '+
        'AND source_document=$2 AND source_section IS NOT NULL',
        [referenced.version_id,'POJK Nomor 34 Tahun 2025']);
      assert.equal(references.rows[0].total,26);
      const installedAgain=await client.query(
        'SELECT ensure_referenced_control_catalog($1) AS id',[created.userId]);
      assert.equal(installedAgain.rows[0].id,referenced.version_id);
      const unchanged=await client.query('SELECT count(*)::int AS total FROM control_catalog_versions');
      assert.equal(unchanged.rows[0].total,2);
      // Built-in v1 immutable; institution can create an extended v2 or its own catalog.
      await client.query("INSERT INTO user_roles(user_id,role) VALUES($1,'IT_OFFICER')",[created.userId]);
      await client.query('SAVEPOINT immutable_builtin');
      await assert.rejects(client.query(
        'UPDATE control_definitions SET title=$2 WHERE version_id=$1',
        [legacy.version_id,'Klaim yang diubah']),e=>e.code==='P0001');
      await client.query('ROLLBACK TO SAVEPOINT immutable_builtin');
      const v2=await createNextVersionInTransaction(client,{
        actorId:created.userId,catalogId:legacy.id});
      assert.equal(v2.status,'draft');
      assert.equal((await listControls(client,created.userId,v2.id)).controls.length,26);
      await addControlInTransaction(client,{actorId:created.userId,versionId:v2.id,
        code:'CUSTOM_BPR_01',title:'Kontrol tambahan lokal'});
      await publishVersionInTransaction(client,{actorId:created.userId,versionId:v2.id});
      assert.equal((await listControls(client,created.userId,v2.id)).controls.length,27);
      const manual=await createCatalogInTransaction(client,{
        actorId:created.userId,code:'KATALOG_LOKAL',title:'Asesmen tambahan lembaga'});
      assert.equal(manual.currentVersion.status,'draft');
      assert.equal((await client.query(
        'SELECT origin FROM control_catalogs WHERE id=$1',[manual.id])).rows[0].origin,'custom');
      await assert.rejects(
        initializeInstitutionInTransaction(client, setup),
        /already been completed or database is not empty/,
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
});

test('initial setup rejects weak passwords and invalid institution names', async () => {
  const fakePool = { async connect() { throw new Error('Database must not be accessed'); } };
  await assert.rejects(bootstrapInstitution(fakePool, { ...setup, password: '123' }), /Invalid initial setup/);
  await assert.rejects(bootstrapInstitution(fakePool, { ...setup, institutionName: '' }), /Invalid initial setup/);
  await assert.rejects(bootstrapInstitution(fakePool, { ...setup, institutionKind: 'UNKNOWN' }), /Invalid initial setup/);
});
