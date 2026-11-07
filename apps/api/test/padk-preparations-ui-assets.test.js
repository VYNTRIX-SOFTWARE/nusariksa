import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createServer} from '../src/server.js';
import {validatePreparationInput,validatePreparationResponse}
  from '../../web/assets/padk-preparation-ui.js';

test('PADK preparation page and module are served with CSP',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const home=await fetch(base+'/');
    assert.equal(home.status,200);
    assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await home.text();
    for(const id of [
      'page-padk-preparations','padk-preparations-menu',
      'pdk-create-toggle','pdk-create-form','pdk-title','pdk-category',
      'pdk-period-start','pdk-period-end','pdk-list','pdk-detail',
      'pdk-note-form','pdk-notes','pdk-evidence-plan','pdk-save','pdk-history',
    ])assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.match(html,/Belum dapat dinilai atau disahkan/);
    const module=await fetch(base+'/assets/padk-preparation-ui.js');
    assert.equal(module.status,200);
    assert.match(module.headers.get('content-security-policy'),/script-src 'self'/);
  }finally{server.close();await once(server,'close');}
});
test('PADK prep UI refuses malformed states and invalid category',()=>{
  const input={title:'Penilaian 2026',category:1,
    periodStart:'2026-01-01',periodEnd:'2026-12-31'};
  assert.deepEqual(validatePreparationInput(input),input);
  assert.throws(()=>validatePreparationInput({...input,category:3}));
  assert.throws(()=>validatePreparationResponse({
    id:'11111111-1111-4111-8111-111111111111',
    title:'Penilaian',category:1,revision:1,
    ownerUserId:'22222222-2222-4222-8222-222222222222',
    preparationNotes:'',evidencePlan:'',status:'PREPARATION_ONLY',
    scoringAvailable:true,submissionAvailable:false,finalReportAvailable:false,
  }));
});
