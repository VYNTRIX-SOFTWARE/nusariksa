import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  registerFormSnapshot,describeInvalidRegisterField,
} from '../../web/assets/register-form-experience.js';
import {workDueDescription} from '../../web/assets/ti-work-ui.js';

test('perubahan formulir hanya mencakup kolom yang dapat diedit petugas',()=>{
  const normal={id:'title',type:'text',value:'Sistem Informasi',disabled:false,readOnly:false};
  const generated={id:'code',type:'text',value:'AUTO',disabled:false,readOnly:true};
  const disabled={id:'example',type:'select-one',value:'',disabled:true,readOnly:false};
  const agree={id:'active',type:'checkbox',checked:false,disabled:false,readOnly:false};
  const form={querySelectorAll:()=>[normal,generated,disabled,agree]};
  const original=registerFormSnapshot(form);
  generated.value='RSK-2026-000001';disabled.value='template';
  assert.equal(registerFormSnapshot(form),original);
  normal.value='Sistem Informasi Baru';
  assert.notEqual(registerFormSnapshot(form),original);
  normal.value='Sistem Informasi';agree.checked=true;
  assert.notEqual(registerFormSnapshot(form),original);
});

test('isian wajib dan batasan format menghasilkan pesan dekat kolom',()=>{
  assert.equal(describeInvalidRegisterField({validity:{valueMissing:true}},'Nama aset'),
    'Nama aset wajib diisi.');
  assert.equal(describeInvalidRegisterField({validity:{tooShort:true},minLength:10},
    'Kondisi nyata'), 'Kondisi nyata minimal 10 karakter.');
  assert.match(describeInvalidRegisterField({validity:{typeMismatch:true}},'Email'),/format/);
  assert.match(describeInvalidRegisterField({validity:{rangeOverflow:true}},'RTO'),/batas nilai/);
  assert.match(describeInvalidRegisterField({validity:{patternMismatch:true}},'Kode'),/format/);
});

test('tanggal pekerjaan dihitung sesuai hari WIB dan membedakan keterlambatan',()=>{
  const now=new Date('2026-11-20T18:00:00Z'); // 21 November WIB
  assert.deepEqual(workDueDescription('2026-11-20',now).late,true);
  assert.match(workDueDescription('2026-11-20',now).label,/Lewat target 1 hari/);
  assert.match(workDueDescription('2026-11-21',now).label,/hari ini/);
  assert.match(workDueDescription('2026-11-24',now).label,/3 hari lagi/);
  assert.equal(workDueDescription('2026-02-31',now),null);
  assert.equal(workDueDescription('bukan-tanggal',now),null);
  assert.equal(workDueDescription(null,now),null);
});

test('sembilan dialog register memakai validasi dan konfirmasi batal yang sama',async()=>{
  const spec=[
    ['ti-assets-ui.js',1],['ti-risks-ui.js',1],
    ['ti-incidents-ui.js',1],['ti-findings-ui.js',1],
    ['ti-vendors-ui.js',3],['ti-recovery-ui.js',2],
  ];
  const html=await readFile(new URL('../../web/index.html',import.meta.url),'utf8');
  for(const [name,expected] of spec){
    const content=await readFile(new URL('../../web/assets/'+name,import.meta.url),'utf8');
    assert.equal((content.match(/createRegisterFormExperience\(\{/g)||[]).length,
      expected,name);
    assert.match(content,/\.showError\(/,name);
  }
  for(const id of ['ti-assets-form','ti-risks-form','ti-incidents-form',
    'ti-findings-form','ti-vendors-form','ti-vendors-contract-form',
    'ti-vendors-review-form','ti-recovery-form','ti-recovery-exercise-form'])
    assert.ok(html.includes('id="'+id+'"'));
  const ux=await readFile(new URL('../../web/assets/register-form-experience.js',import.meta.url),'utf8');
  assert.match(ux,/addEventListener\('invalid'/);
  assert.match(ux,/addEventListener\('cancel'/);
  assert.match(ux,/confirmAssessmentAction/);
  assert.match(ux,/textContent=message/);
  assert.doesNotMatch(ux,/innerHTML|localStorage|sessionStorage/);
  assert.match(html,/id="ti-work-return-bar"/);
  assert.match(html,/id="ti-work-return"/);
});
