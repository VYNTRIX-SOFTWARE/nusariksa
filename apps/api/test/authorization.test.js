import assert from 'node:assert/strict';
import { test } from 'node:test';
import { permissionsForRoles, userHasPermission } from '../src/authorization.js';

test('hak akses hanya diberikan pada peran yang dikenal', () => {
  assert.deepEqual(permissionsForRoles(['UNKNOWN']), []);
  assert.deepEqual(permissionsForRoles([]), []);
  const viewer = permissionsForRoles(['VIEWER']);
  assert.ok(viewer.includes('assessments:read'));
  assert.ok(viewer.includes('evidence:read'));
  assert.ok(!viewer.includes('assessments:write'));
  assert.ok(!viewer.includes('assessments:approve'));
  assert.ok(!viewer.includes('users:manage'));
  assert.ok(viewer.includes('assets:read'));
  assert.ok(!viewer.includes('assets:write'));
  assert.ok(permissionsForRoles(['IT_OFFICER']).includes('assets:write'));
  assert.ok(!permissionsForRoles(['REVIEWER']).includes('assets:write'));
  assert.ok(permissionsForRoles(['IT_OFFICER']).includes('risks:write'));
  assert.ok(permissionsForRoles(['COMPLIANCE_OFFICER']).includes('risks:write'));
  assert.ok(permissionsForRoles(['REVIEWER']).includes('risks:read'));
  assert.ok(!permissionsForRoles(['REVIEWER']).includes('risks:write'));
  assert.ok(!permissionsForRoles(['VIEWER']).includes('risks:write'));
  assert.ok(permissionsForRoles(['IT_OFFICER']).includes('incidents:write'));
  assert.ok(permissionsForRoles(['COMPLIANCE_OFFICER']).includes('incidents:write'));
  assert.ok(permissionsForRoles(['REVIEWER']).includes('incidents:read'));
  assert.ok(!permissionsForRoles(['REVIEWER']).includes('incidents:write'));
  assert.ok(!permissionsForRoles(['VIEWER']).includes('incidents:write'));
  assert.ok(permissionsForRoles(['IT_OFFICER']).includes('findings:write'));
  assert.ok(permissionsForRoles(['COMPLIANCE_OFFICER']).includes('findings:write'));
  assert.ok(permissionsForRoles(['COMPLIANCE_OFFICER']).includes('findings:verify'));
  assert.ok(permissionsForRoles(['REVIEWER']).includes('findings:read'));
  assert.ok(permissionsForRoles(['REVIEWER']).includes('findings:verify'));
  assert.ok(!permissionsForRoles(['REVIEWER']).includes('findings:write'));
  assert.ok(!permissionsForRoles(['VIEWER']).includes('findings:write'));
  assert.ok(!permissionsForRoles(['SUPER_ADMIN']).includes('findings:verify'));
});

test('pemeriksa dapat menyetujui tanpa hak mengubah asesmen', () => {
  const reviewer = permissionsForRoles(['REVIEWER']);
  assert.ok(reviewer.includes('assessments:approve'));
  assert.ok(!reviewer.includes('assessments:write'));
  assert.ok(!permissionsForRoles(['SUPER_ADMIN']).includes('assessments:approve'));
});

test('beberapa peran menggabungkan izin tanpa duplikasi', () => {
  const combined = permissionsForRoles(['IT_OFFICER', 'AUDITOR', 'IT_OFFICER']);
  assert.ok(combined.includes('assessments:write'));
  assert.ok(combined.includes('audit:read'));
  assert.equal(combined.length, new Set(combined).size);
});

test('izin yang tidak dikenal ditolak tanpa query database', async () => {
  const noDatabase = { query() { throw new Error('Unexpected query'); } };
  assert.equal(await userHasPermission(noDatabase, 'anything', 'users:delete-all'), false);
  assert.equal(await userHasPermission(noDatabase, 'anything', undefined), false);
  assert.equal(await userHasPermission(noDatabase, 'not-a-uuid', 'users:manage'), false);
});
