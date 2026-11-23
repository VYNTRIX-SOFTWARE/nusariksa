import {assertSupportedNodeVersion} from '../apps/api/src/node-runtime-policy.js';

try{
  assertSupportedNodeVersion();
  console.log('Runtime Node.js memenuhi baseline keamanan: '+process.version);
}catch{
  console.error('Runtime ditolak: Node.js 24.22.3 atau lebih baru dalam lini 24 LTS diperlukan.');
  process.exitCode=1;
}
