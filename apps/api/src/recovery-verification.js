import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {decryptEvidence} from './assessment-evidence.js';

const MIGRATIONS=fileURLToPath(new URL('../../../database/migrations/',import.meta.url));
const PAGE_SIZE=100;

export class RecoveryVerificationError extends Error{
  constructor(message){super(message);this.name='RecoveryVerificationError';}
}

export async function verifyMigrationHistory(db,directory=MIGRATIONS){
  const actual=await db.query('SELECT id,checksum FROM schema_migrations ORDER BY id');
  const files=(await readdir(directory)).filter(x=>/^\d{4}_[a-z0-9_]+\.sql$/.test(x)).sort();
  if(actual.rows.length!==files.length)
    throw new RecoveryVerificationError('Migration history differs from this version of NusaRiksa');
  for(let i=0;i<files.length;i++){
    const file=files[i];
    const expected=createHash('sha256').update(await readFile(join(directory,file))).digest('hex');
    if(actual.rows[i].id!==file||actual.rows[i].checksum.trim()!==expected)
      throw new RecoveryVerificationError('Migration integrity check failed');
  }
  return files.length;
}

const QUERIES={
  assessment:"SELECT id,assessment_id,control_id,file_name,media_type,size_bytes,sha256,nonce,auth_tag,ciphertext,key_id FROM assessment_evidence WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT 100",
  padk:"SELECT id,preparation_id AS assessment_id,('PADK43_INDICATOR_'||indicator_number)::text AS control_id,file_name,media_type,size_bytes,sha256,nonce,auth_tag,ciphertext,key_id FROM padk_indicator_evidence WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT 100",
};

// Read-only verification of every encrypted payload; no plaintext, filename or key is logged.
export async function verifyEncryptedEvidence(db,keyConfig){
  const stats={assessment:0,padk:0,legacy:0,versioned:0};
  for(const [kind,sql] of Object.entries(QUERIES)){
    let cursor=null;
    for(;;){
      const found=await db.query(sql,[cursor]);
      if(!found.rows.length)break;
      for(const row of found.rows){
        let plaintext;
        try{
          plaintext=decryptEvidence(row,keyConfig);
          stats[kind]++;
          if(row.key_id===null)stats.legacy++;
          else stats.versioned++;
        }catch{
          throw new RecoveryVerificationError('Evidence authentication or required key check failed');
        }finally{
          if(plaintext)plaintext.fill(0);
        }
        cursor=row.id;
      }
      if(found.rows.length<PAGE_SIZE)break;
    }
  }
  return stats;
}

export async function verifyRecoveredDatabase(pool,keyConfig){
  const db=await pool.connect();
  try{
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const migrations=await verifyMigrationHistory(db);
    const evidence=await verifyEncryptedEvidence(db,keyConfig);
    await db.query('COMMIT');
    return {migrations,evidence};
  }catch(error){
    await db.query('ROLLBACK');
    if(error instanceof RecoveryVerificationError)throw error;
    throw new RecoveryVerificationError('Recovered database verification failed');
  }finally{db.release();}
}
