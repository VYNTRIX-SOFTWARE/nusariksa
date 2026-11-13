import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';

test('model maturitas internal auto-seed setelah aktivasi, idempotent, published, dan tanpa skor', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Seed Maturitas','BPR')");
      const first=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES ($1,'pending',NULL) RETURNING id",
        ['default-maturity-first@example.test'],
      );
      const uid=first.rows[0].id;
      let before=await db.query(
        "SELECT count(*)::int AS n FROM maturity_models WHERE code='NUSARIKSA_INTERNAL'",
      );
      const originalCount=before.rows[0].n;
      await db.query("UPDATE users SET status='active',password_hash='test-hash' WHERE id=$1",[uid]);
      const result=await db.query(
        "SELECT m.id,v.id AS version_id,v.status,v.version,p.method "+
        "FROM maturity_models m JOIN maturity_model_versions v ON v.model_id=m.id "+
        "JOIN maturity_aggregation_policies p ON p.version_id=v.id "+
        "WHERE m.code='NUSARIKSA_INTERNAL'",
      );
      assert.equal(result.rowCount,1);
      assert.equal(result.rows[0].status,'published');
      assert.equal(result.rows[0].version,1);
      assert.equal(result.rows[0].method,'minimum');
      const counter=await db.query(
        "SELECT count(*)::int AS domains,count(l.level)::int AS criteria "+
        "FROM maturity_domains d LEFT JOIN maturity_domain_levels l ON l.domain_id=d.id "+
        "WHERE d.version_id=$1",[result.rows[0].version_id],
      );
      assert.equal(counter.rows[0].criteria,36);
      const domainCount=await db.query(
        "SELECT count(*)::int AS n FROM maturity_domains WHERE version_id=$1",
        [result.rows[0].version_id],
      );
      assert.equal(domainCount.rows[0].n,6);
      await db.query("UPDATE users SET password_hash='test-hash-2' WHERE id=$1",[uid]);
      const after=await db.query(
        "SELECT count(*)::int AS n FROM maturity_models WHERE code='NUSARIKSA_INTERNAL'",
      );
      assert.equal(after.rows[0].n,originalCount || 1);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM maturity_assessments WHERE model_version_id=$1',
        [result.rows[0].version_id])).rows[0].n,0);
      await db.query('SAVEPOINT default_maturity_guard');
      await assert.rejects(db.query(
        "UPDATE maturity_domain_levels SET criterion='Unsafe replacement' WHERE domain_id="+
        "(SELECT id FROM maturity_domains WHERE version_id=$1 LIMIT 1) AND level=0",
        [result.rows[0].version_id],
      ),e=>e.code==='P0001');
      await db.query('ROLLBACK TO SAVEPOINT default_maturity_guard');
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
