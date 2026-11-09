import {executeRecoveryDrill} from '../apps/api/src/recovery-drill.js';
import {RecoveryVerificationError} from '../apps/api/src/recovery-verification.js';

try{
  const result=await executeRecoveryDrill();
  console.log(JSON.stringify({status:'PASS',...result}));
}catch(error){
  // Only controlled, credential-free diagnostics are allowed in logs.
  const diagnostic=error instanceof RecoveryVerificationError ? error.message : 'Verification failed';
  console.error('Recovery drill FAILED: '+diagnostic);
  process.exitCode=1;
}
