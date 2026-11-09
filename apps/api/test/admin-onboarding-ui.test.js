import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateAdminAccountList,validateInviteResult} from '../../web/assets/admin-onboarding-ui.js';

const admin='11111111-1111-4111-8111-111111111111';
test('first-run UI only accepts valid invitation secrets and account states',()=>{
  const invitation={userId:admin,email:'example@bpr.test',
    invitationToken:'a'.repeat(43),expiresAt:'2026-11-10T12:00:00Z'};
  assert.equal(validateInviteResult(invitation).invitationToken.length,43);
  assert.throws(()=>validateInviteResult({...invitation,invitationToken:'broken'}),TypeError);
  assert.throws(()=>validateInviteResult({...invitation,expiresAt:'bad'}),TypeError);
  const accounts={users:[{id:admin,email:'admin@bpr.test',status:'active',roles:['SUPER_ADMIN']}]};
  assert.equal(validateAdminAccountList(accounts)[0].roles[0],'SUPER_ADMIN');
  assert.throws(()=>validateAdminAccountList({users:[{...accounts.users[0],roles:'SUPER_ADMIN'}]}),TypeError);
  assert.throws(()=>validateAdminAccountList({users:[{...accounts.users[0],status:'unknown'}]}),TypeError);
});
