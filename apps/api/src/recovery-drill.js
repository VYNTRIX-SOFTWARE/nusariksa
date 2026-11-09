import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPool} from './database.js';
import {configureEvidenceKeys} from './evidence-keyring.js';
import {verifyRecoveredDatabase,RecoveryVerificationError} from './recovery-verification.js';

const TARGET_NAME=/^nusariksa_recovery_[a-z0-9_]{3,40}$/;
const CONFIRM='ISOLATED_EMPTY_RECOVERY_DATABASE';
const SSL_MODES=new Set(['disable','allow','prefer','require','verify-ca','verify-full']);
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]','::1']);

export function parseRecoveryUrl(value){
  let parsed;
  try{parsed=new URL(value);}catch{throw new RecoveryVerificationError('Invalid recovery database connection');}
  if(!['postgresql:','postgres:'].includes(parsed.protocol)||!parsed.hostname||!parsed.pathname||parsed.pathname==='/')
    throw new RecoveryVerificationError('Invalid recovery database connection');
  const dbname=decodeURIComponent(parsed.pathname.slice(1));
  if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(dbname))
    throw new RecoveryVerificationError('Unsupported recovery database name');
  for(const key of parsed.searchParams.keys())if(key!=='sslmode')
    throw new RecoveryVerificationError('Unsupported connection-string parameter for recovery');
  const sslmode=parsed.searchParams.get('sslmode');
  if(sslmode!==null&&!SSL_MODES.has(sslmode))
    throw new RecoveryVerificationError('Invalid database SSL configuration');
  return {
    hostname:parsed.hostname.toLowerCase(),
    port:parsed.port||'5432',
    dbname,
    env:{PGHOST:parsed.hostname,PGPORT:parsed.port||'5432',
      PGUSER:decodeURIComponent(parsed.username||''),
      PGPASSWORD:decodeURIComponent(parsed.password||''),
      PGDATABASE:dbname,
      ...(sslmode?{PGSSLMODE:sslmode}:{})},
  };
}

export function validateRecoveryPlan({sourceUrl,targetUrl,confirmation}){
  if(confirmation!==CONFIRM)
    throw new RecoveryVerificationError('Explicit recovery drill acknowledgment is required');
  const source=parseRecoveryUrl(sourceUrl);
  const target=parseRecoveryUrl(targetUrl);
  if(!TARGET_NAME.test(target.dbname)||!LOOPBACK.has(target.hostname))
    throw new RecoveryVerificationError('Recovery target must be a local, explicitly named disposable database');
  if(source.hostname===target.hostname&&source.port===target.port&&source.dbname===target.dbname)
    throw new RecoveryVerificationError('Source and recovery target must differ');
  return {source,target};
}

function pgEnv(connection){
  // Keep credentials in the child environment, never in argv or printed logs.
  return {PATH:process.env.PATH||'',LANG:'C',HOME:process.env.HOME||'',
    ...(process.env.PGSSLROOTCERT?{PGSSLROOTCERT:process.env.PGSSLROOTCERT}:{}),
    ...connection.env};
}

async function runPg(command,args,connection){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{env:pgEnv(connection),stdio:['ignore','ignore','ignore']});
    child.once('error',()=>reject(new RecoveryVerificationError('Required PostgreSQL client executable is unavailable')));
    child.once('close',code=>code===0?resolve():
      reject(new RecoveryVerificationError('PostgreSQL recovery command failed')));
  });
}

async function databaseIdentity(pool){
  const r=await pool.query('SELECT current_database() AS name, inet_server_addr()::text AS host, inet_server_port() AS port');
  return r.rows[0];
}

async function targetIsEmpty(pool){
  const r=await pool.query(
    "SELECT count(*)::int AS objects FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname NOT IN ('pg_catalog','information_schema') "+
    "AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','m','v','f','S')"
  );
  return r.rows[0].objects===0;
}

async function sha256File(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}

export async function executeRecoveryDrill({
  sourceUrl=process.env.DATABASE_URL,
  targetUrl=process.env.RECOVERY_DATABASE_URL,
  confirmation=process.env.RECOVERY_DRILL_CONFIRM,
  legacyKey=process.env.EVIDENCE_ENCRYPTION_KEY,
  keysJson=process.env.EVIDENCE_KEYRING,
  activeId=process.env.EVIDENCE_ACTIVE_KEY_ID,
}={}){
  const {source,target}=validateRecoveryPlan({sourceUrl,targetUrl,confirmation});
  const keys=configureEvidenceKeys({legacyKey,keysJson,activeId});
  const sourcePool=createPool(sourceUrl);
  const targetPool=createPool(targetUrl);
  let directory;
  try{
    const [sourceIdentity,targetIdentity]=await Promise.all([
      databaseIdentity(sourcePool),databaseIdentity(targetPool)]);
    if(sourceIdentity.name!==source.dbname||targetIdentity.name!==target.dbname
      ||sourceIdentity.host===targetIdentity.host&&sourceIdentity.port===targetIdentity.port
        &&sourceIdentity.name===targetIdentity.name)
      throw new RecoveryVerificationError('Recovery target resolves to the source database');
    if(!await targetIsEmpty(targetPool))
      throw new RecoveryVerificationError('Recovery target contains existing objects');
    directory=await mkdtemp(join(tmpdir(),'nusariksa-recovery-'));
    const archive=join(directory,'snapshot.dump');
    await runPg('pg_dump',['--format=custom','--no-owner','--no-acl','--file='+archive],source);
    const archiveSha256=await sha256File(archive);
    // Never pass --clean, --create or overwrite an existing database.
    await runPg('pg_restore',['--dbname='+target.dbname,'--no-owner','--no-acl',
      '--single-transaction','--exit-on-error',archive],target);
    const verification=await verifyRecoveredDatabase(targetPool,keys);
    return {...verification,archiveSha256,sourceDb:source.dbname,targetDb:target.dbname};
  }catch(error){
    if(error instanceof RecoveryVerificationError)throw error;
    throw new RecoveryVerificationError('Recovery drill failed; inspect isolated target database');
  }finally{
    if(directory)await rm(directory,{recursive:true,force:true});
    await Promise.allSettled([sourcePool.end(),targetPool.end()]);
  }
}
