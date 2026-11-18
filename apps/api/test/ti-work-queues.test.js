import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  validateFindingWorkQueue,findingCardAction,
} from '../../web/assets/ti-findings-ui.js';
import {
  validateVendorWorkQueue,vendorNextStep,contractNextStep,
} from '../../web/assets/ti-vendors-ui.js';

const ID='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
test('ringkasan pekerjaan menolak data tidak lengkap dan hitungan tidak konsisten',()=>{
  const base={kind:'TI_FINDINGS_WORK_QUEUE',active:5,myWork:2,reviewable:1,
    overdue:3,closed:1,canReview:true};
  assert.deepEqual(validateFindingWorkQueue(base),base);
  for(const invalid of [
    {...base,myWork:6},{...base,reviewable:-1},
    {...base,canReview:false,reviewable:1},
    {...base,overdue:'3'},{...base,kind:'FAKE'},
  ])assert.throws(()=>validateFindingWorkQueue(invalid),TypeError);
});
test('tindakan temuan sesuai status, maker-checker, dan kelengkapan bukti',()=>{
  const item={created_by:ID,submitted_by:ID,status:'open',archived_at:null,
    action_plan:'Rencana tindakan yang lengkap',progress_note:'',evidence_reference:''};
  const maker={userId:ID,permissions:['findings:write']};
  const reviewer={userId:OTHER,permissions:['findings:verify']};
  assert.equal(findingCardAction(item,maker),'Lengkapi tindak lanjut');
  assert.equal(findingCardAction({...item,progress_note:'Realisasi tindakan',
    evidence_reference:'BA pemeriksaan tersedia'},maker),'Siap diajukan');
  assert.equal(findingCardAction({...item,status:'pending_verification'},reviewer),
    'Periksa tindak lanjut');
  assert.equal(findingCardAction({...item,status:'pending_verification'},maker),'Lihat rincian');
  assert.equal(findingCardAction({...item,status:'closed'},reviewer),'Lihat rincian');
  assert.equal(findingCardAction({...item,archived_at:'2026-11-18'},maker),'Lihat riwayat');
});
test('kontrak operasional membedakan masa berlaku, evaluasi, dan arsip',()=>{
  const alert={contractId:ID,vendorId:OTHER,contractCode:'CTR-TEST',
    serviceName:'Uji penyedia',vendorName:'Penyedia Uji',
    endDate:'2026-11-30',state:'expiring'};
  const data={kind:'TI_VENDOR_WORK_QUEUE',providers:2,contracts:3,
    expired:1,expiring:1,withoutReview:1,alerts:[alert],truncated:false};
  assert.deepEqual(validateVendorWorkQueue(data),data);
  assert.throws(()=>validateVendorWorkQueue({...data,alerts:[{...alert,state:'fraud'}]}),TypeError);
  assert.throws(()=>validateVendorWorkQueue({...data,expired:5}),TypeError);
  assert.match(vendorNextStep({overdue_contracts:1,expiring_contracts:0,active_contracts:2}),
    /melewati masa berlaku/);
  assert.match(vendorNextStep({overdue_contracts:0,expiring_contracts:1,active_contracts:2}),
    /mendekati tanggal akhir/);
  assert.match(contractNextStep({status:'active',term_state:'current',review_count:0}),/Belum ada evaluasi/);
  assert.match(contractNextStep({status:'ended'}),/diakhiri/);
});
