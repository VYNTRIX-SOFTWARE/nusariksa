import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool, checkDatabase } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';

test('migrasi dapat dijalankan ulang tanpa mengubah riwayat', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const pool = createPool();
  try {
    assert.equal(await checkDatabase(pool), true);
    await runMigrations(pool);
    await runMigrations(pool);

    const migrations = await pool.query(
      'SELECT id, checksum FROM schema_migrations ORDER BY id',
    );
    assert.equal(migrations.rowCount, 28);
    assert.deepEqual(migrations.rows.map((row) => row.id), [
      '0001_create_institutions.sql',
      '0002_create_identity_tables.sql',
      '0003_create_user_roles.sql',
      '0004_create_role_change_events.sql',
      '0005_add_role_event_source.sql',
      '0006_create_user_accounts.sql',
      '0007_create_assessments.sql',
      '0008_create_control_catalogs.sql',
      '0009_create_assessment_control_results.sql',
      '0010_create_assessment_reviews.sql',
      '0011_create_assessment_evidence.sql',
      '0012_create_maturity_frameworks.sql',
      '0013_create_maturity_assessments.sql',
      '0014_create_maturity_review_workflow.sql',
      '0015_add_password_change_audit_action.sql',
      '0016_add_totp_mfa.sql',
      '0017_create_padk_preparations.sql',
      '0018_create_padk_indicator_preparation_notes.sql',
      '0019_create_padk_mapping_review_events.sql',
      '0020_add_padk_provisional_ratings.sql',
      '0021_create_padk_indicator_evidence.sql',
      '0022_create_padk_draft_review_workflow.sql',
      '0023_add_evidence_key_ids.sql',
      '0024_seed_internal_bpr_catalog.sql',
      '0025_create_ti_assets.sql',
      '0026_create_ti_risks.sql',
      '0027_create_ti_incidents.sql',
      '0028_create_ti_findings.sql',
    ]);
    assert.match(migrations.rows[0].checksum.trim(), /^[a-f0-9]{64}$/);

    const columns = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      ['institutions'],
    );
    assert.ok(columns.rows.some((row) => row.column_name === 'kind'));
  } finally {
    await pool.end();
  }
});
