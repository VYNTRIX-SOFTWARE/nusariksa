import {createPool} from '../apps/api/src/database.js';
import {inspectReleaseDatabase} from '../apps/api/src/runtime-readiness.js';

/** Safe read-only operator check; no connection strings or SQL errors in logs. */
const pool=createPool();
if(!pool){
  console.error(JSON.stringify({status:'BLOCKED',reason:'DATABASE_URL_REQUIRED'}));
  process.exitCode=1;
}else{
  try{
    const result=await inspectReleaseDatabase(pool);
    console.log(JSON.stringify({status:'PASS',postgresMajor:result.postgresMajor,
      migrations:result.migrations,scope:'READ_ONLY_SCHEMA_CHECK'}));
  }catch{
    console.error(JSON.stringify({status:'BLOCKED',reason:'DATABASE_OR_MIGRATION_MISMATCH'}));
    process.exitCode=1;
  }finally{await pool.end();}
}
