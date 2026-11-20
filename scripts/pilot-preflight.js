import {createPool} from '../apps/api/src/database.js';
import {verifyMigrationHistory} from '../apps/api/src/recovery-verification.js';
import {evaluatePilotConfiguration,summarizePilotChecks} from '../apps/api/src/pilot-preflight.js';

const args=process.argv.slice(2);
const withDatabase=args.includes('--database');
const unknown=args.filter(x=>!['--database','--json'].includes(x));
if(unknown.length){
  console.error('Penggunaan: npm run pilot:preflight -- [--database] [--json]');
  process.exitCode=2;
}else{
  const result=evaluatePilotConfiguration(process.env,process.version);
  if(withDatabase){
    const ready=['database_config','data_scope'].every(id=>
      result.checks.find(c=>c.id===id)?.state==='PASS');
    if(!ready){
      result.checks.push({id:'database_read_only',state:'BLOCK',
        note:'Pemeriksaan database dibatalkan: konfigurasi koneksi atau data sintetis belum aman.'});
    }else{
      const pool=createPool();
      let client;
      try{
        client=await pool.connect();
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query('SELECT 1');
        const migrationCount=await verifyMigrationHistory(client);
        await client.query('ROLLBACK');
        result.checks.push({id:'database_read_only',state:'PASS',
          note:'Koneksi read-only dan '+migrationCount+' checksum migrasi terverifikasi.'});
      }catch{
        if(client){try{await client.query('ROLLBACK');}catch{/* best effort */}}
        result.checks.push({id:'database_read_only',state:'BLOCK',
          note:'Koneksi atau integritas migrasi gagal. Detail rahasia tidak ditampilkan.'});
      }finally{
        if(client)client.release();
        if(pool)await pool.end();
      }
    }
  }else{
    result.checks.push({id:'database_read_only',state:'WARN',
      note:'Database belum diperiksa; jalankan dengan --database pada lingkungan data sintetis.'});
  }
  result.overall=summarizePilotChecks(result.checks,{databaseRequested:withDatabase});
  if(args.includes('--json'))console.log(JSON.stringify(result));
  else{
    for(const check of result.checks)
      console.log(check.state+' '+check.id+': '+check.note);
    console.log('Hasil pemeriksaan: '+result.overall);
    console.log(result.note);
  }
  process.exitCode=result.overall==='PREFLIGHT_CHECKS_PASSED'?0:1;
}
