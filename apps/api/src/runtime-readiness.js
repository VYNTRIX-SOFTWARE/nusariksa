import {verifyMigrationHistory} from './recovery-verification.js';

/**
 * Checks the actual schema against this release without modifying the database.
 * /health is liveness only; /ready must fail when a migration is missing,
 * altered, or the PostgreSQL major version is unsupported.
 */
export async function inspectReleaseDatabase(pool,{verify=verifyMigrationHistory}={}){
  if(!pool||typeof pool.connect!=='function')
    throw new Error('Database unavailable');
  const client=await pool.connect();
  try{
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const version=await client.query("SELECT current_setting('server_version_num') AS version");
    const number=Number(version.rows?.[0]?.version);
    if(!Number.isInteger(number)||number<170000||number>=180000)
      throw new Error('Unsupported database major version');
    const migrations=await verify(client);
    if(!Number.isSafeInteger(migrations)||migrations<1)
      throw new Error('Migration history invalid');
    await client.query('COMMIT');
    return {postgresMajor:17,migrations};
  }catch{
    try{await client.query('ROLLBACK');}catch{/* do not expose connection errors */}
    throw new Error('Database release inspection failed');
  }finally{client.release();}
}

/** Bounded single-flight cache avoids reading 37 migration files per health poll. */
export function createReadinessProbe(pool,{
  inspect=inspectReleaseDatabase,ttlMs=3000,clock=()=>Date.now(),
}={}){
  if(!Number.isSafeInteger(ttlMs)||ttlMs<0||ttlMs>60000)
    throw new TypeError('Invalid readiness cache duration');
  let cached=null,inFlight=null;
  return async()=>{
    if(cached&&clock()<cached.expiresAt)return cached.ready;
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      let ready=false;
      try{await inspect(pool);ready=true;}catch{/* generic HTTP 503 */}
      cached={ready,expiresAt:clock()+ttlMs};
      return ready;
    })();
    try{return await inFlight;}finally{inFlight=null;}
  };
}
